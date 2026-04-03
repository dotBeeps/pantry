/**
 * Minimal LSP Client — JSON-RPC over stdio to any language server.
 *
 * Handles the LSP framing protocol (Content-Length headers), initialization
 * handshake, and diagnostic streaming. Language-agnostic: takes a server
 * command + args, works with any LSP-compliant server.
 *
 * Built by a tiny goop dog and a very warm dragon.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { EventEmitter } from "node:events";

// ── Types ──

export interface LspServerConfig {
	/** Display name, e.g. "TypeScript", "Go" */
	name: string;
	/** Server binary, e.g. "typescript-language-server", "gopls" */
	command: string;
	/** Server arguments, e.g. ["--stdio"] */
	args: string[];
	/** LSP language ID, e.g. "typescript", "go" */
	languageId: string;
	/** File extensions to track, e.g. [".ts", ".tsx"] */
	fileExtensions: string[];
	/** Directories to open and watch (relative to cwd) */
	watchDirs: string[];
	/** Optional initialization options passed to the server */
	initOptions?: Record<string, unknown>;
}

export interface LspDiagnostic {
	file: string;
	relPath: string;
	line: number;
	col: number;
	severity: "error" | "warning" | "info" | "hint";
	code: string;
	message: string;
	/** Which server reported this diagnostic */
	source: string;
}

export interface LspDiagnosticEvent {
	uri: string;
	diagnostics: LspDiagnostic[];
	source: string;
}

interface LspMessage {
	jsonrpc: "2.0";
	id?: number;
	method?: string;
	params?: any;
	result?: any;
	error?: any;
}

const SEVERITY_MAP: Record<number, "error" | "warning" | "info" | "hint"> = {
	1: "error",
	2: "warning",
	3: "info",
	4: "hint",
};

/** Map file extension to LSP languageId. */
const EXT_TO_LANGUAGE: Record<string, string> = {
	".ts": "typescript",
	".tsx": "typescriptreact",
	".js": "javascript",
	".jsx": "javascriptreact",
	".go": "go",
	".py": "python",
	".rs": "rust",
	".java": "java",
	".kt": "kotlin",
	".c": "c",
	".cpp": "cpp",
	".h": "c",
	".hpp": "cpp",
};

/** Get LSP languageId for a file path, with a default fallback. */
export function languageIdForFile(filePath: string, defaultId: string): string {
	for (const [ext, lang] of Object.entries(EXT_TO_LANGUAGE)) {
		if (filePath.endsWith(ext)) return lang;
	}
	return defaultId;
}

// ── LSP Client ──

export class LspClient extends EventEmitter {
	private proc: ChildProcess | null = null;
	private buffer = "";
	private nextId = 1;
	private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
	private rootUri: string;
	private cwd: string;
	private config: LspServerConfig;
	private initialized = false;
	private _disposed = false;

	constructor(cwd: string, config: LspServerConfig) {
		super();
		this.cwd = cwd;
		this.config = config;
		this.rootUri = `file://${resolve(cwd)}`;
	}

	get isRunning(): boolean {
		return this.proc !== null && !this._disposed;
	}

	get isReady(): boolean {
		return this.initialized && this.isRunning;
	}

	get serverName(): string {
		return this.config.name;
	}

	/** Start the language server and perform the initialization handshake. */
	async start(): Promise<void> {
		if (this._disposed) return;

		this.proc = spawn(this.config.command, this.config.args, {
			cwd: this.cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env },
		});

		this.proc.stdout!.on("data", (chunk: Buffer) => this.onData(chunk));
		this.proc.stderr!.on("data", () => {
			// LSP stderr is for logging, not errors — ignore unless debugging
		});
		this.proc.on("exit", (code) => {
			if (!this._disposed) {
				this.emit("exit", code);
			}
		});
		this.proc.on("error", (err) => {
			this.emit("error", err);
		});

		// Initialize handshake
		await this.request("initialize", {
			processId: process.pid,
			rootUri: this.rootUri,
			capabilities: {
				textDocument: {
					publishDiagnostics: {
						relatedInformation: true,
					},
					synchronization: {
						didSave: true,
						didOpen: true,
						didClose: true,
					},
				},
				workspace: {
					didChangeWatchedFiles: {
						dynamicRegistration: false,
					},
				},
			},
			initializationOptions: this.config.initOptions ?? {},
		});

		this.notify("initialized", {});
		this.initialized = true;
		this.emit("ready");
	}

	/** Open a file so the LSP tracks it. */
	openFile(filePath: string): void {
		if (!this.isReady) return;
		const absPath = resolve(this.cwd, filePath);
		const uri = `file://${absPath}`;
		let text: string;
		try {
			text = readFileSync(absPath, "utf-8");
		} catch {
			return;
		}
		const langId = languageIdForFile(filePath, this.config.languageId);
		this.notify("textDocument/didOpen", {
			textDocument: {
				uri,
				languageId: langId,
				version: 1,
				text,
			},
		});
	}

	/** Notify the LSP that a file was saved (triggers re-diagnosis). */
	notifySaved(filePath: string): void {
		if (!this.isReady) return;
		const absPath = resolve(this.cwd, filePath);
		const uri = `file://${absPath}`;
		let text: string;
		try {
			text = readFileSync(absPath, "utf-8");
		} catch {
			return;
		}
		// Send didChange with full content
		this.notify("textDocument/didChange", {
			textDocument: { uri, version: Date.now() },
			contentChanges: [{ text }],
		});
	}

	/** Open all matching files under a directory. */
	openDirectory(dir: string, extensions?: string[]): void {
		const exts = extensions ?? this.config.fileExtensions;
		const walk = (d: string) => {
			try {
				for (const entry of readdirSync(d, { withFileTypes: true })) {
					const full = resolve(d, entry.name);
					if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== "vendor") {
						walk(full);
					} else if (entry.isFile() && exts.some(ext => entry.name.endsWith(ext))) {
						this.openFile(relative(this.cwd, full));
					}
				}
			} catch { /* skip unreadable dirs */ }
		};
		walk(resolve(this.cwd, dir));
	}

	/** Shut down the LSP server gracefully. */
	async dispose(): Promise<void> {
		if (this._disposed) return;
		this._disposed = true;

		if (this.initialized && this.proc) {
			try {
				await this.request("shutdown", null);
				this.notify("exit", null);
			} catch { /* already dead */ }
		}

		this.proc?.kill();
		this.proc = null;
		this.pending.clear();
		this.removeAllListeners();
	}

	// ── JSON-RPC Transport ──

	private send(msg: LspMessage): void {
		if (!this.proc?.stdin?.writable) return;
		const json = JSON.stringify(msg);
		const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
		this.proc.stdin.write(header + json);
	}

	private request(method: string, params: any): Promise<any> {
		return new Promise((resolve, reject) => {
			const id = this.nextId++;
			this.pending.set(id, { resolve, reject });
			this.send({ jsonrpc: "2.0", id, method, params });

			// Timeout after 15s
			setTimeout(() => {
				if (this.pending.has(id)) {
					this.pending.delete(id);
					reject(new Error(`LSP request ${method} timed out`));
				}
			}, 15_000);
		});
	}

	private notify(method: string, params: any): void {
		this.send({ jsonrpc: "2.0", method, params });
	}

	private onData(chunk: Buffer): void {
		this.buffer += chunk.toString("utf-8");
		this.processBuffer();
	}

	private processBuffer(): void {
		while (true) {
			// Find Content-Length header
			const headerEnd = this.buffer.indexOf("\r\n\r\n");
			if (headerEnd === -1) break;

			const header = this.buffer.slice(0, headerEnd);
			const match = header.match(/Content-Length:\s*(\d+)/i);
			if (!match) {
				// Malformed header — skip past it
				this.buffer = this.buffer.slice(headerEnd + 4);
				continue;
			}

			const contentLength = parseInt(match[1]!, 10);
			const bodyStart = headerEnd + 4;

			if (this.buffer.length < bodyStart + contentLength) break; // Need more data

			const body = this.buffer.slice(bodyStart, bodyStart + contentLength);
			this.buffer = this.buffer.slice(bodyStart + contentLength);

			try {
				const msg: LspMessage = JSON.parse(body);
				this.handleMessage(msg);
			} catch {
				// Malformed JSON — skip
			}
		}
	}

	private handleMessage(msg: LspMessage): void {
		// Response to a request
		if (msg.id !== undefined && this.pending.has(msg.id)) {
			const handler = this.pending.get(msg.id)!;
			this.pending.delete(msg.id);
			if (msg.error) {
				handler.reject(new Error(msg.error.message ?? "LSP error"));
			} else {
				handler.resolve(msg.result);
			}
			return;
		}

		// Server notification
		if (msg.method === "textDocument/publishDiagnostics") {
			this.handleDiagnostics(msg.params);
		}
	}

	private handleDiagnostics(params: any): void {
		const uri: string = params.uri;
		const filePath = uri.startsWith("file://") ? uri.slice(7) : uri;
		const relPath = relative(this.cwd, filePath);
		const source = this.config.name;

		const diagnostics: LspDiagnostic[] = (params.diagnostics ?? []).map((d: any) => ({
			file: filePath,
			relPath,
			line: (d.range?.start?.line ?? 0) + 1, // LSP is 0-indexed
			col: (d.range?.start?.character ?? 0) + 1,
			severity: SEVERITY_MAP[d.severity] ?? "info",
			code: String(d.code ?? ""),
			message: d.message ?? "",
			source,
		}));

		this.emit("diagnostics", { uri, diagnostics, source } satisfies LspDiagnosticEvent);
	}
}
