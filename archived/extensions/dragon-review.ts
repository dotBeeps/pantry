/**
 * Dragon Review — Code review command for pi.
 *
 * Registers /review and /end-review commands. The dragon curls up beside
 * your diff, sniffs every line for security holes and sloppy error handling,
 * then delivers prioritised findings with surgical precision.
 *
 * A small dog and a large dragon made this together.
 *
 * Supports:
 *   /review                    — interactive mode selector
 *   /review uncommitted        — staged/unstaged/untracked changes
 *   /review branch <name>      — changes against a base branch (merge-base)
 *   /review commit <sha>       — a specific commit
 *   /review pr <number|url>    — checkout and review a GitHub PR
 *   /review folder <paths…>    — snapshot review of specific paths
 *   /review --extra "note"     — one-time extra instruction
 *
 * /end-review to return from the review branch.
 */

import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, BorderedLoader } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Text, Spacer, Input, fuzzyFilter, type SelectItem } from "@earendil-works/pi-tui";
import path from "node:path";
import { promises as fs } from "node:fs";

// ── Module-level state ─────────────────────────────────────────────────────
// Only one review active at a time — intentional; UI assumes single review.

let reviewOriginId: string | undefined = undefined;
let reviewLoopFixingEnabled = false;
let reviewCustomInstructions: string | undefined = undefined;
let reviewLoopInProgress = false;
let endReviewInProgress = false;

// ── State entry types ──────────────────────────────────────────────────────

const REVIEW_STATE_TYPE = "review-session";
const REVIEW_ANCHOR_TYPE = "review-anchor";
const REVIEW_SETTINGS_TYPE = "review-settings";

const REVIEW_LOOP_MAX_ITERATIONS = 10;
const REVIEW_LOOP_START_TIMEOUT_MS = 15000;
const REVIEW_LOOP_START_POLL_MS = 50;

type ReviewSessionState = {
	active: boolean;
	originId?: string;
};

type ReviewSettingsState = {
	loopFixingEnabled?: boolean;
	customInstructions?: string;
};

// ── Review target types ────────────────────────────────────────────────────

type ReviewTarget =
	| { type: "uncommitted" }
	| { type: "baseBranch"; branch: string }
	| { type: "commit"; sha: string; title?: string }
	| { type: "pullRequest"; prNumber: number; baseBranch: string; title: string }
	| { type: "folder"; paths: string[] };

// ── Review rubric ──────────────────────────────────────────────────────────

const REVIEW_RUBRIC = `# Review Guidelines

You are acting as a code reviewer for a proposed code change made by another engineer.

Below are default guidelines for determining what to flag. If you encounter more specific guidelines elsewhere (in a developer message, user message, file, or project review guidelines appended below), those override these general instructions.

## Determining what to flag

Flag issues that:
1. Meaningfully impact the accuracy, performance, security, or maintainability of the code.
2. Are discrete and actionable — not general or multi-issue bundles.
3. Don't demand rigor inconsistent with the rest of the codebase.
4. Were introduced in the changes being reviewed, not pre-existing bugs.
5. The author would likely fix if aware of them.
6. Don't rely on unstated assumptions about the codebase or author's intent.
7. Have provable impact on other parts of the code — speculation is not enough; you must identify the parts that are provably affected.
8. Are clearly not intentional changes by the author.
9. Be particularly careful with untrusted user input.
10. Treat silent local error recovery (especially parsing/IO/network fallbacks) as high-signal review candidates unless there is explicit boundary-level justification.

## Security checklist — untrusted user input

1. **Open redirects** — always validate redirect targets against an allow-list of trusted domains (?next_page=...).
2. **SQL injection** — every SQL query touching user data must use parameterised statements; flag any string concatenation or interpolation.
3. **SSRF** — in systems that accept user-supplied URLs, HTTP fetches must be protected against access to local/internal resources (intercept DNS resolver or apply an allow-list).
4. **XSS** — prefer escaping over sanitisation. Never trust HTML/JS produced from user input without an explicit escaping step.

## Fail-fast error handling (strict)

When reviewing added or modified error handling, default to fail-fast behaviour.

1. Evaluate every new or changed \`try/catch\`: identify what can fail and why local handling is correct at that exact layer.
2. Prefer propagation over local recovery. If the current scope cannot fully recover while preserving correctness, rethrow (optionally with context) rather than returning fallbacks.
3. Flag catch blocks that hide failure signals (e.g. returning \`null\`/\`[]\`/\`false\`, swallowing JSON parse failures, logging-and-continuing, or "best effort" silent recovery).
4. JSON parsing/decoding should fail loudly by default. Quiet fallback parsing is only acceptable with an explicit compatibility requirement and clear tested behaviour.
5. Boundary handlers (HTTP routes, CLI entrypoints, supervisors) may translate errors but must not pretend success or silently degrade.
6. If a catch exists only to satisfy lint/style without real handling, treat it as a bug.
7. When uncertain, prefer crashing fast over silent degradation.

## Comment guidelines

1. Be clear about why the issue is a problem.
2. Communicate severity appropriately — don't exaggerate.
3. Be brief — at most 1 paragraph.
4. Keep code snippets under 3 lines, wrapped in inline code or code blocks.
5. Use \`\`\`suggestion blocks ONLY for concrete replacement code (minimal lines; no commentary inside the block). Preserve exact leading whitespace of replaced lines.
6. Explicitly state scenarios/environments where the issue arises.
7. Use a matter-of-fact tone — helpful, not accusatory.
8. Write for quick comprehension without close reading.
9. Avoid excessive flattery or unhelpful phrases like "Great job…".

## Review priorities

1. Surface critical non-blocking human callouts (migrations, dependency churn, auth/permissions, compatibility, destructive operations) at the end.
2. Prefer simple, direct solutions over wrappers or abstractions without clear value.
3. Treat back-pressure handling as critical to system stability.
4. Apply system-level thinking; flag changes that increase operational risk or on-call wakeups.
5. Ensure errors are always checked against codes or stable identifiers, never error messages.

## Priority tags

Tag each finding with a priority in the title:
- **[P0]** — Drop everything. Blocking release/operations. Only for universal issues that do not depend on assumptions about inputs.
- **[P1]** — Urgent. Should be addressed in the next cycle.
- **[P2]** — Normal. To be fixed eventually.
- **[P3]** — Low. Nice to have.

## Required human callouts (non-blocking, at the very end)

After findings/verdict, append:

## Human Reviewer Callouts (Non-Blocking)

Include only applicable callouts (no yes/no lines):

- **This change adds a database migration:** <files/details>
- **This change introduces a new dependency:** <package(s)/details>
- **This change changes a dependency (or the lockfile):** <files/package(s)/details>
- **This change modifies auth/permission behaviour:** <what changed and where>
- **This change introduces backwards-incompatible public schema/API/contract changes:** <what changed and where>
- **This change includes irreversible or destructive operations:** <operation and scope>

Rules:
1. These are informational callouts for the human reviewer, not fix items.
2. Do not include them in Findings unless there is an independent defect.
3. These callouts alone must not change the verdict.
4. Only include callouts that apply to the reviewed change.
5. Keep each emitted callout bold exactly as written.
6. If none apply, write "- (none)".

## Output format

Provide findings in a clear, structured format:
1. List each finding with its priority tag, file location, and explanation.
2. Findings must reference locations that overlap with the actual diff — don't flag pre-existing code.
3. Keep line references as short as possible (avoid ranges over 5–10 lines; pick the most suitable subrange).
4. Provide an overall verdict: **"correct"** (no blocking issues) or **"needs attention"** (has blocking issues).
5. Ignore trivial style issues unless they obscure meaning or violate documented standards.
6. Do not generate a full PR fix — only flag issues and optionally provide short suggestion blocks.
7. End with the required "Human Reviewer Callouts (Non-Blocking)" section and all applicable bold callouts.

Output every finding the author would fix if they knew about it. If there are no qualifying findings, explicitly state the code looks good. Don't stop at the first finding — list every qualifying issue. Then append the required non-blocking callouts section.`;

// ── Review summary / fix prompts ───────────────────────────────────────────

const REVIEW_SUMMARY_PROMPT = `We are leaving a code-review branch and returning to the main coding branch.
Create a structured handoff that can be used immediately to implement fixes.

You MUST summarise the review that happened in this branch so findings can be acted on.
Do not omit findings: include every actionable issue that was identified.

Required sections (in order):

## Review Scope
- What was reviewed (files/paths, changes, and scope)

## Verdict
- "correct" or "needs attention"

## Findings
For EACH finding, include:
- Priority tag ([P0]..[P3]) and short title
- File location (\`path/to/file.ext:line\`)
- Why it matters (brief)
- What should change (brief, actionable)

## Fix Queue
1. Ordered implementation checklist (highest priority first)

## Constraints & Preferences
- Any constraints or preferences mentioned during review
- Or "(none)"

## Human Reviewer Callouts (Non-Blocking)
Include only applicable callouts (no yes/no lines):
- **This change adds a database migration:** <files/details>
- **This change introduces a new dependency:** <package(s)/details>
- **This change changes a dependency (or the lockfile):** <files/package(s)/details>
- **This change modifies auth/permission behaviour:** <what changed and where>
- **This change introduces backwards-incompatible public schema/API/contract changes:** <what changed and where>
- **This change includes irreversible or destructive operations:** <operation and scope>

If none apply, write "- (none)".

Preserve exact file paths, function names, and error messages where available.`;

const REVIEW_FIX_FINDINGS_PROMPT = `Use the latest review summary in this session and implement the review findings now.

Instructions:
1. Treat the summary's Findings/Fix Queue as a checklist.
2. Fix in priority order: P0, P1, then P2 (include P3 if quick and safe).
3. If a finding is invalid, already fixed, or not possible right now, briefly explain why and continue.
4. Treat "Human Reviewer Callouts (Non-Blocking)" as informational only; do not convert them into fix tasks unless there is a separate explicit finding.
5. Follow fail-fast error handling: do not add local catch/fallback recovery unless this scope is an explicit boundary that can safely translate the failure.
6. If you add or keep a \`try/catch\`, explain the expected failure mode and either rethrow with context or return a boundary-safe error response.
7. JSON parsing/decoding should fail loudly by default; avoid silent fallback parsing.
8. Run relevant tests/checks for touched code where practical.
9. End with: fixed items, deferred/skipped items (with reasons), and verification results.`;

// ── Prompt templates ───────────────────────────────────────────────────────

const LOCAL_CHANGES_REVIEW_INSTRUCTIONS =
	"Also include local working-tree changes (staged, unstaged, and untracked files) from this branch. Use `git status --porcelain`, `git diff`, `git diff --staged`, and `git ls-files --others --exclude-standard` so local fixes are part of this review cycle.";

// ── Verdict / finding parsers ──────────────────────────────────────────────

function parseMarkdownHeading(line: string): { level: number; title: string } | null {
	const m = line.match(/^\s*(#{1,6})\s+(.+?)\s*$/);
	if (!m) return null;
	return {
		level: m[1]!.length,
		title: m[2]!.replace(/\s+#+\s*$/, "").trim(),
	};
}

function getFindingsSectionBounds(lines: string[]): { start: number; end: number } | null {
	let start = -1;
	let findingsLevel: number | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const h = parseMarkdownHeading(line);
		if (h && /^findings\b/i.test(h.title)) {
			start = i + 1;
			findingsLevel = h.level;
			break;
		}
		if (/^\s*findings\s*:?\s*$/i.test(line)) {
			start = i + 1;
			break;
		}
	}

	if (start < 0) return null;

	let end = lines.length;
	for (let i = start; i < lines.length; i++) {
		const line = lines[i]!;
		const h = parseMarkdownHeading(line);
		if (h) {
			const t = h.title.replace(/[*_`]/g, "").trim();
			if (/^(review scope|verdict|overall verdict|fix queue|constraints(?:\s*&\s*preferences)?)\b:?/i.test(t)) {
				end = i;
				break;
			}
			if (/\[P[0-3]\]/i.test(h.title)) continue;
			if (findingsLevel !== null && h.level <= findingsLevel) {
				end = i;
				break;
			}
		}
		if (/^\s*(review scope|verdict|overall verdict|fix queue|constraints(?:\s*&\s*preferences)?)\b:?/i.test(line)) {
			end = i;
			break;
		}
	}

	return { start, end };
}

function isLikelyFindingLine(line: string): boolean {
	if (!/\[P[0-3]\]/i.test(line)) return false;

	// Rubric explanation lines — e.g. "- [P0] - Drop everything…"
	if (/^\s*(?:[-*+]|(?:\d+)[.)]|#{1,6})\s+priority\s+tag\b/i.test(line)) return false;
	if (/^\s*(?:[-*+]|(?:\d+)[.)]|#{1,6})\s+\[P[0-3]\]\s*[—–-]\s*(?:drop everything|urgent|normal|low|nice to have)\b/i.test(line)) return false;

	// Lines that enumerate multiple priority tags are rubric examples
	const allTags = line.match(/\[P[0-3]\]/gi) ?? [];
	if (allTags.length > 1) return false;

	// List item, heading, or bare tag at start of line
	if (/^\s*(?:[-*+]|(?:\d+)[.)])\s+/.test(line)) return true;
	if (/^\s*#{1,6}\s+/.test(line)) return true;
	if (/^\s*(?:\*\*|__)?\[P[0-3]\](?:\*\*|__)?(?=\s|:|-)/i.test(line)) return true;

	return false;
}

function normaliseVerdict(value: string): string {
	return value
		.trim()
		.replace(/^[-*+]\s*/, "")
		.replace(/^['"`]+|['"`]+$/g, "")
		.toLowerCase();
}

function isNeedsAttentionVerdict(value: string): boolean {
	const n = normaliseVerdict(value);
	if (!n.includes("needs attention")) return false;
	if (/\bnot\s+needs\s+attention\b/.test(n)) return false;
	// Rubric/choice phrasing — not a real verdict
	if (/\bcorrect\b/.test(n) && /\bor\b/.test(n)) return false;
	return true;
}

export function hasNeedsAttentionVerdict(messageText: string): boolean {
	const lines = messageText.split(/\r?\n/);

	// Inline verdict: "Verdict: needs attention"
	for (const line of lines) {
		const m = line.match(/^\s*(?:[*-+]\s*)?(?:overall\s+)?verdict\s*:\s*(.+)$/i);
		if (m && isNeedsAttentionVerdict(m[1]!)) return true;
	}

	// Block verdict under a heading
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const h = parseMarkdownHeading(line);

		let verdictLevel: number | null = null;
		if (h) {
			const t = h.title.replace(/[*_`]/g, "").trim();
			if (!/^(?:overall\s+)?verdict\b/i.test(t)) continue;
			verdictLevel = h.level;
		} else if (!/^\s*(?:overall\s+)?verdict\s*:?\s*$/i.test(line)) {
			continue;
		}

		for (let j = i + 1; j < lines.length; j++) {
			const vline = lines[j]!;
			const nh = parseMarkdownHeading(vline);
			if (nh) {
				const nt = nh.title.replace(/[*_`]/g, "").trim();
				if (verdictLevel === null || nh.level <= verdictLevel) break;
				if (/^(review scope|findings|fix queue|constraints(?:\s*&\s*preferences)?)\b:?/i.test(nt)) break;
			}
			const trimmed = vline.trim();
			if (!trimmed) continue;
			if (isNeedsAttentionVerdict(trimmed)) return true;
			if (/\bcorrect\b/i.test(normaliseVerdict(trimmed))) break;
		}
	}

	return false;
}

export function hasBlockingReviewFindings(messageText: string): boolean {
	const lines = messageText.split(/\r?\n/);
	const bounds = getFindingsSectionBounds(lines);
	const candidates = bounds ? lines.slice(bounds.start, bounds.end) : lines;

	let inFence = false;
	let foundTagged = false;

	for (const line of candidates) {
		if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
		if (inFence) continue;
		if (!isLikelyFindingLine(line)) continue;

		foundTagged = true;
		// P0, P1, or P2 are blocking
		if (/\[(P0|P1|P2)\]/i.test(line)) return true;
	}

	// If there were tagged findings but none were blocking, check verdict too
	if (foundTagged) return false;

	// Fallback: trust the verdict if no tagged findings were found
	return hasNeedsAttentionVerdict(messageText);
}

// ── Git helpers ────────────────────────────────────────────────────────────

async function getMergeBase(pi: ExtensionAPI, branch: string): Promise<string | null> {
	// Try upstream tracking branch first
	const { stdout: up, code: uc } = await pi.exec("git", ["rev-parse", "--abbrev-ref", `${branch}@{upstream}`]);
	if (uc === 0 && up.trim()) {
		const { stdout: mb, code } = await pi.exec("git", ["merge-base", "HEAD", up.trim()]);
		if (code === 0 && mb.trim()) return mb.trim();
	}
	const { stdout: mb2, code: c2 } = await pi.exec("git", ["merge-base", "HEAD", branch]);
	if (c2 === 0 && mb2.trim()) return mb2.trim();
	return null;
}

async function getLocalBranches(pi: ExtensionAPI): Promise<string[]> {
	const { stdout, code } = await pi.exec("git", ["branch", "--format=%(refname:short)"]);
	if (code !== 0) return [];
	return stdout.trim().split("\n").filter((b) => b.trim());
}

async function getRecentCommits(pi: ExtensionAPI, limit = 20): Promise<Array<{ sha: string; title: string }>> {
	const { stdout, code } = await pi.exec("git", ["log", "--oneline", `-n`, `${limit}`]);
	if (code !== 0) return [];
	return stdout
		.trim()
		.split("\n")
		.filter((l) => l.trim())
		.map((l) => {
			const [sha, ...rest] = l.trim().split(" ");
			return { sha: sha!, title: rest.join(" ") };
		});
}

async function hasUncommittedChanges(pi: ExtensionAPI): Promise<boolean> {
	const { stdout, code } = await pi.exec("git", ["status", "--porcelain"]);
	return code === 0 && stdout.trim().length > 0;
}

async function hasPendingTrackedChanges(pi: ExtensionAPI): Promise<boolean> {
	const { stdout, code } = await pi.exec("git", ["status", "--porcelain"]);
	if (code !== 0) return false;
	return stdout.trim().split("\n").filter((l) => l.trim() && !l.startsWith("??")).length > 0;
}

async function getCurrentBranch(pi: ExtensionAPI): Promise<string | null> {
	const { stdout, code } = await pi.exec("git", ["branch", "--show-current"]);
	return code === 0 && stdout.trim() ? stdout.trim() : null;
}

async function getDefaultBranch(pi: ExtensionAPI): Promise<string> {
	const { stdout, code } = await pi.exec("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"]);
	if (code === 0 && stdout.trim()) return stdout.trim().replace("origin/", "");
	const branches = await getLocalBranches(pi);
	if (branches.includes("main")) return "main";
	if (branches.includes("master")) return "master";
	return "main";
}

// ── PR helpers ─────────────────────────────────────────────────────────────

function parsePrReference(ref: string): number | null {
	const n = parseInt(ref.trim(), 10);
	if (!isNaN(n) && n > 0) return n;
	const m = ref.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
	return m ? parseInt(m[1]!, 10) : null;
}

async function getPrInfo(
	pi: ExtensionAPI,
	prNumber: number,
): Promise<{ baseBranch: string; title: string; headBranch: string } | null> {
	const { stdout, code } = await pi.exec("gh", [
		"pr", "view", String(prNumber),
		"--json", "baseRefName,title,headRefName",
	]);
	if (code !== 0) return null;
	try {
		const d = JSON.parse(stdout);
		return { baseBranch: d.baseRefName, title: d.title, headBranch: d.headRefName };
	} catch {
		return null;
	}
}

async function checkoutPr(pi: ExtensionAPI, prNumber: number): Promise<{ success: boolean; error?: string }> {
	const { stdout, stderr, code } = await pi.exec("gh", ["pr", "checkout", String(prNumber)]);
	if (code !== 0) return { success: false, error: stderr || stdout || "Failed to checkout PR" };
	return { success: true };
}

// ── Project guidelines ─────────────────────────────────────────────────────

async function loadProjectGuidelines(cwd: string): Promise<string | null> {
	let dir = path.resolve(cwd);
	while (true) {
		const piDir = path.join(dir, ".pi");
		const piStat = await fs.stat(piDir).catch(() => null);
		if (piStat?.isDirectory()) {
			const gPath = path.join(dir, "REVIEW_GUIDELINES.md");
			const gStat = await fs.stat(gPath).catch(() => null);
			if (gStat?.isFile()) {
				try {
					const content = (await fs.readFile(gPath, "utf8")).trim();
					return content || null;
				} catch {
					return null;
				}
			}
			return null;
		}
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

// ── Prompt builders ────────────────────────────────────────────────────────

async function buildReviewPrompt(
	pi: ExtensionAPI,
	target: ReviewTarget,
	includeLocalChanges = false,
): Promise<string> {
	switch (target.type) {
		case "uncommitted":
			return "Review the current code changes (staged, unstaged, and untracked files) and provide prioritised findings.";

		case "baseBranch": {
			const mb = await getMergeBase(pi, target.branch);
			const base = mb
				? `Review the code changes against the base branch '${target.branch}'. The merge base commit is ${mb}. Run \`git diff ${mb}\` to inspect the changes. Provide prioritised, actionable findings.`
				: `Review the code changes against the base branch '${target.branch}'. Find the merge base with \`git merge-base HEAD "$(git rev-parse --abbrev-ref "${target.branch}@{upstream}")"\`, then run \`git diff\` against that SHA. Provide prioritised, actionable findings.`;
			return includeLocalChanges ? `${base} ${LOCAL_CHANGES_REVIEW_INSTRUCTIONS}` : base;
		}

		case "commit":
			return target.title
				? `Review the code changes introduced by commit ${target.sha} ("${target.title}"). Provide prioritised, actionable findings.`
				: `Review the code changes introduced by commit ${target.sha}. Provide prioritised, actionable findings.`;

		case "pullRequest": {
			const mb = await getMergeBase(pi, target.baseBranch);
			const base = mb
				? `Review pull request #${target.prNumber} ("${target.title}") against the base branch '${target.baseBranch}'. The merge base commit is ${mb}. Run \`git diff ${mb}\` to inspect the changes. Provide prioritised, actionable findings.`
				: `Review pull request #${target.prNumber} ("${target.title}") against the base branch '${target.baseBranch}'. Find the merge base with \`git merge-base HEAD ${target.baseBranch}\`, then run \`git diff\` against that SHA. Provide prioritised, actionable findings.`;
			return includeLocalChanges ? `${base} ${LOCAL_CHANGES_REVIEW_INSTRUCTIONS}` : base;
		}

		case "folder":
			return `Review the code in the following paths: ${target.paths.join(", ")}. This is a snapshot review (not a diff). Read the files directly and provide prioritised, actionable findings.`;
	}
}

function getUserFacingHint(target: ReviewTarget): string {
	switch (target.type) {
		case "uncommitted": return "current changes";
		case "baseBranch": return `changes against '${target.branch}'`;
		case "commit": {
			const s = target.sha.slice(0, 7);
			return target.title ? `commit ${s}: ${target.title}` : `commit ${s}`;
		}
		case "pullRequest": {
			const t = target.title.length > 30 ? `${target.title.slice(0, 27)}…` : target.title;
			return `PR #${target.prNumber}: ${t}`;
		}
		case "folder": {
			const joined = target.paths.join(", ");
			return joined.length > 40 ? `folders: ${joined.slice(0, 37)}…` : `folders: ${joined}`;
		}
	}
}

// ── Session state helpers ──────────────────────────────────────────────────

function getReviewSessionState(ctx: ExtensionContext): ReviewSessionState | undefined {
	let state: ReviewSessionState | undefined;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && entry.customType === REVIEW_STATE_TYPE) {
			state = entry.data as ReviewSessionState;
		}
	}
	return state;
}

function getReviewSettings(ctx: ExtensionContext): ReviewSettingsState {
	let state: ReviewSettingsState | undefined;
	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type === "custom" && entry.customType === REVIEW_SETTINGS_TYPE) {
			state = entry.data as ReviewSettingsState;
		}
	}
	return {
		loopFixingEnabled: state?.loopFixingEnabled === true,
		customInstructions: state?.customInstructions?.trim() || undefined,
	};
}

// ── Assistant snapshot ─────────────────────────────────────────────────────

type AssistantSnapshot = { id: string; text: string; stopReason?: string };

function extractTextContent(content: unknown): string {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	return (content as Array<unknown>)
		.filter((p): p is { type: "text"; text: string } =>
			Boolean(p && typeof p === "object" && (p as any).type === "text" && "text" in (p as any)))
		.map((p) => p.text)
		.join("\n")
		.trim();
}

function getLastAssistantSnapshot(ctx: ExtensionContext): AssistantSnapshot | null {
	const entries = ctx.sessionManager.getBranch();
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i]!;
		if (e.type !== "message" || e.message.role !== "assistant") continue;
		const msg = e.message as { content?: unknown; stopReason?: string };
		return { id: e.id, text: extractTextContent(msg.content), stopReason: msg.stopReason };
	}
	return null;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

async function waitForLoopTurnToStart(ctx: ExtensionContext, previousId?: string): Promise<boolean> {
	const deadline = Date.now() + REVIEW_LOOP_START_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const lastId = getLastAssistantSnapshot(ctx)?.id;
		if (!ctx.isIdle() || ctx.hasPendingMessages() || (lastId && lastId !== previousId)) return true;
		await sleep(REVIEW_LOOP_START_POLL_MS);
	}
	return false;
}

// ── Footer widget ──────────────────────────────────────────────────────────

function setReviewWidget(ctx: ExtensionContext, active: boolean): void {
	if (!ctx.hasUI) return;
	if (!active) {
		ctx.ui.setWidget("review", undefined);
		return;
	}

	ctx.ui.setWidget("review", (_tui, theme) => {
		const msg = reviewLoopInProgress
			? "🐉 Review session active (loop fixing running)"
			: reviewLoopFixingEnabled
				? "🐉 Review session active (loop fixing on) · /end-review to finish"
				: "🐉 Review session active · /end-review to finish";
		const text = new Text(theme.fg("warning", msg), 0, 0);
		return {
			render: (w: number) => text.render(w),
			invalidate: () => text.invalidate(),
		};
	});
}

// ── Arg tokeniser ──────────────────────────────────────────────────────────

function tokeniseArgs(value: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: "\"" | "'" | null = null;

	for (let i = 0; i < value.length; i++) {
		const c = value[i]!;
		if (quote) {
			if (c === "\\" && i + 1 < value.length) { current += value[i + 1]!; i++; continue; }
			if (c === quote) { quote = null; continue; }
			current += c;
			continue;
		}
		if (c === "\"" || c === "'") { quote = c; continue; }
		if (/\s/.test(c)) {
			if (current.length > 0) { tokens.push(current); current = ""; }
			continue;
		}
		current += c;
	}
	if (current.length > 0) tokens.push(current);
	return tokens;
}

type ParsedArgs = {
	target: ReviewTarget | { type: "pr"; ref: string } | null;
	extraInstruction?: string;
	error?: string;
};

function parseArgs(args: string | undefined): ParsedArgs {
	if (!args?.trim()) return { target: null };

	const raw = tokeniseArgs(args.trim());
	const parts: string[] = [];
	let extra: string | undefined;

	for (let i = 0; i < raw.length; i++) {
		const p = raw[i]!;
		if (p === "--extra") {
			const next = raw[i + 1];
			if (!next) return { target: null, error: "Missing value for --extra" };
			extra = next;
			i++;
			continue;
		}
		if (p.startsWith("--extra=")) { extra = p.slice(8); continue; }
		parts.push(p);
	}

	if (parts.length === 0) return { target: null, extraInstruction: extra };

	const sub = parts[0]!.toLowerCase();

	switch (sub) {
		case "uncommitted":
			return { target: { type: "uncommitted" }, extraInstruction: extra };

		case "branch": {
			const branch = parts[1];
			if (!branch) return { target: null, extraInstruction: extra };
			return { target: { type: "baseBranch", branch }, extraInstruction: extra };
		}

		case "commit": {
			const sha = parts[1];
			if (!sha) return { target: null, extraInstruction: extra };
			const title = parts.slice(2).join(" ") || undefined;
			return { target: { type: "commit", sha, title }, extraInstruction: extra };
		}

		case "pr": {
			const ref = parts[1];
			if (!ref) return { target: null, extraInstruction: extra };
			return { target: { type: "pr", ref }, extraInstruction: extra };
		}

		case "folder": {
			const paths = parts.slice(1).filter((p) => p.trim());
			if (paths.length === 0) return { target: null, extraInstruction: extra };
			return { target: { type: "folder", paths }, extraInstruction: extra };
		}

		default:
			return { target: null, extraInstruction: extra };
	}
}

// ── Preset selector constants ──────────────────────────────────────────────

const REVIEW_PRESETS = [
	{ value: "uncommitted", label: "Review uncommitted changes", description: "staged, unstaged, and untracked" },
	{ value: "baseBranch", label: "Review against a base branch", description: "merge-base diff" },
	{ value: "commit", label: "Review a specific commit", description: "single commit" },
	{ value: "pullRequest", label: "Review a pull request", description: "checks out the PR via gh" },
	{ value: "folder", label: "Review a folder or path", description: "snapshot, not a diff" },
] as const;

const TOGGLE_LOOP_VALUE = "toggleLoop" as const;
const TOGGLE_INSTRUCTIONS_VALUE = "toggleInstructions" as const;

type PresetValue =
	| (typeof REVIEW_PRESETS)[number]["value"]
	| typeof TOGGLE_LOOP_VALUE
	| typeof TOGGLE_INSTRUCTIONS_VALUE;

// ── End-review helpers ─────────────────────────────────────────────────────

type EndAction = "returnOnly" | "returnAndSummarize" | "returnAndFix";
type EndResult = "ok" | "cancelled" | "error";

// ── Extension ─────────────────────────────────────────────────────────────

export default function dragonReview(pi: ExtensionAPI): void {
	// ── Persist helpers ────────────────────────────────────────────────────

	function persistSettings(): void {
		pi.appendEntry(REVIEW_SETTINGS_TYPE, {
			loopFixingEnabled: reviewLoopFixingEnabled,
			customInstructions: reviewCustomInstructions,
		} satisfies ReviewSettingsState);
	}

	function setLoop(enabled: boolean): void {
		reviewLoopFixingEnabled = enabled;
		persistSettings();
	}

	function setCustomInstructions(v: string | undefined): void {
		reviewCustomInstructions = v?.trim() || undefined;
		persistSettings();
	}

	// ── State restoration ──────────────────────────────────────────────────

	function restoreAll(ctx: ExtensionContext): void {
		// Settings (root entries)
		const settings = getReviewSettings(ctx);
		reviewLoopFixingEnabled = settings.loopFixingEnabled === true;
		reviewCustomInstructions = settings.customInstructions;

		// Session state (branch entries)
		const state = getReviewSessionState(ctx);
		if (state?.active && state.originId) {
			reviewOriginId = state.originId;
			setReviewWidget(ctx, true);
		} else {
			reviewOriginId = undefined;
			setReviewWidget(ctx, false);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(pi as any).on("session_start", (_e: any, ctx: any) => restoreAll(ctx as ExtensionContext));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(pi as any).on("session_switch", (_e: any, ctx: any) => restoreAll(ctx as ExtensionContext));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(pi as any).on("session_tree", (_e: any, ctx: any) => restoreAll(ctx as ExtensionContext));

	// ── Selectors ─────────────────────────────────────────────────────────

	async function showPresetSelector(ctx: ExtensionContext): Promise<ReviewTarget | null> {
		// Smart default: uncommitted > base branch > commit
		let smartDefault: string = "commit";
		if (await hasUncommittedChanges(pi)) {
			smartDefault = "uncommitted";
		} else {
			const cur = await getCurrentBranch(pi);
			const def = await getDefaultBranch(pi);
			if (cur && cur !== def) smartDefault = "baseBranch";
		}

		const presetItems: SelectItem[] = REVIEW_PRESETS.map((p) => ({
			value: p.value,
			label: p.label,
			description: p.description,
		}));
		const smartIdx = presetItems.findIndex((i) => i.value === smartDefault);

		while (true) {
			const instructLabel = reviewCustomInstructions
				? "Remove custom review instructions"
				: "Add custom review instructions";
			const instructDesc = reviewCustomInstructions ? "(currently set)" : "(applies to all modes)";
			const loopLabel = reviewLoopFixingEnabled ? "Disable loop fixing" : "Enable loop fixing";
			const loopDesc = reviewLoopFixingEnabled ? "(currently on)" : "(currently off)";

			const items: SelectItem[] = [
				...presetItems,
				{ value: TOGGLE_INSTRUCTIONS_VALUE, label: instructLabel, description: instructDesc },
				{ value: TOGGLE_LOOP_VALUE, label: loopLabel, description: loopDesc },
			];

			const result = await ctx.ui.custom<PresetValue | null>((tui, theme, _kb, done) => {
				const container = new Container();
				container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
				container.addChild(new Text(theme.fg("accent", theme.bold("🐉 Select review mode"))));

				const list = new SelectList(items, Math.min(items.length, 10), {
					selectedPrefix: (t) => theme.fg("accent", t),
					selectedText: (t) => theme.fg("accent", t),
					description: (t) => theme.fg("muted", t),
					scrollInfo: (t) => theme.fg("dim", t),
					noMatch: (t) => theme.fg("warning", t),
				});

				if (smartIdx >= 0) list.setSelectedIndex(smartIdx);

				list.onSelect = (item) => done(item.value as PresetValue);
				list.onCancel = () => done(null);

				container.addChild(list);
				container.addChild(new Text(theme.fg("dim", "Enter to confirm · Esc to cancel")));
				container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

				return {
					render: (w: number) => container.render(w),
					invalidate: () => container.invalidate(),
					handleInput: (data: string) => { list.handleInput(data); tui.requestRender(); },
				};
			});

			if (!result) return null;

			if (result === TOGGLE_LOOP_VALUE) {
				setLoop(!reviewLoopFixingEnabled);
				ctx.ui.notify(reviewLoopFixingEnabled ? "Loop fixing enabled" : "Loop fixing disabled", "info");
				continue;
			}

			if (result === TOGGLE_INSTRUCTIONS_VALUE) {
				if (reviewCustomInstructions) {
					setCustomInstructions(undefined);
					ctx.ui.notify("Custom review instructions removed", "info");
					continue;
				}
				const v = await ctx.ui.editor("Enter custom review instructions (applies to all modes):", "");
				if (!v?.trim()) { ctx.ui.notify("No instructions set", "info"); continue; }
				setCustomInstructions(v);
				ctx.ui.notify("Custom review instructions saved", "info");
				continue;
			}

			// Handle preset selection
			switch (result) {
				case "uncommitted":
					return { type: "uncommitted" };

				case "baseBranch": {
					const t = await showBranchSelector(ctx);
					if (t) return t;
					break;
				}

				case "commit": {
					if (reviewLoopFixingEnabled) {
						ctx.ui.notify("Loop fixing doesn't work with commit review.", "error");
						break;
					}
					const t = await showCommitSelector(ctx);
					if (t) return t;
					break;
				}

				case "pullRequest": {
					const t = await showPrInput(ctx);
					if (t) return t;
					break;
				}

				case "folder": {
					const t = await showFolderInput(ctx);
					if (t) return t;
					break;
				}

				default:
					return null;
			}
		}
	}

	// ── Branch selector ────────────────────────────────────────────────────

	async function showBranchSelector(ctx: ExtensionContext): Promise<ReviewTarget | null> {
		const branches = await getLocalBranches(pi);
		const cur = await getCurrentBranch(pi);
		const def = await getDefaultBranch(pi);

		const candidates = cur ? branches.filter((b) => b !== cur) : branches;
		if (candidates.length === 0) {
			ctx.ui.notify(cur ? `No other branches (current: ${cur})` : "No branches found", "error");
			return null;
		}

		const sorted = [...candidates].sort((a, b) => {
			if (a === def) return -1;
			if (b === def) return 1;
			return a.localeCompare(b);
		});

		const items: SelectItem[] = sorted.map((b) => ({
			value: b,
			label: b,
			description: b === def ? "(default branch)" : "",
		}));

		const result = await ctx.ui.custom<string | null>((tui, theme, kb, done) => {
			const container = new Container();
			container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
			container.addChild(new Text(theme.fg("accent", theme.bold("Select base branch"))));

			const search = new Input();
			container.addChild(search);
			container.addChild(new Spacer(1));

			const listWrap = new Container();
			container.addChild(listWrap);
			container.addChild(new Text(theme.fg("dim", "Type to filter · Enter to select · Esc to cancel")));
			container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

			let filtered = items;
			let list: SelectList | null = null;

			const rebuildList = () => {
				listWrap.clear();
				if (filtered.length === 0) {
					listWrap.addChild(new Text(theme.fg("warning", "  No matching branches")));
					list = null;
					return;
				}
				list = new SelectList(filtered, Math.min(filtered.length, 10), {
					selectedPrefix: (t) => theme.fg("accent", t),
					selectedText: (t) => theme.fg("accent", t),
					description: (t) => theme.fg("muted", t),
					scrollInfo: (t) => theme.fg("dim", t),
					noMatch: (t) => theme.fg("warning", t),
				});
				list.onSelect = (item) => done(item.value);
				list.onCancel = () => done(null);
				listWrap.addChild(list);
			};

			const refilter = () => {
				const q = search.getValue();
				filtered = q ? fuzzyFilter(items, q, (i) => `${i.label} ${i.value} ${i.description ?? ""}`) : items;
				rebuildList();
			};

			rebuildList();

			return {
				render: (w: number) => container.render(w),
				invalidate: () => container.invalidate(),
				handleInput: (data: string) => {
					if (kb.matches(data, "tui.select.up") || kb.matches(data, "tui.select.down") ||
						kb.matches(data, "tui.select.confirm") || kb.matches(data, "tui.select.cancel")) {
						if (list) { list.handleInput(data); }
						else if (kb.matches(data, "tui.select.cancel")) { done(null); }
						tui.requestRender();
						return;
					}
					search.handleInput(data);
					refilter();
					tui.requestRender();
				},
			};
		});

		if (!result) return null;
		return { type: "baseBranch", branch: result };
	}

	// ── Commit selector ────────────────────────────────────────────────────

	async function showCommitSelector(ctx: ExtensionContext): Promise<ReviewTarget | null> {
		const commits = await getRecentCommits(pi, 20);
		if (commits.length === 0) {
			ctx.ui.notify("No commits found", "error");
			return null;
		}

		const items: SelectItem[] = commits.map((c) => ({
			value: c.sha,
			label: `${c.sha.slice(0, 7)} ${c.title}`,
			description: "",
		}));

		const result = await ctx.ui.custom<{ sha: string; title: string } | null>((tui, theme, kb, done) => {
			const container = new Container();
			container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
			container.addChild(new Text(theme.fg("accent", theme.bold("Select commit to review"))));

			const search = new Input();
			container.addChild(search);
			container.addChild(new Spacer(1));

			const listWrap = new Container();
			container.addChild(listWrap);
			container.addChild(new Text(theme.fg("dim", "Type to filter · Enter to select · Esc to cancel")));
			container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

			let filtered = items;
			let list: SelectList | null = null;

			const rebuildList = () => {
				listWrap.clear();
				if (filtered.length === 0) {
					listWrap.addChild(new Text(theme.fg("warning", "  No matching commits")));
					list = null;
					return;
				}
				list = new SelectList(filtered, Math.min(filtered.length, 10), {
					selectedPrefix: (t) => theme.fg("accent", t),
					selectedText: (t) => theme.fg("accent", t),
					description: (t) => theme.fg("muted", t),
					scrollInfo: (t) => theme.fg("dim", t),
					noMatch: (t) => theme.fg("warning", t),
				});
				list.onSelect = (item) => {
					const c = commits.find((x) => x.sha === item.value);
					done(c ?? null);
				};
				list.onCancel = () => done(null);
				listWrap.addChild(list);
			};

			const refilter = () => {
				const q = search.getValue();
				filtered = q ? fuzzyFilter(items, q, (i) => `${i.label} ${i.value}`) : items;
				rebuildList();
			};

			rebuildList();

			return {
				render: (w: number) => container.render(w),
				invalidate: () => container.invalidate(),
				handleInput: (data: string) => {
					if (kb.matches(data, "tui.select.up") || kb.matches(data, "tui.select.down") ||
						kb.matches(data, "tui.select.confirm") || kb.matches(data, "tui.select.cancel")) {
						if (list) { list.handleInput(data); }
						else if (kb.matches(data, "tui.select.cancel")) { done(null); }
						tui.requestRender();
						return;
					}
					search.handleInput(data);
					refilter();
					tui.requestRender();
				},
			};
		});

		if (!result) return null;
		return { type: "commit", sha: result.sha, title: result.title };
	}

	// ── Folder input ───────────────────────────────────────────────────────

	async function showFolderInput(ctx: ExtensionContext): Promise<ReviewTarget | null> {
		const v = await ctx.ui.editor("Enter paths to review (space-separated):", ".");
		if (!v?.trim()) return null;
		const paths = v.trim().split(/\s+/).filter((p) => p.trim());
		return paths.length > 0 ? { type: "folder", paths } : null;
	}

	// ── PR input ───────────────────────────────────────────────────────────

	async function handlePrCheckout(ctx: ExtensionContext, ref: string): Promise<ReviewTarget | null> {
		if (await hasPendingTrackedChanges(pi)) {
			ctx.ui.notify("Cannot checkout PR: uncommitted changes. Commit or stash them first.", "error");
			return null;
		}

		const prNumber = parsePrReference(ref);
		if (!prNumber) {
			ctx.ui.notify("Invalid PR reference. Enter a number or GitHub PR URL.", "error");
			return null;
		}

		ctx.ui.notify(`Fetching PR #${prNumber}…`, "info");
		const info = await getPrInfo(pi, prNumber);
		if (!info) {
			ctx.ui.notify(`Could not find PR #${prNumber}. Check gh auth and try again.`, "error");
			return null;
		}

		if (await hasPendingTrackedChanges(pi)) {
			ctx.ui.notify("Cannot checkout PR: uncommitted changes. Commit or stash them first.", "error");
			return null;
		}

		ctx.ui.notify(`Checking out PR #${prNumber}…`, "info");
		const co = await checkoutPr(pi, prNumber);
		if (!co.success) {
			ctx.ui.notify(`Failed to checkout PR: ${co.error}`, "error");
			return null;
		}

		ctx.ui.notify(`Checked out PR #${prNumber} (${info.headBranch})`, "info");
		return { type: "pullRequest", prNumber, baseBranch: info.baseBranch, title: info.title };
	}

	async function showPrInput(ctx: ExtensionContext): Promise<ReviewTarget | null> {
		if (await hasPendingTrackedChanges(pi)) {
			ctx.ui.notify("Cannot checkout PR: uncommitted changes. Commit or stash them first.", "error");
			return null;
		}
		const v = await ctx.ui.editor("Enter PR number or URL:", "");
		if (!v?.trim()) return null;
		return handlePrCheckout(ctx, v.trim());
	}

	// ── Execute review ─────────────────────────────────────────────────────

	async function executeReview(
		ctx: ExtensionCommandContext,
		target: ReviewTarget,
		useFreshSession: boolean,
		opts?: { includeLocalChanges?: boolean; extraInstruction?: string },
	): Promise<boolean> {
		if (reviewOriginId) {
			ctx.ui.notify("Already in a review. Use /end-review to finish first.", "warning");
			return false;
		}

		if (useFreshSession) {
			// Record where we are before branching
			let originId = ctx.sessionManager.getLeafId() ?? undefined;
			if (!originId) {
				pi.appendEntry(REVIEW_ANCHOR_TYPE, { createdAt: new Date().toISOString() });
				originId = ctx.sessionManager.getLeafId() ?? undefined;
			}
			if (!originId) {
				ctx.ui.notify("Failed to determine review origin.", "error");
				return false;
			}

			reviewOriginId = originId;
			const lockedOriginId = originId;

			const entries = ctx.sessionManager.getEntries();
			const firstUser = entries.find((e) => e.type === "message" && e.message.role === "user");

			if (firstUser) {
				try {
					const nav = await ctx.navigateTree(firstUser.id, { summarize: false, label: "code-review" });
					if (nav.cancelled) {
						reviewOriginId = undefined;
						return false;
					}
				} catch (err) {
					reviewOriginId = undefined;
					ctx.ui.notify(`Failed to start review: ${err instanceof Error ? err.message : String(err)}`, "error");
					return false;
				}
				ctx.ui.setEditorText("");
			}

			// Restore after navigation events
			reviewOriginId = lockedOriginId;
			setReviewWidget(ctx, true);
			pi.appendEntry(REVIEW_STATE_TYPE, { active: true, originId: lockedOriginId } satisfies ReviewSessionState);
		}

		const prompt = await buildReviewPrompt(pi, target, opts?.includeLocalChanges === true);
		const hint = getUserFacingHint(target);
		const guidelines = await loadProjectGuidelines(ctx.cwd);

		let full = `${REVIEW_RUBRIC}\n\n---\n\nPlease perform a code review with the following focus:\n\n${prompt}`;

		if (reviewCustomInstructions) {
			full += `\n\nCustom review instructions (applies to all reviews):\n\n${reviewCustomInstructions}`;
		}

		if (opts?.extraInstruction?.trim()) {
			full += `\n\nAdditional instruction for this review:\n\n${opts.extraInstruction.trim()}`;
		}

		if (guidelines) {
			full += `\n\nProject-level review guidelines:\n\n${guidelines}`;
		}

		ctx.ui.notify(`Starting review: ${hint}${useFreshSession ? " (fresh branch)" : ""}`, "info");
		pi.sendUserMessage(full);
		return true;
	}

	// ── Loop fixing ────────────────────────────────────────────────────────

	async function runLoopFixing(
		ctx: ExtensionCommandContext,
		target: ReviewTarget,
		extraInstruction?: string,
	): Promise<void> {
		if (reviewLoopInProgress) {
			ctx.ui.notify("Loop fixing is already running.", "warning");
			return;
		}

		reviewLoopInProgress = true;
		setReviewWidget(ctx, Boolean(reviewOriginId));

		try {
			ctx.ui.notify("Loop fixing: cycling review→fix until no P0/P1/P2 findings remain.", "info");

			for (let pass = 1; pass <= REVIEW_LOOP_MAX_ITERATIONS; pass++) {
				const prevReviewId = getLastAssistantSnapshot(ctx)?.id;

				const started = await executeReview(ctx, target, true, {
					includeLocalChanges: true,
					extraInstruction,
				});
				if (!started) {
					ctx.ui.notify("Loop fixing stopped before review pass.", "warning");
					return;
				}

				if (!await waitForLoopTurnToStart(ctx, prevReviewId)) {
					ctx.ui.notify("Loop fixing stopped: review pass did not start in time.", "error");
					return;
				}

				await ctx.waitForIdle();

				const reviewSnap = getLastAssistantSnapshot(ctx);
				if (!reviewSnap || reviewSnap.id === prevReviewId) {
					ctx.ui.notify("Loop fixing stopped: could not read review result.", "warning");
					return;
				}
				if (reviewSnap.stopReason === "aborted") {
					ctx.ui.notify("Loop fixing stopped: review was aborted.", "warning");
					return;
				}
				if (reviewSnap.stopReason === "error") {
					ctx.ui.notify("Loop fixing stopped: review failed.", "error");
					return;
				}
				if (reviewSnap.stopReason === "length") {
					ctx.ui.notify("Loop fixing stopped: review output truncated.", "warning");
					return;
				}

				if (!hasBlockingReviewFindings(reviewSnap.text)) {
					const r = await doEndReviewAction(ctx, "returnAndSummarize", { showLoader: true, notifySuccess: false });
					if (r !== "ok") return;
					ctx.ui.notify("Loop fixing complete: no blocking findings remain 🐉", "info");
					return;
				}

				ctx.ui.notify(`Loop pass ${pass}: blocking findings found — returning to fix…`, "info");

				const prevFixId = getLastAssistantSnapshot(ctx)?.id;
				const r = await doEndReviewAction(ctx, "returnAndFix", { showLoader: true, notifySuccess: false });
				if (r !== "ok") return;

				if (!await waitForLoopTurnToStart(ctx, prevFixId)) {
					ctx.ui.notify("Loop fixing stopped: fix pass did not start in time.", "error");
					return;
				}

				await ctx.waitForIdle();

				const fixSnap = getLastAssistantSnapshot(ctx);
				if (!fixSnap || fixSnap.id === prevFixId) {
					ctx.ui.notify("Loop fixing stopped: could not read fix result.", "warning");
					return;
				}
				if (fixSnap.stopReason === "aborted") { ctx.ui.notify("Loop fixing stopped: fix pass aborted.", "warning"); return; }
				if (fixSnap.stopReason === "error") { ctx.ui.notify("Loop fixing stopped: fix pass failed.", "error"); return; }
				if (fixSnap.stopReason === "length") { ctx.ui.notify("Loop fixing stopped: fix pass truncated.", "warning"); return; }
			}

			ctx.ui.notify(`Loop fixing stopped after ${REVIEW_LOOP_MAX_ITERATIONS} passes (safety limit).`, "warning");
		} finally {
			reviewLoopInProgress = false;
			setReviewWidget(ctx, Boolean(reviewOriginId));
		}
	}

	// ── /review command ────────────────────────────────────────────────────

	pi.registerCommand("review", {
		description: "Review code changes — PR, uncommitted, branch, commit, or folder",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Review requires interactive mode", "error");
				return;
			}
			if (reviewLoopInProgress) {
				ctx.ui.notify("Loop fixing is already running.", "warning");
				return;
			}
			if (reviewOriginId) {
				ctx.ui.notify("Already in a review. Use /end-review to finish first.", "warning");
				return;
			}

			const { code } = await pi.exec("git", ["rev-parse", "--git-dir"]);
			if (code !== 0) {
				ctx.ui.notify("Not a git repository", "error");
				return;
			}

			const parsed = parseArgs(args);
			if (parsed.error) {
				ctx.ui.notify(parsed.error, "error");
				return;
			}

			let target: ReviewTarget | null = null;
			let fromSelector = false;
			const extra = parsed.extraInstruction?.trim() || undefined;

			if (parsed.target) {
				if (parsed.target.type === "pr") {
					target = await handlePrCheckout(ctx, (parsed.target as { type: "pr"; ref: string }).ref);
					if (!target) fromSelector = true; // fall through to selector on failure
				} else {
					target = parsed.target as ReviewTarget;
				}
			} else {
				fromSelector = true;
			}

			while (true) {
				if (!target && fromSelector) {
					target = await showPresetSelector(ctx);
				}
				if (!target) {
					ctx.ui.notify("Review cancelled", "info");
					return;
				}

				if (reviewLoopFixingEnabled && target.type === "commit") {
					ctx.ui.notify("Loop fixing doesn't work with commit review.", "error");
					if (fromSelector) { target = null; continue; }
					return;
				}

				if (reviewLoopFixingEnabled) {
					await runLoopFixing(ctx, target, extra);
					return;
				}

				// Decide fresh session vs current session
				const messages = ctx.sessionManager.getEntries().filter((e) => e.type === "message");
				let useFreshSession = messages.length === 0;

				if (messages.length > 0) {
					const choice = await ctx.ui.select("Start review in:", ["Fresh branch", "Current session"]);
					if (choice === undefined) {
						if (fromSelector) { target = null; continue; }
						ctx.ui.notify("Review cancelled", "info");
						return;
					}
					useFreshSession = choice === "Fresh branch";
				}

				await executeReview(ctx, target, useFreshSession, { extraInstruction: extra });
				return;
			}
		},
	});

	// ── End-review helpers ─────────────────────────────────────────────────

	function getActiveOrigin(ctx: ExtensionContext): string | undefined {
		if (reviewOriginId) return reviewOriginId;

		const state = getReviewSessionState(ctx);
		if (state?.active && state.originId) {
			reviewOriginId = state.originId;
			return reviewOriginId;
		}

		if (state?.active) {
			// State exists but no origin — clear it
			setReviewWidget(ctx, false);
			pi.appendEntry(REVIEW_STATE_TYPE, { active: false } satisfies ReviewSessionState);
			ctx.ui.notify("Review state missing origin; cleared.", "warning");
		}

		return undefined;
	}

	function clearReviewState(ctx: ExtensionContext): void {
		setReviewWidget(ctx, false);
		reviewOriginId = undefined;
		pi.appendEntry(REVIEW_STATE_TYPE, { active: false } satisfies ReviewSessionState);
	}

	async function navigateWithSummary(
		ctx: ExtensionCommandContext,
		originId: string,
		showLoader: boolean,
	): Promise<{ cancelled: boolean; error?: string } | null> {
		const opts = {
			summarize: true,
			customInstructions: REVIEW_SUMMARY_PROMPT,
			replaceInstructions: true,
		};

		if (showLoader && ctx.hasUI) {
			return ctx.ui.custom<{ cancelled: boolean; error?: string } | null>((_tui, theme, _kb, done) => {
				const loader = new BorderedLoader(_tui, theme, "Summarising review branch and returning…");
				loader.onAbort = () => done(null);
				ctx.navigateTree(originId, opts)
					.then(done)
					.catch((err) => done({ cancelled: false, error: err instanceof Error ? err.message : String(err) }));
				return loader;
			});
		}

		try {
			return await ctx.navigateTree(originId, opts);
		} catch (err) {
			return { cancelled: false, error: err instanceof Error ? err.message : String(err) };
		}
	}

	async function doEndReviewAction(
		ctx: ExtensionCommandContext,
		action: EndAction,
		opts: { showLoader?: boolean; notifySuccess?: boolean } = {},
	): Promise<EndResult> {
		const originId = getActiveOrigin(ctx);
		if (!originId) {
			if (!getReviewSessionState(ctx)?.active) {
				ctx.ui.notify("Not in a review branch (use /review first, or review was started in current-session mode)", "info");
			}
			return "error";
		}

		const notify = opts.notifySuccess ?? true;

		if (action === "returnOnly") {
			try {
				const nav = await ctx.navigateTree(originId, { summarize: false });
				if (nav.cancelled) {
					ctx.ui.notify("Navigation cancelled. Use /end-review to try again.", "info");
					return "cancelled";
				}
			} catch (err) {
				ctx.ui.notify(`Failed to return: ${err instanceof Error ? err.message : String(err)}`, "error");
				return "error";
			}
			clearReviewState(ctx);
			if (notify) ctx.ui.notify("Review complete. Returned to original position.", "info");
			return "ok";
		}

		const nav = await navigateWithSummary(ctx, originId, opts.showLoader ?? false);
		if (nav === null) {
			ctx.ui.notify("Summarisation cancelled. Use /end-review to try again.", "info");
			return "cancelled";
		}
		if (nav.error) {
			ctx.ui.notify(`Summarisation failed: ${nav.error}`, "error");
			return "error";
		}
		if (nav.cancelled) {
			ctx.ui.notify("Navigation cancelled. Use /end-review to try again.", "info");
			return "cancelled";
		}

		clearReviewState(ctx);

		if (action === "returnAndSummarize") {
			if (!ctx.ui.getEditorText().trim()) ctx.ui.setEditorText("Act on the review findings");
			if (notify) ctx.ui.notify("Review complete. Returned with summary.", "info");
			return "ok";
		}

		// returnAndFix
		pi.sendUserMessage(REVIEW_FIX_FINDINGS_PROMPT, { deliverAs: "followUp" });
		if (notify) ctx.ui.notify("Review complete. Fix pass queued.", "info");
		return "ok";
	}

	// ── /end-review command ────────────────────────────────────────────────

	pi.registerCommand("end-review", {
		description: "Finish review and return to the original session position",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("End-review requires interactive mode", "error");
				return;
			}
			if (reviewLoopInProgress) {
				ctx.ui.notify("Loop fixing is running. Wait for it to finish.", "info");
				return;
			}
			if (endReviewInProgress) {
				ctx.ui.notify("/end-review is already running", "info");
				return;
			}

			endReviewInProgress = true;
			try {
				const choice = await ctx.ui.select("Finish review:", [
					"Return only",
					"Return and summarize",
					"Return and fix",
				]);

				if (choice === undefined) {
					ctx.ui.notify("Cancelled. Use /end-review to try again.", "info");
					return;
				}

				const action: EndAction =
					choice === "Return and fix" ? "returnAndFix"
					: choice === "Return and summarize" ? "returnAndSummarize"
					: "returnOnly";

				await doEndReviewAction(ctx, action, { showLoader: true, notifySuccess: true });
			} finally {
				endReviewInProgress = false;
			}
		},
	});
}
