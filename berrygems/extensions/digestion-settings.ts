/**
 * Digestion Settings - Live-tweakable floating panel for compaction configuration.
 *
 * Because when a dragon processes context, it's not "compaction" - it's digestion.
 *
 * Features:
 * - Non-blocking overlay panel showing current compaction settings + context usage
 * - Toggle auto-compaction on/off, adjust reserveTokens and keepRecentTokens
 * - Trigger modes: Reserve (raw tokens), Percentage (% of context), Fixed (token threshold)
 * - Strategy presets for manual compaction (Default / Code / Task / Minimal)
 * - Threshold marker on the context bar showing where compaction triggers
 * - Last compaction stats - timestamp, token savings, percentage freed
 * - Writes changes to project .pi/settings.json for persistence across sessions
 * - Hooks session_before_compact as a safety net for live enforcement
 * - `/digestion` command to open/close the panel
 * - Alt+C shortcut to toggle panel visibility
 * - Press `g` when focused to copy values from global config
 * - Context usage bar updates on turn_end events
 *
 * A small dog and a large dragon made this together.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import { matchesKey, Key } from "@mariozechner/pi-tui";
import {
	renderHeader, renderFooter, padContentLine,
	type ChromeOptions,
} from "../lib/panel-chrome.ts";

// ── Panel Manager Access ──
const PANELS_KEY = Symbol.for("dot.panels");
function getPanels(): any {
	return (globalThis as any)[PANELS_KEY];
}

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { readHoardKey, readProjectHoardSetting, writeProjectHoardSetting, keyLabel } from "../lib/settings.ts";

// ── Local Types ──

interface PanelContext {
	tui: TUI;
	theme: Theme;
	cwd: string;
	isFocused: () => boolean;
	skin: () => import("../lib/panel-chrome.ts").PanelSkin;
}

// ── Types ──

type TriggerMode = "reserve" | "percentage" | "fixed";

interface CompactionSettings {
	enabled: boolean;
	reserveTokens: number;
	keepRecentTokens: number;
}

interface DigestSettings {
	triggerMode: TriggerMode;
	triggerPercentage: number;
	triggerFixed: number;
	strategy: string;
}

interface ContextUsageInfo {
	tokens: number | null;
	contextWindow: number | null;
	percent: number | null;
}

interface CompactionStats {
	lastCompactedAt: number | null;
	tokensBefore: number | null;
	tokensAfter: number | null;
}

interface PanelItem {
	id: string;
	label: string;
}

interface StrategyPreset {
	id: string;
	label: string;
	instructions: string;
}

// ── Constants ──

// Settings namespace — migrated to hoard.digestion.* via shared lib

const DEFAULT_SETTINGS: CompactionSettings = {
	enabled: true,
	reserveTokens: 16384,
	keepRecentTokens: 20000,
};

const DEFAULT_DIGEST: DigestSettings = {
	triggerMode: "reserve",
	triggerPercentage: 80,
	triggerFixed: 150000,
	strategy: "default",
};

const TRIGGER_MODES: TriggerMode[] = ["reserve", "percentage", "fixed"];
const TRIGGER_MODE_LABELS: Record<TriggerMode, string> = {
	reserve: "Reserve",
	percentage: "Percentage",
	fixed: "Fixed",
};

/**
 * Reserve-mode response-budget presets - filtered at runtime to modelMaxTokens.
 * In Reserve mode, reserveTokens = how much space to keep for the LLM's response.
 * In Percentage/Fixed modes, reserveTokens is always SAFE_RESERVE_TOKENS (decoupled).
 */
const RESERVE_PRESETS_BASE = [4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576];

/**
 * Safe reserveTokens written to the settings file for Percentage/Fixed trigger modes.
 * Pi uses reserveTokens as max_tokens for compaction LLM calls (0.8 × reserveTokens).
 * This value keeps that budget reasonable and API-safe regardless of context window size.
 * Actual trigger logic is enforced separately via turn_end + session_before_compact.
 */
const SAFE_RESERVE_TOKENS = 16384;

/** Preset values for keepRecentTokens - how much recent context to preserve */
const KEEP_RECENT_PRESETS = [5000, 10000, 20000, 40000, 80000, 160000];

/** Preset values for percentage mode - trigger when context reaches this % full */
const PERCENTAGE_PRESETS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95];

/** Strategy presets for manual compaction - customInstructions passed to ctx.compact() */
const STRATEGY_PRESETS: StrategyPreset[] = [
	{ id: "default", label: "Default", instructions: "" },
	{
		id: "code",
		label: "Code",
		instructions:
			"Focus on code changes, file paths, function signatures, and technical decisions. Keep implementation details. Minimize conversational prose.",
	},
	{
		id: "task",
		label: "Tasks",
		instructions:
			"Focus on user goals, completed tasks, current progress, and planned next steps. Minimize code-level details.",
	},
	{
		id: "minimal",
		label: "Minimal",
		instructions:
			"Extremely brief summary. Only include absolutely essential context needed to continue. Omit anything that can be re-derived from files.",
	},
];

// ── Digestion Overlay Animation ──

const DIGESTION_PHASES: Array<{ emoji: string; text: string }> = [
	{ emoji: "🐉", text: "Starting digestion" },
	{ emoji: "🔥", text: "Firing up the furnace" },
	{ emoji: "✨", text: "Condensing the essence" },
	{ emoji: "💭", text: "Weaving through memories" },
	{ emoji: "⚗️", text: "Distilling the context" },
	{ emoji: "📜", text: "Inscribing the summary" },
];
const PHASE_INTERVAL_MS = 2800;

/** Key to copy settings from global config (configurable via hoard.digestion.copyGlobalKey) */
const COPY_GLOBAL_KEY = readHoardKey("digestion.copyGlobalKey", "g");
const COPY_GLOBAL_LABEL = keyLabel(COPY_GLOBAL_KEY);

// ── Helpers ──



function formatTokens(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
	return String(n);
}

function cyclePreset(current: number, presets: number[], direction: 1 | -1): number {
	let closestIdx = 0;
	let closestDist = Math.abs(current - presets[0]!);
	for (let i = 1; i < presets.length; i++) {
		const dist = Math.abs(current - presets[i]!);
		if (dist < closestDist) {
			closestIdx = i;
			closestDist = dist;
		}
	}
	const nextIdx = Math.max(0, Math.min(presets.length - 1, closestIdx + direction));
	return presets[nextIdx]!;
}

function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

// ── Settings I/O ──

function getGlobalSettingsPath(): string {
	return join(process.env.HOME || process.env.USERPROFILE || homedir(), ".pi", "agent", "settings.json");
}

function getProjectSettingsPath(cwd: string): string {
	return join(cwd, ".pi", "settings.json");
}

function readSettingsFile(path: string): Record<string, unknown> {
	try {
		if (!existsSync(path)) return {};
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		return typeof parsed === "object" && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}



function readCompactionSettings(cwd: string): CompactionSettings {
	const global = readSettingsFile(getGlobalSettingsPath());
	const project = readSettingsFile(getProjectSettingsPath(cwd));
	const globalCompaction = (global.compaction ?? {}) as Partial<CompactionSettings>;
	const projectCompaction = (project.compaction ?? {}) as Partial<CompactionSettings>;

	return {
		enabled: projectCompaction.enabled ?? globalCompaction.enabled ?? DEFAULT_SETTINGS.enabled,
		reserveTokens: projectCompaction.reserveTokens ?? globalCompaction.reserveTokens ?? DEFAULT_SETTINGS.reserveTokens,
		keepRecentTokens:
			projectCompaction.keepRecentTokens ?? globalCompaction.keepRecentTokens ?? DEFAULT_SETTINGS.keepRecentTokens,
	};
}

function readGlobalCompactionSettings(): CompactionSettings {
	const global = readSettingsFile(getGlobalSettingsPath());
	const gc = (global.compaction ?? {}) as Partial<CompactionSettings>;
	return {
		enabled: gc.enabled ?? DEFAULT_SETTINGS.enabled,
		reserveTokens: gc.reserveTokens ?? DEFAULT_SETTINGS.reserveTokens,
		keepRecentTokens: gc.keepRecentTokens ?? DEFAULT_SETTINGS.keepRecentTokens,
	};
}

function readDigestSettings(cwd: string): DigestSettings {
	return {
		triggerMode: readProjectHoardSetting(cwd, "digestion.triggerMode", DEFAULT_DIGEST.triggerMode) as TriggerMode,
		triggerPercentage: readProjectHoardSetting(cwd, "digestion.triggerPercentage", DEFAULT_DIGEST.triggerPercentage) as number,
		triggerFixed: readProjectHoardSetting(cwd, "digestion.triggerFixed", DEFAULT_DIGEST.triggerFixed) as number,
		strategy: readProjectHoardSetting(cwd, "digestion.strategy", DEFAULT_DIGEST.strategy) as string,
	};
}

function writeCompactionSetting(cwd: string, key: keyof CompactionSettings, value: unknown): boolean {
	try {
		const path = getProjectSettingsPath(cwd);
		const settings = readSettingsFile(path);
		const compaction =
			typeof settings.compaction === "object" && settings.compaction !== null
				? (settings.compaction as Record<string, unknown>)
				: {};
		compaction[key] = value;
		settings.compaction = compaction;
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
		return true;
	} catch {
		return false;
	}
}

function writeAllCompactionSettings(cwd: string, settings: CompactionSettings): boolean {
	try {
		const path = getProjectSettingsPath(cwd);
		const file = readSettingsFile(path);
		file.compaction = { ...settings };
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, JSON.stringify(file, null, 2) + "\n");
		return true;
	} catch {
		return false;
	}
}

function writeDigestSetting(cwd: string, key: string, value: unknown): boolean {
	return writeProjectHoardSetting(cwd, `digestion.${key}`, value);
}

// ── Panel Component ──

class CompactionPanelComponent {
	private panelCtx: PanelContext;
	private theme: Theme;
	private tui: TUI;
	private cwd: string;
	private settings: CompactionSettings;
	private contextUsage: ContextUsageInfo = { tokens: null, contextWindow: null, percent: null };
	private selectedIndex = 0;
	private cachedWidth?: number;
	private cachedLines?: string[];
	/** Max output tokens for the current model - caps reserveTokens */
	private modelMaxTokens: number | null = null;


	/** Live override - if set, session_before_compact uses these instead of file */
	public liveSettings: CompactionSettings;
	/** Digest-specific settings - trigger mode, percentage, fixed, strategy */
	public digestSettings: DigestSettings;
	/** Stats from the most recent compaction */
	public compactionStats: CompactionStats = { lastCompactedAt: null, tokensBefore: null, tokensAfter: null };
	/** Reference to ctx.compact - set by the extension after construction */
	public triggerCompact?: () => void;

	constructor(panelCtx: PanelContext) {
		this.panelCtx = panelCtx;
		this.theme = panelCtx.theme;
		this.tui = panelCtx.tui;
		this.cwd = panelCtx.cwd;
		this.settings = readCompactionSettings(panelCtx.cwd);
		this.liveSettings = { ...this.settings };
		this.digestSettings = readDigestSettings(panelCtx.cwd);

	}

	updateModel(maxTokens: number | null): void {
		if (maxTokens === this.modelMaxTokens) return;
		this.modelMaxTokens = maxTokens;
		this.recalculateReserveTokens();
		this.invalidate();
		this.tui.requestRender();
	}

	updateContextUsage(usage: ContextUsageInfo): void {
		const prevWindow = this.contextUsage.contextWindow;
		this.contextUsage = usage;
		// Recalculate reserve tokens when context window first becomes known or changes
		if (usage.contextWindow !== null && usage.contextWindow !== prevWindow) {
			this.recalculateReserveTokens();
		}
		this.invalidate();
		this.tui.requestRender();
	}

	refresh(): void {
		this.settings = readCompactionSettings(this.cwd);
		this.liveSettings = { ...this.settings };
		this.digestSettings = readDigestSettings(this.cwd);
		this.invalidate();
	}

	// ── Items ──

	private getItems(): PanelItem[] {
		const modeLabel = TRIGGER_MODE_LABELS[this.digestSettings.triggerMode];
		const items: PanelItem[] = [
			{ id: "enabled", label: "Auto-Compaction" },
		];

		switch (this.digestSettings.triggerMode) {
			case "reserve":
				items.push({ id: "reserveTokens", label: `Threshold · ${modeLabel}` });
				break;
			case "percentage":
				items.push({ id: "triggerPercentage", label: `Threshold · ${modeLabel}` });
				break;
			case "fixed":
				items.push({ id: "triggerFixed", label: `Threshold · ${modeLabel}` });
				break;
		}

		items.push({ id: "keepRecentTokens", label: "Keep Recent" });

		// In Percentage/Fixed modes, reserveTokens controls the summary output budget.
		// Expose it as a separate field so the user can tune compaction quality.
		if (this.digestSettings.triggerMode !== "reserve") {
			items.push({ id: "reserveTokens", label: "Summary Budget" });
		}

		items.push(
			{ id: "strategy", label: "Strategy" },
			{ id: "compact-now", label: "⚡ Compact Now" },
		);

		return items;
	}

	// ── Settings Changes ──

	private applyChange(key: keyof CompactionSettings, value: unknown): void {
		(this.liveSettings as unknown as Record<string, unknown>)[key] = value;
		writeCompactionSetting(this.cwd, key, value);
		this.settings = { ...this.liveSettings };
		this.invalidate();
		this.tui.requestRender();
	}

	private copyFromGlobal(): void {
		const global = readGlobalCompactionSettings();
		this.liveSettings = { ...global };
		writeAllCompactionSettings(this.cwd, global);
		this.settings = { ...global };
		// Reset trigger mode to reserve when copying global (global doesn't have trigger modes)
		this.digestSettings.triggerMode = "reserve";
		writeDigestSetting(this.cwd, "triggerMode", "reserve");
		this.invalidate();
		this.tui.requestRender();
	}

	private cycleTriggerMode(direction: 1 | -1): void {
		const currentIdx = TRIGGER_MODES.indexOf(this.digestSettings.triggerMode);
		const nextIdx = (currentIdx + direction + TRIGGER_MODES.length) % TRIGGER_MODES.length;
		this.digestSettings.triggerMode = TRIGGER_MODES[nextIdx]!;
		writeDigestSetting(this.cwd, "triggerMode", this.digestSettings.triggerMode);
		this.recalculateReserveTokens();
		this.invalidate();
		this.tui.requestRender();
	}

	private cycleDigestValue(field: keyof DigestSettings, settingsKey: string, presets: number[], direction: 1 | -1): void {
		const current = this.digestSettings[field] as number;
		const newVal = cyclePreset(current, presets, direction);
		(this.digestSettings as unknown as Record<string, unknown>)[field] = newVal;
		writeDigestSetting(this.cwd, settingsKey, newVal);
		this.recalculateReserveTokens();
		this.invalidate();
		this.tui.requestRender();
	}

	private cycleStrategy(direction: 1 | -1): void {
		const currentIdx = STRATEGY_PRESETS.findIndex((s) => s.id === this.digestSettings.strategy);
		const idx = currentIdx === -1 ? 0 : currentIdx;
		const nextIdx = (idx + direction + STRATEGY_PRESETS.length) % STRATEGY_PRESETS.length;
		this.digestSettings.strategy = STRATEGY_PRESETS[nextIdx]!.id;
		writeDigestSetting(this.cwd, "strategy", this.digestSettings.strategy);
		this.invalidate();
		this.tui.requestRender();
	}

	/**
	 * Reserve-mode response-budget presets - filtered to modelMaxTokens.
	 * These are only used in Reserve mode, where reserveTokens directly sets the
	 * response budget AND is the trigger threshold (tokens > contextWindow - reserve).
	 */
	private getReservePresets(): number[] {
		const cap = this.modelMaxTokens;
		if (cap === null) return RESERVE_PRESETS_BASE;
		const filtered = RESERVE_PRESETS_BASE.filter((v) => v <= cap);
		return filtered.length > 0 ? filtered : [Math.min(cap, RESERVE_PRESETS_BASE[0]!)];
	}

	/**
	 * Compute the effective trigger threshold in tokens, for display purposes.
	 * Percentage/Fixed modes store their trigger separately from reserveTokens.
	 */
	private getEffectiveTriggerTokens(): number | null {
		const cw = this.contextUsage.contextWindow;
		if (!cw) return null;
		switch (this.digestSettings.triggerMode) {
			case "reserve":
				return cw - this.liveSettings.reserveTokens;
			case "percentage":
				return Math.round(cw * (this.digestSettings.triggerPercentage / 100));
			case "fixed":
				return this.digestSettings.triggerFixed;
		}
	}

	/** Get fixed-mode presets - 10k steps of 20k up to near the context window (or 2M if unknown) */
	private getFixedPresets(): number[] {
		const step = 20000;
		const start = 10000;
		const cw = this.contextUsage.contextWindow;
		const end = cw !== null ? cw - 10000 : 2000000;
		const presets: number[] = [];
		for (let v = start; v <= end; v += step) presets.push(v);
		return presets.length > 0 ? presets : [start];
	}

	/**
	 * Ensure reserveTokens is within API limits for Percentage/Fixed modes.
	 * Only clamps if the stored value exceeds modelMaxTokens - user-set values
	 * within the safe range are preserved. Reserve mode manages this directly.
	 */
	private recalculateReserveTokens(): void {
		if (this.digestSettings.triggerMode === "reserve") return;
		if (this.modelMaxTokens !== null && this.liveSettings.reserveTokens > this.modelMaxTokens) {
			this.applyChange("reserveTokens", Math.min(this.modelMaxTokens, SAFE_RESERVE_TOKENS));
		}
	}

	// ── Input ──

	handleInput(data: string): void {
		if (matchesKey(data, COPY_GLOBAL_KEY)) {
			this.copyFromGlobal();
			return;
		}

		const items = this.getItems();
		const currentItem = items[this.selectedIndex];
		const isThresholdRow =
			currentItem?.id === "reserveTokens" ||
			currentItem?.id === "triggerPercentage" ||
			currentItem?.id === "triggerFixed";

		if (data === "\t" && isThresholdRow) {
			this.cycleTriggerMode(1);
			return;
		}

		if (matchesKey(data, Key.up) && this.selectedIndex > 0) {
			this.selectedIndex--;
			this.invalidate();
			this.tui.requestRender();
		} else if (matchesKey(data, Key.down) && this.selectedIndex < items.length - 1) {
			this.selectedIndex++;
			this.invalidate();
			this.tui.requestRender();
		} else if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
			this.activateItem(items);
		} else if (matchesKey(data, Key.left)) {
			this.adjustItem(items, -1);
		} else if (matchesKey(data, Key.right)) {
			this.adjustItem(items, 1);
		}
	}

	private activateItem(items: PanelItem[]): void {
		const item = items[this.selectedIndex];
		if (!item) return;

		if (item.id === "compact-now") {
			this.triggerCompact?.();
			return;
		}

		// For all other items, activate = adjust forward
		this.adjustItem(items, 1);
	}

	private adjustItem(items: PanelItem[], direction: 1 | -1): void {
		const item = items[this.selectedIndex];
		if (!item) return;

		switch (item.id) {
			case "enabled":
				this.applyChange("enabled", !this.liveSettings.enabled);
				break;
			case "reserveTokens":
				this.applyChange("reserveTokens", cyclePreset(this.liveSettings.reserveTokens, this.getReservePresets(), direction));
				break;
			case "triggerPercentage":
				this.cycleDigestValue("triggerPercentage", "triggerPercentage", PERCENTAGE_PRESETS, direction);
				break;
			case "triggerFixed":
				this.cycleDigestValue("triggerFixed", "triggerFixed", this.getFixedPresets(), direction);
				break;
			case "keepRecentTokens":
				this.applyChange("keepRecentTokens", cyclePreset(this.liveSettings.keepRecentTokens, KEEP_RECENT_PRESETS, direction));
				break;
			case "strategy":
				this.cycleStrategy(direction);
				break;
		}
	}

	// ── Render ──

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

		const th = this.theme;
		const focused = this.panelCtx.isFocused();
		const lines: string[] = [];
		const pad = (s: string) => padContentLine(s, width, chromeOpts);
		const add = (s: string) => lines.push(pad(s));

		const kh = getPanels()?.keyHints;
		const chromeOpts: ChromeOptions = {
			title: "🐉 Digestion Settings",
			focused,
			theme: th,
			skin: this.panelCtx.skin(),
			footerHint: focused
				? `↑↓ nav · ←→/Space adjust · Tab cycle mode · ${COPY_GLOBAL_LABEL} global · ${kh?.focused ?? "Q close · Escape unfocus"}`
				: `${kh?.unfocused ?? "Alt+T focus"} · /digestion help`,
		};

		// ── Header ──
		lines.push(...renderHeader(width, chromeOpts));

		// ── Context Usage Bar with Threshold Marker ──
		if (this.contextUsage.tokens !== null && this.contextUsage.contextWindow !== null) {
			const pct = this.contextUsage.percent ?? 0;
			const cw = this.contextUsage.contextWindow;
			const barW = Math.min(20, width - 16);
			if (barW >= 5) {
				const filled = Math.round((pct / 100) * barW);
				const barColor = pct > 80 ? "error" : pct > 60 ? "warning" : "success";

				const keepRecentW = Math.round((this.liveSettings.keepRecentTokens / cw) * barW);
				const summaryW = Math.round((this.liveSettings.reserveTokens / cw) * barW);
				const keepRecentStart = barW - keepRecentW;
				const summaryStart = Math.max(0, keepRecentStart - summaryW);

				const thresholdTokens = this.getEffectiveTriggerTokens() ?? (cw - this.liveSettings.reserveTokens);
				const thresholdPct = Math.max(0, Math.min(100, (thresholdTokens / cw) * 100));
				const thresholdPos = Math.min(barW - 1, Math.round((thresholdPct / 100) * barW));

				let bar = "";
				for (let i = 0; i < barW; i++) {
					const inKept = keepRecentW > 0 && i >= keepRecentStart;
					const inBudget = summaryW > 0 && i >= summaryStart && i < keepRecentStart;
					if (i === thresholdPos) {
						bar += th.fg("warning", "▼");
					} else if (i < filled) {
							if (inKept) bar += th.fg("muted", "█");
						else if (inBudget) bar += th.fg("accent", "█");
						else bar += th.fg(barColor, "█");
					} else {
						if (inKept) bar += th.fg("muted", "░");
						else if (inBudget) bar += th.fg("accent", "░");
						else bar += th.fg("dim", "░");
					}
				}

				add(`  Context: ${bar} ${pct}%`);
				add(th.fg("dim", `  ${formatTokens(this.contextUsage.tokens)} / ${formatTokens(cw)} tokens`));
				// Legend
				const legendKept = th.fg("muted", "█") + th.fg("dim", " kept");
				const legendBudget = th.fg("accent", "█") + th.fg("dim", " budget");
				const legendTrigger = th.fg("warning", "▼") + th.fg("dim", " trigger");
				add(`  ${legendKept}  ${legendBudget}  ${legendTrigger}`);
			}
		} else {
			add(th.fg("dim", "  Context: waiting for data..."));
		}

		// ── Compaction threshold indicator ──
		if (this.contextUsage.contextWindow !== null) {
			const cw = this.contextUsage.contextWindow;
			const threshold = this.getEffectiveTriggerTokens() ?? (cw - this.liveSettings.reserveTokens);
			const thresholdPct = Math.round((threshold / cw) * 100);
			add(th.fg("dim", `  Triggers at: ${formatTokens(threshold)} tokens (${thresholdPct}%)`));
		}

		// ── Last Compaction Stats ──
		if (this.compactionStats.lastCompactedAt !== null) {
			const timeStr = formatRelativeTime(this.compactionStats.lastCompactedAt);
			let statsLine = `  Last: ${timeStr}`;
			if (this.compactionStats.tokensBefore !== null && this.compactionStats.tokensAfter !== null) {
				const before = this.compactionStats.tokensBefore;
				const after = this.compactionStats.tokensAfter;
				const savedPct = before > 0 ? Math.round(((before - after) / before) * 100) : 0;
				statsLine += ` · ${formatTokens(before)}→${formatTokens(after)} (${savedPct}% freed)`;
			}
			add(th.fg("muted", statsLine));
		}

		add("");
		add(th.fg("dim", "  " + "─".repeat(Math.min(width - 4, 30))));
		add("");

		// ── Settings Items ──
		const items = this.getItems();
		for (let i = 0; i < items.length; i++) {
			const item = items[i]!;
			const isSelected = focused && i === this.selectedIndex;
			const pointer = isSelected ? th.fg("accent", "▸ ") : "  ";
			const labelColor = isSelected ? "accent" : "text";
			const label = th.fg(labelColor, item.label);

			let valueStr: string;
			switch (item.id) {
				case "enabled":
					valueStr = this.liveSettings.enabled ? th.fg("success", "● ON") : th.fg("error", "○ OFF");
					break;

				case "reserveTokens":
					valueStr =
						th.fg("muted", "◂ ") +
						th.fg("text", formatTokens(this.liveSettings.reserveTokens)) +
						th.fg("muted", " ▸");
					break;
				case "triggerPercentage":
					valueStr =
						th.fg("muted", "◂ ") +
						th.fg("text", `${this.digestSettings.triggerPercentage}%`) +
						th.fg("muted", " ▸");
					break;
				case "triggerFixed":
					valueStr =
						th.fg("muted", "◂ ") +
						th.fg("text", formatTokens(this.digestSettings.triggerFixed)) +
						th.fg("muted", " ▸");
					break;
				case "keepRecentTokens":
					valueStr =
						th.fg("muted", "◂ ") +
						th.fg("text", formatTokens(this.liveSettings.keepRecentTokens)) +
						th.fg("muted", " ▸");
					break;
				case "strategy": {
					const preset = STRATEGY_PRESETS.find((s) => s.id === this.digestSettings.strategy) ?? STRATEGY_PRESETS[0]!;
					valueStr = th.fg("muted", "◂ ") + th.fg("text", preset.label) + th.fg("muted", " ▸");
					break;
				}
				case "compact-now":
					valueStr = "";
					break;
				default:
					valueStr = "";
			}

			if (valueStr) {
				add(` ${pointer}${label}  ${valueStr}`);
			} else {
				add(` ${pointer}${label}`);
			}
		}

		// ── Footer ──
		lines.push(...renderFooter(width, chromeOpts));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

// ── Extension ──

const PANEL_ID = "digestion";

export default function (pi: ExtensionAPI) {
	let ctxRef: ExtensionContext | null = null;
	let panelComponent: CompactionPanelComponent | null = null;
	let compactionInProgress = false;
	/** ctx.compact() was called but session_before_compact hasn't fired yet - guards against double-trigger */
	let pendingCompact = false;
	let digestionStatusInterval: ReturnType<typeof setInterval> | null = null;

	/**
	 * Animate the status bar through DIGESTION_PHASES while compaction runs.
	 * ctx.ui.custom() cannot be called during compaction (displaces the main view),
	 * so the status bar is the only safe place for live feedback.
	 */
	function startDigestionStatus(ctx: ExtensionContext): void {
		stopDigestionStatus();
		let phaseIdx = 0;
		ctx.ui.setStatus("digestion", `${DIGESTION_PHASES[0]!.emoji} ${DIGESTION_PHASES[0]!.text}...`);
		digestionStatusInterval = setInterval(() => {
			phaseIdx = (phaseIdx + 1) % DIGESTION_PHASES.length;
			const phase = DIGESTION_PHASES[phaseIdx]!;
			ctxRef?.ui.setStatus("digestion", `${phase.emoji} ${phase.text}...`);
		}, PHASE_INTERVAL_MS);
	}

	function stopDigestionStatus(): void {
		if (digestionStatusInterval !== null) {
			clearInterval(digestionStatusInterval);
			digestionStatusInterval = null;
		}
		ctxRef?.ui.setStatus("digestion", undefined);
	}

	/**
	 * Sanitize the settings file at session start to prevent 400 API errors.
	 * Clamps reserveTokens to the model's output limit if known, or SAFE_RESERVE_TOKENS
	 * as a conservative fallback. User-set values within the safe range are preserved.
	 */
	function ensureSafeReserveTokens(cwd: string, modelMaxTokens: number | null): void {
		const digest = readDigestSettings(cwd);
		if (digest.triggerMode === "reserve") return;
		const settings = readCompactionSettings(cwd);
		const cap = modelMaxTokens ?? SAFE_RESERVE_TOKENS;
		if (settings.reserveTokens > cap) {
			writeCompactionSetting(cwd, "reserveTokens", Math.min(cap, SAFE_RESERVE_TOKENS));
		}
	}

	/**
	 * Check whether our custom trigger condition is met.
	 * Reads from panelComponent (live) when available, falls back to disk.
	 * Reserve mode: triggers when tokens > contextWindow - reserveTokens (pi semantics preserved).
	 * Percentage mode: triggers when tokens > contextWindow × (pct / 100).
	 * Fixed mode: triggers when tokens > fixedThreshold.
	 */
	function shouldTrigger(ctx: ExtensionContext): boolean {
		const cwd = getPanels()?.cwd ?? process.cwd();
		const settings = panelComponent?.liveSettings ?? readCompactionSettings(cwd);
		if (!settings.enabled) return false;
		const usage = ctx.getContextUsage();
		if (!usage?.tokens || !usage?.contextWindow) return false;
		const { tokens, contextWindow } = usage;
		const digest = panelComponent?.digestSettings ?? readDigestSettings(cwd);
		switch (digest.triggerMode) {
			case "reserve":
				return tokens > contextWindow - settings.reserveTokens;
			case "percentage":
				return tokens > contextWindow * (digest.triggerPercentage / 100);
			case "fixed":
				return tokens > digest.triggerFixed;
			default:
				return false;
		}
	}

	// ── Panel Management ──
	function openPanel(ctx: ExtensionContext): string {
		const panels = getPanels();
		if (!panels) return "Error: Panel manager not available";

		if (panels.isOpen(PANEL_ID)) {
			panelComponent?.refresh();
			panels.requestRender();
			return "Digestion panel refreshed";
		}

		let component: CompactionPanelComponent | null = null;
		const result = panels.createPanel(PANEL_ID, (panelCtx: any) => {
			component = new CompactionPanelComponent(panelCtx);
			panelComponent = component;
			component.triggerCompact = () => {
				if (compactionInProgress || pendingCompact) return;
				pendingCompact = true;
				const cwd = panels.cwd;
				const digest = panelComponent?.digestSettings ?? readDigestSettings(cwd);
				const strategyPreset = STRATEGY_PRESETS.find((s) => s.id === digest.strategy);
				const instructions = strategyPreset?.instructions || undefined;
				ctxRef?.compact({
					...(instructions ? { customInstructions: instructions } : {}),
					onError: (err: Error) => {
						pendingCompact = false;
						ctxRef?.hasUI && ctxRef.ui.notify(`🐉 Digestion failed: ${err.message}`, "error");
					},
				});
			};
			component.updateModel(ctx.model?.maxTokens ?? null);
			const usage = ctx.getContextUsage();
			if (usage) {
				component.updateContextUsage({
					tokens: usage.tokens ?? null,
					contextWindow: usage.contextWindow ?? null,
					percent: usage.percent ?? null,
				});
			}
			return {
				render: (w: number) => component!.render(w),
				invalidate: () => component!.invalidate(),
				handleInput: (data: string) => component!.handleInput(data),
			};
		}, {
			anchor: "top-right",
			width: "35%",
			minWidth: 36,
			maxHeight: "60%",
			onClose: () => { panelComponent = null; },
		});

		if (!result.success) return result.message;
		return "Digestion settings panel opened";
	}

	function closePanel(): string {
		const panels = getPanels();
		if (!panels?.isOpen(PANEL_ID)) return "No panel open";
		panels.close(PANEL_ID);
		return "Digestion panel closed";
	}

	function togglePanel(ctx: ExtensionContext): string {
		if (getPanels()?.isOpen(PANEL_ID)) return closePanel();
		return openPanel(ctx);
	}

	// ── Model + Context Usage Updates ──
	function updateModel(ctx: ExtensionContext): void {
		panelComponent?.updateModel(ctx.model?.maxTokens ?? null);
	}

	function updateContextUsage(ctx: ExtensionContext): void {
		if (!panelComponent) return;
		const usage = ctx.getContextUsage();
		if (usage) {
			panelComponent.updateContextUsage({
				tokens: usage.tokens ?? null,
				contextWindow: usage.contextWindow ?? null,
				percent: usage.percent ?? null,
			});
		}
	}

	// ── Events ──
	pi.on("session_start", async (_event, ctx) => {
		ctxRef = ctx;
		updateModel(ctx);
		ensureSafeReserveTokens(getPanels()?.cwd ?? process.cwd(), ctx.model?.maxTokens ?? null);
	});
	pi.on("session_switch", async (_event, ctx) => {
		panelComponent = null;
		compactionInProgress = false;
		pendingCompact = false;
		stopDigestionStatus();
		ctxRef = ctx;
		updateModel(ctx);
		ensureSafeReserveTokens(getPanels()?.cwd ?? process.cwd(), ctx.model?.maxTokens ?? null);
	});
	pi.on("model_select", async (_event, ctx) => {
		updateModel(ctx);
	});
	pi.on("session_shutdown", async () => {
		panelComponent = null;
	});

	// Update context usage display after each turn, then check proactive trigger
	pi.on("turn_end", async (_event, ctx) => {
		updateContextUsage(ctx);

		// Proactive compaction: fire ctx.compact() when our threshold is met.
		// pendingCompact guards against double-trigger while waiting for session_before_compact.
		// All UI/flag updates happen in session_before_compact once confirmed.
		if (compactionInProgress || pendingCompact || !shouldTrigger(ctx)) return;
		pendingCompact = true;

		const cwd = getPanels()?.cwd ?? process.cwd();
		const digest = panelComponent?.digestSettings ?? readDigestSettings(cwd);
		const strategyPreset = STRATEGY_PRESETS.find((s) => s.id === digest.strategy);
		const instructions = strategyPreset?.instructions || undefined;

		ctx.compact({
			...(instructions ? { customInstructions: instructions } : {}),
			onError: (err: Error) => {
				pendingCompact = false;
				ctx.hasUI && ctx.ui.notify(`🐉 Digestion failed: ${err.message}`, "error");
			},
		});
	});

	// Track compaction stats and update context usage
	pi.on("session_compact", async (event, ctx) => {
		compactionInProgress = false;
		pendingCompact = false;
		stopDigestionStatus();
		updateContextUsage(ctx);
		if (panelComponent) {
			const usage = ctx.getContextUsage();
			panelComponent.compactionStats = {
				lastCompactedAt: Date.now(),
				tokensBefore: (event as any).compactionEntry?.tokensBefore ?? null,
				tokensAfter: usage?.tokens ?? null,
			};
			panelComponent.invalidate();
		}
	});

	// ── Compaction Gatekeeper ──
	// Fires before any compaction (proactive, manual /compact, or pi's safety-net).
	// Only cancels if the user explicitly disabled auto-compaction.
	pi.on("session_before_compact", async (_event, ctx) => {
		pendingCompact = false;
		const cwd = getPanels()?.cwd ?? process.cwd();
		const settings = panelComponent?.liveSettings ?? readCompactionSettings(cwd);

		if (!settings.enabled) {
			return { cancel: true };
		}

		// Compaction is proceeding — start animated status cycling through DIGESTION_PHASES
		compactionInProgress = true;
		startDigestionStatus(ctx);
		return;
	});

	// ── /digestion Command ──
	pi.registerCommand("digestion", {
		description: "Manage digestion settings panel (compaction tuning)",
		handler: async (args, ctx) => {
			const subcmd = (args ?? "").trim().toLowerCase();
			switch (subcmd) {
				case "open":
				case "show":
					ctx.ui.notify(openPanel(ctx), "info");
					return;
				case "close":
				case "hide":
					ctx.ui.notify(closePanel(), "info");
					return;
				case "toggle":
				case "":
					ctx.ui.notify(togglePanel(ctx), "info");
					return;
				case "status": {
					const cwd = getPanels()?.cwd ?? process.cwd();
					const settings = readCompactionSettings(cwd);
					const digest = readDigestSettings(cwd);
					const usage = ctx.getContextUsage();
					const statusLines = [
						`Auto-compaction: ${settings.enabled ? "ON" : "OFF"}`,
						`Trigger mode: ${TRIGGER_MODE_LABELS[digest.triggerMode]}`,
					];
					switch (digest.triggerMode) {
						case "reserve":
							statusLines.push(`Reserve tokens: ${formatTokens(settings.reserveTokens)}`);
							break;
						case "percentage":
							statusLines.push(`Trigger at: ${digest.triggerPercentage}%`);
							break;
						case "fixed":
							statusLines.push(`Trigger at: ${formatTokens(digest.triggerFixed)} tokens`);
							break;
					}
					statusLines.push(`Keep recent: ${formatTokens(settings.keepRecentTokens)}`);
					const strategy = STRATEGY_PRESETS.find((s) => s.id === digest.strategy) ?? STRATEGY_PRESETS[0]!;
					statusLines.push(`Strategy: ${strategy.label}`);
					if (usage?.tokens != null && usage?.contextWindow != null) {
						const threshold = usage.contextWindow - settings.reserveTokens;
						const thresholdPct = Math.round((threshold / usage.contextWindow) * 100);
						statusLines.push(
							`Context: ${formatTokens(usage.tokens)} / ${formatTokens(usage.contextWindow)} (${usage.percent ?? 0}%)`,
						);
						statusLines.push(`Compaction triggers at: ${formatTokens(threshold)} (${thresholdPct}%)`);
					}
					ctx.ui.notify(statusLines.join("\n"), "info");
					return;
				}
				default:
					{
						const kh = getPanels()?.keyHints;
						ctx.ui.notify(
							[
								"🐉 Digestion Settings - compaction tuning for dragons",
								"",
								"  /digestion               Toggle panel",
								"  /digestion open          Open panel",
								"  /digestion close         Close panel",
								"  /digestion status        Show current settings",
								"",
								"Threshold · [mode]  Tab while hovered cycles mode",
								"  Reserve      Keep N tokens free for LLM response",
								"  Percentage   Compact when context reaches N% full",
								"  Fixed        Compact when tokens exceed N",
								"",
								"Strategy (affects manual Compact Now):",
								"  Default      Standard compaction summary",
								"  Code         Focus on code changes & technical decisions",
								"  Tasks        Focus on goals, progress & next steps",
								"  Minimal      Extremely brief, essentials only",
								"",
								"When focused: ↑↓ navigate, ←→ or Space to adjust,",
								`${COPY_GLOBAL_LABEL} to copy from global config,`,
								"Enter on 'Compact Now' to trigger manually,",
								`${kh?.focusKey ?? "Alt+T"} to cycle focus, ${kh?.closeKey ?? "Q"} to close, ${kh?.unfocusKey ?? "Escape"} to unfocus`,
							].join("\n"),
							"info",
						);
					}
			}
		},
	});
}
