/**
 * Dragon Herald — Desktop notifications when the dragon finishes its work.
 *
 * The herald announces when the dragon has finished its work, so you can wander
 * away from the terminal without missing a beat. Fires on agent_end, skips
 * quick responses under minDuration, and strips markdown from the body.
 *
 * Notification methods (tried in order for "auto"):
 *   1. OSC 777 — terminal-native, no dependencies. Works in Ghostty, WezTerm,
 *      iTerm2, foot, rxvt-unicode.
 *   2. notify-send — Linux desktop fallback for terminals that don't forward
 *      OSC sequences. Requires libnotify.
 *
 * Settings (pantry.herald.*):
 *   enabled      — master switch (default: true)
 *   title        — notification title (default: "Ember 🐉")
 *   method       — "auto" | "osc777" | "notify-send" (default: "auto")
 *   minDuration  — ms threshold; skip notifications for fast responses (default: 5000)
 *
 * A small dog wrote this spec. A large dragon signs the notifications.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";
import { readPantrySetting } from "../lib/settings.ts";

// ── Settings ──

function cfg<T>(key: string, fallback: T): T {
  return readPantrySetting<T>(`herald.${key}`, fallback);
}

// ── Notification Methods ──

/** Send via OSC 777 escape sequence — works in Ghostty, WezTerm, iTerm2, foot. */
function sendOsc777(title: string, body: string): void {
  // Escape semicolons so they don't corrupt the sequence
  const safeTitle = title.replace(/;/g, ",");
  const safeBody = body.replace(/;/g, ",");
  process.stdout.write(`\x1b]777;notify;${safeTitle};${safeBody}\x07`);
}

/** Send via notify-send (Linux, libnotify). */
function sendNotifySend(title: string, body: string): void {
  const safeTitle = title.replace(/"/g, '\\"');
  const safeBody = body.replace(/"/g, '\\"');
  execSync(`notify-send "${safeTitle}" "${safeBody}"`, { stdio: "ignore" });
}

/** Check once at startup whether notify-send is available. */
function hasNotifySend(): boolean {
  try {
    execSync("which notify-send", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ── Message Extraction ──

type MsgPart = { type: string; text?: string };

function isTextPart(p: unknown): p is { type: "text"; text: string } {
  return (
    typeof p === "object" &&
    p !== null &&
    (p as MsgPart).type === "text" &&
    typeof (p as MsgPart).text === "string"
  );
}

/** Pull raw text from the last assistant message in the history. */
function extractLastAssistantText(messages: unknown[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as { role?: string; content?: unknown };
    if (msg?.role !== "assistant") continue;

    const { content } = msg;
    if (typeof content === "string") return content.trim() || null;
    if (Array.isArray(content)) {
      const text = content
        .filter(isTextPart)
        .map((p) => p.text)
        .join(" ")
        .trim();
      return text || null;
    }
    return null;
  }
  return null;
}

/** Strip markdown punctuation for a clean notification body. */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "[code]") // fenced code blocks
    .replace(/`[^`]*`/g, "[code]") // inline code
    .replace(/!\[.*?\]\(.*?\)/g, "") // images
    .replace(/\[([^\]]+)\]\(.*?\)/g, "$1") // links → label
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1") // bold/italic/strike
    .replace(/^\s*[-*+>]\s+/gm, "") // list bullets / blockquotes
    .replace(/\s+/g, " ")
    .trim();
}

/** Produce a ≤100-char summary suitable for a notification body. */
function buildBody(messages: unknown[], errored: boolean): string {
  if (errored) return "The dragon encountered an error.";

  const raw = extractLastAssistantText(messages);
  if (!raw) return "Done.";

  const clean = stripMarkdown(raw);
  if (!clean) return "Done.";

  return clean.length > 100 ? `${clean.slice(0, 99)}…` : clean;
}

// ── Main ──

export default function (pi: ExtensionAPI) {
  if (!cfg<boolean>("enabled", true)) return;

  const notifySendAvailable = hasNotifySend();
  let agentStartedAt = 0;

  pi.on("agent_start", () => {
    agentStartedAt = Date.now();
  });

  pi.on("agent_end", async (event: any) => {
    const title = cfg<string>("title", "Ember 🐉");
    const method = cfg<string>("method", "auto");
    const minDuration = cfg<number>("minDuration", 5000);

    // Skip fast responses
    if (agentStartedAt > 0 && Date.now() - agentStartedAt < minDuration) return;

    const messages: unknown[] = event?.messages ?? [];
    const errored: boolean = event?.error != null;
    const body = buildBody(messages, errored);

    try {
      if (method === "osc777") {
        sendOsc777(title, body);
      } else if (method === "notify-send") {
        if (notifySendAvailable) sendNotifySend(title, body);
      } else {
        // auto — OSC 777 first, notify-send as fallback
        sendOsc777(title, body);
        if (notifySendAvailable) sendNotifySend(title, body);
      }
    } catch {
      // Notifications are best-effort; never crash the agent
    }
  });
}
