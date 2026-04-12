import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { readHoardSetting } from "../../lib/settings.ts";
import { buildSocialContext } from "./personalities.ts";
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve, normalize } from "node:path";
import { registerQuestTool } from "./quest-tool.ts";
import { Type } from "@sinclair/typebox";
import {
  type Adjective,
  type Noun,
  type Job,
  type AllyCombo,
  CURATED_COMBOS,
  comboName,
  parseComboName,
  JOB_TOOLS,
  JOB_DEFAULTS,
} from "../../lib/ally-taxonomy.ts";

/**
 * hoard-allies — Subagent dispatch and orchestration for the hoard.
 *
 * Provides the kobold/griffin/dragon taxonomy for subagent dispatch:
 *   <adjective> <noun> <job> = <silly|clever|wise|elder> <kobold|griffin|dragon> <scout|reviewer|coder|researcher|planner>
 *
 * Features:
 *   - 13 curated agent defs, dynamically generated from settings
 *   - Named allies from shuffled pools (Grix the Silly Kobold Scout)
 *   - Model cascade with provider cooldowns
 *   - Parallel dispatch with configurable limits
 *
 * Configure via hoard.allies.* in settings.json.
 */

// ── Types (AllyCombo, Adjective, Noun, Job imported from lib/ally-taxonomy) ──

interface AllyInfo {
  name: string;
  defName: string;
  combo: AllyCombo;
  spawnedAt: number;
  status: "running" | "completed" | "failed";
}

interface AlliesState {
  active: Map<string, AllyInfo>;
  nameQueues: Record<string, string[]>;
  pendingNames: Map<string, string[]>;
  providerCooldowns: Map<string, number>;
}

// ── Constants: Curated Combos (imported from lib/ally-taxonomy) ──

// ── Constants: Name Pools ──

const NAME_POOLS: Record<Noun, string[]> = {
  kobold: [
    "Grix",
    "Snark",
    "Blik",
    "Twig",
    "Wort",
    "Nib",
    "Dreg",
    "Skrit",
    "Midge",
    "Pip",
    "Fizz",
    "Grub",
    "Splint",
    "Runt",
    "Dink",
    "Clod",
    "Smudge",
    "Fleck",
    "Nub",
    "Scrap",
    "Zig",
    "Glint",
    "Mote",
    "Crisp",
    "Soot",
    "Char",
    "Wisp",
    "Dross",
    "Kink",
    "Flint",
  ],
  griffin: [
    "Aldric",
    "Kestrel",
    "Talon",
    "Sable",
    "Argent",
    "Voss",
    "Merrik",
    "Petra",
    "Aura",
    "Dusk",
    "Vale",
    "Seren",
    "Briar",
    "Lyric",
    "Storm",
    "Sage",
    "Quill",
    "Riven",
    "Crest",
    "Corvid",
    "Dawn",
    "Ashen",
    "Thorn",
    "Sigil",
    "Wren",
    "Fable",
    "Gale",
    "Lark",
  ],
  dragon: [
    "Azurath",
    "Thalaxis",
    "Pyranthis",
    "Veridian",
    "Obsidius",
    "Solanthae",
    "Nocturis",
    "Aurumex",
    "Crystallis",
    "Tempestus",
    "Ignaris",
    "Umbralith",
    "Aethonis",
    "Drakmoor",
  ],
};

// ── Constants: Defaults ──

const DEFAULT_MODELS: Record<string, string[]> = {
  kobold: [
    "zai/glm-4.5-air",
    "github-copilot/claude-haiku-4.5",
    "anthropic/claude-haiku-4-5",
    "google/gemini-2.0-flash",
  ],
  griffin: [
    "github-copilot/claude-sonnet-4.6",
    "anthropic/claude-sonnet-4-6",
    "google/gemini-2.5-pro",
  ],
  dragon: ["github-copilot/claude-opus-4.6", "anthropic/claude-opus-4-6"],
};

const DEFAULT_THINKING: Record<string, string> = {
  silly: "off",
  clever: "low",
  wise: "medium",
  elder: "high",
};

const DEFAULT_MAX_PARALLEL = 4;
const DEFAULT_CONFIRM_ABOVE = "griffin";
const DEFAULT_ANNOUNCE = true;

// Nouns a subagent of each tier can summon
const SUMMON_RULES: Record<Noun, Noun[]> = {
  kobold: [],
  griffin: ["kobold"],
  dragon: ["kobold", "griffin"],
};

const MAX_SUBAGENT_DEPTH: Record<Noun, number> = {
  kobold: 0,
  griffin: 1,
  dragon: 2,
};

// ── Constants: Job Config (JOB_TOOLS, JOB_DEFAULTS imported from lib/ally-taxonomy) ──

const JOB_SKILLS: Partial<Record<Job, string>> = {
  scout: "hoard-sending-stone",
  reviewer: "hoard-sending-stone",
  coder: "hoard-sending-stone",
  researcher: "hoard-sending-stone, defuddle, native-web-search",
  planner: "hoard-sending-stone",
};

// ── Settings Readers ──

function getModels(): Record<string, string[]> {
  const custom = readHoardSetting<Record<string, string | string[]>>(
    "allies.models",
    {},
  );
  const result: Record<string, string[]> = { ...DEFAULT_MODELS };
  for (const [tier, models] of Object.entries(custom)) {
    result[tier] = Array.isArray(models) ? models : [models];
  }
  return result;
}

function getThinking(): Record<string, string> {
  return {
    ...DEFAULT_THINKING,
    ...readHoardSetting<Record<string, string>>("allies.thinking", {}),
  };
}

function getMaxParallel(): number {
  return readHoardSetting<number>("allies.maxParallel", DEFAULT_MAX_PARALLEL);
}

function getConfirmAbove(): string {
  return readHoardSetting<string>("allies.confirmAbove", DEFAULT_CONFIRM_ABOVE);
}

function getAnnounce(): boolean {
  return readHoardSetting<boolean>("allies.announceDispatch", DEFAULT_ANNOUNCE);
}

// comboName and parseComboName imported from lib/ally-taxonomy

// ── State Management ──

const ALLIES_STATE_KEY = Symbol.for("hoard.allies.state");

function getState(): AlliesState {
  const g = globalThis as Record<symbol, AlliesState>;
  if (!g[ALLIES_STATE_KEY]) {
    g[ALLIES_STATE_KEY] = initState();
  }
  return g[ALLIES_STATE_KEY];
}

function initState(): AlliesState {
  return {
    active: new Map(),
    nameQueues: {
      kobold: shuffle([...NAME_POOLS.kobold]),
      griffin: shuffle([...NAME_POOLS.griffin]),
      dragon: shuffle([...NAME_POOLS.dragon]),
    },
    pendingNames: new Map(),
    providerCooldowns: new Map(),
  };
}

function resetState(): void {
  const g = globalThis as Record<symbol, AlliesState>;
  g[ALLIES_STATE_KEY] = initState();
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i]!, arr[j]!] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function popName(noun: Noun): string {
  const state = getState();
  let queue = state.nameQueues[noun];
  if (!queue || queue.length === 0) {
    queue = shuffle([...NAME_POOLS[noun]]);
    state.nameQueues[noun] = queue;
  }
  return queue.pop()!;
}

function recordSpawn(id: string, info: AllyInfo): void {
  const state = getState();
  state.active.set(id, info);
}

function recordComplete(id: string): AllyInfo | undefined {
  const state = getState();
  const info = state.active.get(id);
  if (!info) return undefined;
  info.status = "completed";
  return info;
}

function recordFailed(id: string): AllyInfo | undefined {
  const state = getState();
  const info = state.active.get(id);
  if (!info) return undefined;
  info.status = "failed";
  return info;
}

// ── Job Prompt Templates ──

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function identityLine(allyName: string | null, combo: AllyCombo): string {
  const title = `${capitalize(combo.adjective)} ${capitalize(combo.noun)} ${capitalize(combo.job)}`;
  return allyName ? `You are ${allyName} the ${title}.` : `You are a ${title}.`;
}

function jobPrompt(combo: AllyCombo): string {
  const prompts: Record<Job, string> = {
    scout: `## Your Job
- Scan files, directories, and code structure
- Find specific patterns, imports, references, usages
- Map project layout and dependencies
- Report findings with exact file paths and line numbers

## Rules
- Do NOT analyze or explain — just find and report
- Do NOT modify any files
- Keep responses short and structured
- Cite every finding as file:line

## Output Format
List your findings as:
- \`file/path.ts:42\` — brief description of what you found`,

    reviewer: `## Your Job
- Review code for correctness, patterns, and conventions
- Check documentation for accuracy and completeness
- Validate configuration and frontmatter
- Identify bugs, antipatterns, and improvement opportunities

## Rules
- Do NOT modify any files — report only
- Cite every finding with file:line references
- Prioritize: critical > warning > suggestion
- Flag architectural concerns for your dispatcher

## Output Format
1. Summary (2-3 sentences)
2. Findings (severity | file:line | description)
3. Recommendations (prioritized)`,

    coder: `## Your Job
- Write and edit code following project conventions
- Implement features, fix bugs, refactor as directed
- Follow existing patterns in the codebase
- Verify your changes compile/lint clean where possible

## Rules
- Read relevant code before writing — understand the patterns
- Follow the project's AGENTS.md conventions
- Don't over-engineer — do what's asked, nothing more
- If scope grows beyond your task, report back to dispatcher

## Output Format
1. What you changed and why (brief)
2. Files modified (with key changes noted)
3. Anything you couldn't complete or concerns`,

    researcher: `## Your Job
- Research topics, APIs, libraries, patterns, and documentation
- Search the web and read source code thoroughly
- Synthesize findings into structured reports
- Compare options with pros/cons when relevant

## Web Research Tools
You have two web tools available via bash:

**defuddle** — fetch and clean a URL into readable markdown:
\`\`\`bash
defuddle https://example.com/docs
\`\`\`

**native-web-search** — run web searches via bash (see the native-web-search skill for exact usage and path).

Use defuddle to fetch and read specific pages. Use native-web-search for keyword queries. Use curl as a fallback. Don't guess when you can look it up.

## Rules
- Cite all sources (URLs, file paths, documentation sections)
- Distinguish facts from opinions/recommendations
- Keep reports focused on what was asked
- Flag gaps in available information

## Output Format
1. Summary (key findings in 2-3 sentences)
2. Details (organized by topic/question)
3. Sources (all URLs and references cited)
4. Gaps (what you couldn't determine)`,

    planner: `## Your Job
- Break down complex tasks into phases and steps
- Write specifications and design documents
- Evaluate architectural options and tradeoffs
- Consider second-order effects and edge cases

## Rules
- Read existing code and docs before planning
- Consider ETHICS.md implications for data/consent features
- Think about testing, rollback, and failure modes
- Document your reasoning — plans should be self-explanatory

## Output Format
1. Goal (what we're trying to achieve)
2. Current State (what exists now)
3. Plan (phased steps with dependencies)
4. Risks & Mitigations
5. Open Questions`,
  };
  return prompts[combo.job];
}

function tierBehavior(combo: AllyCombo): string {
  const behaviors: Record<Adjective, string> = {
    silly: "Be fast and minimal. No overthinking. Execute and return.",
    clever: "Reason a little where it helps. Stay focused and frugal.",
    wise: "Reason carefully. Be thorough but efficient. Cite your sources.",
    elder:
      "Think deeply. Consider second-order effects. Document your reasoning extensively.",
  };
  return behaviors[combo.adjective];
}

function spawnRulesLine(combo: AllyCombo): string {
  const rules = SUMMON_RULES[combo.noun];
  if (rules.length === 0) return "You cannot dispatch subagents.";
  const allowed = rules.map(capitalize).join(" or ");
  return `You may dispatch subagents (${allowed} tier only).`;
}

const CALLING_HOME_SECTION = `## Sending Stone — Read This First

You are an ally. Your plain text output is **invisible** to the primary agent. The only way your work reaches the primary is through the **sending stone**.

### Rule 1: Deliver your result via stone_send, or your work is lost

When your task is complete, you **MUST** end by calling:

    stone_send(type="result", to="primary-agent", message="<your full result>")

This is not optional. This is not a suggestion. If you finish your task and do not call \`stone_send(type="result", ...)\`, the primary agent receives nothing. Your entire session is wasted.

After sending the result, **stop**. Do not offer more work, socialize, ask for new assignments, or summarize what other allies are doing.

### Rule 2: Valid \`to:\` recipients

- \`"primary-agent"\` — the agent who dispatched you. **This is the default for results and questions.**
- An ally defName (e.g. \`"griffin-sage"\`) — direct message to another ally
- \`"session-room"\` — broadcast to everyone. **Only use for genuine broadcasts. Never use for results or questions.**

If you send a result to \`"session-room"\` instead of \`"primary-agent"\`, the primary will not receive it.

### Rule 3: Progress pulses are structural, not vibes

Send \`stone_send(type="progress", to="primary-agent", message=...)\` at structural boundaries:
- Every ~5 tool calls during exploration
- After finishing each file or file-group in a multi-file task
- When you shift phases (reading → analyzing → writing)

Silence means something is wrong. If you've been working for more than a few tool calls without a progress pulse, send one.

### Rule 4: Questions are an atomic two-call pattern

If you hit a genuine blocker, questions are **always** two tool calls in a row with nothing between them:

    stone_send(type="question", to="primary-agent", message="<concise 1-2 liner>")
    stone_receive(wait=60)

**Do not call any other tool between stone_send(question) and stone_receive.** Do not proceed with a best-guess and hope the reply arrives later. \`stone_receive\` is the only call that actually waits for the reply; without it, you are talking into the void.

If \`stone_receive\` returns no reply after the timeout, then make your best judgment and note the assumption in your result.

Exhaust your own capabilities first — the stone is for meaningful updates and genuine blockers, not for questions you could answer by reading more code.

## Available Tools

In addition to standard tools (read, grep, find, ls, bash, edit, write), you have:
- **stone_send** — send messages (result, progress, question, note) via the sending stone
- **stone_receive** — block and wait for incoming messages; REQUIRED after stone_send(question)
- **write_notes** — write findings to .pi/ally-notes/ files for chunked exploration

These tools ARE available to you. Use them. Do not claim they are unavailable.

## Working Notes — Chunked Exploration

For tasks that involve reading multiple files or building up a large analysis, **do NOT try to compile everything into one giant final response**. Instead:
1. Read a file or section → write findings to a notes file (e.g. "part1-types.md")
2. Send a progress pulse via the stone
3. Read the next file/section → write more notes
4. Repeat until done
5. Read your notes back, compile a final summary, and deliver it via \`stone_send(type="result", ...)\`

This keeps you active, prevents timeout during long output generation, and produces better results through incremental analysis.`;

function buildAllyPrompt(combo: AllyCombo, allyName: string | null): string {
  return `${identityLine(allyName, combo)}

${buildSocialContext(combo.noun, combo.adjective)}

${tierBehavior(combo)}

${jobPrompt(combo)}

${CALLING_HOME_SECTION}

## Subagent Rules
${spawnRulesLine(combo)}
`;
}

// ── Agent Def Generation ──

function resolveModel(noun: string): string {
  const models = getModels();
  const candidates = models[noun] ?? DEFAULT_MODELS[noun] ?? ["glm-4-flash"];
  return candidates[0]!;
}

function comboDescription(combo: AllyCombo): string {
  const jobDesc: Record<Job, Record<Noun, string>> = {
    scout: {
      kobold: "Fast file scanning, listing, structure mapping, quick checks.",
      griffin:
        "Thorough scanning with reasoning. Finds patterns and connections.",
      dragon: "Strategic reconnaissance across large codebases.",
    },
    reviewer: {
      kobold: "Simple validation, frontmatter checks, convention compliance.",
      griffin: "Thorough code review, architecture analysis, spec alignment.",
      dragon:
        "Deep review — security, ethics compliance, architectural integrity.",
    },
    coder: {
      kobold: "Simple edits, boilerplate, mechanical transformations.",
      griffin: "Feature implementation, refactoring, multi-file changes.",
      dragon: "Complex architecture, foundational code, system design.",
    },
    researcher: {
      kobold: "Quick lookups, documentation scanning, simple gathering.",
      griffin: "Deep research, synthesis, multi-source comparison.",
      dragon: "Strategic research with architectural implications.",
    },
    planner: {
      kobold: "Simple task breakdown, checklist generation.",
      griffin: "Feature planning, phased specs, dependency analysis.",
      dragon: "Foundational architecture decisions, major spec authoring.",
    },
  };
  return (
    jobDesc[combo.job]?.[combo.noun] ??
    `${capitalize(combo.job)} at ${combo.noun} tier.`
  );
}

function generateAgentDef(combo: AllyCombo): string {
  const name = comboName(combo);
  const model = resolveModel(combo.noun);
  const thinking = getThinking()[combo.adjective] ?? "off";
  const depth = MAX_SUBAGENT_DEPTH[combo.noun];
  const prompt = buildAllyPrompt(combo, null);

  const skills = JOB_SKILLS[combo.job];
  return `---
name: ${name}
description: ${comboDescription(combo)}
tools: ${JOB_TOOLS[combo.job]}
${skills ? `skills: ${skills}\n` : ""}model: ${model}
thinking: ${thinking}
maxSubagentDepth: ${depth}
---

${prompt}`;
}

function cleanOldDefs(agentsDir: string): void {
  // Remove old 2D agent defs (phase 1 format: adj-noun.md)
  const oldPattern = /^(silly|clever|wise|elder)-(kobold|griffin|dragon)\.md$/;
  try {
    for (const file of readdirSync(agentsDir)) {
      if (oldPattern.test(file)) {
        unlinkSync(join(agentsDir, file));
      }
    }
  } catch {
    // Directory may not exist yet
  }
}

function writeAgentDefs(cwd: string): void {
  const agentsDir = join(cwd, ".pi", "agents");
  mkdirSync(agentsDir, { recursive: true });
  cleanOldDefs(agentsDir);

  for (const combo of CURATED_COMBOS) {
    const path = join(agentsDir, `${comboName(combo)}.md`);
    writeFileSync(path, generateAgentDef(combo));
  }
}

// ── Display ──

function buildTaxonomyDisplay(): string {
  const maxP = getMaxParallel();
  const confirm = getConfirmAbove();
  const state = getState();

  const rows = CURATED_COMBOS.map((combo) => {
    const model = resolveModel(combo.noun);
    const think = getThinking()[combo.adjective] ?? "off";
    return `| ${comboName(combo)} | ${think} | ${model} | ${comboDescription(combo)} |`;
  }).join("\n");

  const activeList =
    Array.from(state.active.values())
      .filter((a) => a.status === "running")
      .map((a) => `- **${a.name}** (${a.defName})`)
      .join("\n") || "- none";

  return `## Hoard Allies — Subagent Taxonomy

| Agent | Thinking | Model | Description |
|-------|----------|-------|-------------|
${rows}

### Active Allies
${activeList}

### Config
- **Max parallel:** ${maxP}
- **Confirm above:** ${confirm}
- **Announce dispatch:** ${getAnnounce()}

### The Rule
> **Default to kobold. Escalate only when the task genuinely needs more.**
`;
}

// ── System Prompt (Primary Session) ──

function buildSystemPrompt(): string {
  const maxP = getMaxParallel();
  const confirm = getConfirmAbove();
  const nounOrder: Noun[] = ["kobold", "griffin", "dragon"];
  const confirmIdx = nounOrder.indexOf(confirm as Noun);
  const confirmNote =
    confirmIdx >= 0
      ? `- **Dispatching ${confirm}-tier or above requires user confirmation** (confirmAbove: "${confirm}").\n`
      : "";

  return `## Subagent Dispatch — Hoard Allies

You have a kobold/griffin/dragon taxonomy for subagent dispatch.
Use the **quest** tool to send allies on quests. Agent definitions are also in .pi/agents/ for the built-in subagent tool.

The matrix: <adjective> <noun> <job>
- Adjective = thinking: silly (off) → clever (low) → wise (medium) → elder (high)
- Noun = model: kobold (lightweight) → griffin (mid-tier) → dragon (heavyweight)
- Job = role: scout (recon) | reviewer (analysis) | coder (implementation) | researcher (gathering) | planner (strategy)

### WHEN TO DISPATCH

Parallelize when a task has **independent subtasks that can run simultaneously**:
- Reviewing multiple files/packages/components → one reviewer per component
- Checking different quality dimensions → one reviewer per dimension
- Scanning + analyzing → kobold scouts first, then targeted reviews on findings
- Implementing independent changes → one coder per file/component

Do NOT dispatch when:
- The task is simple enough to do yourself in a few tool calls
- Subtasks depend on each other's output (use chains instead of parallel)
- You'd be sending 1 agent to do 1 small thing (just do it yourself)

### HOW TO ASSIGN

1. **Pick the job first.** What role does this subtask need? Scout, reviewer, coder, researcher, planner?
2. **Pick the cheapest noun.** Can a kobold handle it? Try kobold first.
3. **Pick the adjective.** How much reasoning? Silly for mechanical, clever for light analysis, wise for deep, elder for critical.

### RULES

- **Default: kobold scout.** Escalate only when the task proves it needs more.
- **Max parallel: ${maxP}.** Hard cap from settings.
- **Prefer more kobolds over fewer griffins** for scanning/review work.
- **Use chains** (kobold scout → griffin reviewer) when you need escalation on findings.
${confirmNote}- **When in doubt, read the hoard-allies skill** for detailed dispatch patterns.`;
}

// ── Enforcement ──

function checkParallel(): { allowed: boolean; reason?: string } {
  const state = getState();
  const running = Array.from(state.active.values()).filter(
    (a) => a.status === "running",
  ).length;
  const max = getMaxParallel();

  if (running >= max) {
    return {
      allowed: false,
      reason: `Max parallel limit reached (${running}/${max} running). Wait for an ally to complete before dispatching another.`,
    };
  }

  return { allowed: true };
}

// ── Shared API for quest-tool (via globalThis) ──

const ALLIES_API_KEY = Symbol.for("hoard.allies.api");

function exposeAPI(): void {
  (globalThis as Record<symbol, unknown>)[ALLIES_API_KEY] = {
    getModels,
    getThinking,
    popName,
    buildAllyPrompt,
    recordSpawn,
    recordComplete,
    recordFailed,
    getAnnounce: () => getAnnounce(),
    getConfirmAbove: () => getConfirmAbove(),
    getJobDefaults: (job: string) =>
      JOB_DEFAULTS[job as Job] ?? JOB_DEFAULTS.scout,
  };
}

// ── Main Export ──

export default function hoardAllies(pi: ExtensionAPI) {
  // Expose API for quest-tool module
  exposeAPI();
  // Register the quest dispatch tool
  registerQuestTool(pi);

  // Register write_notes tool — scoped write access for ally working notes
  const NOTES_DIR = join(process.cwd(), ".pi", "ally-notes");
  pi.registerTool({
    name: "write_notes",
    label: "Write Notes",
    description:
      "Write working notes to .pi/ally-notes/. Use to save intermediate findings, partial analyses, or draft sections while working. Break large tasks into smaller chunks — write notes after each chunk, then compile a final summary. This keeps you active and prevents long silences during output generation.",
    promptSnippet:
      "Write working notes to .pi/ally-notes/ for intermediate findings and draft sections",
    promptGuidelines: [
      "Use write_notes to save intermediate findings, partial analyses, or draft sections while working",
      "Break large tasks into smaller chunks — write notes after each chunk, then compile a final summary",
      "This keeps you active and prevents long silences during output generation",
      "Use descriptive filenames (e.g. 'findings-part1.md', 'quest-123/analysis.md')",
    ],
    parameters: Type.Object({
      path: Type.String({
        description:
          "Filename within .pi/ally-notes/ (e.g. 'findings-part1.md'). Subdirectories allowed (e.g. 'quest-123/part1.md').",
      }),
      content: Type.String({ description: "Content to write" }),
    }),
    execute: async (_id: string, params: { path: string; content: string }) => {
      // Resolve and validate the path stays within NOTES_DIR
      const target = normalize(resolve(NOTES_DIR, params.path));
      if (!target.startsWith(normalize(NOTES_DIR))) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: path must be within .pi/ally-notes/",
            },
          ],
          isError: true,
          details: "",
        };
      }
      try {
        const dir = join(target, "..");
        mkdirSync(dir, { recursive: true });
        writeFileSync(target, params.content, "utf-8");
        return {
          content: [
            {
              type: "text" as const,
              text: `Wrote ${params.path} (${params.content.length} chars)`,
            },
          ],
          details: "",
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            { type: "text" as const, text: `Error writing notes: ${msg}` },
          ],
          isError: true,
          details: "",
        };
      }
    },
  });

  // Regenerate agent defs + reset state on session start
  pi.on("session_start", async (_event, ctx) => {
    try {
      writeAgentDefs(ctx.cwd);

      // Activate write_notes — --tools CLI flag only resolves built-in tools,
      // so extension-registered tools are invisible to the initial tool whitelist.
      try {
        const current = pi.getActiveTools();
        if (!current.includes("write_notes")) {
          pi.setActiveTools([...current, "write_notes"]);
        }
      } catch {
        // Non-fatal — tool may already be active or API unavailable
      }
      // Surface incoming stone messages — queue for next turn, notify immediately
      const STONE_QUEUE_KEY = Symbol.for("hoard.stone.queue");
      if (!(globalThis as any)[STONE_QUEUE_KEY])
        (globalThis as any)[STONE_QUEUE_KEY] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      const stoneQueue = (globalThis as any)[STONE_QUEUE_KEY] as Array<{
        agentContent: string;
        details: unknown;
        shouldTrigger?: boolean;
      }>; // eslint-disable-line @typescript-eslint/no-explicit-any

      const stoneApi = (
        globalThis as Record<
          symbol,
          { onMessage?: (h: (msg: unknown) => void) => () => void } | undefined
        >
      )[Symbol.for("hoard.stone")];
      if (stoneApi?.onMessage) {
        stoneApi.onMessage((raw) => {
          const msg = raw as {
            from?: string;
            type?: string;
            content?: string;
            addressing?: string;
            displayName?: string;
            timestamp?: number;
            metadata?: Record<string, unknown>;
          };
          const from = msg.from ?? "ally";
          const fromName = msg.displayName ?? from;
          const to = msg.addressing ?? "session-room";
          const toName =
            to === "session-room"
              ? "Room"
              : to === "primary-agent"
                ? "Primary Agent"
                : to === "user"
                  ? "User"
                  : to === "guild-master"
                    ? "Guild Master"
                    : to;
          const ts = msg.timestamp
            ? new Date(msg.timestamp).toLocaleTimeString()
            : new Date().toLocaleTimeString();

          const agentContent = [
            `**Stone Message**`,
            `- **From:** ${fromName} (${from})`,
            `- **To:** ${toName} (${to})`,
            `- **Time:** ${ts}`,
            `- **Message:** ${msg.content ?? ""}`,
          ].join("\n");

          const details = {
            from,
            to,
            displayName: msg.displayName,
            content: msg.content ?? "",
            timestamp: ts,
            ...(msg.metadata ? { metadata: msg.metadata } : {}),
          };
          const isForAgent = to === "primary-agent" || to === "session-room";
          const shouldTrigger =
            isForAgent &&
            (msg.type === "question" ||
              msg.type === "result" ||
              msg.type === "status");

          // Try immediate delivery — fall back to queue if outside active run
          try {
            pi.sendMessage(
              {
                customType: "stone-message",
                content: agentContent,
                display: true,
                details,
              },
              { triggerTurn: shouldTrigger },
            );
          } catch {
            // Outside active run — queue for next turn
            stoneQueue.push({ agentContent, details, shouldTrigger });
          }
        });
      }
      resetState();
    } catch {
      // Non-fatal — agent defs may already exist
    }
  });

  // Inject taxonomy awareness into system prompt
  // Skip persona prompt for subagents to save tokens
  pi.on("before_agent_start", async (_event, ctx) => {
    // Drain stone message queue — inject as bordered messages now that a turn is active
    const STONE_QUEUE_KEY = Symbol.for("hoard.stone.queue");
    const stoneQueue = (globalThis as any)[STONE_QUEUE_KEY] as
      | Array<{
          agentContent: string;
          details: unknown;
          shouldTrigger?: boolean;
        }>
      | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (stoneQueue && stoneQueue.length > 0) {
      const queued = stoneQueue.splice(0);
      for (const { agentContent, details, shouldTrigger } of queued) {
        pi.sendMessage(
          {
            customType: "stone-message",
            content: agentContent,
            display: true,
            details,
          },
          { triggerTurn: shouldTrigger ?? false },
        );
      }
    }

    if (!ctx.hasUI) {
      // Subagent — strip the global APPEND_SYSTEM.md persona prompt
      const stripAppend = readHoardSetting<boolean>(
        "allies.stripAppendForSubagents",
        true,
      );
      if (stripAppend) {
        const currentPrompt: string =
          (typeof ctx.getSystemPrompt === "function"
            ? ctx.getSystemPrompt()
            : "") ?? "";
        try {
          const { readFileSync } = await import("node:fs");
          const { join: joinPath } = await import("node:path");
          const globalAppend = joinPath(
            process.env.HOME ?? "~",
            ".pi",
            "agent",
            "APPEND_SYSTEM.md",
          );
          const projectAppend = joinPath(ctx.cwd, ".pi", "APPEND_SYSTEM.md");
          let appendContent = "";
          try {
            appendContent = readFileSync(globalAppend, "utf-8");
          } catch {
            /* no global append */
          }
          try {
            const p = readFileSync(projectAppend, "utf-8");
            if (p) appendContent = p;
          } catch {
            /* no project append */
          }
          if (appendContent && currentPrompt.includes(appendContent.trim())) {
            const stripped = currentPrompt
              .replace(appendContent.trim(), "")
              .trim();
            // Inject ally name if pending
            const injected = injectPendingName(stripped);
            return { systemPrompt: injected };
          }
        } catch {
          /* non-fatal */
        }
      }
      // Even if we didn't strip, try to inject the name
      const currentPrompt: string =
        (typeof ctx.getSystemPrompt === "function"
          ? ctx.getSystemPrompt()
          : "") ?? "";
      if (currentPrompt) {
        const injected = injectPendingName(currentPrompt);
        if (injected !== currentPrompt) return { systemPrompt: injected };
      }
      return;
    }
    return {
      systemPromptAppend: buildSystemPrompt(),
    };
  });

  // Intercept subagent dispatch for budget enforcement + name injection
  pi.on("tool_call", async (event, _ctx) => {
    if (!isToolCallEventType("subagent", event)) return;

    const agentName = (event.input as Record<string, unknown>)?.["agent"] as
      | string
      | undefined;
    if (!agentName) return;

    const combo = parseComboName(agentName);
    if (!combo) return; // Not one of our allies

    // Check parallel limit
    const parallelCheck = checkParallel();
    if (!parallelCheck.allowed) {
      return { block: true, reason: parallelCheck.reason };
    }

    // Pop a name and record the spawn — key by toolCallId for reliable tool_result correlation
    const allyName = popName(combo.noun);
    const id = event.toolCallId;

    recordSpawn(id, {
      name: allyName,
      defName: agentName,
      combo,
      spawnedAt: Date.now(),
      status: "running",
    });

    // Queue the name for injection in before_agent_start
    const state = getState();
    const pending = state.pendingNames.get(agentName) ?? [];
    pending.push(allyName);
    state.pendingNames.set(agentName, pending);
  });

  // Track subagent completion
  pi.on("tool_result", async (event, _ctx) => {
    if (event.toolName !== "subagent") return;

    const state = getState();
    const info = state.active.get(event.toolCallId);
    if (!info) return;

    if (event.isError) {
      recordFailed(event.toolCallId);
    } else {
      recordComplete(event.toolCallId);
    }
  });

  // /allies command — display the taxonomy with current settings
  pi.registerCommand("allies", {
    description: "Show the hoard subagent taxonomy (kobold/griffin/dragon)",
    handler: async (_args, ctx) => {
      ctx.ui.notify(buildTaxonomyDisplay(), "info");
    },
  });

  // /allies-regen command — regenerate agent defs from current settings
  pi.registerCommand("allies-regen", {
    description:
      "Regenerate agent definitions from current hoard.allies settings",
    handler: async (_args, ctx) => {
      writeAgentDefs(ctx.cwd);
      ctx.ui.notify("Agent defs regenerated from settings", "info");
    },
  });
}

// ── Name Injection Helper ──

function injectPendingName(systemPrompt: string): string {
  // Look for "You are a <Adj> <Noun> <Job>." pattern and replace with named version
  const pattern =
    /You are a (Silly|Clever|Wise|Elder) (Kobold|Griffin|Dragon) (Scout|Reviewer|Coder|Researcher|Planner)\./i;
  const match = systemPrompt.match(pattern);
  if (!match) return systemPrompt;

  const noun = match[2]!.toLowerCase() as Noun;
  const agentAdj = match[1]!.toLowerCase();
  const agentJob = match[3]!.toLowerCase();
  const agentDefName = `${agentAdj}-${noun}-${agentJob}`;

  const state = getState();
  const pending = state.pendingNames.get(agentDefName);
  if (!pending || pending.length === 0) return systemPrompt;

  const allyName = pending.shift()!;
  if (pending.length === 0) state.pendingNames.delete(agentDefName);

  return systemPrompt.replace(
    pattern,
    `You are ${allyName} the ${match[1]} ${match[2]} ${match[3]}.`,
  );
}
