/**
 * Lint Panel — Live diagnostics via LSP + floating panel.
 *
 * Language-agnostic: auto-detects project languages, starts the appropriate
 * LSP servers, and merges diagnostics into a single unified panel.
 * Falls back to language-specific compiler commands when LSP isn't available.
 *
 * Supported: TypeScript (typescript-language-server), Go (gopls).
 * Extensible via LanguageServerConfig + FallbackConfig.
 *
 * A three-inch dog designed this inside a dragon's stomach.
 * She was about 2/3 goop at the time and still wagging.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey, Key } from "@mariozechner/pi-tui";
import type { TUI } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { execSync } from "node:child_process";
import { resolve, relative } from "node:path";
import { existsSync, watch, type FSWatcher } from "node:fs";
import {
	renderHeader, renderFooter, padContentLine,
	type PanelSkin,
} from "../lib/panel-chrome.ts";
import { LspClient, type LspDiagnostic, type LspDiagnosticEvent, type LspServerConfig } from "../lib/lsp-client.ts";

// ── Panel Manager Access ──

const PANELS_KEY = Symbol.for("dot.panels");
function getPanels(): any {
	return (globalThis as any)[PANELS_KEY];
}

// ── Types ──

interface Diagnostic {
	file: string;
	relPath: string;
	line: number;
	col: number;
	code: string;
	message: string;
	severity: "error" | "warning" | "info" | "hint";
	source: string;
}

interface FileGroup {
	file: string;
	relPath: string;
	diagnostics: Diagnostic[];
	expanded: boolean;
}

// ── Language Detection & Configuration ──

interface FallbackConfig {
	/** Display name for the fallback, e.g. "tsc", "go vet" */
	name: string;
	/** Command to run */
	command: string;
	/** Args (can reference {cwd} for working directory) */
	args: string[];
	/** Parse output into diagnostics */
	parser: (output: string, cwd: string) => Diagnostic[];
}

interface LanguageConfig {
	server: LspServerConfig;
	fallback?: FallbackConfig;
}

/** Check if a command exists on PATH. */
function commandExists(cmd: string): boolean {
	try {
		execSync(`which ${cmd}`, { stdio: "pipe", encoding: "utf8" });
		return true;
	} catch {
		return false;
	}
}

/** Parse tsc output into diagnostics. */
function parseTscOutput(output: string, cwd: string): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	for (const line of output.split("\n")) {
		const match = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
		if (match) {
			diagnostics.push({
				file: resolve(cwd, match[1]!),
				relPath: relative(cwd, resolve(cwd, match[1]!)),
				line: parseInt(match[2]!, 10),
				col: parseInt(match[3]!, 10),
				code: match[4]!,
				message: match[5]!,
				severity: "error",
				source: "tsc",
			});
		}
	}
	return diagnostics;
}

/** Parse go vet / gopls output into diagnostics. */
function parseGoOutput(output: string, cwd: string): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	for (const line of output.split("\n")) {
		// go vet: file.go:line:col: message
		const match = line.match(/^(.+?\.go):(\d+):(\d+):\s*(.+)$/);
		if (match) {
			diagnostics.push({
				file: resolve(cwd, match[1]!),
				relPath: relative(cwd, resolve(cwd, match[1]!)),
				line: parseInt(match[2]!, 10),
				col: parseInt(match[3]!, 10),
				code: "",
				message: match[4]!,
				severity: "error",
				source: "go vet",
			});
		}
	}
	return diagnostics;
}

/** Find tsconfig.json relative to cwd. */
function findTsconfig(cwd: string): string | null {
	const candidates = [
		resolve(cwd, "tsconfig.json"),
		resolve(cwd, "berrygems/tsconfig.json"),
	];
	for (const c of candidates) {
		if (existsSync(c)) return c;
	}
	return null;
}

/** Find directories containing Go files. */
function findGoDirs(cwd: string): string[] {
	const dirs: string[] = [];
	const candidates = [".", "dragon-daemon", "cmd", "pkg", "internal"];
	for (const d of candidates) {
		const abs = resolve(cwd, d);
		if (existsSync(resolve(abs, "go.mod"))) {
			dirs.push(d === "." ? "." : d);
		}
	}
	return dirs;
}

/** Detect available languages and their configs for a project. */
function detectLanguages(cwd: string): LanguageConfig[] {
	const configs: LanguageConfig[] = [];

	// TypeScript
	const tsconfig = findTsconfig(cwd);
	if (tsconfig && commandExists("typescript-language-server")) {
		// Determine watch dirs from tsconfig location
		const tsconfigRel = relative(cwd, tsconfig);
		const tsconfigDir = tsconfigRel.includes("/")
			? tsconfigRel.split("/")[0]!
			: ".";
		const watchDirs = tsconfigDir === "."
			? ["src", "lib", "extensions"]
			: [`${tsconfigDir}/extensions`, `${tsconfigDir}/lib`];

		configs.push({
			server: {
				name: "TypeScript",
				command: "typescript-language-server",
				args: ["--stdio"],
				languageId: "typescript",
				fileExtensions: [".ts", ".tsx"],
				watchDirs: watchDirs.filter(d => existsSync(resolve(cwd, d))),
				initOptions: { tsserver: { path: "" } },
			},
			fallback: {
				name: "tsc",
				command: "tsc",
				args: ["--project", tsconfig],
				parser: parseTscOutput,
			},
		});
	}

	// Go
	const goDirs = findGoDirs(cwd);
	if (goDirs.length > 0 && commandExists("gopls")) {
		configs.push({
			server: {
				name: "Go",
				command: "gopls",
				args: ["serve"],
				languageId: "go",
				fileExtensions: [".go"],
				watchDirs: goDirs,
			},
			fallback: goDirs.length > 0 ? {
				name: "go vet",
				command: "go",
				args: ["vet", "./..."],
				parser: parseGoOutput,
			} : undefined,
		});
	}

	return configs;
}

// ── Fallback Runner ──

function runFallback(cwd: string, fallback: FallbackConfig): { diagnostics: Diagnostic[]; duration: number } {
	const start = Date.now();
	let output = "";

	// For Go, run in the directory with go.mod
	const execCwd = fallback.name === "go vet" ? resolve(cwd, "dragon-daemon") : cwd;

	try {
		execSync(`${fallback.command} ${fallback.args.join(" ")}`, {
			cwd: execCwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000,
		});
	} catch (err: any) {
		output = (err.stdout ?? "") + (err.stderr ?? "");
	}
	return { diagnostics: fallback.parser(output, execCwd), duration: Date.now() - start };
}

// ── Diagnostic Grouping ──

function groupByFile(diagnostics: Diagnostic[]): FileGroup[] {
	const groups = new Map<string, FileGroup>();
	for (const d of diagnostics) {
		let group = groups.get(d.file);
		if (!group) {
			group = { file: d.file, relPath: d.relPath, diagnostics: [], expanded: false };
			groups.set(d.file, group);
		}
		group.diagnostics.push(d);
	}
	return [...groups.values()].sort((a, b) => a.relPath.localeCompare(b.relPath));
}

// ── Multi-Language LSP Manager ──

class LspManager {
	private clients: Array<{ config: LanguageConfig; client: LspClient }> = [];
	private watchers: FSWatcher[] = [];
	private allDiagnostics = new Map<string, LspDiagnostic[]>();
	private listeners = new Set<() => void>();
	private cwd: string;
	private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private _readyServers = new Set<string>();
	private _startingServers = new Set<string>();
	private _errors = new Map<string, string>();
	private _configs: LanguageConfig[] = [];

	constructor(cwd: string) {
		this.cwd = cwd;
	}

	get ready(): boolean { return this._readyServers.size > 0; }
	get starting(): boolean { return this._startingServers.size > 0; }
	get configs(): LanguageConfig[] { return this._configs; }

	get statusText(): string {
		const parts: string[] = [];
		for (const name of this._readyServers) parts.push(`${name} ✓`);
		for (const name of this._startingServers) parts.push(`${name} ⏳`);
		for (const [name] of this._errors) parts.push(`${name} ✗`);
		return parts.join(" · ") || "No servers";
	}

	get errorText(): string | null {
		const errs = [...this._errors.entries()].map(([name, err]) => `${name}: ${err}`);
		return errs.length > 0 ? errs.join("; ") : null;
	}

	onUpdate(fn: () => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private notifyListeners(): void {
		for (const fn of this.listeners) fn();
	}

	getAllDiagnostics(): Diagnostic[] {
		const all: Diagnostic[] = [];
		for (const [, diags] of this.allDiagnostics) {
			for (const d of diags) {
				all.push({
					file: d.file,
					relPath: d.relPath,
					line: d.line,
					col: d.col,
					code: d.code || "",
					message: d.message,
					severity: d.severity,
					source: d.source,
				});
			}
		}
		return all;
	}

	getErrorCount(): number {
		let count = 0;
		for (const [, diags] of this.allDiagnostics) {
			count += diags.filter(d => d.severity === "error").length;
		}
		return count;
	}

	getTotalCount(): number {
		let count = 0;
		for (const [, diags] of this.allDiagnostics) {
			count += diags.length;
		}
		return count;
	}

	/** Detect languages and start all available LSP servers. */
	async start(): Promise<void> {
		this._configs = detectLanguages(this.cwd);

		if (this._configs.length === 0) {
			this._errors.set("detect", "No supported languages found");
			this.notifyListeners();
			return;
		}

		const startPromises = this._configs.map(config => this.startServer(config));
		await Promise.allSettled(startPromises);
	}

	private async startServer(config: LanguageConfig): Promise<void> {
		const name = config.server.name;
		this._startingServers.add(name);
		this.notifyListeners();

		try {
			const client = new LspClient(this.cwd, config.server);

			client.on("diagnostics", (event: LspDiagnosticEvent) => {
				// Key by source+uri to keep servers' diagnostics separate
				const key = `${event.source}:${event.uri}`;
				this.allDiagnostics.set(key, event.diagnostics);
				this.notifyListeners();
			});

			client.on("error", (err: Error) => {
				this._errors.set(name, err.message);
				this.notifyListeners();
			});

			client.on("exit", (code: number) => {
				this._readyServers.delete(name);
				this._errors.set(name, `exited with code ${code}`);
				this.notifyListeners();
			});

			await client.start();
			this._startingServers.delete(name);
			this._readyServers.add(name);
			this.clients.push({ config, client });

			// Open configured directories
			for (const dir of config.server.watchDirs) {
				client.openDirectory(dir);
			}

			// Watch for file changes
			for (const dir of config.server.watchDirs) {
				this.watchDirectory(dir, config.server.fileExtensions, client);
			}

			this.notifyListeners();
		} catch (err: any) {
			this._startingServers.delete(name);
			this._errors.set(name, `Failed to start: ${err.message}`);
			this.notifyListeners();
		}
	}

	private watchDirectory(dir: string, extensions: string[], client: LspClient): void {
		const absDir = resolve(this.cwd, dir);
		if (!existsSync(absDir)) return;

		try {
			const watcher = watch(absDir, { recursive: true }, (_event, filename) => {
				if (!filename || !extensions.some(ext => filename.endsWith(ext))) return;
				this.handleFileChange(resolve(absDir, filename), client);
			});
			this.watchers.push(watcher);
		} catch {
			try {
				const watcher = watch(absDir, (_event, filename) => {
					if (!filename || !extensions.some(ext => filename.endsWith(ext))) return;
					this.handleFileChange(resolve(absDir, filename), client);
				});
				this.watchers.push(watcher);
			} catch { /* give up on watching this dir */ }
		}
	}

	private handleFileChange(filePath: string, client: LspClient): void {
		const key = filePath;
		const existing = this.debounceTimers.get(key);
		if (existing) clearTimeout(existing);
		this.debounceTimers.set(key, setTimeout(() => {
			this.debounceTimers.delete(key);
			if (client.isReady) {
				client.notifySaved(relative(this.cwd, filePath));
			}
		}, 300));
	}

	/** Force a refresh of all servers. */
	refresh(): void {
		for (const { config, client } of this.clients) {
			if (client.isReady) {
				for (const dir of config.server.watchDirs) {
					client.openDirectory(dir);
				}
			}
		}
	}

	async dispose(): Promise<void> {
		for (const w of this.watchers) w.close();
		this.watchers = [];
		for (const [, timer] of this.debounceTimers) clearTimeout(timer);
		this.debounceTimers.clear();
		await Promise.allSettled(this.clients.map(({ client }) => client.dispose()));
		this.clients = [];
		this._readyServers.clear();
		this._startingServers.clear();
		this.listeners.clear();
		this.allDiagnostics.clear();
	}
}

// ── Panel Component ──

class LintPanelComponent {
	private panelCtx: any;
	private cwd: string;
	private theme!: Theme;
	private tui!: TUI;
	private lsp: LspManager;
	private groups: FileGroup[] = [];
	private totalErrors = 0;
	private totalDiagnostics = 0;
	private selectedIndex = 0;
	private cache: string[] | null = null;
	private unsubscribe: (() => void) | null = null;
	private mode: "lsp" | "fallback" = "lsp";
	private fallbackName = "";

	constructor(options: { panelCtx: any; cwd: string; lsp: LspManager }) {
		this.panelCtx = options.panelCtx;
		this.cwd = options.cwd;
		this.lsp = options.lsp;
		this.theme = options.panelCtx.theme;
		this.tui = options.panelCtx.tui;

		this.unsubscribe = this.lsp.onUpdate(() => {
			if (this.mode === "lsp") {
				this.rebuildFromLsp();
				this.cache = null;
				this.tui?.requestRender();
			}
		});

		if (this.lsp.ready) {
			this.rebuildFromLsp();
		}
	}

	private rebuildFromLsp(): void {
		const all = this.lsp.getAllDiagnostics();
		this.totalErrors = this.lsp.getErrorCount();
		this.totalDiagnostics = this.lsp.getTotalCount();
		this.mode = "lsp";

		const oldExpanded = new Set(this.groups.filter(g => g.expanded).map(g => g.relPath));
		this.groups = groupByFile(all);

		if (oldExpanded.size > 0) {
			for (const g of this.groups) {
				if (oldExpanded.has(g.relPath)) g.expanded = true;
			}
		} else if (this.groups.length <= 3) {
			for (const g of this.groups) g.expanded = true;
		}
	}

	/** Fallback: run all configured fallback commands. */
	runFallbacks(): void {
		const configs = this.lsp.configs;
		const withFallback = configs.filter(c => c.fallback);
		if (withFallback.length === 0) return;

		this.mode = "fallback";
		this.fallbackName = withFallback.map(c => c.fallback!.name).join(" + ");
		this.cache = null;
		this.tui?.requestRender();

		setTimeout(() => {
			const allDiags: Diagnostic[] = [];
			for (const config of withFallback) {
				const result = runFallback(this.cwd, config.fallback!);
				allDiags.push(...result.diagnostics);
			}
			this.groups = groupByFile(allDiags);
			this.totalErrors = allDiags.filter(d => d.severity === "error").length;
			this.totalDiagnostics = allDiags.length;
			if (this.groups.length <= 3) {
				for (const g of this.groups) g.expanded = true;
			}
			this.cache = null;
			this.tui?.requestRender();
		}, 0);
	}

	handleInput(data: string): void {
		if (matchesKey(data, "r")) {
			this.lsp.refresh();
			return;
		}
		if (matchesKey(data, "t")) {
			if (this.mode === "lsp") {
				this.runFallbacks();
			} else {
				this.rebuildFromLsp();
				this.cache = null;
				this.tui.requestRender();
			}
			return;
		}
		if (matchesKey(data, "j") || matchesKey(data, Key.down)) {
			this.selectedIndex = Math.min(this.selectedIndex + 1, this.getSelectableCount() - 1);
			this.cache = null;
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "k") || matchesKey(data, Key.up)) {
			this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
			this.cache = null;
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
			this.toggleExpand();
			return;
		}
	}

	private getSelectableCount(): number {
		let count = 0;
		for (const g of this.groups) {
			count++;
			if (g.expanded) count += g.diagnostics.length;
		}
		return Math.max(count, 1);
	}

	private toggleExpand(): void {
		let idx = 0;
		for (const g of this.groups) {
			if (idx === this.selectedIndex) {
				g.expanded = !g.expanded;
				this.cache = null;
				this.tui.requestRender();
				return;
			}
			idx++;
			if (g.expanded) idx += g.diagnostics.length;
		}
	}

	invalidate(): void {
		this.theme = this.panelCtx.theme;
		this.tui = this.panelCtx.tui;
		this.cache = null;
	}

	dispose(): void {
		this.unsubscribe?.();
	}

	render(width: number): string[] {
		if (this.cache) return this.cache;

		const th = this.theme;
		const skin: PanelSkin = this.panelCtx.skin();
		const focused = this.panelCtx.isFocused();

		const modeLabel = this.mode === "lsp" ? "LSP" : this.fallbackName || "fallback";
		const isStarting = !this.lsp.ready && this.lsp.starting && this.mode === "lsp";
		const statusIcon = isStarting
			? "⏳"
			: this.totalErrors === 0
				? "✅"
				: "⚠️";

		const toggleLabel = this.mode === "lsp"
			? (this.fallbackName || "fallback")
			: "lsp";

		const chromeOpts = {
			theme: th,
			skin,
			focused,
			title: this.totalErrors === 0
				? `${statusIcon} Lint — Clean`
				: `${statusIcon} Lint — ${this.totalErrors} error${this.totalErrors === 1 ? "" : "s"}`,
			footerHint: focused
				? `r refresh · t ${toggleLabel} · j/k · ⏎`
				: undefined,
			scrollInfo: this.totalDiagnostics > 0
				? `${modeLabel} · ${this.totalDiagnostics} total`
				: this.lsp.statusText || modeLabel,
		};

		const lines: string[] = [];
		lines.push(...renderHeader(width, chromeOpts));

		if (isStarting) {
			const status = this.lsp.errorText
				? th.fg("error" as any, `  ${this.lsp.errorText}`)
				: th.fg("dim", `  ${this.lsp.statusText || "Starting LSP..."}`);
			lines.push(padContentLine(status, width, chromeOpts));
			lines.push(padContentLine("", width, chromeOpts));
		} else if (this.totalDiagnostics === 0) {
			lines.push(padContentLine(th.fg("success", "  All clear! No diagnostics."), width, chromeOpts));
			if (this.lsp.ready) {
				lines.push(padContentLine(
					th.fg("dim", `  ${this.lsp.statusText}`),
					width, chromeOpts,
				));
			}
			lines.push(padContentLine("", width, chromeOpts));
		} else if (this.totalErrors === 0) {
			lines.push(padContentLine(th.fg("success", "  No errors!"), width, chromeOpts));
			const nonErrors = this.totalDiagnostics;
			lines.push(padContentLine(
				th.fg("dim", `  ${nonErrors} ${nonErrors === 1 ? "warning" : "warnings"}`),
				width, chromeOpts,
			));
			lines.push(padContentLine("", width, chromeOpts));
		} else {
			let selectIdx = 0;
			for (const group of this.groups) {
				const isSelected = selectIdx === this.selectedIndex;
				const marker = group.expanded ? "▾" : "▸";
				const errCount = group.diagnostics.filter(d => d.severity === "error").length;
				const warnCount = group.diagnostics.length - errCount;
				const counts = [
					errCount > 0 ? th.fg("error", `${errCount}E`) : "",
					warnCount > 0 ? th.fg("warning", `${warnCount}W`) : "",
				].filter(Boolean).join(" ");
				const prefix = isSelected && focused ? th.fg("accent", "▶ ") : "  ";
				const fileColor = isSelected && focused ? "accent" : "text";

				lines.push(padContentLine(
					`${prefix}${marker} ${th.fg(fileColor as any, group.relPath)} ${counts}`,
					width, chromeOpts,
				));
				selectIdx++;

				if (group.expanded) {
					for (const d of group.diagnostics) {
						const isDiagSelected = selectIdx === this.selectedIndex;
						const dPrefix = isDiagSelected && focused ? th.fg("accent", "  ▶ ") : "    ";
						const loc = th.fg("dim", `${d.line}:${d.col}`);
						const sevColor = d.severity === "error" ? "error" : d.severity === "warning" ? "warning" : "dim";
						const code = d.code ? th.fg(sevColor as any, d.code) : "";
						const sourceTag = this.lsp.configs.length > 1 ? th.fg("dim", ` [${d.source}]`) : "";

						lines.push(padContentLine(
							`${dPrefix}${loc} ${code} ${d.message}${sourceTag}`,
							width, chromeOpts,
						));
						selectIdx++;
					}
				}
			}
			lines.push(padContentLine("", width, chromeOpts));
		}

		lines.push(...renderFooter(width, chromeOpts));

		this.cache = lines;
		return lines;
	}
}

// ── Tool Parameters ──

const LintParams = Type.Object({
	action: StringEnum(["check", "open", "close"] as const, {
		description: "check: run type/lint checks and return results. open: show lint panel with live LSP diagnostics. close: hide lint panel.",
	}),
});

// ── Extension ──

export default function lintPanel(pi: ExtensionAPI): void {
	let panelComponent: LintPanelComponent | null = null;
	let lspManager: LspManager | null = null;
	const PANEL_ID = "lint-panel";

	function ensureLsp(cwd: string): LspManager {
		if (!lspManager) {
			lspManager = new LspManager(cwd);
			lspManager.start().catch(() => {}); // Fire and forget — errors surface in panel
		}
		return lspManager;
	}

	function openPanel(cwd: string): boolean {
		const panels = getPanels();
		if (!panels) return false;

		if (panelComponent) {
			panels.close(PANEL_ID);
			panelComponent = null;
		}

		const lsp = ensureLsp(cwd);

		panels.createPanel(PANEL_ID, (panelCtx: any) => {
			panelComponent = new LintPanelComponent({ panelCtx, cwd, lsp });
			return {
				render: (w: number) => panelComponent!.render(w),
				invalidate: () => panelComponent!.invalidate(),
				handleInput: (data: string) => panelComponent!.handleInput(data),
				dispose: () => panelComponent!.dispose(),
			};
		}, {
			anchor: "top-right",
			width: "45%",
		});

		return true;
	}

	function closePanel(): boolean {
		const panels = getPanels();
		if (panels && panelComponent) {
			panels.close(PANEL_ID);
			panelComponent = null;
			return true;
		}
		return false;
	}

	/**
	 * Run a check: prefer LSP diagnostics if available, fall back to compiler commands.
	 * Returns diagnostics from whichever source responds.
	 */
	function runCheck(cwd: string): { diagnostics: Diagnostic[]; source: string; duration: number } {
		// If LSP is running and has data, use it
		if (lspManager?.ready) {
			const diags = lspManager.getAllDiagnostics();
			return { diagnostics: diags, source: "LSP", duration: 0 };
		}

		// Otherwise, run all fallback commands
		const configs = detectLanguages(cwd);
		const allDiags: Diagnostic[] = [];
		const sources: string[] = [];
		const start = Date.now();

		for (const config of configs) {
			if (config.fallback) {
				const result = runFallback(cwd, config.fallback);
				allDiags.push(...result.diagnostics);
				sources.push(config.fallback.name);
			}
		}

		return {
			diagnostics: allDiags,
			source: sources.join(" + ") || "no tools found",
			duration: Date.now() - start,
		};
	}

	pi.registerTool({
		name: "lint",
		label: "Lint",
		description:
			"Run type/lint checking and show results. Uses LSP servers when available, falls back to compiler commands. Supports TypeScript and Go. Use 'check' to get diagnostics as text, 'open' to show a persistent floating panel, 'close' to hide it.",
		promptSnippet:
			"Run type/lint checking (LSP + compiler fallback) and show/manage diagnostic results",
		promptGuidelines: [
			"Use 'check' before committing to verify no type errors",
			"Use 'open' to keep a persistent lint panel visible while working",
			"Use 'close' to dismiss the lint panel when done",
		],
		parameters: LintParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const cwd = ctx.cwd;

			if (params.action === "check") {
				const result = runCheck(cwd);

				if (result.diagnostics.length === 0) {
					const timing = result.duration > 0 ? ` (${result.duration}ms)` : "";
					return {
						content: [{ type: "text" as const, text: `✅ No diagnostics via ${result.source}${timing}` }],
						details: { action: "check", errors: 0, source: result.source, duration: result.duration },
					};
				}

				const errors = result.diagnostics.filter(d => d.severity === "error");
				const warnings = result.diagnostics.filter(d => d.severity !== "error");
				const groups = groupByFile(result.diagnostics);
				const timing = result.duration > 0 ? ` (${result.duration}ms)` : "";

				const lines: string[] = [];
				if (errors.length > 0) {
					lines.push(`⚠️ ${errors.length} error${errors.length === 1 ? "" : "s"} via ${result.source}${timing}`);
				}
				if (warnings.length > 0) {
					lines.push(`${errors.length === 0 ? "📋" : ""} ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`);
				}
				lines.push("");

				for (const group of groups) {
					lines.push(`## ${group.relPath} (${group.diagnostics.length})`);
					for (const d of group.diagnostics) {
						const sev = d.severity === "error" ? "E" : "W";
						lines.push(`  ${d.line}:${d.col} ${d.code} [${sev}] ${d.message}`);
					}
					lines.push("");
				}

				return {
					content: [{ type: "text" as const, text: lines.join("\n") }],
					details: {
						action: "check",
						errors: errors.length,
						warnings: warnings.length,
						source: result.source,
						duration: result.duration,
						files: groups.map(g => ({ path: g.relPath, count: g.diagnostics.length })),
					},
				};
			}

			if (params.action === "open") {
				const success = openPanel(cwd);
				const langs = detectLanguages(cwd);
				const serverNames = langs.map(l => l.server.name).join(", ");
				return {
					content: [{ type: "text" as const, text: success ? `Opened lint panel — connecting to ${serverNames || "no servers detected"}...` : "Panel manager not available" }],
					details: { action: "open", success, languages: langs.map(l => l.server.name) },
				};
			}

			if (params.action === "close") {
				const success = closePanel();
				return {
					content: [{ type: "text" as const, text: success ? "Closed lint panel" : "No lint panel open" }],
					details: { action: "close", success },
				};
			}

			return {
				content: [{ type: "text" as const, text: `Unknown action: ${params.action}` }],
				details: { action: params.action, success: false },
			};
		},
	});

	// Register /lint command
	pi.registerCommand("lint", {
		description: "Run diagnostics or manage lint panel (check|open|close)",
		handler: async (args, ctx) => {
			const action = (args ?? "").trim() || "check";
			if (action === "open") {
				const ok = openPanel(ctx.cwd);
				const langs = detectLanguages(ctx.cwd);
				const names = langs.map(l => l.server.name).join(", ");
				ctx.ui.notify(ok ? `Lint panel — ${names || "no languages detected"}` : "Panel manager not available", ok ? "info" : "warning");
			} else if (action === "close") {
				const ok = closePanel();
				ctx.ui.notify(ok ? "Closed lint panel" : "No lint panel open", "info");
			} else {
				const result = runCheck(ctx.cwd);
				if (result.diagnostics.length === 0) {
					const timing = result.duration > 0 ? ` (${result.duration}ms)` : "";
					ctx.ui.notify(`✅ Clean — ${result.source}${timing}`, "info");
				} else {
					const errors = result.diagnostics.filter(d => d.severity === "error").length;
					const warnings = result.diagnostics.length - errors;
					const parts = [];
					if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
					if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
					ctx.ui.notify(`⚠️ ${parts.join(", ")} — ${result.source}`, "warning");
				}
			}
		},
	});

	// Cleanup on exit
	process.on("exit", () => { lspManager?.dispose(); });
}
