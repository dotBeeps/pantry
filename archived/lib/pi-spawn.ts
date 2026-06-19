/**
 * pi-spawn.ts — Reusable utility for spawning pi subprocesses.
 *
 * Provides a clean, generic interface for launching `pi --mode json` child
 * processes and collecting their NDJSON output. Handles argument assembly,
 * temp file management for system prompt injection, timeout/abort, and
 * structured result extraction.
 *
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface SpawnOptions {
  /** The task/prompt to pass as the trailing positional argument. */
  task: string;
  /** Comma-separated tool whitelist passed via --tools. */
  tools?: string;
  /** Model identifier passed via --model. */
  model?: string;
  /** Thinking level passed via --thinking-level (e.g. "off", "low", "high"). */
  thinkingLevel?: string;
  /** System prompt content to inject via --append-system-prompt (written to a temp file). */
  appendSystemPrompt?: string;
  /** Working directory for the spawned process. */
  cwd?: string;
  /** AbortSignal to cancel the process early. */
  signal?: AbortSignal;
  /** Extra environment variables merged with process.env. */
  env?: Record<string, string>;
  /** Milliseconds before the process is killed and timedOut is set. */
  timeoutMs?: number;
}

export interface SpawnResult {
  /** Extracted assistant text from the pi JSON-mode output. */
  output: string;
  /** Process exit code (null coerced to 1). */
  exitCode: number;
  /** True when the process was killed due to timeoutMs being exceeded. */
  timedOut: boolean;
}

// ─── Binary resolution ───────────────────────────────────────────────────────

/**
 * Find the pi binary.
 *
 * Primary: ~/.npm/bin/pi (the canonical install location).
 * Fallback: locate 'pi' on PATH via `which`.
 * Last resort: return the npm path anyway and let the caller deal with it.
 */
export function findPiBinary(): string {
  const npmBin = join(process.env.HOME ?? "~", ".npm", "bin", "pi");

  if (existsSync(npmBin)) {
    return npmBin;
  }

  try {
    const fromPath = execSync("which pi", { encoding: "utf-8" }).trim();
    if (fromPath) return fromPath;
  } catch {
    // which failed — fall through to fallback
  }

  return npmBin;
}

// ─── Spawn ───────────────────────────────────────────────────────────────────

/**
 * Spawn a pi process in JSON mode and collect its output.
 *
 * If appendSystemPrompt is provided, writes it to a temp file and passes
 * --append-system-prompt. The temp file is cleaned up in a finally block.
 */
export async function spawnPi(opts: SpawnOptions): Promise<SpawnResult> {
  const piBin = findPiBinary();

  let promptDir: string | undefined;
  let promptFile: string | undefined;

  if (opts.appendSystemPrompt != null) {
    promptDir = mkdtempSync(join(tmpdir(), "pi-spawn-"));
    promptFile = join(promptDir, "system.md");
    writeFileSync(promptFile, opts.appendSystemPrompt, "utf-8");
  }

  try {
    const args: string[] = [
      "--no-extensions",
      "--mode",
      "json",
      "-p",
      "--no-session",
    ];

    if (opts.tools) {
      args.push("--tools", opts.tools);
    }

    if (opts.model) {
      args.push("--model", opts.model);
    }

    if (opts.thinkingLevel) {
      args.push("--thinking-level", opts.thinkingLevel);
    }

    if (promptFile) {
      args.push("--append-system-prompt", promptFile);
    }

    // Task goes as the trailing positional argument
    args.push(opts.task);

    return await new Promise<SpawnResult>((resolve) => {
      const proc = spawn(piBin, args, {
        cwd: opts.cwd,
        env: {
          ...process.env,
          ...opts.env,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let timedOut = false;

      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      // Drain stderr so the child's pipe doesn't block
      proc.stderr?.on("data", () => {});

      // Merge caller signal + optional timeout into one AbortController
      const ac = new AbortController();
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

      if (opts.signal) {
        opts.signal.addEventListener("abort", () =>
          ac.abort("caller cancelled"),
        );
      }
      if (opts.timeoutMs) {
        timeoutTimer = setTimeout(() => {
          timedOut = true;
          ac.abort("timeout");
        }, opts.timeoutMs);
      }

      ac.signal.addEventListener("abort", () => proc.kill("SIGTERM"));

      proc.on("close", (code) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        resolve({
          output: parseSpawnOutput(stdout),
          exitCode: code ?? 1,
          timedOut,
        });
      });

      proc.on("error", () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        resolve({
          output: "",
          exitCode: 1,
          timedOut,
        });
      });
    });
  } finally {
    if (promptFile) {
      try {
        rmSync(promptFile);
      } catch {
        /* ignore */
      }
    }
    if (promptDir) {
      try {
        rmSync(promptDir, { recursive: true });
      } catch {
        /* ignore */
      }
    }
  }
}

// ─── Output parsing ──────────────────────────────────────────────────────────

/**
 * Parse NDJSON output from `pi --mode json` and extract the assistant's text.
 *
 * Pi emits newline-delimited JSON events. We scan all lines and collect:
 * - text from `message_end` / `content_block_delta` message content blocks
 * - text from plain `{ type: "text", text: "..." }` events
 * - a top-level `response` field if present
 *
 * Non-JSON lines that don't look like JSON objects are appended as raw text.
 */
export function parseSpawnOutput(raw: string): string {
  const lines = raw.trim().split("\n").filter(Boolean);
  let result = "";

  for (const line of lines) {
    try {
      const event = JSON.parse(line);

      // message_end / content_block_delta carry content blocks
      if (
        event.type === "message_end" ||
        event.type === "content_block_delta"
      ) {
        if (event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === "text" && block.text) {
              result = block.text;
            }
          }
        }
      }

      // Simple text delta events
      if (event.type === "text" && event.text) {
        result += event.text;
      }

      // Top-level response field (used by some pi output shapes)
      if (event.response) {
        result = event.response;
      }
    } catch {
      // Non-JSON lines are treated as raw text output
      if (!line.startsWith("{")) {
        result += line + "\n";
      }
    }
  }

  return result.trim();
}
