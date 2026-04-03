/**
 * dots-panels — Central authority for floating overlay panels.
 *
 * Owns ALL panel lifecycle: creation, positioning, focus cycling,
 * smart placement, collision avoidance, and session management.
 *
 * Consumer extensions call `panels.createPanel()` instead of touching
 * pi's overlay API directly. No more 35-line boilerplate dances.
 *
 * API published to globalThis at extension load time:
 *
 *   const panels = (globalThis as any)[Symbol.for("dot.panels")];
 *   panels.createPanel("my-panel", (panelCtx) => myComponent, options);
 *   panels.close("my-panel");
 *
 * A small dog and a large dragon made this together.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import type { OverlayAnchor, OverlayHandle, TUI } from "@mariozechner/pi-tui";
import { matchesKey } from "@mariozechner/pi-tui";
import { readHoardSetting, readHoardKey, keyLabel } from "../lib/settings.ts";
import { setDefaultSkin, getSkin, listSkins, type SkinName, type PanelSkin } from "../lib/panel-chrome.ts";

// ── Public Types ──

/** Context passed to panel component factories by createPanel(). */
export interface PanelContext {
	/** TUI rendering reference */
	tui: TUI;
	/** Current theme */
	theme: Theme;
	/** Working directory */
	cwd: string;
	/** Whether this panel currently has keyboard focus */
	isFocused: () => boolean;
	/** Get this panel's current skin (respects per-panel overrides). */
	skin: () => PanelSkin;
}

/** Shape a component must implement to be hosted by dots-panels. */
export interface PanelComponent {
	/** Return rendered lines. Each line MUST NOT exceed `width`. */
	render(width: number): string[];
	/** Clear cached render state for fresh output next cycle. */
	invalidate(): void;
	/** Handle extension-specific keyboard input. Shared keys (Esc/Q/focus) are routed by dots-panels first. */
	handleInput?(data: string): void;
	/** Clean up resources (intervals, images, etc.) before panel removal. */
	dispose?(): void;
}

/** Reference point on another panel for relative anchoring. */
export interface PanelAnchorRef {
	/** ID of the panel to anchor relative to */
	relativeTo: string;
	/** Which edge/corner of the reference panel */
	edge: "top" | "bottom" | "left" | "right"
		| "top-left" | "top-right" | "bottom-left" | "bottom-right";
	/** Horizontal offset from computed position in cells */
	offsetX?: number;
	/** Vertical offset from computed position in cells */
	offsetY?: number;
}

/** Anchor can be a screen position or a reference to another panel. */
export type AnchorSpec = OverlayAnchor | PanelAnchorRef;

/** Options for createPanel(). All optional — smart defaults apply. */
export interface PanelCreateOptions {
	/** Screen anchor OR panel-relative anchor. Omit for auto-placement. */
	anchor?: AnchorSpec;
	/** Width — column count or percentage string (e.g. "30%"). Default: "30%" */
	width?: number | string;
	/** Minimum width in columns. Default: 30 */
	minWidth?: number;
	/** Maximum height — row count or percentage string. Default: "90%" */
	maxHeight?: number | string;
	/** Horizontal offset from anchor in cells */
	offsetX?: number;
	/** Vertical offset from anchor in cells */
	offsetY?: number;
	/** Margin — number (all sides) or per-side object. Default: 1 */
	margin?: number | { top?: number; right?: number; bottom?: number; left?: number };
	/** If true, skip collision avoidance. Default: false */
	allowOverlap?: boolean;
	/** Responsive visibility function */
	visible?: (termWidth: number, termHeight: number) => boolean;
	/** Called after the panel is closed (for consumer state cleanup) */
	onClose?: () => void;
}

/** Result from createPanel(). */
export interface PanelCreateResult {
	success: boolean;
	message: string;
}

/** Layout suggestion returned by suggestLayout(). */
export interface LayoutSuggestion {
	anchor: OverlayAnchor;
	width: string;
	margin?: { top?: number; right?: number; bottom?: number; left?: number };
}

// ── Internal Types ──

/** Shape of a panel in the registry (internal + backward-compat register()). */
interface ManagedPanel {
	handle: OverlayHandle;
	invalidate(): void;
	handleInput?(data: string): void;
	dispose?(): void;
	onClose?(): void;
}

/** Tracked geometry for an open panel. */
interface PanelGeometry {
	/** Resolved screen anchor (even if originally relative) */
	anchor: OverlayAnchor;
	/** Requested width spec */
	width: number | string;
	/** Resolved width in columns */
	resolvedWidthCols: number;
	/** Estimated height in rows (from maxHeight or default) */
	estimatedHeightRows: number;
	/** Applied offsets */
	offsetX: number;
	offsetY: number;
	/** Applied margin */
	margin: number;
	/** Original anchor spec (may be PanelAnchorRef) */
	anchorSpec: AnchorSpec;
	/** For relatively-positioned panels: the actual computed bounding box.
	 *  Without this, computeGeoRect uses anchor+offsets which gives the
	 *  REFERENCE panel's position, not this panel's actual position. */
	computedRect?: CellRect;
}

/** Axis-aligned bounding box in cell coordinates. */
interface CellRect {
	top: number;
	left: number;
	width: number;
	height: number;
}

// ── Settings ──

// ── Constants ──

const FOCUS_KEY = readHoardKey("panels.focusKey", "alt+t");
const CLOSE_KEY = readHoardKey("panels.closeKey", "q");
const UNFOCUS_KEY = readHoardKey("panels.unfocusKey", "escape");
const DEFAULT_SKIN = readHoardSetting<string>("panels.defaultSkin", "ember");
const FOCUS_LABEL = keyLabel(FOCUS_KEY);
const CLOSE_LABEL = keyLabel(CLOSE_KEY);
const UNFOCUS_LABEL = keyLabel(UNFOCUS_KEY);
const API_KEY = Symbol.for("dot.panels");

const VALID_ANCHORS: OverlayAnchor[] = [
	"top-left", "top-center", "top-right",
	"left-center", "center", "right-center",
	"bottom-left", "bottom-center", "bottom-right",
];

/** Default placement priority — right side first, center last. */
const PLACEMENT_PRIORITY: OverlayAnchor[] = [
	"right-center", "top-right", "bottom-right",
	"left-center", "top-left", "bottom-left",
	"top-center", "bottom-center",
];

const DEFAULT_WIDTH = "30%";
const DEFAULT_MIN_WIDTH = 30;
const DEFAULT_MAX_HEIGHT = "90%";
const DEFAULT_MARGIN = 1;
const DEFAULT_ESTIMATED_HEIGHT_ROWS = 20;
/** Cap for collision-detection height estimates. maxHeight is an upper bound,
 *  not the actual render height — using it raw makes every panel look terminal-sized.
 *  This cap keeps collision math realistic. */
const COLLISION_HEIGHT_CAP_PCT = 0.40;

// ── Geometry Helpers ──

/** Resolve a width spec (number or "N%") to a column count. */
function resolveWidth(width: number | string, termCols: number): number {
	if (typeof width === "number") return Math.min(width, termCols);
	if (typeof width === "string" && width.endsWith("%")) {
		const pct = parseFloat(width);
		return isNaN(pct) ? Math.round(termCols * 0.3) : Math.round(termCols * (pct / 100));
	}
	const n = parseInt(String(width), 10);
	return isNaN(n) ? Math.round(termCols * 0.3) : Math.min(n, termCols);
}

/** Resolve a height spec to a row count. */
function resolveHeight(height: number | string | undefined, termRows: number): number {
	if (height === undefined) return DEFAULT_ESTIMATED_HEIGHT_ROWS;
	if (typeof height === "number") return Math.min(height, termRows);
	if (typeof height === "string" && height.endsWith("%")) {
		const pct = parseFloat(height);
		return isNaN(pct) ? DEFAULT_ESTIMATED_HEIGHT_ROWS : Math.round(termRows * (pct / 100));
	}
	return DEFAULT_ESTIMATED_HEIGHT_ROWS;
}

/** Compute a panel's bounding box from its anchor, dimensions, and offsets. */
function computeCellRect(
	anchor: OverlayAnchor,
	panelW: number,
	panelH: number,
	offsetX: number,
	offsetY: number,
	margin: number,
	termCols: number,
	termRows: number,
): CellRect {
	let top: number;
	let left: number;

	// Vertical position
	if (anchor.startsWith("top")) top = margin;
	else if (anchor.startsWith("bottom")) top = termRows - panelH - margin;
	else top = Math.round((termRows - panelH) / 2); // center vertically

	// Horizontal position
	if (anchor.endsWith("left")) left = margin;
	else if (anchor.endsWith("right")) left = termCols - panelW - margin;
	else if (anchor === "center" || anchor.endsWith("center")) left = Math.round((termCols - panelW) / 2);
	else left = Math.round((termCols - panelW) / 2);

	return {
		top: top + offsetY,
		left: left + offsetX,
		width: panelW,
		height: panelH,
	};
}

/** Check if two CellRects overlap. */
function rectsOverlap(a: CellRect, b: CellRect): boolean {
	return a.left < b.left + b.width &&
		a.left + a.width > b.left &&
		a.top < b.top + b.height &&
		a.top + a.height > b.top;
}

/** Compute CellRect for a panel-relative anchor. */
function computeRelativeRect(
	ref: PanelGeometry,
	refRect: CellRect,
	panelW: number,
	panelH: number,
	anchorRef: PanelAnchorRef,
): CellRect {
	const ox = anchorRef.offsetX ?? 0;
	const oy = anchorRef.offsetY ?? 0;

	let top: number;
	let left: number;

	switch (anchorRef.edge) {
		case "bottom":
			top = refRect.top + refRect.height + oy;
			left = refRect.left + ox;
			break;
		case "top":
			top = refRect.top - panelH + oy;
			left = refRect.left + ox;
			break;
		case "right":
			top = refRect.top + oy;
			left = refRect.left + refRect.width + ref.margin + ox;
			break;
		case "left":
			top = refRect.top + oy;
			left = refRect.left - panelW - ref.margin + ox;
			break;
		case "bottom-right":
			top = refRect.top + refRect.height + ref.margin + oy;
			left = refRect.left + refRect.width + ref.margin + ox;
			break;
		case "bottom-left":
			top = refRect.top + refRect.height + ref.margin + oy;
			left = refRect.left - panelW - ref.margin + ox;
			break;
		case "top-right":
			top = refRect.top - panelH - ref.margin + oy;
			left = refRect.left + refRect.width + ref.margin + ox;
			break;
		case "top-left":
			top = refRect.top - panelH - ref.margin + oy;
			left = refRect.left - panelW - ref.margin + ox;
			break;
		default:
			top = refRect.top + refRect.height + oy;
			left = refRect.left + ox;
	}

	return { top, left, width: panelW, height: panelH };
}

/** Get the flat margin value from a margin spec. */
function flatMargin(margin: number | { top?: number; right?: number; bottom?: number; left?: number } | undefined): number {
	if (margin === undefined) return DEFAULT_MARGIN;
	if (typeof margin === "number") return margin;
	return Math.max(margin.top ?? 0, margin.right ?? 0, margin.bottom ?? 0, margin.left ?? 0);
}

// ── Smart Placement ──

/**
 * Find the best non-overlapping anchor for a new panel.
 * Tries PLACEMENT_PRIORITY order, picking the first anchor whose bounding box
 * doesn't intersect any existing panel.
 */
function findBestAnchor(
	panelW: number,
	panelH: number,
	margin: number,
	existingRects: CellRect[],
	termCols: number,
	termRows: number,
): OverlayAnchor {
	for (const anchor of PLACEMENT_PRIORITY) {
		const rect = computeCellRect(anchor, panelW, panelH, 0, 0, margin, termCols, termRows);
		if (!existingRects.some(er => rectsOverlap(rect, er))) {
			return anchor;
		}
	}
	// All positions conflict — fall back to the first with least overlap area
	let bestAnchor = PLACEMENT_PRIORITY[0]!;
	let bestOverlap = Infinity;
	for (const anchor of PLACEMENT_PRIORITY) {
		const rect = computeCellRect(anchor, panelW, panelH, 0, 0, margin, termCols, termRows);
		let totalOverlap = 0;
		for (const er of existingRects) {
			const overlapW = Math.max(0, Math.min(rect.left + rect.width, er.left + er.width) - Math.max(rect.left, er.left));
			const overlapH = Math.max(0, Math.min(rect.top + rect.height, er.top + er.height) - Math.max(rect.top, er.top));
			totalOverlap += overlapW * overlapH;
		}
		if (totalOverlap < bestOverlap) {
			bestOverlap = totalOverlap;
			bestAnchor = anchor;
		}
	}
	return bestAnchor;
}

/**
 * Adjust offsets to avoid collision when a specific anchor is requested.
 * Stacks vertically or horizontally depending on the anchor's edge.
 */
function adjustForCollision(
	anchor: OverlayAnchor,
	panelW: number,
	panelH: number,
	baseOffsetX: number,
	baseOffsetY: number,
	margin: number,
	existingRects: CellRect[],
	termCols: number,
	termRows: number,
): { offsetX: number; offsetY: number } {
	let rect = computeCellRect(anchor, panelW, panelH, baseOffsetX, baseOffsetY, margin, termCols, termRows);

	if (!existingRects.some(er => rectsOverlap(rect, er))) {
		return { offsetX: baseOffsetX, offsetY: baseOffsetY };
	}

	// Try stacking vertically (shift down in 2-row increments)
	for (let dy = 1; dy < termRows; dy += 2) {
		// Try shifting down
		const downRect = { ...rect, top: rect.top + dy };
		if (downRect.top + downRect.height <= termRows && !existingRects.some(er => rectsOverlap(downRect, er))) {
			return { offsetX: baseOffsetX, offsetY: baseOffsetY + dy };
		}
		// Try shifting up
		const upRect = { ...rect, top: rect.top - dy };
		if (upRect.top >= 0 && !existingRects.some(er => rectsOverlap(upRect, er))) {
			return { offsetX: baseOffsetX, offsetY: baseOffsetY - dy };
		}
	}

	// Last resort: shift horizontally
	for (let dx = 2; dx < termCols; dx += 2) {
		const shiftedRect = { ...rect, left: rect.left + dx };
		if (shiftedRect.left + shiftedRect.width <= termCols && !existingRects.some(er => rectsOverlap(shiftedRect, er))) {
			return { offsetX: baseOffsetX + dx, offsetY: baseOffsetY };
		}
	}

	// Truly no room — return original offsets (will overlap)
	return { offsetX: baseOffsetX, offsetY: baseOffsetY };
}

// ── Layout Suggestions ──

/**
 * Suggest optimal positions for N new panels.
 * Considers currently open panels to avoid conflicts.
 */
function suggestLayoutPositions(count: number, occupiedAnchors: Set<OverlayAnchor>): LayoutSuggestion[] {
	if (count <= 0) return [];

	// For small counts with no existing panels, use curated static layouts
	if (occupiedAnchors.size === 0) {
		if (count === 1) return [{ anchor: "right-center", width: "30%", margin: { right: 1 } }];
		if (count === 2) return [
			{ anchor: "top-right", width: "30%", margin: { right: 1, top: 1 } },
			{ anchor: "bottom-right", width: "30%", margin: { right: 1, bottom: 1 } },
		];
		if (count === 3) return [
			{ anchor: "top-right", width: "28%", margin: { right: 1, top: 0 } },
			{ anchor: "right-center", width: "28%", margin: { right: 1 } },
			{ anchor: "bottom-right", width: "28%", margin: { right: 1, bottom: 0 } },
		];
	}

	// Dynamic: pick from priority list, skipping occupied
	const available = PLACEMENT_PRIORITY.filter(a => !occupiedAnchors.has(a));
	const suggestions: LayoutSuggestion[] = [];
	const width = count > 3 ? "28%" : "30%";

	for (let i = 0; i < count && i < available.length; i++) {
		const anchor = available[i]!;
		const side = anchor.endsWith("right") ? "right" : anchor.endsWith("left") ? "left" : undefined;
		suggestions.push({
			anchor,
			width,
			margin: side ? { [side]: 1 } : undefined,
		});
	}

	// If we need more panels than available positions, stack with offsets
	if (suggestions.length < count) {
		const remaining = count - suggestions.length;
		for (let i = 0; i < remaining; i++) {
			suggestions.push({
				anchor: PLACEMENT_PRIORITY[i % PLACEMENT_PRIORITY.length]!,
				width,
				margin: { right: 1 },
			});
		}
	}

	return suggestions;
}

// ── PanelRegistry ──

/** Stored info needed to recreate a panel on resize. */
interface PanelRecreateInfo {
	factory: (panelCtx: PanelContext) => PanelComponent;
	options: PanelCreateOptions;
}

class PanelRegistry {
	private panels = new Map<string, ManagedPanel>();
	private geometries = new Map<string, PanelGeometry>();
	private recreateInfo = new Map<string, PanelRecreateInfo>();
	private focusOrder: string[] = [];
	private _tui: TUI | null = null;
	private _theme: Theme | null = null;
	private _cwd: string = process.cwd();
	private _ctx: ExtensionContext | null = null;
	private _suspended = false;
	private _suspendTimer: ReturnType<typeof setTimeout> | null = null;
	/** Virtual focus — visual-only, doesn't change overlay capture state.
	 *  Used by capturing overlays (like ask prompts) that forward keys manually. */
	private _virtualFocusId: string | null = null;
	/** Per-panel skin overrides. If absent, falls back to global default. */
	private _panelSkins = new Map<string, string>();
	private _resizeTimer: ReturnType<typeof setTimeout> | null = null;
	private _resizeListenerAttached = false;
	/** Timestamp (ms) after which overlays should become visible again post-resize.
	 *  Zero means no resize in progress. */
	private _resizeVisibleAfter = 0;
	private static readonly RESIZE_HIDE_MS = 150;

	get tui(): TUI | null { return this._tui; }
	get theme(): Theme | null { return this._theme; }
	get cwd(): string { return this._cwd; }
	get size(): number { return this.panels.size; }

	/** @internal Called by widget factory to inject TUI/theme/cwd refs. */
	_init(tui: TUI | null, theme: Theme | null, cwd: string): void {
		this._tui = tui;
		this._theme = theme;
		this._cwd = cwd;
	}

	/** @internal Update cwd without touching TUI refs. */
	_updateCwd(cwd: string): void { this._cwd = cwd; }

	/** @internal Store ExtensionContext for createPanel(). Updated on every session event. */
	_setContext(ctx: ExtensionContext): void {
		this._ctx = ctx;
		this._updateCwd(ctx.cwd);
	}

	/** @internal Clear context on shutdown. */
	_clearContext(): void { this._ctx = null; }

	/**
	 * Whether overlays should be visible right now.
	 * Returns false during the post-resize blanking window.
	 * Used as a workaround for a pi upstream bug where nonCapturing overlays
	 * corrupt the viewport scroll position when the terminal gets wider.
	 */
	isVisibleDuringResize(): boolean {
		return this._resizeVisibleAfter === 0 || Date.now() >= this._resizeVisibleAfter;
	}

	/** @internal Attach process.stdout resize listener (once). */
	_attachResizeListener(): void {
		if (this._resizeListenerAttached) return;
		this._resizeListenerAttached = true;

		// WORKAROUND: nonCapturing overlays + terminal widen causes viewport scroll
		// corruption in pi's TUI compositor (upstream bug). visible() returning false
		// isn't enough — the overlay stays in pi's stack and still affects layout.
		// Nuclear option: fully remove all overlays from the stack on resize,
		// then recreate everything after the resize settles.
		process.stdout.on("resize", () => {
			this._resizeVisibleAfter = Date.now() + PanelRegistry.RESIZE_HIDE_MS;
			// Immediately nuke all overlays from pi's stack
			this._removeAllForResize();
			if (this._resizeTimer) clearTimeout(this._resizeTimer);
			this._resizeTimer = setTimeout(() => {
				this._resizeVisibleAfter = 0;
				this._recreateAllAfterResize();
			}, PanelRegistry.RESIZE_HIDE_MS);
		});
	}

	/**
	 * Remove ALL panels from pi's overlay stack without clearing recreateInfo.
	 * Called synchronously on SIGWINCH so the stack is empty when pi re-renders.
	 */
	private _removeAllForResize(): void {
		for (const [, panel] of this.panels) {
			panel.dispose?.();
			panel.handle.unfocus();
			panel.handle.hide();
		}
		this.panels.clear();
		this.geometries.clear();
		this.focusOrder = [];
		// recreateInfo is intentionally preserved
	}

	/**
	 * Recreate ALL panels from stored recreateInfo after resize settles.
	 * Screen-anchored panels recreate at their original anchor (pi handles new size).
	 * Relatively-anchored panels recompute positions from the new terminal dimensions.
	 */
	private _recreateAllAfterResize(): void {
		if (this.recreateInfo.size === 0) return;

		// Collect all, sort by dependency, recreate
		const all: Array<{ id: string; info: PanelRecreateInfo }> = [];
		for (const [id, info] of this.recreateInfo) {
			all.push({ id, info });
		}
		const sorted = this._sortByDependency(all);

		// Clear recreateInfo — createPanel() will re-populate it
		this.recreateInfo.clear();

		for (const { id, info } of sorted) {
			this.createPanel(id, info.factory, info.options);
		}
	}


	/** Sort panels so that dependency targets come before dependents. */
	private _sortByDependency(items: Array<{ id: string; info: PanelRecreateInfo }>): Array<{ id: string; info: PanelRecreateInfo }> {
		const idSet = new Set(items.map(i => i.id));
		const result: Array<{ id: string; info: PanelRecreateInfo }> = [];
		const placed = new Set<string>();

		// Iterative topological sort — safe for small N
		let remaining = [...items];
		for (let pass = 0; pass < items.length + 1 && remaining.length > 0; pass++) {
			const next: typeof remaining = [];
			for (const item of remaining) {
				const anchor = item.info.options?.anchor;
				const depId = anchor && typeof anchor === "object" ? anchor.relativeTo : undefined;
				if (!depId || !idSet.has(depId) || placed.has(depId)) {
					result.push(item);
					placed.add(item.id);
				} else {
					next.push(item);
				}
			}
			remaining = next;
		}
		// Any remaining (circular deps) — just append
		result.push(...remaining);
		return result;
	}

	// ── Panel Creation (primary API) ──

	/**
	 * Create, position, and register a panel in one call.
	 *
	 * The factory receives a PanelContext with tui, theme, cwd, and isFocused().
	 * dots-panels handles overlay creation, key routing, and geometry tracking.
	 *
	 * If the panel already exists, it's refreshed instead of recreated.
	 * If no anchor is specified, the smart placement engine picks the best position.
	 * Unless allowOverlap is true, collisions with existing panels are avoided.
	 */
	createPanel(
		id: string,
		factory: (panelCtx: PanelContext) => PanelComponent,
		options?: PanelCreateOptions,
	): PanelCreateResult {
		// Already open? Refresh.
		if (this.panels.has(id)) {
			const existing = this.panels.get(id)!;
			existing.invalidate();
			this._tui?.requestRender();
			return { success: true, message: `Panel '${id}' already open — refreshed` };
		}

		// Need ctx for overlay creation
		if (!this._ctx) {
			return { success: false, message: "Error: no active session context" };
		}
		if (!this._ctx.hasUI) {
			return { success: false, message: "Error: TUI not available (non-interactive mode)" };
		}

		const ctx = this._ctx;
		const opts = options ?? {};
		const termCols = process.stdout.columns ?? 120;
		const termRows = process.stdout.rows ?? 40;

		// ── Resolve dimensions ──
		const widthSpec = opts.width ?? DEFAULT_WIDTH;
		const minW = opts.minWidth ?? DEFAULT_MIN_WIDTH;
		const panelW = Math.max(resolveWidth(widthSpec, termCols), minW);
		// For collision detection, cap height estimate at COLLISION_HEIGHT_CAP_PCT of terminal.
		// maxHeight is an upper bound, not actual render height — panels are usually much shorter.
		const maxH = resolveHeight(opts.maxHeight, termRows);
		const panelH = Math.min(maxH, Math.max(DEFAULT_ESTIMATED_HEIGHT_ROWS, Math.round(termRows * COLLISION_HEIGHT_CAP_PCT)));
		const margin = flatMargin(opts.margin);

		// ── Resolve anchor + position ──
		let resolvedAnchor: OverlayAnchor;
		let finalOffsetX = opts.offsetX ?? 0;
		let finalOffsetY = opts.offsetY ?? 0;
		let useAbsolutePos = false;
		let absoluteRow: number | string | undefined;
		let absoluteCol: number | string | undefined;
		let relativeComputedRect: CellRect | undefined;

		const existingRects = this.getAllRects(termCols, termRows);

		if (opts.anchor === undefined) {
			// Auto-place: pick the best non-overlapping position
			resolvedAnchor = findBestAnchor(panelW, panelH, margin, existingRects, termCols, termRows);
		} else if (typeof opts.anchor === "string") {
			// Screen anchor
			resolvedAnchor = VALID_ANCHORS.includes(opts.anchor as OverlayAnchor)
				? opts.anchor as OverlayAnchor
				: "right-center";

			// Collision adjustment (unless explicitly allowed)
			if (!opts.allowOverlap && existingRects.length > 0) {
				const adjusted = adjustForCollision(
					resolvedAnchor, panelW, panelH,
					finalOffsetX, finalOffsetY, margin,
					existingRects, termCols, termRows,
				);
				finalOffsetX = adjusted.offsetX;
				finalOffsetY = adjusted.offsetY;
			}
		} else {
			// Panel-relative anchor
			const anchorRef = opts.anchor;
			const refGeo = this.geometries.get(anchorRef.relativeTo);
			if (!refGeo) {
				return { success: false, message: `Error: reference panel '${anchorRef.relativeTo}' not found` };
			}
			const refRect = this.computeGeoRect(refGeo, termCols, termRows);
			const relRect = computeRelativeRect(refGeo, refRect, panelW, panelH, anchorRef);
			relativeComputedRect = relRect;

			// Use exact cell coordinates — no percentage drift
			absoluteRow = relRect.top;
			absoluteCol = relRect.left;
			useAbsolutePos = true;
			resolvedAnchor = refGeo.anchor; // inherit for geometry tracking
		}

		// ── Build overlay options ──
		const overlayOptions: Record<string, unknown> = {
			nonCapturing: true,
			width: widthSpec,
			minWidth: opts.minWidth ?? DEFAULT_MIN_WIDTH,
			maxHeight: opts.maxHeight ?? DEFAULT_MAX_HEIGHT,
			margin: opts.margin ?? DEFAULT_MARGIN,
		};

		if (useAbsolutePos) {
			overlayOptions.row = absoluteRow;
			overlayOptions.col = absoluteCol;
		} else {
			overlayOptions.anchor = resolvedAnchor;
			if (finalOffsetX !== 0) overlayOptions.offsetX = finalOffsetX;
			if (finalOffsetY !== 0) overlayOptions.offsetY = finalOffsetY;
		}

		// Compose resize-blanking visibility with any user-provided visible() callback.
		// During resize, all panels return false to avoid pi's viewport scroll bug.
		const userVisible = opts.visible;
		overlayOptions.visible = (w: number, h: number): boolean => {
			if (!this.isVisibleDuringResize()) return false;
			return userVisible ? userVisible(w, h) : true;
		};

		// ── Track geometry ──
		const geometry: PanelGeometry = {
			anchor: resolvedAnchor,
			width: widthSpec,
			resolvedWidthCols: panelW,
			estimatedHeightRows: panelH,
			offsetX: finalOffsetX,
			offsetY: finalOffsetY,
			margin,
			anchorSpec: opts.anchor ?? resolvedAnchor,
			computedRect: relativeComputedRect,
		};

		// Reserve geometry IMMEDIATELY so parallel createPanel() calls see it.
		// onHandle fires async — without this, concurrent opens all pick the same slot.
		this.geometries.set(id, geometry);

		// Store recreation info for resize handling
		this.recreateInfo.set(id, { factory, options: opts });

		// ── Create overlay ──
		let componentRef: PanelComponent | null = null;

		ctx.ui.custom(
			(tui, theme, _kb, _done) => {
				const panelCtx: PanelContext = {
					tui,
					theme,
					cwd: this._cwd,
					isFocused: () => (this.panels.get(id)?.handle.isFocused() ?? false) || this._virtualFocusId === id,
					skin: () => getSkin(this._panelSkins.get(id)),
				};
				componentRef = factory(panelCtx);
				// Return wrapped component — shared keys route through the registry
				return {
					render: (w: number) => this._suspended ? [] : componentRef!.render(w),
					invalidate: () => componentRef!.invalidate(),
					handleInput: (data: string) => this.handlePanelInput(id, data),
				};
			},
			{
				overlay: true,
				overlayOptions,
				onHandle: (handle: OverlayHandle) => {
					if (!componentRef) return;
					this.register(id, {
						handle,
						invalidate: () => componentRef!.invalidate(),
						handleInput: (data) => componentRef!.handleInput?.(data),
						dispose: () => componentRef!.dispose?.(),
						onClose: opts.onClose,
					});
					// Geometry already reserved above — no need to set again
				},
			},
		).catch(() => {
			// Overlay creation failed — release reserved geometry + recreation info
			this.geometries.delete(id);
			this.recreateInfo.delete(id);
			opts.onClose?.();
		});

		return { success: true, message: `Opened panel '${id}' at ${resolvedAnchor}` };
	}

	// ── Registration (lower-level, kept for backward compat) ──

	/** Register a panel. Duplicate IDs are silently ignored. */
	register(id: string, panel: ManagedPanel): void {
		if (this.panels.has(id)) return;
		this.panels.set(id, panel);
		this.focusOrder.push(id);
	}

	// ── Lifecycle ──

	/** Close a panel: dispose → unfocus → hide → remove → notify. Returns false if not found. */
	close(id: string): boolean {
		const panel = this.panels.get(id);
		if (!panel) return false;
		if (this._virtualFocusId === id) this._virtualFocusId = null;
		this._panelSkins.delete(id);
		panel.dispose?.();
		panel.handle.unfocus();
		panel.handle.hide();
		this.panels.delete(id);
		this.geometries.delete(id);
		this.recreateInfo.delete(id);
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

	// ── Suspend/Resume (compaction) ──

	suspend(): void {
		this._suspended = true;
		if (this._suspendTimer) clearTimeout(this._suspendTimer);
		this._suspendTimer = setTimeout(() => this.resume(), 60_000);
	}

	resume(): void {
		this._clearSuspend();
		if (!this._suspended) return;
		this._suspended = false;
		for (const panel of this.panels.values()) panel.invalidate();
		this._tui?.requestRender();
	}

	isSuspended(): boolean { return this._suspended; }

	private _clearSuspend(): void {
		if (this._suspendTimer) { clearTimeout(this._suspendTimer); this._suspendTimer = null; }
	}

	// ── Queries ──

	isOpen(id: string): boolean { return this.panels.has(id); }
	get(id: string): ManagedPanel | undefined { return this.panels.get(id); }

	/** Get tracked geometry for a panel. */
	getGeometry(id: string): PanelGeometry | undefined {
		return this.geometries.get(id);
	}

	/** List all open panels with focus state. */
	list(): { id: string; focused: boolean }[] {
		return [...this.panels.entries()].map(([id, p]) => ({
			id,
			focused: p.handle.isFocused(),
		}));
	}

	// ── Focus Management ──

	// ── Virtual Focus (for use by capturing overlays like ask prompts) ──

	/** Set virtual focus (visual-only, no overlay capture change). */
	setVirtualFocus(id: string | null): void {
		if (this._virtualFocusId === id) return;
		if (this._virtualFocusId) this.panels.get(this._virtualFocusId)?.invalidate();
		this._virtualFocusId = id;
		if (id) this.panels.get(id)?.invalidate();
		this._tui?.requestRender();
	}

	/** Get current virtual focus ID (auto-clears if panel was closed). */
	getVirtualFocusId(): string | null {
		if (this._virtualFocusId && !this.panels.has(this._virtualFocusId)) {
			this._virtualFocusId = null;
		}
		return this._virtualFocusId;
	}

	/** Cycle virtual focus through open panels. Returns status. */
	cycleVirtualFocus(): string {
		if (this.focusOrder.length === 0) return "No panels open";
		let currentIdx = this._virtualFocusId
			? this.focusOrder.indexOf(this._virtualFocusId)
			: -1;
		if (this._virtualFocusId) this.panels.get(this._virtualFocusId)?.invalidate();
		const nextIdx = (currentIdx + 1) % this.focusOrder.length;
		const nextId = this.focusOrder[nextIdx]!;
		this._virtualFocusId = nextId;
		this.panels.get(nextId)?.invalidate();
		this._tui?.requestRender();
		return `Virtual focus: '${nextId}'`;
	}

	// ── Global Skin Management ──

	/** Change the global default skin and re-render all open panels. */
	setSkin(name: string): string {
		setDefaultSkin(name as SkinName);
		for (const panel of this.panels.values()) {
			panel.invalidate();
		}
		this._tui?.requestRender();
		return `Skin: '${name}'`;
	}

	/** Cycle the global default to the next skin and re-render all open panels. */
	cycleSkin(): string {
		const skins = listSkins();
		const current = getSkin().name;
		const idx = skins.indexOf(current);
		const next = skins[(idx + 1) % skins.length]!;
		return this.setSkin(next);
	}

	// ── Per-Panel Skin Management ──

	/** Set a specific panel's skin (overrides the global default for that panel). */
	setPanelSkin(id: string, name: string): string {
		this._panelSkins.set(id, name);
		this.panels.get(id)?.invalidate();
		this._tui?.requestRender();
		return `Panel '${id}' skin: '${name}'`;
	}

	/** Clear a panel's skin override (reverts to global default). */
	clearPanelSkin(id: string): void {
		this._panelSkins.delete(id);
		this.panels.get(id)?.invalidate();
		this._tui?.requestRender();
	}

	/** Cycle a specific panel's skin forward or backward. */
	cyclePanelSkin(id: string, direction: 1 | -1 = 1): string {
		const skins = listSkins();
		const current = (this._panelSkins.get(id) ?? getSkin().name);
		const idx = skins.indexOf(current);
		const next = skins[((idx + direction) % skins.length + skins.length) % skins.length]!;
		return this.setPanelSkin(id, next);
	}

	/** Get a panel's current skin name. */
	getPanelSkin(id: string): string {
		return this._panelSkins.get(id) ?? getSkin().name;
	}

	/** Cycle focus to the next panel. Returns status message. */
	cycleFocus(): string {
		// Clear any virtual focus when using real overlay focus
		if (this._virtualFocusId) {
			this.panels.get(this._virtualFocusId)?.invalidate();
			this._virtualFocusId = null;
		}
		if (this.focusOrder.length === 0) return "No panels open";

		let currentIdx = -1;
		for (let i = 0; i < this.focusOrder.length; i++) {
			const panel = this.panels.get(this.focusOrder[i]!);
			if (panel?.handle.isFocused()) { currentIdx = i; break; }
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
			if (oid !== id) { p.handle.unfocus(); p.invalidate(); }
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

	// ── Input Routing ──

	/**
	 * Handle input for a focused panel. Shared keys first, then delegate.
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

		// Skin cycling: ] = next, [ = previous
		if (data === "]" || data === "[") {
			this.cyclePanelSkin(id, data === "]" ? 1 : -1);
			return true;
		}

		panel.handleInput?.(data);
		return true;
	}

	// ── Render ──

	requestRender(): void { this._tui?.requestRender(); }

	// ── Layout Suggestions ──

	/** Suggest optimal positions for N new panels, considering what's already open. */
	suggestLayout(count: number): LayoutSuggestion[] {
		const occupied = new Set<OverlayAnchor>();
		for (const [, geo] of this.geometries) occupied.add(geo.anchor);
		return suggestLayoutPositions(count, occupied);
	}

	// ── Geometry Helpers (internal) ──

	/** Get bounding rects for all open panels. */
	private getAllRects(termCols: number, termRows: number): CellRect[] {
		const rects: CellRect[] = [];
		for (const [, geo] of this.geometries) {
			rects.push(this.computeGeoRect(geo, termCols, termRows));
		}
		return rects;
	}

	/** Compute CellRect from stored PanelGeometry. */
	private computeGeoRect(geo: PanelGeometry, termCols: number, termRows: number): CellRect {
		// Relatively-positioned panels store their actual computed rect
		if (geo.computedRect) return geo.computedRect;
		return computeCellRect(
			geo.anchor,
			geo.resolvedWidthCols,
			geo.estimatedHeightRows,
			geo.offsetX,
			geo.offsetY,
			geo.margin,
			termCols,
			termRows,
		);
	}

	// ── Backward Compat ──

	/** Wrap a component so shared keys route through the registry. Lower-level than createPanel(). */
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
			render: (w) => this._suspended ? [] : inner.render(w),
			invalidate: () => inner.invalidate(),
			handleInput: (data) => this.handlePanelInput(panelId, data),
		};
	}
}

// ── Extension ──

export default function (pi: ExtensionAPI) {
	// Apply configured default skin
	setDefaultSkin(DEFAULT_SKIN as SkinName);

	const registry = new PanelRegistry();
	let widgetRegistered = false;

	// ── Public API (published to globalThis) ──
	const api = {
		get tui() { return registry.tui; },
		get theme() { return registry.theme; },
		get cwd() { return registry.cwd; },
		get size() { return registry.size; },
		// Primary API
		createPanel: (id: string, factory: (panelCtx: PanelContext) => PanelComponent, options?: PanelCreateOptions) =>
			registry.createPanel(id, factory, options),
		suggestLayout: (count: number) => registry.suggestLayout(count),
		getGeometry: (id: string) => registry.getGeometry(id),
		// Lifecycle
		close: (id: string) => registry.close(id),
		closeAll: () => registry.closeAll(),
		isOpen: (id: string) => registry.isOpen(id),
		get: (id: string) => registry.get(id),
		list: () => registry.list(),
		// Focus
		focusPanel: (id: string) => registry.focusPanel(id),
		cycleFocus: () => registry.cycleFocus(),
		unfocusAll: () => registry.unfocusAll(),
		/** Route input to a specific panel, including shared keys (close/unfocus/focus-cycle). */
		handleInput: (id: string, data: string) => registry.handlePanelInput(id, data),
		// Virtual focus (visual-only, for capturing overlays that forward keys)
		setVirtualFocus: (id: string | null) => registry.setVirtualFocus(id),
		getVirtualFocusId: () => registry.getVirtualFocusId(),
		cycleVirtualFocus: () => registry.cycleVirtualFocus(),
		// Skin management (global)
		setSkin: (name: string) => registry.setSkin(name),
		cycleSkin: () => registry.cycleSkin(),
		listSkins: () => listSkins(),
		currentSkin: () => getSkin().name,
		// Skin management (per-panel)
		setPanelSkin: (id: string, name: string) => registry.setPanelSkin(id, name),
		clearPanelSkin: (id: string) => registry.clearPanelSkin(id),
		cyclePanelSkin: (id: string, dir?: 1 | -1) => registry.cyclePanelSkin(id, dir),
		getPanelSkin: (id: string) => registry.getPanelSkin(id),
		// Render
		requestRender: () => registry.requestRender(),
		// Compaction
		suspend: () => registry.suspend(),
		resume: () => registry.resume(),
		// Backward compat (prefer createPanel)
		register: (id: string, panel: ManagedPanel) => registry.register(id, panel),
		wrapComponent: (panelId: string, inner: any) => registry.wrapComponent(panelId, inner),
		/** Display-friendly hints for shared panel keys. */
		keyHints: {
			focusKey: FOCUS_LABEL,
			closeKey: CLOSE_LABEL,
			unfocusKey: UNFOCUS_LABEL,
			focused: `${CLOSE_LABEL} close · ${UNFOCUS_LABEL} unfocus`,
			unfocused: `${FOCUS_LABEL} focus`,
		},
		/** Raw matchesKey-compatible key codes for passthrough from overlays. */
		rawKeys: {
			focus: FOCUS_KEY,
			close: CLOSE_KEY,
			unfocus: UNFOCUS_KEY,
		},
	};

	(globalThis as any)[API_KEY] = api;

	// ── Shortcut & Resize ──

	pi.registerShortcut(FOCUS_KEY, {
		description: "Cycle focus between panels",
		handler: async () => {
			if (registry.size > 0) registry.cycleFocus();
		},
	});

	process.stdout.on("resize", () => {
		if (registry.size > 0) {
			for (const { id } of registry.list()) registry.get(id)?.invalidate();
			registry.requestRender();
		}
	});

	// ── TUI Capture (invisible widget for tui/theme refs) ──

	function captureUI(ctx: ExtensionContext): void {
		registry._setContext(ctx);
		registry._attachResizeListener();
		if (widgetRegistered) return;
		if (!ctx.hasUI) {
			registry._init(null, null, ctx.cwd);
			return;
		}
		widgetRegistered = true;
		// Widget ID kept as "__panel_manager_capture" for backward compat with active sessions
		ctx.ui.setWidget("__panel_manager_capture", (tui, theme) => {
			registry._init(tui, theme, ctx.cwd);
			return {
				// Widget renders nothing — it exists only to capture tui/theme refs.
				// DO NOT invalidate panels here — render() is called every frame
				// and invalidating triggers re-renders, causing a feedback loop
				// that destroys scroll position on terminal resize.
				render: () => [],
				invalidate: () => {},
			};
		});
	}

	// ── Session Lifecycle ──

	pi.on("session_start", async (_event, ctx) => {
		captureUI(ctx);
		pi.events.emit("panels:ready", {});
	});

	pi.on("session_switch", async (_event, ctx) => {
		registry.closeAll();
		widgetRegistered = false;
		captureUI(ctx);
		pi.events.emit("panels:ready", {});
	});

	pi.on("session_shutdown", async () => {
		registry.closeAll();
		registry._clearContext();
	});

	// ── Compaction: suspend panels to prevent terminal scroll ──

	pi.on("session_before_compact", async () => {
		if (registry.size > 0) registry.suspend();
	});

	pi.on("session_compact", async () => {
		setTimeout(() => registry.resume(), 150);
	});

	pi.on("turn_end", async () => {
		if (registry.isSuspended()) registry.resume();
	});

	// ── /panels Command ──

	pi.registerCommand("panels", {
		description: "Manage all floating panels: list, close-all, layout, help",
		handler: async (args, ctx) => {
			const parts = (args ?? "").trim().split(/\s+/).filter(Boolean);
			const subcmd = parts[0]?.toLowerCase() ?? "list";

			switch (subcmd) {
				case "list":
				case "status": {
					if (registry.size === 0) {
						ctx.ui.notify("No panels open", "info");
						return;
					}
					const lines = [`${registry.size} panel(s) open:`];
					for (const { id, focused } of registry.list()) {
						const geo = registry.getGeometry(id);
						const pos = geo ? ` @ ${geo.anchor}` : "";
						const focus = focused ? " ⚡" : "";
						lines.push(`  ${id}${pos}${focus}`);
					}
					ctx.ui.notify(lines.join("\n"), "info");
					return;
				}
				case "close-all": {
					const count = registry.closeAll();
					ctx.ui.notify(`Closed ${count} panel(s)`, "info");
					return;
				}
				case "layout": {
					const count = parts[1] ? parseInt(parts[1], 10) : registry.size + 1;
					const suggestions = registry.suggestLayout(isNaN(count) ? 1 : count);
					if (!suggestions.length) {
						ctx.ui.notify("No layout suggestions for 0 panels", "info");
						return;
					}
					const lines = [`Suggested layout for ${count} panel(s):`];
					for (let i = 0; i < suggestions.length; i++) {
						const s = suggestions[i]!;
						lines.push(`  Panel ${i + 1}: ${s.anchor} ${s.width}`);
					}
					ctx.ui.notify(lines.join("\n"), "info");
					return;
				}
				case "focus": {
					if (registry.size === 0) { ctx.ui.notify("No panels open", "info"); return; }
					const target = parts[1];
					ctx.ui.notify(target ? registry.focusPanel(target) : registry.cycleFocus(), "info");
					return;
				}
				default:
					ctx.ui.notify([
						"🐉 dots-panels — central panel manager",
						"",
						"  /panels                  List all open panels",
						"  /panels close-all         Close everything",
						"  /panels layout [count]    Suggest positions",
						"  /panels focus [id]        Focus panel / cycle",
						"",
						`Focus: ${FOCUS_LABEL} · Close: ${CLOSE_LABEL} · Unfocus: ${UNFOCUS_LABEL}`,
					].join("\n"), "info");
			}
		},
	});
}
