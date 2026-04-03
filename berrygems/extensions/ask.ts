/**
 * Ask — Interactive user input tool for agents.
 * A small dog and a large dragon made this together.
 *
 * Three modes:
 *   select   — Pick from options (with optional free-text fallback)
 *   confirm  — Yes/No question
 *   text     — Free-text input
 *
 * Gives agents a way to interview users, gather preferences, or confirm
 * decisions without breaking flow.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	Text,
	truncateToWidth,
} from "@mariozechner/pi-tui";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type, type Static } from "@sinclair/typebox";

import {
	getSkin,
	renderBorder,
	type ChromeOptions,
} from "../lib/panel-chrome.ts";

// --- Themed Borders ---
// Uses shared panel-chrome lib. Pattern picked once per component instance.

// --- Schema ---

const OptionSchema = Type.Object({
	label: Type.String({ description: "Display label" }),
	description: Type.Optional(Type.String({ description: "Hint text shown below label" })),
});

const AskParams = Type.Object({
	question: Type.String({ description: "The question to present to the user" }),
	mode: StringEnum(["select", "confirm", "text"] as const, {
		description: "select: pick from options. confirm: yes/no. text: free-text input.",
	}),
	options: Type.Optional(
		Type.Array(OptionSchema, {
			description: "Options for select mode. Ignored in other modes.",
		}),
	),
	allowCustom: Type.Optional(
		Type.Boolean({
			description:
				'In select mode, adds a "Type something…" option. Default: true.',
		}),
	),
	placeholder: Type.Optional(
		Type.String({
			description: "Placeholder text for text mode. Ignored in other modes.",
		}),
	),
});

type AskInput = Static<typeof AskParams>;

interface Option {
	label: string;
	description?: string;
}

type DisplayOption = Option & { isOther?: boolean };

interface AskDetails {
	question: string;
	mode: string;
	answer: string | null;
	wasCustom?: boolean;
	index?: number;
	options?: string[];
	userNote?: string;
}

// ── Panel Manager Access (for key passthrough) ──

const PANELS_KEY = Symbol.for("dot.panels");
function getPanels(): any {
	return (globalThis as any)[PANELS_KEY];
}

/**
 * Forward keys to panels while an ask prompt is capturing input.
 *
 * Uses VIRTUAL focus (visual-only) instead of real overlay focus to avoid
 * corrupting pi's overlay capture stack. The ask prompt remains the sole
 * capturing overlay; panels get their keys relayed through here.
 */
function passthroughToPanel(data: string): boolean {
	const panels = getPanels();
	if (!panels?.rawKeys) return false;

	// Focus cycle: use virtual focus (no overlay capture changes)
	if (matchesKey(data, panels.rawKeys.focus)) {
		if (panels.cycleVirtualFocus) {
			panels.cycleVirtualFocus();
		} else {
			// Fallback for older dots-panels without virtual focus
			panels.cycleFocus();
		}
		return true;
	}

	// If a panel has virtual focus, handle shared keys + forward the rest
	const virtualId = panels.getVirtualFocusId?.();
	if (virtualId) {
		if (matchesKey(data, panels.rawKeys.unfocus)) {
			panels.setVirtualFocus(null);
			return true;
		}
		if (matchesKey(data, panels.rawKeys.close)) {
			panels.close(virtualId);
			return true;
		}
		// Skin cycling: ] = next, [ = previous
		if (data === "]" || data === "[") {
			panels.cyclePanelSkin?.(virtualId, data === "]" ? 1 : -1);
			return true;
		}
		// Forward to the panel component's input handler
		const panel = panels.get(virtualId);
		if (panel?.handleInput) {
			panel.handleInput(data);
		}
		return true;
	}

	return false;
}

/** Clear virtual panel focus — call when an ask prompt finishes. */
function clearPanelForwarding(): void {
	getPanels()?.setVirtualFocus?.(null);
}

// --- Extension ---

export default function ask(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask",
		label: "Ask",
		description:
			"Ask the user a question. Modes: select (pick from options), confirm (yes/no), text (free input). Use when you need user input, preferences, or confirmation to proceed.",
		promptSnippet:
			"Ask the user a question (select from options, yes/no confirm, or free text input)",
		promptGuidelines: [
			"Use ask with mode 'select' when presenting choices, 'confirm' for yes/no decisions, 'text' for open-ended input.",
			"Provide clear, specific option labels. Add descriptions for options that need context.",
			"Phrase questions warmly — the user is a friend, not a customer. Be playful, specific, and concise.",
		],
		parameters: AskParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return error("UI not available (non-interactive mode)", params);
			}

			switch (params.mode) {
				case "select":
					return executeSelect(params, ctx);
				case "confirm":
					return executeConfirm(params, ctx);
				case "text":
					return executeText(params, ctx);
				default:
					return error(`Unknown mode: ${params.mode}`, params);
			}
		},

		renderCall(args, theme, _context) {
			const input = args as AskInput;
			const modeTag = theme.fg("muted", `[${input.mode}] `);
			let text =
				theme.fg("toolTitle", theme.bold("ask ")) +
				modeTag +
				theme.fg("text", input.question);

			if (input.mode === "select" && Array.isArray(input.options)) {
				const labels = input.options.map(
					(o: Option, i: number) => `${i + 1}. ${o.label}`,
				);
				if (input.allowCustom !== false) labels.push(`${labels.length + 1}. Bark something…`);
				text += `\n${theme.fg("dim", `  ${labels.join("  ")}`)}`;
			}

			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, _context) {
			const d = result.details as AskDetails | undefined;
			if (!d) {
				const first = result.content[0];
				return new Text(
					first?.type === "text" ? first.text : "",
					0,
					0,
				);
			}

			if (d.answer === null) {
				return new Text(theme.fg("warning", "🐿️ got distracted"), 0, 0);
			}

			const paw = "🐾 ";

			if (d.mode === "confirm") {
				const note = d.userNote
					? " " + theme.fg("muted", `\u00b7 ${d.userNote}`)
					: "";
				if (d.answer === "yes") {
					return new Text(paw + theme.fg("success", "good girl chose yes") + note, 0, 0);
				}
				return new Text(paw + theme.fg("muted", "nuh uh") + note, 0, 0);
			}

			if (d.wasCustom) {
				return new Text(
					paw +
						theme.fg("muted", "barked: ") +
						theme.fg("accent", d.answer),
					0,
					0,
				);
			}

			const display =
				d.index != null ? `${d.index}. ${d.answer}` : d.answer;
			const note = d.userNote
				? " " + theme.fg("muted", `· ${d.userNote}`)
				: "";
			return new Text(paw + theme.fg("accent", `fetched: ${display}`) + note, 0, 0);
		},
	});
}

// --- Mode Implementations ---

async function executeSelect(params: AskInput, ctx: any) {
	const options: Option[] = params.options ?? [];
	if (options.length === 0) {
		return error("No options provided for select mode", params);
	}

	const allowCustom = params.allowCustom !== false;
	const allOptions: DisplayOption[] = [
		...options,
		...(allowCustom
			? [{ label: "Bark something…", isOther: true }]
			: []),
	];

	const result = await (ctx.ui.custom as any)((tui: any, theme: any, _kb: any, done: any) => {
		let optionIndex = 0;
		let editMode: "off" | "custom" | "note" = "off";
		let cachedLines: string[] | undefined;
		const skin = getSkin();

		const editorTheme: EditorTheme = {
			borderColor: (s: string) => theme.fg("accent", s),
			selectList: {
				selectedPrefix: (t: string) => theme.fg("accent", t),
				selectedText: (t: string) => theme.fg("accent", t),
				description: (t: string) => theme.fg("muted", t),
				scrollInfo: (t: string) => theme.fg("dim", t),
				noMatch: (t: string) => theme.fg("warning", t),
			},
		};
		const editor = new Editor(tui, editorTheme);

		editor.onSubmit = (value: string) => {
			const trimmed = value.trim();
			if (editMode === "note") {
				// Submit the selected option with the note attached
				const selected = allOptions[optionIndex];
				done({
					answer: selected.label,
					wasCustom: false,
					index: optionIndex + 1,
					userNote: trimmed || undefined,
				});
				return;
			}
			if (trimmed) {
				done({ answer: trimmed, wasCustom: true });
			} else {
				editMode = "off";
				editor.setText("");
				refresh();
			}
		};

		function refresh() {
			cachedLines = undefined;
			tui.requestRender();
		}

		function handleInput(data: string) {
			// Panel focus passthrough — always allow cycling panels
			if (passthroughToPanel(data)) return;

			if (editMode !== "off") {
				if (matchesKey(data, Key.escape)) {
					editMode = "off";
					editor.setText("");
					refresh();
					return;
				}
				editor.handleInput(data);
				refresh();
				return;
			}

			if (matchesKey(data, Key.up)) {
				optionIndex = Math.max(0, optionIndex - 1);
				refresh();
			} else if (matchesKey(data, Key.down)) {
				optionIndex = Math.min(allOptions.length - 1, optionIndex + 1);
				refresh();
			} else if (matchesKey(data, Key.enter)) {
				const selected = allOptions[optionIndex];
				if (selected.isOther) {
					editMode = "custom";
					refresh();
				} else {
					done({
						answer: selected.label,
						wasCustom: false,
						index: optionIndex + 1,
					});
				}
			} else if (matchesKey(data, Key.tab)) {
				// Tab on a non-"other" option opens note editor
				const selected = allOptions[optionIndex];
				if (!selected.isOther) {
					editMode = "note";
					editor.setText("");
					refresh();
				}
			} else if (matchesKey(data, Key.escape)) {
				done(null);
			}
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;

			const lines: string[] = [];
			const add = (s: string) => lines.push(truncateToWidth(s, width));

			const chromeOpts: ChromeOptions = { focused: true, theme, skin };
			add(renderBorder(width, chromeOpts));
			add(theme.fg("text", ` ${params.question}`));
			lines.push("");

			for (let i = 0; i < allOptions.length; i++) {
				const opt = allOptions[i];
				const isSelected = i === optionIndex;
				const prefix = isSelected
					? theme.fg("accent", "> ")
					: "  ";
				const color = isSelected ? "accent" : "text";

				if (opt.isOther && editMode === "custom") {
					add(
						prefix +
							theme.fg("accent", `${i + 1}. ${opt.label} ✎`),
					);
				} else {
					add(
						prefix + theme.fg(color, `${i + 1}. ${opt.label}`),
					);
				}
				if (opt.description) {
					add(`     ${theme.fg("muted", opt.description)}`);
				}
			}

			if (editMode === "custom") {
				lines.push("");
				add(theme.fg("muted", " Your answer:"));
				for (const line of editor.render(width - 2)) {
					add(` ${line}`);
				}
			} else if (editMode === "note") {
				lines.push("");
				const selectedLabel = allOptions[optionIndex]?.label ?? "";
				add(theme.fg("muted", ` Adding note to: ${theme.fg("accent", selectedLabel)}`));
				for (const line of editor.render(width - 2)) {
					add(` ${line}`);
				}
			}

			lines.push("");
			const hints = editMode !== "off"
				? " Enter to submit • Esc to go back"
				: " ↑↓ sniff around • Enter to fetch • Tab to add note • Esc to wander off";
			add(theme.fg("dim", hints));
			add(renderBorder(width, chromeOpts));

			cachedLines = lines;
			return lines;
		}

		return {
			render,
			invalidate: () => {
				cachedLines = undefined;
			},
			handleInput,
		};
	});
	clearPanelForwarding();

	const simpleOptions = options.map((o) => o.label);

	if (!result) {
		return {
			content: [{ type: "text" as const, text: "Pup got distracted by a squirrel 🐿️" }],
			details: {
				question: params.question,
				mode: "select",
				options: simpleOptions,
				answer: null,
			} as AskDetails,
		};
	}

	if (result.wasCustom) {
		return {
			content: [
				{ type: "text" as const, text: `Pup barked: ${result.answer}` },
			],
			details: {
				question: params.question,
				mode: "select",
				options: simpleOptions,
				answer: result.answer,
				wasCustom: true,
			} as AskDetails,
		};
	}

	const noteText = result.userNote ? ` (note: ${result.userNote})` : "";
	return {
		content: [
			{
				type: "text" as const,
				text: `Pup fetched: ${result.index}. ${result.answer}${noteText}`,
			},
		],
		details: {
			question: params.question,
			mode: "select",
			options: simpleOptions,
			answer: result.answer,
			wasCustom: false,
			index: result.index,
			userNote: result.userNote,
		} as AskDetails,
	};
}

async function executeConfirm(params: AskInput, ctx: any) {
	const result = await (ctx.ui.custom as any)((tui: any, theme: any, _kb: any, done: any) => {
		let selectedYes = true;
		let editMode: "off" | "note" = "off";
		let cachedLines: string[] | undefined;
		const skin = getSkin();

		const editorTheme: EditorTheme = {
			borderColor: (s: string) => theme.fg("accent", s),
			selectList: {
				selectedPrefix: (t: string) => theme.fg("accent", t),
				selectedText: (t: string) => theme.fg("accent", t),
				description: (t: string) => theme.fg("muted", t),
				scrollInfo: (t: string) => theme.fg("dim", t),
				noMatch: (t: string) => theme.fg("warning", t),
			},
		};
		const editor = new Editor(tui, editorTheme);

		editor.onSubmit = (value: string) => {
			const trimmed = value.trim();
			done({
				answer: selectedYes,
				userNote: trimmed || undefined,
			});
		};

		function refresh() {
			cachedLines = undefined;
			tui.requestRender();
		}

		function handleInput(data: string) {
			if (passthroughToPanel(data)) return;

			if (editMode === "note") {
				if (matchesKey(data, Key.escape)) {
					editMode = "off";
					editor.setText("");
					refresh();
					return;
				}
				editor.handleInput(data);
				refresh();
				return;
			}

			if (matchesKey(data, Key.left) || matchesKey(data, Key.right) ||
				matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
				selectedYes = !selectedYes;
				refresh();
			} else if (matchesKey(data, Key.enter)) {
				done({ answer: selectedYes });
			} else if (matchesKey(data, Key.tab)) {
				editMode = "note";
				editor.setText("");
				refresh();
			} else if (matchesKey(data, Key.escape)) {
				done(null);
			}
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;

			const lines: string[] = [];
			const add = (s: string) => lines.push(truncateToWidth(s, width));

			const chromeOpts: ChromeOptions = { focused: true, theme, skin };
			add(renderBorder(width, chromeOpts));
			add(theme.fg("text", ` ${params.question}`));
			lines.push("");

			// Yes / No options
			const yesPrefix = selectedYes ? theme.fg("accent", "> ") : "  ";
			const noPrefix = !selectedYes ? theme.fg("accent", "> ") : "  ";
			const yesColor = selectedYes ? "accent" : "text";
			const noColor = !selectedYes ? "accent" : "text";
			add(`${yesPrefix}${theme.fg(yesColor, "Yes")}    ${noPrefix}${theme.fg(noColor, "No")}`);

			if (editMode === "note") {
				lines.push("");
				const choice = selectedYes ? "Yes" : "No";
				add(theme.fg("muted", ` Adding note to: ${theme.fg("accent", choice)}`));
				for (const line of editor.render(width - 2)) {
					add(` ${line}`);
				}
			}

			lines.push("");
			const hints = editMode === "note"
				? " Enter to submit \u2022 Esc to go back"
				: " \u2190\u2192 toggle \u2022 Enter to confirm \u2022 Tab to add note \u2022 Esc to wander off";
			add(theme.fg("dim", hints));
			add(renderBorder(width, chromeOpts));

			cachedLines = lines;
			return lines;
		}

		return {
			render,
			invalidate: () => { cachedLines = undefined; },
			handleInput,
		};
	});
	clearPanelForwarding();

	if (!result) {
		return {
			content: [{ type: "text" as const, text: "Pup got distracted by a squirrel \uD83D\uDC3F\uFE0F" }],
			details: {
				question: params.question,
				mode: "confirm",
				answer: null,
			} as AskDetails,
		};
	}

	const noteText = result.userNote ? ` (note: ${result.userNote})` : "";
	return {
		content: [
			{
				type: "text" as const,
				text: result.answer
					? `Pup nodded enthusiastically \uD83D\uDC3E${noteText}`
					: `Pup shook her head${noteText}`,
			},
		],
		details: {
			question: params.question,
			mode: "confirm",
			answer: result.answer ? "yes" : "no",
			userNote: result.userNote,
		} as AskDetails,
	};
}

async function executeText(params: AskInput, ctx: any) {
	const result = await (ctx.ui.custom as any)((tui: any, theme: any, _kb: any, done: any) => {
		let cachedLines: string[] | undefined;
		const skin = getSkin();

		const editorTheme: EditorTheme = {
			borderColor: (s: string) => theme.fg("accent", s),
			selectList: {
				selectedPrefix: (t: string) => theme.fg("accent", t),
				selectedText: (t: string) => theme.fg("accent", t),
				description: (t: string) => theme.fg("muted", t),
				scrollInfo: (t: string) => theme.fg("dim", t),
				noMatch: (t: string) => theme.fg("warning", t),
			},
		};
		const editor = new Editor(tui, editorTheme);
		if (params.placeholder) (editor as any).setPlaceholder?.(params.placeholder);

		editor.onSubmit = (value: string) => {
			const trimmed = value.trim();
			done(trimmed || null);
		};

		function refresh() {
			cachedLines = undefined;
			tui.requestRender();
		}

		function handleInput(data: string) {
			// Panel focus passthrough
			if (passthroughToPanel(data)) return;

			if (matchesKey(data, Key.escape)) {
				done(null);
				return;
			}
			editor.handleInput(data);
			refresh();
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;

			const lines: string[] = [];
			const add = (s: string) => lines.push(truncateToWidth(s, width));

			const chromeOpts: ChromeOptions = { focused: true, theme, skin };
			add(renderBorder(width, chromeOpts));
			add(theme.fg("text", ` ${params.question}`));
			lines.push("");

			for (const line of editor.render(width - 2)) {
				add(` ${line}`);
			}

			lines.push("");
			add(theme.fg("dim", " Enter to submit • Shift+Enter for newline • Esc to wander off"));
			add(renderBorder(width, chromeOpts));

			cachedLines = lines;
			return lines;
		}

		return {
			render,
			invalidate: () => { cachedLines = undefined; },
			handleInput,
		};
	});
	clearPanelForwarding();

	if (result === null || result === undefined) {
		return {
			content: [{ type: "text" as const, text: "Pup got distracted by a squirrel 🐿️" }],
			details: {
				question: params.question,
				mode: "text",
				answer: null,
			} as AskDetails,
		};
	}

	return {
		content: [
			{ type: "text" as const, text: `Pup barked: ${result}` },
		],
		details: {
			question: params.question,
			mode: "text",
			answer: result,
			wasCustom: true,
		} as AskDetails,
	};
}

// --- Helpers ---

function error(message: string, params: AskInput) {
	return {
		content: [{ type: "text" as const, text: `Error: ${message}` }],
		details: {
			question: params.question,
			mode: params.mode,
			answer: null,
		} as AskDetails,
	};
}
