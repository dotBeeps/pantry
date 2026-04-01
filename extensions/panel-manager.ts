/**
 * Panel Manager — Shared infrastructure for floating overlay panels.
 *
 * Standalone extension owning:
 * - Singleton PanelRegistry for panel lifecycle
 * - Alt+T focus cycling across all panel types
 * - TUI/theme/cwd capture via invisible widget
 * - Session lifecycle — auto-closes on switch/shutdown
 *
 * Other extensions access the API via globalThis — no imports needed:
 *
 *   const panels = (globalThis as any)[Symbol.for("dot.panels")];
 *   panels.register("my-panel", { handle, invalidate, dispose, onClose });
 *   panels.close("my-panel");
 *
 * The API object is published at extension load time. TUI/theme refs become
 * available after session_start (when the invisible widget renders).
 * Listen for pi.events "panels:ready" to react when TUI is captured.
 *
 * A small dog and a large dragon made this together.
 */

import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import type { OverlayHandle, TUI } from "@mariozechner/pi-tui";
import { matchesKey, Key } from "@mariozechner/pi-tui";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Types ──

/** Shape of a panel registered with the manager. */
export interface ManagedPanel {
	/** Overlay handle from tui.showOverlay() */
	handle: OverlayHandle;
	/** Invalidate cached render state (called on focus changes, resize) */
	invalidate(): void;
	/**
	 * Extension-specific input handler. Called AFTER panel-manager handles
	 * shared keys (unfocus, close, cycle-focus). Return value unused.
	 */
	handleInput?(data: string): void;
	/** Cleanup resources before removal (GIF teardown, intervals, etc.) */
	dispose?(): void;
	/** Notification after close completes — for the extension to update its own state */
	onClose?(): void;
}

// ── Settings ──

const SETTINGS_NAMESPACE = "dotsPiEnhancements";

function getSettingsPath(): string {
	return join(process.env.HOME || process.env.USERPROFILE || homedir(), ".pi", "agent", "settings.json");
}

function readSetting<T>(key: string, fallback: T): T {
	try {
		const path = getSettingsPath();
		if (!existsSync(path)) return fallback;
		const settings = JSON.parse(readFileSync(path, "utf-8"));
		if (typeof settings !== "object" || settings === null) return fallback;
		const ns = settings[SETTINGS_NAMESPACE];
		if (typeof ns !== "object" || ns === null) return fallback;
		return key in ns ? (ns as Record<string, unknown>)[key] as T : fallback;
	} catch { return fallback; }
}

/** Turn a matchesKey-style code like "alt+t" into a display label like "Alt+T". */
function keyLabel(code: string): string {
	return code.split("+").map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("+");
}

// ── Constants ──

const FOCUS_KEY = readSetting<string>("panelFocusKey", "alt+t");
const CLOSE_KEY = readSetting<string>("panelCloseKey", "q");
const UNFOCUS_KEY = readSetting<string>("panelUnfocusKey", "escape");
const FOCUS_LABEL = keyLabel(FOCUS_KEY);
const CLOSE_LABEL = keyLabel(CLOSE_KEY);
const UNFOCUS_LABEL = keyLabel(UNFOCUS_KEY);
const API_KEY = Symbol.for("dot.panels");

// ── Registry (module-private) ──

class PanelRegistry {
	private panels = new Map<string, ManagedPanel>();
	private focusOrder: string[] = [];
	private _tui: TUI | null = null;
	private _theme: Theme | null = null;
	private _cwd: string = process.cwd();
	private _suspended = false;
	private _suspendTimer: ReturnType<typeof setTimeout> | null = null;

	get tui(): TUI | null {
		return this._tui;
	}
	get theme(): Theme | null {
		return this._theme;
	}
	get cwd(): string {
		return this._cwd;
	}
	get size(): number {
		return this.panels.size;
	}

	/** @internal Called by widget factory to inject TUI/theme/cwd refs. */
	_init(tui: TUI | null, theme: Theme | null, cwd: string): void {
		this._tui = tui;
		this._theme = theme;
		this._cwd = cwd;
	}

	/** @internal Update cwd without touching TUI refs. */
	_updateCwd(cwd: string): void {
		this._cwd = cwd;
	}

	/** Register a panel. Duplicate IDs are silently ignored. */
	register(id: string, panel: ManagedPanel): void {
		if (this.panels.has(id)) return;
		this.panels.set(id, panel);
		this.focusOrder.push(id);
	}

	/** Close a panel: dispose → unfocus → hide → remove → notify. Returns false if not found. */
	close(id: string): boolean {
		const panel = this.panels.get(id);
		if (!panel) return false;
		panel.dispose?.();
		panel.handle.unfocus();
		panel.handle.hide();
		this.panels.delete(id);
		const idx = this.focusOrder.indexOf(id);
		if (idx !== -1) this.focusOrder.splice(idx, 1);
		panel.onClose?.();
		this._tui?.requestRender();
		return true;
	}

	/** Close all panels. Returns count of panels closed. */
	closeAll(): number {
		const ids = [...this.panels.keys()];
		for (const id of ids) this.close(id);
		this._clearSuspend();
		return ids.length;
	}

	/**
	 * Suspend panel rendering — all panels return empty output until resumed.
	 * Used during compaction to prevent overlay content from scrolling the
	 * terminal past the main TUI while pi rebuilds its layout.
	 */
	suspend(): void {
		this._suspended = true;
		if (this._suspendTimer) clearTimeout(this._suspendTimer);
		// Safety net: auto-resume after 60s if session_compact never fires
		this._suspendTimer = setTimeout(() => this.resume(), 60_000);
	}

	/** Resume panel rendering. Invalidates all panels for a fresh render pass. */
	resume(): void {
		this._clearSuspend();
		if (!this._suspended) return;
		this._suspended = false;
		for (const panel of this.panels.values()) {
			panel.invalidate();
		}
		this._tui?.requestRender();
	}

	isSuspended(): boolean {
		return this._suspended;
	}

	private _clearSuspend(): void {
		if (this._suspendTimer) {
			clearTimeout(this._suspendTimer);
			this._suspendTimer = null;
		}
	}

	isOpen(id: string): boolean {
		return this.panels.has(id);
	}

	get(id: string): ManagedPanel | undefined {
		return this.panels.get(id);
	}

	/** Cycle focus to the next panel. Returns status message. */
	cycleFocus(): string {
		if (this.focusOrder.length === 0) return "No panels open";

		let currentIdx = -1;
		for (let i = 0; i < this.focusOrder.length; i++) {
			const panel = this.panels.get(this.focusOrder[i]!);
			if (panel?.handle.isFocused()) {
				currentIdx = i;
				break;
			}
		}

		for (const panel of this.panels.values()) {
			panel.handle.unfocus();
			panel.invalidate();
		}

		const nextIdx = (currentIdx + 1) % this.focusOrder.length;
		const nextId = this.focusOrder[nextIdx]!;
		const next = this.panels.get(nextId);
		if (next) {
			next.handle.focus();
			next.invalidate();
			this._tui?.requestRender();
			return `Focused '${nextId}'`;
		}
		return "No panels to focus";
	}

	/** Focus a specific panel by ID. Returns status message. */
	focusPanel(id: string): string {
		const panel = this.panels.get(id);
		if (!panel) return `No panel '${id}' open`;
		for (const [oid, p] of this.panels) {
			if (oid !== id) {
				p.handle.unfocus();
				p.invalidate();
			}
		}
		panel.handle.focus();
		panel.invalidate();
		this._tui?.requestRender();
		return `Focused '${id}'`;
	}

	/** Unfocus all panels. */
	unfocusAll(): void {
		for (const panel of this.panels.values()) {
			panel.handle.unfocus();
			panel.invalidate();
		}
		this._tui?.requestRender();
	}

	/** List all open panels with focus state. */
	list(): { id: string; focused: boolean }[] {
		return [...this.panels.entries()].map(([id, p]) => ({
			id,
			focused: p.handle.isFocused(),
		}));
	}

	/**
	 * Handle input for a focused panel. Shared keys are handled first:
	 *   Configured keys: unfocus, close, cycle-focus (see panelUnfocusKey, panelCloseKey, panelFocusKey).
	 * If none match, delegates to the panel's own handleInput.
	 * Returns true if input was consumed.
	 */
	handlePanelInput(id: string, data: string): boolean {
		const panel = this.panels.get(id);
		if (!panel) return false;

		if (matchesKey(data, UNFOCUS_KEY)) {
			panel.handle.unfocus();
			panel.invalidate();
			this._tui?.requestRender();
			return true;
		}
		if (matchesKey(data, CLOSE_KEY)) {
			this.close(id);
			return true;
		}
		if (matchesKey(data, FOCUS_KEY)) {
			this.cycleFocus();
			return true;
		}

		// Delegate to extension-specific handler
		panel.handleInput?.(data);
		return true;
	}

	requestRender(): void {
		this._tui?.requestRender();
	}
}

// ── Extension ──

export default function (pi: ExtensionAPI) {
	const registry = new PanelRegistry();
	let widgetRegistered = false;

	// ── Public API (published to globalThis for cross-extension access) ──
	const api = {
		get tui() {
			return registry.tui;
		},
		get theme() {
			return registry.theme;
		},
		get cwd() {
			return registry.cwd;
		},
		get size() {
			return registry.size;
		},
		register: (id: string, panel: ManagedPanel) => registry.register(id, panel),
		close: (id: string) => registry.close(id),
		closeAll: () => registry.closeAll(),
		isOpen: (id: string) => registry.isOpen(id),
		get: (id: string) => registry.get(id),
		list: () => registry.list(),
		focusPanel: (id: string) => registry.focusPanel(id),
		cycleFocus: () => registry.cycleFocus(),
		unfocusAll: () => registry.unfocusAll(),
		requestRender: () => registry.requestRender(),
		suspend: () => registry.suspend(),
		resume: () => registry.resume(),
		/** Display-friendly hints for shared panel keys. */
		keyHints: {
			/** Focus-cycle key label, e.g. "Alt+T" */
			focusKey: FOCUS_LABEL,
			/** Close key label, e.g. "Q" */
			closeKey: CLOSE_LABEL,
			/** Unfocus key label, e.g. "Escape" */
			unfocusKey: UNFOCUS_LABEL,
			/** Hint fragment for a *focused* panel: "Q close · Escape unfocus" */
			focused: `${CLOSE_LABEL} close · ${UNFOCUS_LABEL} unfocus`,
			/** Hint fragment for an *unfocused* panel: "Alt+T focus" */
			unfocused: `${FOCUS_LABEL} focus`,
		},
		/** Wrap a component so shared keys (Esc, q, Alt+T) route through the registry. */
		wrapComponent(
			panelId: string,
			inner: {
				render(width: number): string[];
				invalidate(): void;
				handleInput?(data: string): void;
			},
		): {
			render(width: number): string[];
			invalidate(): void;
			handleInput(data: string): void;
		} {
			return {
				render: (w) => registry.isSuspended() ? [] : inner.render(w),
				invalidate: () => inner.invalidate(),
				handleInput: (data) => registry.handlePanelInput(panelId, data),
			};
		},
	};

	(globalThis as any)[API_KEY] = api;

	// ── Shortcut & Resize (registered once at load) ──

	pi.registerShortcut(FOCUS_KEY, {
		description: "Cycle focus between panels",
		handler: async () => {
			if (registry.size > 0) registry.cycleFocus();
		},
	});

	process.stdout.on("resize", () => {
		if (registry.size > 0) {
			for (const { id } of registry.list()) {
				registry.get(id)?.invalidate();
			}
			registry.requestRender();
		}
	});

	// ── TUI Capture ──

	function captureUI(ctx: {
		hasUI: boolean;
		cwd: string;
		ui: {
			setWidget: (
				id: string,
				factory: (tui: TUI, theme: Theme) => { render(): string[]; invalidate(): void },
			) => void;
		};
	}): void {
		registry._updateCwd(ctx.cwd);
		if (widgetRegistered) return;
		if (!ctx.hasUI) {
			registry._init(null, null, ctx.cwd);
			return;
		}
		widgetRegistered = true;
		ctx.ui.setWidget("__panel_manager_capture", (tui, theme) => {
			registry._init(tui, theme, ctx.cwd);
			return {
				render: () => {
					// Pi is running a render pass — invalidate open panel caches so
					// they produce fresh output this cycle (handles scroll, collapse, etc.)
					for (const { id } of registry.list()) {
						registry.get(id)?.invalidate();
					}
					return [];
				},
				invalidate: () => {},
			};
		});
	}

	// ── Session Lifecycle ──

	pi.on("session_start", async (_event, ctx) => {
		captureUI(ctx);
		pi.events.emit("panels:ready");
	});

	pi.on("session_switch", async (_event, ctx) => {
		registry.closeAll();
		widgetRegistered = false;
		captureUI(ctx);
		pi.events.emit("panels:ready");
	});

	pi.on("session_shutdown", async () => {
		registry.closeAll();
	});

	// ── Compaction: suspend panels to prevent terminal scroll ──
	// During compaction pi rebuilds its TUI. Overlay panels rendering at stale
	// positions write past the viewport, scrolling the main interface out of view.
	// Suspend makes all panels return [] from render until pi settles.

	pi.on("session_before_compact", async () => {
		if (registry.size > 0) registry.suspend();
	});

	pi.on("session_compact", async () => {
		// Short delay lets pi finish its post-compaction TUI redraw before
		// panels re-render with fresh coordinates.
		setTimeout(() => registry.resume(), 150);
	});

	// Safety net: if compaction was cancelled (session_compact never fires),
	// resume on the next turn so panels don't stay invisible.
	pi.on("turn_end", async () => {
		if (registry.isSuspended()) registry.resume();
	});
}
