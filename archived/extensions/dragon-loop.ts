/**
 * Dragon Loop — Automation loops with breakout conditions.
 *
 * Registers /loop to start a follow-up loop that keeps sending a driving prompt
 * after every agent turn until the agent calls signal_loop_success.
 *
 * Modes: tests · lint · review · custom · self
 *
 * The dragon flies in circles until the dog says it's done.
 * The dog waits until all the tests are green, or until she gets bored,
 * whichever comes first. (She has never gotten bored.)
 */

import type { ExtensionAPI, ExtensionContext, SessionBeforeSwitchEvent } from "@earendil-works/pi-coding-agent";
import { compact, DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Text, type SelectItem } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { complete, type Api, type Model, type UserMessage } from "@earendil-works/pi-ai";

// ── Types ──

type LoopMode = "tests" | "lint" | "review" | "custom" | "self";

interface LoopState {
	active: boolean;
	mode?: LoopMode;
	condition?: string;
	prompt?: string;
	summary?: string;
	turnCount?: number;
}

// ── Constants ──

const LOOP_STATE_ENTRY = "dragon-loop-state";
const HAIKU_MODEL_ID = "claude-haiku-4-5";

const MODE_PRESETS: Array<{ value: LoopMode; label: string; description: string }> = [
	{ value: "tests",  label: "Until tests pass",           description: "Runs tests, fixes failures, loops until green" },
	{ value: "lint",   label: "Until lint/types are clean", description: "Type-checks and lints, loops until no errors" },
	{ value: "review", label: "Until code review passes",   description: "Reviews changes, loops until no blocking findings" },
	{ value: "custom", label: "Until custom condition",     description: "You define what done looks like" },
	{ value: "self",   label: "Self-driven (agent decides)", description: "Agent decides when to stop" },
];

const SUMMARY_SYSTEM_PROMPT = `You summarize loop breakout conditions for a compact status widget.
Return a short phrase (max 6 words) describing when the loop should stop.
Plain text only — no quotes, no punctuation, no prefix words like "Summary:".

Use natural phrasing: "breaks when tests pass", "loops until lint is clean", "stops on no findings", etc.
Pick the form that best fits the condition.`;

// ── Prompt builders ──

function buildPrompt(mode: LoopMode, condition?: string): string {
	switch (mode) {
		case "tests":
			return (
				"Run all tests. If they are all passing, call the signal_loop_success tool. " +
				"Otherwise continue fixing failures until they pass."
			);
		case "lint":
			return (
				"Run type checking and linting. If the output is clean with no errors, " +
				"call the signal_loop_success tool. Otherwise fix the issues and try again."
			);
		case "review":
			return (
				"Review the code changes. If there are no blocking findings, " +
				"call the signal_loop_success tool. Otherwise fix the issues you found."
			);
		case "custom": {
			const cond = condition?.trim() || "the condition is satisfied";
			return (
				`Continue until the following condition is satisfied: ${cond}. ` +
				"When it is satisfied, call the signal_loop_success tool."
			);
		}
		case "self":
			return (
				"Continue working until you are completely done. " +
				"When finished, call the signal_loop_success tool."
			);
	}
}

function conditionText(mode: LoopMode, condition?: string): string {
	switch (mode) {
		case "tests":  return "all tests pass";
		case "lint":   return "lint and type checks are clean";
		case "review": return "code review has no blocking findings";
		case "custom": return condition?.trim() || "custom condition is met";
		case "self":   return "the agent is done";
	}
}

function fallbackSummary(mode: LoopMode, condition?: string): string {
	switch (mode) {
		case "tests":  return "tests pass";
		case "lint":   return "lint is clean";
		case "review": return "review passes";
		case "self":   return "agent done";
		case "custom": {
			const c = condition?.trim() || "condition met";
			return c.length > 48 ? `${c.slice(0, 45)}…` : c;
		}
	}
}

// ── Haiku summarizer ──

async function pickSummaryModel(
	ctx: ExtensionContext,
): Promise<{ model: Model<Api>; apiKey?: string; headers?: Record<string, string> } | null> {
	if (!ctx.model) return null;

	// Prefer free github-copilot Haiku, then ZAI flash ($0.06/MTok), then Anthropic Haiku
	const copilotHaiku = ctx.modelRegistry.find("github-copilot", HAIKU_MODEL_ID);
	if (copilotHaiku) {
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(copilotHaiku);
		if (auth.ok) return { model: copilotHaiku, apiKey: auth.apiKey, headers: auth.headers };
	}

	// ZAI flash — dirt cheap with reasoning
	for (const zaiId of ["glm-4.7-flashx", "glm-4.7-flash"]) {
		const zai = ctx.modelRegistry.find("zai", zaiId);
		if (zai) {
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(zai);
			if (auth.ok) return { model: zai, apiKey: auth.apiKey, headers: auth.headers };
		}
	}

	// Fall back to Anthropic Haiku
	if (ctx.model.provider === "anthropic") {
		const haiku = ctx.modelRegistry.find("anthropic", HAIKU_MODEL_ID);
		if (haiku) {
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(haiku);
			if (auth.ok) return { model: haiku, apiKey: auth.apiKey, headers: auth.headers };
		}
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok) return null;
	return { model: ctx.model, apiKey: auth.apiKey, headers: auth.headers };
}

async function summarizeCondition(
	ctx: ExtensionContext,
	mode: LoopMode,
	condition?: string,
): Promise<string> {
	const fallback = fallbackSummary(mode, condition);
	const selection = await pickSummaryModel(ctx);
	if (!selection) return fallback;

	const userMsg: UserMessage = {
		role: "user",
		content: [{ type: "text", text: conditionText(mode, condition) }],
		timestamp: Date.now(),
	};

	try {
		const response = await complete(
			selection.model,
			{ systemPrompt: SUMMARY_SYSTEM_PROMPT, messages: [userMsg] },
			{ apiKey: selection.apiKey, headers: selection.headers },
		);

		if (response.stopReason === "aborted" || response.stopReason === "error") return fallback;

		const summary = response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();

		if (!summary) return fallback;
		return summary.length > 60 ? `${summary.slice(0, 57)}…` : summary;
	} catch {
		return fallback;
	}
}

// ── Compaction instructions ──

function compactionInstructions(mode: LoopMode, condition?: string): string {
	return (
		`Automation loop is active. Breakout condition: ${conditionText(mode, condition)}. ` +
		"Preserve this loop state in your summary so the loop survives the context rollover."
	);
}

// ── Footer widget ──

function refreshWidget(ctx: ExtensionContext, state: LoopState): void {
	if (!ctx.hasUI) return;

	if (!state.active || !state.mode) {
		ctx.ui.setWidget("dragon-loop", undefined);
		return;
	}

	const turn = state.turnCount ?? 0;
	const turnLabel = turn === 1 ? "1 turn" : `${turn} turns`;
	const summary = state.summary?.trim() || fallbackSummary(state.mode, state.condition);
	ctx.ui.setWidget("dragon-loop", [
		ctx.ui.theme.fg("accent", `🔁 Loop: ${summary} (${turnLabel})`),
	]);
}

// ── State persistence ──

async function restoreState(ctx: ExtensionContext): Promise<LoopState> {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i] as { type: string; customType?: string; data?: LoopState };
		if (e.type === "custom" && e.customType === LOOP_STATE_ENTRY && e.data) {
			return e.data;
		}
	}
	return { active: false };
}

// ── Selector UI ──

async function showModeSelector(ctx: ExtensionContext): Promise<LoopState | null> {
	const items: SelectItem[] = MODE_PRESETS.map((p) => ({
		value: p.value,
		label: p.label,
		description: p.description,
	}));

	const chosen = await ctx.ui.custom<LoopMode | null>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		container.addChild(new Text(theme.fg("accent", theme.bold(" 🔁 Start a loop"))));

		const list = new SelectList(items, Math.min(items.length, 8), {
			selectedPrefix: (t) => theme.fg("accent", t),
			selectedText:   (t) => theme.fg("accent", t),
			description:    (t) => theme.fg("muted", t),
			scrollInfo:     (t) => theme.fg("dim", t),
			noMatch:        (t) => theme.fg("warning", t),
		});

		list.onSelect = (item) => done(item.value as LoopMode);
		list.onCancel = () => done(null);

		container.addChild(list);
		container.addChild(new Text(theme.fg("dim", " ↵ start · esc cancel")));
		container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

		return {
			render:      (width) => container.render(width),
			invalidate:  ()      => container.invalidate(),
			handleInput: (data)  => { list.handleInput(data); tui.requestRender(); },
		};
	});

	if (!chosen) return null;

	if (chosen === "custom") {
		const condition = await ctx.ui.editor("Describe the condition for stopping the loop:", "");
		if (!condition?.trim()) return null;
		return {
			active: true,
			mode: "custom",
			condition: condition.trim(),
			prompt: buildPrompt("custom", condition.trim()),
		};
	}

	return { active: true, mode: chosen, prompt: buildPrompt(chosen) };
}

// ── Command arg parser ──

function parseArgs(args: string | undefined): LoopState | "stop" | null {
	const raw = args?.trim();
	if (!raw) return null;

	const [first, ...rest] = raw.split(/\s+/);
	const keyword = first?.toLowerCase();

	if (keyword === "stop") return "stop";
	if (keyword === "tests")  return { active: true, mode: "tests",  prompt: buildPrompt("tests") };
	if (keyword === "lint")   return { active: true, mode: "lint",   prompt: buildPrompt("lint") };
	if (keyword === "review") return { active: true, mode: "review", prompt: buildPrompt("review") };
	if (keyword === "self")   return { active: true, mode: "self",   prompt: buildPrompt("self") };

	if (keyword === "custom") {
		const condition = rest.join(" ").trim();
		if (!condition) return null;
		return { active: true, mode: "custom", condition, prompt: buildPrompt("custom", condition) };
	}

	return null;
}

// ── Abort detection ──

function lastAssistantWasAborted(messages: Array<{ role?: string; stopReason?: string }>): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m?.role === "assistant") return m.stopReason === "aborted";
	}
	return false;
}

// ── Extension ──

export default function dragonLoop(pi: ExtensionAPI): void {
	let state: LoopState = { active: false };

	// ── Internal state helpers ──

	function save(next: LoopState, ctx: ExtensionContext): void {
		state = next;
		pi.appendEntry(LOOP_STATE_ENTRY, next);
		refreshWidget(ctx, next);
	}

	function clear(ctx: ExtensionContext): void {
		save({ active: false }, ctx);
	}

	function kick(ctx: ExtensionContext): void {
		if (!state.active || !state.mode || !state.prompt) return;
		if (ctx.hasPendingMessages()) return;

		const turnCount = (state.turnCount ?? 0) + 1;
		state = { ...state, turnCount };
		pi.appendEntry(LOOP_STATE_ENTRY, state);
		refreshWidget(ctx, state);

		pi.sendMessage(
			{ customType: "dragon-loop", content: state.prompt!, display: true },
			{ deliverAs: "followUp", triggerTurn: true },
		);
	}

	// ── Background summarizer ──

	function refreshSummary(mode: LoopMode, condition: string | undefined, ctx: ExtensionContext): void {
		void (async () => {
			const summary = await summarizeCondition(ctx, mode, condition);
			// Bail if loop changed while we were awaiting
			if (!state.active || state.mode !== mode || state.condition !== condition) return;
			state = { ...state, summary };
			pi.appendEntry(LOOP_STATE_ENTRY, state);
			refreshWidget(ctx, state);
		})();
	}

	// ── signal_loop_success tool ──

	pi.registerTool({
		name: "signal_loop_success",
		label: "Signal Loop Success",
		description:
			"Signal that the active loop's breakout condition has been satisfied and stop the loop. " +
			"Only call this when the loop prompt explicitly instructs you to do so.",
		parameters: Type.Object({}),

		async execute(_id, _params, _signal, _onUpdate, ctx) {
			if (!state.active) {
				return {
					content: [{ type: "text", text: "No loop is currently active." }],
					details: { active: false },
				};
			}

			clear(ctx);

			return {
				content: [{ type: "text", text: "✅ Loop condition satisfied — dragon lands, dog cheers." }],
				details: { active: false },
			};
		},
	});

	// ── /loop command ──

	pi.registerCommand("loop", {
		description:
			"Start or stop an automation loop: /loop tests|lint|review|self|custom <cond>|stop",

		handler: async (args, ctx) => {
			const parsed = parseArgs(args);

			// /loop stop
			if (parsed === "stop") {
				if (!state.active) {
					ctx.ui.notify("No loop is running", "info");
					return;
				}
				clear(ctx);
				ctx.ui.notify("Loop stopped 🐉", "info");
				return;
			}

			// No args or unrecognised → interactive selector (UI only)
			let next: LoopState | null = parsed;
			if (!next) {
				if (!ctx.hasUI) {
					ctx.ui.notify(
						"Usage: /loop tests | lint | review | self | custom <cond> | stop",
						"warning",
					);
					return;
				}
				next = await showModeSelector(ctx);
			}

			if (!next) {
				ctx.ui.notify("Loop cancelled", "info");
				return;
			}

			// Confirm replacement if one is already running
			if (state.active) {
				const replace = ctx.hasUI
					? await ctx.ui.confirm("Replace active loop?", "A loop is already running. Replace it?")
					: true;
				if (!replace) {
					ctx.ui.notify("Loop unchanged", "info");
					return;
				}
			}

			const fresh: LoopState = { ...next, turnCount: 0, summary: undefined };
			save(fresh, ctx);
			ctx.ui.notify(`Loop active — ${conditionText(fresh.mode!, fresh.condition)} 🔁`, "info");

			// Kick off the first turn
			kick(ctx);

			// Generate widget summary in background
			refreshSummary(fresh.mode!, fresh.condition, ctx);
		},
	});

	// ── agent_end hook — re-trigger loop ──

	pi.on("agent_end", async (event, ctx) => {
		if (!state.active) return;

		// Offer to break out if the user aborted the last turn
		if (ctx.hasUI && lastAssistantWasAborted(event.messages)) {
			const stop = await ctx.ui.confirm(
				"Break out of loop?",
				"The last turn was aborted. Should the dragon land?",
			);
			if (stop) {
				clear(ctx);
				ctx.ui.notify("Loop aborted", "info");
				return;
			}
		}

		kick(ctx);
	});

	// ── session_before_compact hook — inject loop state ──

	pi.on("session_before_compact", async (event, ctx) => {
		if (!state.active || !state.mode || !ctx.model) return;

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
		if (!auth.ok) return;

		const instructions = [
			event.customInstructions,
			compactionInstructions(state.mode, state.condition),
		]
			.filter(Boolean)
			.join("\n\n");

		try {
			const compaction = await compact(
				event.preparation,
				ctx.model,
				auth.apiKey ?? "",
				auth.headers,
				instructions,
				event.signal,
			);
			return { compaction };
		} catch (err) {
			if (ctx.hasUI) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`Loop compaction failed: ${msg}`, "warning");
			}
		}
	});

	// ── Session restore ──

	async function onSessionLoad(ctx: ExtensionContext): Promise<void> {
		state = await restoreState(ctx);
		refreshWidget(ctx, state);

		// Regenerate summary if loop is active but summary is missing
		if (state.active && state.mode && !state.summary) {
			refreshSummary(state.mode, state.condition, ctx);
		}
	}

	pi.on("session_start",        async (_event, ctx) => { await onSessionLoad(ctx); });
	pi.on("session_before_switch", async (_event: SessionBeforeSwitchEvent, ctx) => { await onSessionLoad(ctx); });
}
