/**
 * local-server.ts — Generic local HTTP server with SSE support.
 *
 * Provides a reusable HTTP server lifecycle (find port, graceful shutdown)
 * with built-in SSE streaming support. Used by hoard-sending-stone and
 * available for any extension that needs local HTTP services.
 */

import * as http from "http";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LocalServerOptions {
	/** Hostname to bind to (default: "127.0.0.1"). */
	hostname?: string;
	/** Specific port to use (default: 0 = auto-assign). */
	port?: number;
	/** Request handler. */
	handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
}

export interface LocalServer {
	/** The actual port the server is listening on. */
	port: number;
	/** The underlying http.Server instance. */
	server: http.Server;
	/** Stop the server and clean up all connections. */
	stop(): void;
}

// ── SSE Subscriber Management ────────────────────────────────────────────────

/** Manages SSE (Server-Sent Events) subscribers for broadcasting. */
export class SSEBroadcaster {
	private subscribers = new Set<http.ServerResponse>();
	private pingInterval: ReturnType<typeof setInterval> | null = null;

	/** Add an SSE subscriber. Sets up headers, ping, and cleanup. */
	addSubscriber(req: http.IncomingMessage, res: http.ServerResponse): void {
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			"Connection": "keep-alive",
		});
		res.write(":\n\n"); // initial ping

		this.subscribers.add(res);

		// Start pinging if first subscriber
		if (this.subscribers.size === 1 && !this.pingInterval) {
			this.pingInterval = setInterval(() => {
				for (const sub of this.subscribers) sub.write(":\n\n");
			}, 30_000);
		}

		req.on("close", () => {
			this.subscribers.delete(res);
			if (this.subscribers.size === 0 && this.pingInterval) {
				clearInterval(this.pingInterval);
				this.pingInterval = null;
			}
		});
	}

	/** Broadcast a data event to all subscribers. */
	broadcast(data: string): void {
		const payload = `data: ${data}\n\n`;
		for (const res of this.subscribers) {
			res.write(payload);
		}
	}

	/** Broadcast a JSON object to all subscribers. */
	broadcastJSON(obj: unknown): void {
		this.broadcast(JSON.stringify(obj));
	}

	/** Get the number of active subscribers. */
	get subscriberCount(): number {
		return this.subscribers.size;
	}

	/** Close all subscriber connections. */
	closeAll(): void {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}
		for (const res of this.subscribers) res.end();
		this.subscribers.clear();
	}
}

// ── Server Lifecycle ─────────────────────────────────────────────────────────

/**
 * Start a local HTTP server on a free (or specified) port.
 * Returns a handle with the port, server instance, and stop function.
 */
export function startLocalServer(opts: LocalServerOptions): Promise<LocalServer> {
	const hostname = opts.hostname ?? "127.0.0.1";
	const port = opts.port ?? 0;

	return new Promise((resolve, reject) => {
		const server = http.createServer(opts.handler);

		server.listen(port, hostname, () => {
			const addr = server.address();
			if (!addr || typeof addr === "string") {
				reject(new Error("unexpected server address format"));
				return;
			}
			resolve({
				port: addr.port,
				server,
				stop() {
					server.close();
				},
			});
		});

		server.on("error", (err: Error) => {
			reject(err);
		});
	});
}
