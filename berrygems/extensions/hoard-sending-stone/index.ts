/**
 * hoard-sending-stone — Cross-agent communication bus for pi sessions.
 *
 * Starts a local HTTP/SSE server in the primary session, writes connection info
 * to ~/.pi/hoard-sending-stone.json so subagent sessions can discover it.
 * Exposes stoneAPI on globalThis for other extensions to subscribe to messages.
 *
 * Reinitializes on /reload — stops old server, starts fresh.
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { startServer, stopServer } from "./server.js";
import { sendToStone } from "./client.js";
import type { StoneAPI, StoneMessage } from "./types.js";
import { STONE_KEY } from "./types.js";
import { readHoardSetting } from "../../lib/settings.js";
import { registerStoneRenderer } from "./renderer.js";

const JSON_PATH = path.join(os.homedir(), ".pi", "hoard-sending-stone.json");
const INTERNALS_KEY = Symbol.for("hoard.stone.internals");

interface StoneInternals {
  port: number | null;
  sseReq: http.ClientRequest | null;
  handlers: Set<(msg: StoneMessage) => void>;
}

function getInternals(): StoneInternals {
  let internals = (globalThis as any)[INTERNALS_KEY] as
    | StoneInternals
    | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!internals) {
    internals = { port: null, sseReq: null, handlers: new Set() };
    (globalThis as any)[INTERNALS_KEY] = internals; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  return internals;
}

// ── stone_send Tool Registration ─────────────────────────────────────────────

function registerStoneSendTool(
  pi: ExtensionAPI,
  stoneAPI: StoneAPI,
  senderFrom: string,
  senderDisplayName?: string,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pi.registerTool as any)({
    name: "stone_send",
    description:
      "MUST BE USED to deliver your final result when working as an ally — results sent as plain text are invisible to the primary agent. Use PROACTIVELY after each significant step completes. type='result' triggers primary agent attention; type='progress' is passive non-interrupting; type='question' when blocked and waiting for a reply. Do not finish your quest without sending type='result'.",
    promptSnippet:
      "Send messages to allies, the primary agent, or the room via the sending stone",
    promptGuidelines: [
      "ALWAYS send type='result' before your session ends — never let your final output be free text. The primary agent cannot see plain text output from ally sessions.",
      "Send type='progress' after each major step so the primary knows you are working.",
      "Send type='question' when blocked by a genuine ambiguity — then call stone_receive to wait for the reply before continuing.",
      "Address messages: 'session-room' (broadcast), 'primary-agent' (to lead), or an ally defName (direct)",
      "Use @Name in messages for urgent pings - marks the message with priority",
    ],
    parameters: Type.Object({
      to: Type.Optional(
        Type.String({
          description:
            'Who to address: "primary-agent", "user", "guild-master", "session-room", or an ally defName. Default: "session-room"',
        }),
      ),
      message: Type.String({ description: "The message to send" }),
      type: Type.Optional(
        Type.Union(
          [
            Type.Literal("question"),
            Type.Literal("status"),
            Type.Literal("result"),
            Type.Literal("progress"),
          ],
          {
            description:
              'Message type: "question", "status", "result", "progress". Default: "status"',
          },
        ),
      ),
    }),
    execute: async (
      _id: string,
      params: { to?: string; message: string; type?: string },
    ) => {
      const addressing = params.to ?? "session-room";
      const msgType = params.type ?? "status";

      // Detect @mentions for urgency signaling
      const hasMention = /@\w+/.test(params.message);
      const metadata = hasMention ? { urgent: true } : undefined;

      try {
        await stoneAPI.send({
          from: senderFrom,
          ...(senderDisplayName ? { displayName: senderDisplayName } : {}),
          type: msgType as "status",
          addressing,
          content: params.message,
          ...(metadata ? { metadata } : {}),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `✉️ Sent to ${addressing}: ${params.message}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to send: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  });
}

// ── Extension Entry Point ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI, _ctx: ExtensionContext): void {
  // Ally sessions get a client-only stone API with SSE subscription for bidirectional dialog
  if (process.env["HOARD_GUARD_MODE"] === "ally") {
    const allyDefName = process.env["HOARD_ALLY_DEFNAME"] ?? "ally";
    const allyName = process.env["HOARD_ALLY_NAME"] || undefined;
    const stonePort = Number(process.env["HOARD_STONE_PORT"]) || null;
    const allyHandlers = new Set<(msg: StoneMessage) => void>();
    const pendingMessages: StoneMessage[] = [];

    const allyStoneAPI: StoneAPI = {
      onMessage(handler: (msg: StoneMessage) => void): () => void {
        allyHandlers.add(handler);
        return () => {
          allyHandlers.delete(handler);
        };
      },
      async send(msg) {
        await sendToStone(msg);
      },
      port() {
        return stonePort;
      },
    };
    (globalThis as any)[STONE_KEY] = allyStoneAPI; // eslint-disable-line @typescript-eslint/no-explicit-any

    registerStoneSendTool(pi, allyStoneAPI, allyDefName, allyName);

    // Activate extension tools via session_start — during extension loading
    // the runtime isn't initialized yet, so pi.setActiveTools() would throw.
    // session_start fires after _bindExtensionCore sets up the runtime.
    pi.on("session_start" as any, () => {
      try {
        const current = pi.getActiveTools();
        const needed = ["stone_send", "stone_receive"];
        const missing = needed.filter((t) => !current.includes(t));
        if (missing.length > 0) pi.setActiveTools([...current, ...missing]);
      } catch {
        // Non-fatal — tools may already be active or API unavailable
      }
    });

    // ── SSE subscription: listen for messages from primary ──
    let sseRequest: ReturnType<typeof http.get> | undefined;
    if (stonePort) {
      try {
        sseRequest = http.get(
          {
            hostname: "127.0.0.1",
            port: stonePort,
            path: "/stream",
            headers: { Accept: "text/event-stream" },
          },
          (res) => {
            let buf = "";
            res.on("data", (chunk: Buffer) => {
              buf += chunk.toString();
              const lines = buf.split("\n");
              buf = lines.pop() ?? "";
              for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const raw = line.slice(5).trim();
                if (!raw) continue;
                try {
                  const msg = JSON.parse(raw) as StoneMessage;
                  // Only accept messages addressed to us or to session-room
                  const addr = msg.addressing ?? "session-room";
                  const isForUs =
                    addr === allyDefName || addr === "session-room";
                  // Ignore our own messages
                  const isFromUs = (msg.from ?? "") === allyDefName;
                  if (isForUs && !isFromUs) {
                    pendingMessages.push(msg);
                    for (const h of allyHandlers) h(msg);
                  }
                } catch {
                  /* ignore malformed */
                }
              }
            });
            res.on("error", () => {});
          },
        );
        sseRequest.on("error", () => {});
      } catch {
        /* ignore */
      }
    }

    // Clean up SSE connection on session shutdown
    pi.on("session_shutdown" as any, () => {
      sseRequest?.destroy();
    });

    // ── stone_receive tool: poll for incoming messages ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pi.registerTool as any)({
      name: "stone_receive",
      description:
        "MUST BE USED immediately after sending a type='question' via stone_send — block and wait for the primary agent's reply before continuing. Also use proactively at task start to drain any pending directives. Do not guess at blocked decisions; call stone_receive and wait.",
      promptSnippet:
        "Check for incoming stone messages from the primary agent or other allies",
      promptGuidelines: [
        "ALWAYS call stone_receive IMMEDIATELY after stone_send(type='question'). No other tool call may come between them. Without stone_receive, the reply is lost.",
        "Call stone_receive at task start to drain any pending directives before beginning.",
        "Default wait=60 when waiting for a question reply. Use shorter waits (5-10s) only when draining at task start.",
        "If stone_receive times out with no reply, proceed with best judgment and note the assumption in your result.",
      ],
      parameters: Type.Object({
        wait: Type.Optional(
          Type.Number({
            description:
              "Max seconds to wait for a message (default: 30, max: 120)",
          }),
        ),
      }),
      execute: async (_id: string, params: { wait?: number }) => {
        const maxWait = Math.min(params.wait ?? 30, 120) * 1000;
        const startMs = Date.now();

        // Drain any already-pending messages first
        if (pendingMessages.length > 0) {
          const msgs = pendingMessages.splice(0);
          const formatted = msgs
            .map(
              (m) =>
                `📨 From ${m.displayName ?? m.from ?? "unknown"} (${m.type ?? "status"}): ${m.content ?? ""}`,
            )
            .join("\n\n");
          return { content: [{ type: "text" as const, text: formatted }] };
        }

        // Poll for new messages
        while (Date.now() - startMs < maxWait) {
          await new Promise((r) => setTimeout(r, 200));
          if (pendingMessages.length > 0) {
            const msgs = pendingMessages.splice(0);
            const formatted = msgs
              .map(
                (m) =>
                  `📨 From ${m.displayName ?? m.from ?? "unknown"} (${m.type ?? "status"}): ${m.content ?? ""}`,
              )
              .join("\n\n");
            return { content: [{ type: "text" as const, text: formatted }] };
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `No messages received after ${Math.round(maxWait / 1000)}s. Continue with your best judgment.`,
            },
          ],
        };
      },
    });

    // ── tool_result hook: inject pending messages passively ──
    pi.on("tool_result", (event) => {
      if (pendingMessages.length === 0) return undefined;
      // Don't inject into stone_receive results (it handles its own messages)
      if (event.toolName === "stone_receive") return undefined;

      const msgs = pendingMessages.splice(0);
      const injection = msgs
        .map(
          (m) =>
            `\n\n📨 Incoming message from ${m.displayName ?? m.from ?? "unknown"} (${m.type ?? "status"}): ${m.content ?? ""}`,
        )
        .join("");

      const existingContent = event.content ?? [];
      const existingText = existingContent.find(
        (c): c is { type: "text"; text: string } => c.type === "text",
      );
      if (existingText) {
        return {
          content: existingContent.map((c) =>
            c === existingText ? { ...c, text: c.text + injection } : c,
          ),
        };
      }
      return {
        content: [
          ...existingContent,
          { type: "text" as const, text: injection.trim() },
        ],
      };
    });

    return;
  }

  const internals = getInternals();

  // ── Settings ──
  const primaryDisplayName = readHoardSetting<string>(
    "contributor.name",
    "Agent",
  );
  const maxLines = readHoardSetting<number>("stone.maxLines", 8);
  const preferredPort = readHoardSetting<number | undefined>(
    "stone.port",
    undefined,
  );

  // ── Register message renderer ──
  registerStoneRenderer(pi, { primaryDisplayName, maxLines });

  // ── Cleanup from previous load (handles /reload) ──
  if (internals.sseReq) {
    internals.sseReq.destroy();
    internals.sseReq = null;
  }
  if (internals.port != null) {
    stopServer();
    try {
      if (fs.existsSync(JSON_PATH)) fs.unlinkSync(JSON_PATH);
    } catch {}
    internals.port = null;
  }
  internals.handlers.clear();

  // ── SSE stream ──

  function openSSEStream(port: number): void {
    try {
      const req = http.get(
        {
          hostname: "127.0.0.1",
          port,
          path: "/stream",
          headers: { Accept: "text/event-stream" },
        },
        (res) => {
          let buf = "";
          res.on("data", (chunk: Buffer) => {
            buf += chunk.toString();
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const raw = line.slice(5).trim();
              if (!raw) continue;
              try {
                const msg = JSON.parse(raw) as StoneMessage;
                for (const h of internals.handlers) h(msg);
              } catch {
                /* ignore malformed payloads */
              }
            }
          });
          res.on("error", () => {});
        },
      );
      req.on("error", () => {});
      internals.sseReq = req;
    } catch {
      /* ignore */
    }
  }

  // ── Stone API ──

  function postToSelf(
    msg: Partial<StoneMessage> & { content: string; from: string },
  ): Promise<void> {
    const port = internals.port;
    if (port == null) return Promise.resolve();
    const body = JSON.stringify(msg);
    return new Promise<void>((resolve) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/message",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on("error", () => resolve());
      req.write(body);
      req.end();
    });
  }

  const stoneAPI: StoneAPI = {
    onMessage(handler: (msg: StoneMessage) => void): () => void {
      internals.handlers.add(handler);
      return () => {
        internals.handlers.delete(handler);
      };
    },
    async send(msg) {
      await postToSelf(msg);
    },
    port() {
      return internals.port;
    },
  };

  (globalThis as any)[STONE_KEY] = stoneAPI; // eslint-disable-line @typescript-eslint/no-explicit-any

  // ── Register stone_send tool ──
  registerStoneSendTool(pi, stoneAPI, "primary-agent", primaryDisplayName);

  // ── Start server immediately (works on /reload too) ──

  (async () => {
    try {
      const port = await startServer(preferredPort);
      internals.port = port;
      fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
      fs.writeFileSync(
        JSON_PATH,
        JSON.stringify({ port, pid: process.pid }),
        "utf8",
      );
      openSSEStream(port);
    } catch (err) {
      console.warn(`[sending-stone] server start failed: ${String(err)}`);
    }
  })();

  pi.on("session_shutdown", async () => {
    try {
      if (internals.sseReq) {
        internals.sseReq.destroy();
        internals.sseReq = null;
      }
      stopServer();
      internals.port = null;
      if (fs.existsSync(JSON_PATH)) fs.unlinkSync(JSON_PATH);
    } catch {}
  });
}
