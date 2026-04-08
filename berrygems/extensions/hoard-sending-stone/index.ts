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
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
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
	let internals = (globalThis as any)[INTERNALS_KEY] as StoneInternals | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
	if (!internals) {
		internals = { port: null, sseReq: null, handlers: new Set() };
		(globalThis as any)[INTERNALS_KEY] = internals; // eslint-disable-line @typescript-eslint/no-explicit-any
	}
	return internals;
}

// ── stone_send Tool Registration ─────────────────────────────────────────────

function registerStoneSendTool(pi: ExtensionAPI, stoneAPI: StoneAPI, senderFrom: string, senderDisplayName?: string): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(pi.registerTool as any)({
		name: "stone_send",
		description: "Send a message via the sending stone to the room, a specific agent, or dot. Use to communicate with running allies, ask questions, or broadcast updates.",
		parameters: Type.Object({
			to: Type.Optional(Type.String({ description: "Who to address: \"primary-agent\", \"user\", \"guild-master\", \"session-room\", or an ally defName. Default: \"session-room\"" })),
			message: Type.String({ description: "The message to send" }),
			type: Type.Optional(Type.Union([
				Type.Literal("question"),
				Type.Literal("status"),
				Type.Literal("result"),
				Type.Literal("progress"),
			], { description: "Message type: \"question\", \"status\", \"result\", \"progress\". Default: \"status\"" })),
		}),
		execute: async (_id: string, params: { to?: string; message: string; type?: string }) => {
			const addressing = params.to ?? "session-room";
			const msgType = params.type ?? "status";
			try {
				await stoneAPI.send({
					from: senderFrom,
					...(senderDisplayName ? { displayName: senderDisplayName } : {}),
					type: msgType as "status",
					addressing,
					content: params.message,
				});
				return { content: [{ type: "text" as const, text: `✉️ Sent to ${addressing}: ${params.message}` }] };
			} catch (err) {
				return { content: [{ type: "text" as const, text: `Failed to send: ${(err as Error).message}` }] };
			}
		},
	});
}

// ── Extension Entry Point ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI, _ctx: ExtensionContext): void {
	// Ally sessions get a client-only stone API (send only, no server)
	if (process.env["HOARD_GUARD_MODE"] === "ally") {
		const allyStoneAPI: StoneAPI = {
			onMessage() { return () => {}; },
			async send(msg) { await sendToStone(msg); },
			port() { return Number(process.env["HOARD_STONE_PORT"]) || null; },
		};
		(globalThis as any)[STONE_KEY] = allyStoneAPI; // eslint-disable-line @typescript-eslint/no-explicit-any

		registerStoneSendTool(pi, allyStoneAPI, process.env["HOARD_ALLY_DEFNAME"] ?? "ally");
		return;
	}

	const internals = getInternals();

	// ── Settings ──
	const primaryDisplayName = readHoardSetting<string>("contributor.name", "Agent");
	const maxLines = readHoardSetting<number>("stone.maxLines", 8);
	const preferredPort = readHoardSetting<number | undefined>("stone.port", undefined);

	// ── Register message renderer ──
	registerStoneRenderer(pi, { primaryDisplayName, maxLines });

	// ── Cleanup from previous load (handles /reload) ──
	if (internals.sseReq) {
		internals.sseReq.destroy();
		internals.sseReq = null;
	}
	if (internals.port != null) {
		stopServer();
		try { if (fs.existsSync(JSON_PATH)) fs.unlinkSync(JSON_PATH); } catch {}
		internals.port = null;
	}
	internals.handlers.clear();

	// ── SSE stream ──

	function openSSEStream(port: number): void {
		try {
			const req = http.get(
				{ hostname: "127.0.0.1", port, path: "/stream", headers: { Accept: "text/event-stream" } },
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
							} catch { /* ignore malformed payloads */ }
						}
					});
					res.on("error", () => {});
				},
			);
			req.on("error", () => {});
			internals.sseReq = req;
		} catch { /* ignore */ }
	}

	// ── Stone API ──

	function postToSelf(msg: Partial<StoneMessage> & { content: string; from: string }): Promise<void> {
		const port = internals.port;
		if (port == null) return Promise.resolve();
		const body = JSON.stringify(msg);
		return new Promise<void>((resolve) => {
			const req = http.request(
				{ hostname: "127.0.0.1", port, path: "/message", method: "POST",
				  headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
				(res) => { res.resume(); resolve(); },
			);
			req.on("error", () => resolve());
			req.write(body);
			req.end();
		});
	}

	const stoneAPI: StoneAPI = {
		onMessage(handler: (msg: StoneMessage) => void): () => void {
			internals.handlers.add(handler);
			return () => { internals.handlers.delete(handler); };
		},
		async send(msg) { await postToSelf(msg); },
		port() { return internals.port; },
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
			fs.writeFileSync(JSON_PATH, JSON.stringify({ port, pid: process.pid }), "utf8");
			openSSEStream(port);
		} catch (err) {
			console.warn(`[sending-stone] server start failed: ${String(err)}`);
		}
	})();

	pi.on("session_shutdown", async () => {
		try {
			if (internals.sseReq) { internals.sseReq.destroy(); internals.sseReq = null; }
			stopServer();
			internals.port = null;
			if (fs.existsSync(JSON_PATH)) fs.unlinkSync(JSON_PATH);
		} catch {}
	});
}
