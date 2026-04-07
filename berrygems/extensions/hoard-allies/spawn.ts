/**
 * spawn.ts — Pi process spawning for quest dispatch.
 *
 * Spawns `pi --mode json` child processes and streams NDJSON output.
 * Handles abort, timeout, and structured result extraction.
 */

import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SpawnOptions, SpawnResult } from "./types.ts";

/** Resolve the pi binary path. */
export function findPiBinary(): string {
	// Use the same pi that's running us
	const npmBin = join(process.env.HOME ?? "~", ".npm", "bin", "pi");
	return npmBin;
}

/**
 * Spawn a pi process in JSON mode and collect results.
 *
 * Writes the system prompt to a temp file and passes --append-system-prompt.
 * Streams NDJSON events, extracts final assistant response and usage stats.
 */
export async function spawnPi(opts: SpawnOptions): Promise<SpawnResult> {
	const promptDir = mkdtempSync(join(tmpdir(), "hoard-quest-"));
	const promptFile = join(promptDir, "system.md");

	try {
		writeFileSync(promptFile, opts.systemPrompt, "utf-8");

		const args = [
			"--mode", "json",
			"--no-session",
			"--model", opts.model,
			"--system-prompt", promptFile,
			"-p", opts.task,
		];

		if (opts.tools) {
			args.push("--tools", opts.tools);
		}

		if (opts.thinking && opts.thinking !== "none") {
			args.push("--thinking", opts.thinking);
		}

		if (opts.maxSubagentDepth !== undefined) {
			args.push("--max-subagent-depth", String(opts.maxSubagentDepth));
		}

		return await new Promise<SpawnResult>((resolve) => {
			const proc = spawn(opts.piPath, args, {
				cwd: opts.cwd,
				env: { ...process.env },
				stdio: ["pipe", "pipe", "pipe"],
			});

			let stdout = "";
			let stderr = "";

			proc.stdout?.on("data", (chunk: Buffer) => {
				stdout += chunk.toString();
			});

			proc.stderr?.on("data", (chunk: Buffer) => {
				stderr += chunk.toString();
			});

			if (opts.signal) {
				opts.signal.addEventListener("abort", () => {
					proc.kill("SIGTERM");
				});
			}

			proc.on("close", (code) => {
				const result = parseSpawnOutput(stdout, stderr, code ?? 1);
				resolve(result);
			});

			proc.on("error", (err) => {
				resolve({
					success: false,
					response: "",
					error: `Spawn error: ${err.message}`,
					retryable: false,
				});
			});
		});
	} finally {
		try { unlinkSync(promptFile); } catch { /* ignore */ }
		try { unlinkSync(promptDir); } catch { /* ignore, rmdir would be better but non-fatal */ }
	}
}

/**
 * Parse NDJSON output from pi --mode json.
 *
 * Events are newline-delimited JSON objects. We extract:
 * - message_end events → assistant response text
 * - usage stats from the final message_end
 */
function parseSpawnOutput(stdout: string, stderr: string, exitCode: number): SpawnResult {
	if (exitCode !== 0 && !stdout.trim()) {
		const isRateLimit = stderr.includes("429") || stderr.includes("rate limit") || stderr.includes("Rate limit");
		const isServer = stderr.includes("500") || stderr.includes("502") || stderr.includes("503") || stderr.includes("504");

		return {
			success: false,
			response: "",
			error: stderr.trim() || `Process exited with code ${exitCode}`,
			retryable: isRateLimit || isServer,
		};
	}

	const lines = stdout.trim().split("\n").filter(Boolean);
	let lastAssistantText = "";
	let usage: SpawnResult["usage"] = undefined;

	for (const line of lines) {
		try {
			const event = JSON.parse(line);

			// Extract assistant text from message events
			if (event.type === "message_end" || event.type === "content_block_delta") {
				if (event.message?.content) {
					for (const block of event.message.content) {
						if (block.type === "text" && block.text) {
							lastAssistantText = block.text;
						}
					}
				}
			}

			// Extract text from simpler event formats
			if (event.type === "text" && event.text) {
				lastAssistantText += event.text;
			}

			// Extract response from final output
			if (event.response) {
				lastAssistantText = event.response;
			}

			// Extract usage
			if (event.usage) {
				usage = {
					inputTokens: event.usage.input_tokens ?? event.usage.inputTokens ?? 0,
					outputTokens: event.usage.output_tokens ?? event.usage.outputTokens ?? 0,
					cacheReadTokens: event.usage.cache_read_input_tokens ?? event.usage.cacheReadTokens,
					cacheWriteTokens: event.usage.cache_creation_input_tokens ?? event.usage.cacheWriteTokens,
				};
			}
		} catch {
			// Not valid JSON — might be raw text output
			if (!line.startsWith("{")) {
				lastAssistantText += line + "\n";
			}
		}
	}

	return {
		success: !!lastAssistantText.trim(),
		response: lastAssistantText.trim(),
		usage,
	};
}
