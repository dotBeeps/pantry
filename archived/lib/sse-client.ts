/**
 * sse-client.ts — Generic SSE (Server-Sent Events) client with reconnection.
 *
 * Connects to a local HTTP SSE endpoint, parses event stream, and calls
 * a handler for each data event. Supports automatic reconnection.
 */

import * as http from "http";

export interface SSEClientOptions {
	/** Hostname to connect to (default: "127.0.0.1"). */
	hostname?: string;
	/** Port to connect to. */
	port: number;
	/** Path to the SSE endpoint (default: "/stream"). */
	path?: string;
	/** Handler called for each parsed data payload. */
	onData: (data: string) => void;
	/** Handler called on connection error (optional). */
	onError?: (err: Error) => void;
	/** Auto-reconnect on disconnect (default: false). */
	reconnect?: boolean;
	/** Delay between reconnection attempts in ms (default: 3000). */
	reconnectDelayMs?: number;
}

export interface SSEClient {
	/** Close the connection (stops reconnection). */
	close(): void;
	/** Whether the client is currently connected. */
	connected: boolean;
}

/**
 * Connect to an SSE endpoint and parse incoming data events.
 * Returns a handle for closing the connection.
 */
export function connectSSE(opts: SSEClientOptions): SSEClient {
	const hostname = opts.hostname ?? "127.0.0.1";
	const path = opts.path ?? "/stream";
	const reconnect = opts.reconnect ?? false;
	const reconnectDelay = opts.reconnectDelayMs ?? 3000;

	let closed = false;
	let currentReq: http.ClientRequest | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	function connect(): void {
		if (closed) return;

		try {
			const req = http.get(
				{ hostname, port: opts.port, path, headers: { Accept: "text/event-stream" } },
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
							opts.onData(raw);
						}
					});
					res.on("end", () => {
						if (!closed && reconnect) {
							reconnectTimer = setTimeout(connect, reconnectDelay);
						}
					});
					res.on("error", (err: Error) => {
						opts.onError?.(err);
						if (!closed && reconnect) {
							reconnectTimer = setTimeout(connect, reconnectDelay);
						}
					});
				},
			);

			req.on("error", (err: Error) => {
				opts.onError?.(err);
				if (!closed && reconnect) {
					reconnectTimer = setTimeout(connect, reconnectDelay);
				}
			});

			currentReq = req;
		} catch (err) {
			opts.onError?.(err as Error);
		}
	}

	connect();

	return {
		get connected() { return currentReq !== null && !closed; },
		close() {
			closed = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			if (currentReq) {
				currentReq.destroy();
				currentReq = null;
			}
		},
	};
}
