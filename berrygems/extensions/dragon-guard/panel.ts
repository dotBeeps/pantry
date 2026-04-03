/**
 * Dragon Guard Panel — floating overlay for guard status and settings.
 *
 * Replaces the old select-loop /guard-settings UI with a proper SettingsList
 * panel registered with dots-panels. Shows current mode, live-tweakable
 * settings, and session tool policy overrides.
 *
 * A small dog and a large dragon made this together.
 */

import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import { matchesKey, Key, truncateToWidth } from "@mariozechner/pi-tui";
import {
	renderHeader, renderFooter, padContentLine,
	type ChromeOptions,
} from "../../lib/panel-chrome.ts";

import {
	getMode,
	dogModeSessionAllowedTools, dogModeSessionBlockedTools, puppyModeSessionAllowedTools,
	MODE_LABEL, type GuardMode,
} from "./state.ts";

import {
	getAutoDetect, setAutoDetect,
	getComplexityThreshold, setComplexityThreshold,
	getLlmSummaries, setLlmSummaries,
	writeProjectSetting,
} from "./settings.ts";

// ── Local Types ──

interface PanelContext {
	tui: TUI;
	theme: Theme;
	cwd: string;
	isFocused: () => boolean;
	skin: () => import("../../lib/panel-chrome.ts").PanelSkin;
}

// ── Panel Manager Access ──

const PANELS_KEY = Symbol.for("dot.panels");
function getPanels(): any {
	return (globalThis as any)[PANELS_KEY];
}

// ── Types ──

const MODES: GuardMode[] = ["none", "plan", "dragon"];
const THRESHOLD_PRESETS = [2, 3, 4, 5, 6, 7, 8];

interface PanelItem {
	id: string;
	label: string;
}

export interface GuardPanelCallbacks {
	setMode: (mode: GuardMode) => void;
	persistState: () => void;
}

// ── Helpers ──

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

// ── Panel Component ──

export class GuardPanelComponent {
	private panelCtx: PanelContext;
	private theme: Theme;
	private tui: TUI;
	private cwd: string;
	private callbacks: GuardPanelCallbacks;
	private selectedIndex = 0;
	private cachedWidth?: number;
	private cachedLines?: string[];


	constructor(panelCtx: PanelContext, callbacks: GuardPanelCallbacks) {
		this.panelCtx = panelCtx;
		this.theme = panelCtx.theme;
		this.tui = panelCtx.tui;
		this.cwd = panelCtx.cwd;
		this.callbacks = callbacks;

	}

	// ── Items ──

	private getItems(): PanelItem[] {
		return [
			{ id: "mode", label: "Mode" },
			{ id: "auto-detect", label: "Auto-Detect" },
			{ id: "sensitivity", label: "Sensitivity" },
			{ id: "llm-summaries", label: "LLM Summaries" },
			{ id: "reset", label: "⟲ Reset Overrides" },
		];
	}

	// ── Input ──

	handleInput(data: string): void {
		const items = this.getItems();

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

		if (item.id === "reset") {
			dogModeSessionAllowedTools.clear();
			dogModeSessionBlockedTools.clear();
			puppyModeSessionAllowedTools.clear();
			this.callbacks.persistState();
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		// Toggle/cycle items: activate = adjust forward
		this.adjustItem(items, 1);
	}

	private adjustItem(items: PanelItem[], direction: 1 | -1): void {
		const item = items[this.selectedIndex];
		if (!item) return;

		switch (item.id) {
			case "mode": {
				const currentIdx = MODES.indexOf(getMode());
				const nextIdx = (currentIdx + direction + MODES.length) % MODES.length;
				this.callbacks.setMode(MODES[nextIdx]!);
				break;
			}
			case "auto-detect": {
				const newVal = !getAutoDetect();
				setAutoDetect(newVal);
				writeProjectSetting(this.cwd, "guard.autoDetect", newVal);
				break;
			}
			case "sensitivity": {
				const newVal = cyclePreset(getComplexityThreshold(), THRESHOLD_PRESETS, direction);
				setComplexityThreshold(newVal);
				writeProjectSetting(this.cwd, "guard.complexityThreshold", newVal);
				break;
			}
			case "llm-summaries": {
				const newVal = !getLlmSummaries();
				setLlmSummaries(newVal);
				writeProjectSetting(this.cwd, "guard.llmSummaries", newVal);
				break;
			}
		}

		this.invalidate();
		this.tui.requestRender();
	}

	// ── Render ──

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

		const th = this.theme;
		const focused = this.panelCtx.isFocused();
		const lines: string[] = [];
		const pad = (s: string) => padContentLine(s, width, chromeOpts);
		const add = (s: string) => lines.push(pad(s));

		const mode = getMode();
		const modeEmoji = mode === "dragon" ? "🐉" : mode === "plan" ? "🐶" : "🐕";

		const kh = getPanels()?.keyHints;
		const chromeOpts: ChromeOptions = {
			title: `${modeEmoji} Dragon Guard`,
			focused,
			theme: th,
			skin: this.panelCtx.skin(),
			footerHint: focused
				? `↑↓ nav · ←→/Space adjust · ${kh?.focused ?? "Q close · Escape unfocus"}`
				: `${kh?.unfocused ?? "Alt+T focus"} · /guard help`,
		};

		// ── Header ──
		lines.push(...renderHeader(width, chromeOpts));

		// ── Settings Items ──
		const items = this.getItems();
		for (let i = 0; i < items.length; i++) {
			const item = items[i]!;
			const isSelected = focused && i === this.selectedIndex;
			const pointer = isSelected ? th.fg("accent", "▸ ") : "  ";
			const labelColor = isSelected ? "accent" : "text";
			const label = th.fg(labelColor, item.label);

			// Insert separator + session override info before the reset action
			if (item.id === "reset") {
				add("");
				add(th.fg("dim", "  " + "─".repeat(Math.min(width - 4, 30))));

				if (mode === "dragon") {
					add(th.fg("success", "  All tools allowed"));
				} else if (mode === "plan") {
					const allowed = [...puppyModeSessionAllowedTools].sort().join(", ") || "(defaults)";
					add(th.fg("dim", "  Session allows: ") + th.fg("text", truncateToWidth(allowed, Math.max(4, width - 20))));
				} else {
					const allowed = [...dogModeSessionAllowedTools].sort().join(", ") || "(none)";
					const blocked = [...dogModeSessionBlockedTools].sort().join(", ") || "(none)";
					add(th.fg("dim", "  + allowed: ") + th.fg("success", truncateToWidth(allowed, Math.max(4, width - 16))));
					add(th.fg("dim", "  − blocked: ") + th.fg("error", truncateToWidth(blocked, Math.max(4, width - 16))));
				}

				add("");
			}

			let valueStr: string;
			switch (item.id) {
				case "mode": {
					const modeLabel = MODE_LABEL[mode];
					const modeColor = mode === "dragon" ? "warning" : mode === "plan" ? "accent" : "text";
					valueStr = th.fg("muted", "◂ ") + th.fg(modeColor, modeLabel) + th.fg("muted", " ▸");
					break;
				}
				case "auto-detect":
					valueStr = getAutoDetect() ? th.fg("success", "● ON") : th.fg("error", "○ OFF");
					break;
				case "sensitivity":
					valueStr = th.fg("muted", "◂ ") + th.fg("text", String(getComplexityThreshold())) + th.fg("muted", " ▸");
					break;
				case "llm-summaries":
					valueStr = getLlmSummaries() ? th.fg("success", "● ON") : th.fg("error", "○ OFF");
					break;
				case "reset":
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
