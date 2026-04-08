import * as http from "http";
import * as crypto from "crypto";
import type { StoneMessage } from "./types.js";

let server: http.Server | null = null;
let currentPort: number | null = null;
let messageCount = 0;

const subscribers = new Set<http.ServerResponse>();

function fanOut(msg: StoneMessage): void {
	const payload = `data: ${JSON.stringify(msg)}\n\n`;
	for (const res of subscribers) {
		res.write(payload);
	}
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
	const url = req.url ?? "/";
	const method = req.method ?? "GET";

	if (method === "POST" && url === "/message") {
		let body = "";
		req.on("data", (chunk: Buffer) => {
			body += chunk.toString();
		});
		req.on("end", () => {
			let partial: Partial<StoneMessage>;
			try {
				partial = JSON.parse(body) as Partial<StoneMessage>;
			} catch {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "invalid json" }));
				return;
			}

			// Validate required fields
			if (!partial.content || typeof partial.content !== "string") {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "missing or invalid 'content' field (string required)" }));
				return;
			}
			if (!partial.from || typeof partial.from !== "string") {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "missing or invalid 'from' field (string required)" }));
				return;
			}

			const msg: StoneMessage = {
				addressing: "both",
				type: "status",
				...partial,
				id: crypto.randomUUID(),
				content: partial.content ?? "",
				from: partial.from ?? "unknown",
				timestamp: Date.now(),
			};

			messageCount++;
			fanOut(msg);

			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: true, id: msg.id }));
		});
		return;
	}

	if (method === "GET" && url === "/stream") {
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			"Connection": "keep-alive",
		});
		res.write(":\n\n");

		subscribers.add(res);

		const ping = setInterval(() => {
			res.write(":\n\n");
		}, 30_000);

		req.on("close", () => {
			clearInterval(ping);
			subscribers.delete(res);
		});
		return;
	}

	if (method === "GET" && url === "/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ status: "ok", port: currentPort, messageCount }));
		return;
	}

	res.writeHead(404, { "Content-Type": "application/json" });
	res.end(JSON.stringify({ error: "not found" }));
}

export function startServer(preferredPort?: number): Promise<number> {
	return new Promise((resolve, reject) => {
		if (server) {
			resolve(currentPort!);
			return;
		}

		const s = http.createServer(handleRequest);
		s.listen(preferredPort ?? 0, "127.0.0.1", () => {
			const addr = s.address();
			if (!addr || typeof addr === "string") {
				reject(new Error("unexpected server address format"));
				return;
			}
			server = s;
			currentPort = addr.port;
			resolve(addr.port);
		});
		s.on("error", (err: Error) => {
			reject(err);
		});
	});
}

export function stopServer(): void {
	if (!server) return;
	for (const res of subscribers) {
		res.end();
	}
	subscribers.clear();
	server.close();
	server = null;
	currentPort = null;
}

export function getMessageCount(): number {
	return messageCount;
}
