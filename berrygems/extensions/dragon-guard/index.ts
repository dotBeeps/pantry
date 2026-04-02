/**
 * Dragon Guard — Three-tier permission guard for pi.
 *
 * Modes:
 * - Dog Mode (default): permission-gated — prompts before non-allowlisted tools
 * - Puppy Mode: read-only planning — safe tools auto-allowed, restricted tools prompt
 * - Dragon Mode: all tools allowed, full implementation enabled
 *
 * A small dog and a large dragon made this together.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { complete, type UserMessage } from "@mariozechner/pi-ai";

import {
	GUARD_DRAGON_KEY, GUARD_PUPPY_KEY, GUARD_DOG_KEY, GUARD_PANEL_KEY,
	getAutoDetect, getComplexityThreshold, getLlmSummaries,
} from "./settings.ts";

import { GuardPanelComponent } from "./panel.ts";

import {
	getMode, setMode as setModeState,
	getDogModeToolPolicy, getPuppyModeToolPolicy,
	reconstructState, persistState as doPersistState,
	dogModeSessionAllowedTools, dogModeSessionBlockedTools, puppyModeSessionAllowedTools,
	MODE_LABEL, type GuardMode,
} from "./state.ts";

// ── Constants ──

const TOOL_SUMMARY_SYSTEM_PROMPT = `You summarize tool calls for a permission dialog.
Explain what the tool call is expected to do in 1 concise sentence.
Be factual, cautious, and avoid guarantees.
Mention potential file/network/system impact when relevant.
Return plain text only.`;

// ── Panel Manager Access ──

const PANELS_KEY = Symbol.for("dot.panels");
function getPanels(): any {
	return (globalThis as any)[PANELS_KEY];
}

const GUARD_PANEL_ID = "dragon-guard";

// ── Color Helpers (rendering — stays here until panel integration) ──

function rgb(text: string, r: number, g: number, b: number): string {
	return `\u001b[38;2;${Math.round(r)};${Math.round(g)};${Math.round(b)}m${text}\u001b[0m`;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const sat = s / 100;
	const light = l / 100;
	const c = (1 - Math.abs(2 * light - 1)) * sat;
	const hh = h / 60;
	const x = c * (1 - Math.abs((hh % 2) - 1));
	let [r1, g1, b1] = [0, 0, 0];

	if (hh >= 0 && hh < 1) [r1, g1, b1] = [c, x, 0];
	else if (hh < 2) [r1, g1, b1] = [x, c, 0];
	else if (hh < 3) [r1, g1, b1] = [0, c, x];
	else if (hh < 4) [r1, g1, b1] = [0, x, c];
	else if (hh < 5) [r1, g1, b1] = [x, 0, c];
	else [r1, g1, b1] = [c, 0, x];

	const m = light - c / 2;
	return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

// ── Utility ──

function truncate(text: string, max = 480): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 3)}...`;
}

function formatToolCall(toolName: string, input: unknown): string {
	let params = "{}";
	try {
		params = JSON.stringify(input ?? {});
	} catch {
		params = "{\"error\":\"unserializable input\"}";
	}
	return `${toolName}(${truncate(params, 320)})`;
}

function fallbackToolSummary(toolName: string): string {
	if (toolName === "read") return "Read file contents without modifying files.";
	if (toolName === "bash") return "Run a shell command that may read, modify, or affect system/project state.";
	if (toolName === "edit") return "Modify a file by replacing exact text.";
	if (toolName === "write") return "Create or overwrite a file with provided content.";
	return "Execute the requested tool call, which may inspect or change project/system state.";
}

// ── Complexity Scoring (stays here until Batch 2 improves it) ──

function complexityScore(prompt: string): number {
	const text = prompt.toLowerCase();
	let score = 0;

	// Length signals
	if (text.length > 220) score += 2;
	if (text.length > 500) score += 2;
	if ((text.match(/\n/g)?.length ?? 0) >= 3) score += 1;

	// Positive signals — implementation-scale keywords
	const complexityKeywords = [
		"refactor", "architecture", "migration", "design", "roadmap",
		"plan", "strategy", "system", "across", "multi-file",
		"end-to-end", "production",
	];
	if (complexityKeywords.some((k) => text.includes(k))) score += 2;

	const sequencing = ["first", "then", "after", "step", "phase", "before", "finally"];
	if (sequencing.some((k) => text.includes(k))) score += 2;

	const broadScope = ["entire codebase", "whole project", "all files", "throughout", "foundation"];
	if (broadScope.some((k) => text.includes(k))) score += 2;

	// Negative signals — questions and exploration reduce score
	const questionWords = ["what is", "what does", "explain", "show me", "help me understand", "how does", "why does", "where is"];
	if (questionWords.some((k) => text.includes(k))) score -= 3;

	return Math.max(0, score);
}

function shouldAutoPlan(prompt: string): boolean {
	if (!getAutoDetect()) return false;
	return complexityScore(prompt) >= getComplexityThreshold();
}

// ── Extension Entry Point ──

export default function dragonGuardExtension(pi: ExtensionAPI): void {
	// Subagent child processes inherit all package extensions. The guard's
	// context injection ("[DOG MODE ACTIVE]") and tool_call blocking confuse
	// subagent workers — they interpret guard messages as instructions to
	// refuse writes. Bail out entirely when PI_SUBAGENT_DEPTH indicates
	// we're inside a spawned subagent process.
	const subagentDepth = Number(process.env.PI_SUBAGENT_DEPTH ?? "0");
	if (subagentDepth > 0) return;

	let animationTimer: NodeJS.Timeout | undefined;
	let uiCtx: ExtensionContext | undefined;
	let panelComponent: GuardPanelComponent | null = null;

	const puppySheen = {
		active: false,
		index: 0,
		nextAt: Date.now() + 2500,
	};

	// ── Local Wrappers ──

	/** Consolidated tool name list for pi.setActiveTools and settings UI. */
	function getToolNames(): string[] {
		return pi.getAllTools().map((t) => t.name).sort((a, b) => a.localeCompare(b));
	}

	/** Persist guard state to session entries. */
	function persistState(): void {
		doPersistState((type, data) => pi.appendEntry(type, data));
	}

	/** Enable all tools regardless of mode — policy is enforced in the tool_call event handler. */
	function enableAllTools(): void {
		pi.setActiveTools(getToolNames());
	}

	// ── Animation & Rendering ──

	function stopAnimation(): void {
		if (animationTimer) {
			clearInterval(animationTimer);
			animationTimer = undefined;
		}
	}

	function renderDragonStatus(now: number): string {
		const label = "DRAGON MODE";
		const breathe = 0.72 + 0.22 * (Math.sin((now / 2600) * 2 * Math.PI) + 1) / 2;
		let out = "";
		for (let i = 0; i < label.length; i++) {
			const ch = label[i] ?? "";
			const hue = ((now / 28 + i * 30) % 360 + 360) % 360;
			const [r, g, b] = hslToRgb(hue, 95, 56 * breathe + 8);
			out += rgb(ch, r, g, b);
		}
		return out;
	}

	function renderPuppyStatus(now: number): string {
		const label = "PUPPY MODE";
		const breathe = 0.82 + 0.16 * (Math.sin((now / 2500) * 2 * Math.PI) + 1) / 2;

		if (!puppySheen.active && now >= puppySheen.nextAt) {
			puppySheen.active = true;
			puppySheen.index = -2;
		}

		let out = "";
		for (let i = 0; i < label.length; i++) {
			const ch = label[i] ?? "";
			const sheenDistance = Math.abs(i - puppySheen.index);
			if (puppySheen.active && sheenDistance <= 1) {
				out += rgb(ch, 245, 250, 255);
				continue;
			}
			const [r, g, b] = hslToRgb(204, 92, 66 * breathe + 10);
			out += rgb(ch, r, g, b);
		}

		if (puppySheen.active) {
			puppySheen.index += 2;
			if (puppySheen.index > label.length + 2) {
				puppySheen.active = false;
				puppySheen.nextAt = now + 2500 + Math.floor(Math.random() * 1500);
			}
		}

		return out;
	}

	function refreshModeUi(): void {
		panelComponent?.invalidate();
		getPanels()?.requestRender();
		if (!uiCtx?.hasUI) return;

		if (getMode() === "none") {
			stopAnimation();
			uiCtx.ui.setStatus("dragon-guard", undefined);
			uiCtx.ui.setWidget("dragon-guard", undefined);
			return;
		}

		const renderTick = () => {
			if (!uiCtx?.hasUI) return;
			const now = Date.now();

			const theme = uiCtx.ui.theme;
			if (getMode() === "dragon") {
				uiCtx.ui.setStatus("dragon-guard", renderDragonStatus(now));
				uiCtx.ui.setWidget("dragon-guard", [theme ? theme.fg("success", "all edits allowed") : rgb("all edits allowed", 255, 170, 240)]);
				return;
			}

			if (getMode() === "plan") {
				uiCtx.ui.setStatus("dragon-guard", renderPuppyStatus(now));
				uiCtx.ui.setWidget("dragon-guard", [theme ? theme.fg("accent", "read-only planning enabled") : rgb("read-only planning enabled", 130, 210, 255)]);
			}
		};

		stopAnimation();
		renderTick();
		animationTimer = setInterval(renderTick, 120);
	}

	// ── Mode Switching ──

	function setMode(nextMode: GuardMode, ctx?: ExtensionContext, notify = true): void {
		setModeState(nextMode);
		if (ctx) uiCtx = ctx;
		enableAllTools();
		refreshModeUi();
		persistState();

		if (notify && uiCtx?.hasUI) {
			uiCtx.ui.notify(`Guard mode: ${MODE_LABEL[nextMode]}`, "info");
		}
	}

	// ── LLM Tool Summaries ──

	async function summarizeToolUse(toolName: string, input: unknown, ctx: ExtensionContext): Promise<string> {
		if (!getLlmSummaries()) return fallbackToolSummary(toolName);

		const toolCall = formatToolCall(toolName, input);

		// Try cheap/fast models in preference order; fall back gracefully
		const model =
			ctx.modelRegistry.find("anthropic", "claude-haiku-4-5") ??
			ctx.modelRegistry.find("anthropic", "claude-haiku-4-5-20251001") ??
			ctx.modelRegistry.find("anthropic", "claude-haiku-3-5-20241022") ??
			ctx.modelRegistry.find("google", "gemini-2.0-flash") ??
			ctx.modelRegistry.find("google", "gemini-2.0-flash-lite");

		if (!model) return fallbackToolSummary(toolName);

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok || !auth.apiKey) return fallbackToolSummary(toolName);

		const userMessage: UserMessage = {
			role: "user",
			content: [
				{
					type: "text",
					text: `Tool call to summarize for user permission:\n${toolCall}`,
				},
			],
			timestamp: Date.now(),
		};

		try {
			const response = await complete(
				model,
				{ systemPrompt: TOOL_SUMMARY_SYSTEM_PROMPT, messages: [userMessage] },
				{ apiKey: auth.apiKey, headers: auth.headers, signal: ctx.signal },
			);
			const text = response.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("\n")
				.trim();
			return text.length > 0 ? truncate(text, 220) : fallbackToolSummary(toolName);
		} catch {
			return fallbackToolSummary(toolName);
		}
	}

	// ── Permission Dialogs ──

	async function askDogModePermission(
		toolName: string,
		input: unknown,
		ctx: ExtensionContext,
	): Promise<"allow-once" | "allow-always" | "dragon" | "puppy" | "block"> {
		if (!ctx.hasUI) return "block";

		const callText = formatToolCall(toolName, input);
		const summary = await summarizeToolUse(toolName, input, ctx);

		const choice = await ctx.ui.select(`Allow tool use?\n${callText}\n${summary}`, [
			"Allow this tool call once",
			`Always allow ${toolName} in Dog Mode (this session)`,
			"Enter Puppy Mode (read-only planning)",
			"Enter Dragon Mode (implement now)",
		]);

		if (choice === "Allow this tool call once") return "allow-once";
		if (choice?.startsWith("Always allow")) {
			dogModeSessionBlockedTools.delete(toolName);
			dogModeSessionAllowedTools.add(toolName);
			persistState();
			if (ctx.hasUI) {
				ctx.ui.notify(`Dog Mode: always allowing ${toolName} for this session.`, "info");
			}
			return "allow-always";
		}
		if (choice?.startsWith("Enter Puppy Mode")) {
			setMode("plan", ctx);
			return "puppy";
		}
		if (choice?.startsWith("Enter Dragon Mode")) {
			setMode("dragon", ctx);
			return "dragon";
		}

		return "block";
	}

	async function askPuppyModePermission(
		toolName: string,
		input: unknown,
		ctx: ExtensionContext,
	): Promise<"allow-once" | "allow-always" | "dragon" | "stay-puppy"> {
		if (!ctx.hasUI) return "stay-puppy";

		const callText = formatToolCall(toolName, input);
		const summary = await summarizeToolUse(toolName, input, ctx);

		const choice = await ctx.ui.select(`Puppy Mode readonly guard triggered:\n${callText}\n${summary}`, [
			"Allow this tool call once",
			`Always allow ${toolName} in Puppy Mode (this session)`,
			"Enter Dragon Mode (all edits allowed)",
			"Stay in Puppy Mode (planning only)",
		]);

		if (choice === "Allow this tool call once") return "allow-once";
		if (choice?.startsWith("Always allow")) {
			puppyModeSessionAllowedTools.add(toolName);
			persistState();
			ctx.ui.notify(`Puppy Mode: always allowing ${toolName} for this session.`, "info");
			return "allow-always";
		}
		if (choice?.startsWith("Enter Dragon Mode")) {
			setMode("dragon", ctx);
			return "dragon";
		}

		return "stay-puppy";
	}

	// ── Guard Panel ──

	function openPanel(): string {
		const panels = getPanels();
		if (!panels) return "Panel manager not available";

		if (panels.isOpen(GUARD_PANEL_ID)) {
			panelComponent?.invalidate();
			panels.requestRender();
			return "Dragon Guard panel refreshed";
		}

		let component: GuardPanelComponent | null = null;
		const result = panels.createPanel(GUARD_PANEL_ID, (panelCtx: any) => {
			component = new GuardPanelComponent(panelCtx, {
				setMode: (mode) => setMode(mode, undefined, false),
				persistState: () => persistState(),
			});
			panelComponent = component;
			return {
				render: (w: number) => component!.render(w),
				invalidate: () => component!.invalidate(),
				handleInput: (data: string) => component!.handleInput(data),
			};
		}, {
			anchor: "top-left",
			width: "30%",
			minWidth: 32,
			maxHeight: "50%",
			onClose: () => { panelComponent = null; },
		});

		return result.success ? "Dragon Guard panel opened" : result.message;
	}

	function closePanel(): string {
		const panels = getPanels();
		if (!panels?.isOpen(GUARD_PANEL_ID)) return "No panel open";
		panels.close(GUARD_PANEL_ID);
		return "Dragon Guard panel closed";
	}

	function togglePanel(): string {
		if (getPanels()?.isOpen(GUARD_PANEL_ID)) return closePanel();
		return openPanel();
	}

	// ── Commands ──

	pi.registerCommand("mode", {
		description: "Show current guard mode",
		handler: async (_args, ctx) => {
			uiCtx = ctx;
			ctx.ui.notify(`Current guard mode: ${MODE_LABEL[getMode()]}`, "info");
		},
	});

	pi.registerCommand("dragon", {
		description: "Enter Dragon Mode (implementation enabled)",
		handler: async (_args, ctx) => setMode("dragon", ctx),
	});

	pi.registerCommand("puppy", {
		description: "Enter Puppy Mode (read-only planning)",
		handler: async (_args, ctx) => setMode("plan", ctx),
	});

	pi.registerCommand("plan", {
		description: "Alias for /puppy",
		handler: async (_args, ctx) => setMode("plan", ctx),
	});

	pi.registerCommand("nomode", {
		description: "Enter Dog Mode (permission-gated neutral mode)",
		handler: async (_args, ctx) => setMode("none", ctx),
	});

	pi.registerCommand("dog", {
		description: "Enter Dog Mode (permission-gated neutral mode)",
		handler: async (_args, ctx) => setMode("none", ctx),
	});

	pi.registerCommand("guard-settings", {
		description: "Toggle Dragon Guard settings panel",
		handler: async (_args, ctx) => {
			uiCtx = ctx;
			ctx.ui.notify(togglePanel(), "info");
		},
	});

	pi.registerCommand("guard", {
		description: "Manage Dragon Guard panel",
		handler: async (args, ctx) => {
			uiCtx = ctx;
			const subcmd = (args ?? "").trim().toLowerCase();
			switch (subcmd) {
				case "open":
				case "show":
					ctx.ui.notify(openPanel(), "info");
					return;
				case "close":
				case "hide":
					ctx.ui.notify(closePanel(), "info");
					return;
				case "toggle":
				case "":
					ctx.ui.notify(togglePanel(), "info");
					return;
				case "status": {
					const statusLines = [
						`Mode: ${MODE_LABEL[getMode()]}`,
						`Auto-Detect: ${getAutoDetect() ? "ON" : "OFF"}`,
						`Sensitivity: ${getComplexityThreshold()}`,
						`LLM Summaries: ${getLlmSummaries() ? "ON" : "OFF"}`,
						`Session allowed: ${[...dogModeSessionAllowedTools].sort().join(", ") || "(none)"}`,
						`Session blocked: ${[...dogModeSessionBlockedTools].sort().join(", ") || "(none)"}`,
					];
					ctx.ui.notify(statusLines.join("\n"), "info");
					return;
				}
				default: {
					const kh = getPanels()?.keyHints;
					ctx.ui.notify([
						"🐉 Dragon Guard — three-tier permission guard",
						"",
						"  /guard               Toggle panel",
						"  /guard open          Open panel",
						"  /guard close         Close panel",
						"  /guard status        Show current settings",
						"",
						"  /dragon              Enter Dragon Mode",
						"  /puppy               Enter Puppy Mode",
						"  /dog                 Enter Dog Mode",
						"",
						"When focused: ↑↓ navigate, ←→ or Space to adjust,",
						`${kh?.focusKey ?? "Alt+T"} to cycle focus, ${kh?.closeKey ?? "Q"} to close, ${kh?.unfocusKey ?? "Escape"} to unfocus`,
					].join("\n"), "info");
				}
			}
		},
	});

	// ── Shortcuts (configurable via settings) ──

	pi.registerShortcut(GUARD_DRAGON_KEY, {
		description: "Enter Dragon Mode",
		handler: async (ctx) => setMode("dragon", ctx),
	});

	pi.registerShortcut(GUARD_PUPPY_KEY, {
		description: "Enter Puppy Mode",
		handler: async (ctx) => setMode("plan", ctx),
	});

	pi.registerShortcut(GUARD_DOG_KEY, {
		description: "Enter Dog Mode",
		handler: async (ctx) => setMode("none", ctx),
	});

	pi.registerShortcut(GUARD_PANEL_KEY, {
		description: "Toggle Dragon Guard panel",
		handler: async (ctx) => {
			uiCtx = ctx;
			togglePanel();
		},
	});

	// ── Agent Events ──

	pi.on("before_agent_start", async (event, ctx) => {
		uiCtx = ctx;
		const promptText = typeof event.prompt === "string" ? event.prompt : "";

		if (getMode() === "none" && shouldAutoPlan(promptText)) {
			setMode("plan", ctx);
			if (ctx.hasUI) {
				ctx.ui.notify("Auto-entered Puppy Mode for a higher-complexity request.", "info");
			}
		}

		if (getMode() === "none") {
			return {
				message: {
					customType: "dog-mode-context",
					content:
						"[DOG MODE ACTIVE: PERMISSION-GATED]\\nBefore non-allowlisted tools (including subagent), use guard prompts to ask for allow-once, allow-this-session, switch to Puppy Mode, or switch to Dragon Mode.",
					display: false,
				},
			};
		}

		if (getMode() !== "plan") return;

		return {
			message: {
				customType: "puppy-mode-context",
				content: `[PUPPY MODE ACTIVE: READ-ONLY PLANNING]\nYou are in Puppy Mode. The project is read-only by default.\nIf a restricted tool is needed (including subagent), use the guard permission flow: allow once, allow this session, or switch to Dragon Mode.\nAnalyze, inspect, ask clarifying questions, and produce a concrete implementation plan.`,
				display: false,
			},
		};
	});

	// ── Tool Call Guard ──

	pi.on("tool_call", async (event, ctx) => {
		uiCtx = ctx;

		if (getMode() === "plan") {
			const puppyPolicy = getPuppyModeToolPolicy(event.toolName, event.input);
			if (puppyPolicy === "allow") return;

			const decision = await askPuppyModePermission(event.toolName, event.input, ctx);
			if (decision === "allow-once" || decision === "allow-always" || decision === "dragon") return;

			return {
				block: true,
				reason:
					"Puppy Mode readonly guard blocked this tool. Choose allow once/session or switch to Dragon Mode to implement.",
			};
		}

		if (getMode() === "none") {
			const toolPolicy = getDogModeToolPolicy(event.toolName);
			if (toolPolicy === "allow") {
				return;
			}
			if (toolPolicy === "block") {
				return {
					block: true,
					reason: `Tool ${event.toolName} is blocked by Dog Mode session settings (/guard-settings).`,
				};
			}

			const decision = await askDogModePermission(event.toolName, event.input, ctx);
			if (decision === "allow-once" || decision === "allow-always" || decision === "dragon") {
				return;
			}

			const reason =
				decision === "puppy"
					? "Tool use blocked in Dog Mode after switching to Puppy Mode."
					: "Tool use blocked in Dog Mode until permission is granted or Dragon Mode is enabled.";

			return {
				block: true,
				reason,
			};
		}
	});

	// ── Session Lifecycle ──

	const handleSessionChange = async (_event: any, ctx: ExtensionContext) => {
		uiCtx = ctx;
		panelComponent = null;
		reconstructState(ctx.sessionManager.getEntries());
		enableAllTools();
		refreshModeUi();
	};

	pi.on("session_start", handleSessionChange);
	pi.on("session_switch", handleSessionChange);
	pi.on("session_fork", handleSessionChange);
	pi.on("session_tree", handleSessionChange);

	pi.on("session_shutdown", async (_event, ctx) => {
		uiCtx = ctx;
		panelComponent = null;
		stopAnimation();
		if (ctx.hasUI) {
			ctx.ui.setStatus("dragon-guard", undefined);
			ctx.ui.setWidget("dragon-guard", undefined);
		}
	});
}
