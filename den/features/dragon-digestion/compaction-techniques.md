# Research: LLM Context Compaction Techniques for Coding Agents

> Researched: 2026-04-06 | Scope: terminal/IDE coding agents, context summarization, anti-degradation strategies
> Target: dragon-digestion extension (pi compaction control)

---

## Summary

Modern coding agents use a spectrum of compaction strategies ranging from zero-LLM observation masking (cheapest, surprisingly effective) to multi-tier LLM summarization (most context-preserving). The empirical consensus is that **verbatim/masking approaches outperform prose summarization for code tasks** due to hallucination avoidance, while **structured summaries with explicit sections beat prose** when LLM summarization is unavoidable. Successive summarizations degrade quality non-linearly — anchored incremental updates over a persistent structured document are the best-known mitigation.

---

## 1. How Coding Agents Handle Context Limits

### 1.1 Claude Code (3-Tier Architecture)

Claude Code uses a three-tier compaction system:

- **Tier 1 — Lightweight cleanup** (no LLM): Clears old tool results, keeping only the 5 most recent. Runs before every API call. Zero model cost.
- **Tier 2 — Cache-edit surgery**: Uses `cache_edits` blocks to surgically delete old tool results by `tool_use_id` without invalidating the prompt cache prefix. Queued alongside the API request, not applied to local history.
- **Tier 3 — Full LLM summarization**: Triggers at ~95% context utilization. Produces a structured 9-section summary, then reconstructs the conversation as: boundary marker → summary → recent file contents (capped at 50K tokens) → skills/tools/hooks → CLAUDE.md instructions.

Best practice recommends triggering at ~60% utilization (while model still has full uncompressed access) rather than waiting until 95% where the summary itself reflects degraded context.

**Sources:**
- [Claude Code's Compaction Engine (reverse-engineered)](https://barazany.dev/blog/claude-codes-compaction-engine)
- [Anthropic Server-Side Compaction API](https://platform.claude.com/docs/en/build-with-claude/compaction)
- [MindStudio: Compact command guide](https://www.mindstudio.ai/blog/claude-code-compact-command-context-management)

### 1.2 Aider — Repository Map

Aider uses a **compressed codebase overview** called a repository map: file names, function signatures, and class definitions assembled to fit within the context budget. This gives the LLM a bird's-eye view without consuming full file contents. When a file is actively edited, it's promoted from the map into full context.

**Source:** [Context Management in VSCode LLM Plugins](https://datalakehousehub.com/blog/2026-03-context-management-vscode-llm-plugins/)

### 1.3 Cursor — Semantic Parsing with Tree-sitter

Cursor uses **Tree-sitter to parse code into abstract syntax trees** rather than treating it as linear text. Cross-file reference resolution adds another layer to understand code as a dependency graph, not a document. This allows semantically-relevant chunks to be selected rather than recency-based ones.

**Source:** [Cline vs. Cursor: Beyond Linear Context](https://medium.com/@alexgrape/cline-vs-cursor-beyond-linear-context-for-ai-assisted-coding-00e9efd4be08)

### 1.4 Cline — Memory Bank (Cross-Session)

Cline's Memory Bank stores project intelligence in structured Markdown files (`projectbrief.md`, `activeContext.md`, `progress.md`) that are read at session start. This is cross-session persistence rather than in-session compaction, but functionally serves the same purpose of resuming work coherently.

Practical limit: ~300KB per file operation despite theoretical 1M token support (VS Code API constraint).

**Source:** [Cline vs. Cursor comparison](https://dev.to/agentsindex/cline-vs-cursor-which-ai-coding-agent-should-you-use-1gli)

### 1.5 Windsurf — Flow-Aware Dynamic Context

Windsurf's Cascade runs an assembly pipeline on every turn: Load Rules → Load Memories → Read open files → Run codebase retrieval → Read recent actions → Assemble prompt. Its differentiator is **flow awareness** — it tracks IDE actions (file edits, terminal runs, navigation) and automatically updates context in real time without requiring re-explanation.

**Source:** [Windsurf Flow Context Engine](https://markaicode.com/windsurf-flow-context-engine/)

### 1.6 Google ADK — Sliding Window with Summarization

Google's Agent Development Kit uses a **configurable sliding window**: when a session exceeds a threshold of workflow events, older events are summarized by an LLM. Sessions remain scalable for extremely long-running conversations without full history.

**Source:** [Google ADK Context Compaction Docs](https://google.github.io/adk-docs/context/compaction/)

### 1.7 Pi (Current Implementation)

Pi's compaction system:
- Config: `enabled`, `reserveTokens` (default: 16384), `keepRecentTokens` (default: 20000)
- Preserves messages that survived earlier compaction by including them in the next summarization pass
- Recalculates `tokensBefore` from the rebuilt session context before writing the new `CompactionEntry`
- The `reserveTokens` value serves double duty: trigger threshold AND output budget cap for the compaction LLM call

**Source:** [pi-mono compaction docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md)

---

## 2. Summarization Strategy Taxonomy

| Strategy | LLM Cost | Compression | Hallucination Risk | Code Fidelity | Notes |
|---|---|---|---|---|---|
| **Observation masking** | None | Low–Medium | None | Perfect | Delete/hide old tool outputs |
| **Verbatim compaction** | None | Medium | None | Perfect | Select subset of original tokens, no rewriting |
| **Rolling structured summary** | Medium | High | Low | Good | Persistent doc, incrementally updated |
| **One-shot LLM summarization** | High | Very High | Medium | Variable | Single-pass rewrite of full history |
| **Repository map** | None | Very High | None | Perfect | Pre-computed structural overview |
| **Hierarchical / recursive** | Medium | High | Low | Good | Chunk → summarize → merge iteratively |
| **Opaque token compression** | None | Extreme (99.3%) | None | Poor | OpenAI-style; uninspectable |

**Key finding:** JetBrains' 2025 research on SWE-bench tasks found **observation masking matches or beats full LLM summarization** on both cost and task completion while requiring zero LLM calls. This is the strongest empirical result in the field.

**Sources:**
- [JetBrains: Efficient Context Management](https://blog.jetbrains.com/research/2025/12/efficient-context-management/)
- [Morph: Compaction vs. Summarization](https://www.morphllm.com/compaction-vs-summarization)
- [Morph FlashCompact comparison of 8 methods](https://www.morphllm.com/flashcompact)

---

## 3. Best Practices: What to Preserve vs. Discard

### 3.1 Always Preserve

| Category | Examples | Why |
|---|---|---|
| **Session intent** | Original task, stated requirements, ideal outcome | Without this, agent can't resume coherently |
| **Exact identifiers** | File paths, function names, variable names, error codes, URLs, version numbers | Never generalize; LLM hallucinations corrupt these |
| **Artifact trail** | Files created/modified/deleted, key changes per file | Prevents re-reading already-examined files, conflicting edits |
| **Decisions made** | Architecture choices, things ruled out, why | Re-deriving decisions wastes context and can reach different conclusions |
| **User constraints** | "Don't do X", coding style preferences, workflow instructions | Behavioral drift after compaction is a common failure mode |
| **Debugging state** | What was tried, what was ruled out, evidence found | Without this, agent "amnesia" restarts debugging from scratch |
| **Next steps** | What needs to happen next | Enables seamless continuation |
| **Key error messages** | Verbatim, not summarized | Exact text matters for diagnosis and search |

### 3.2 Safe to Discard / Mask

| Category | Notes |
|---|---|
| **Redundant tool outputs** | Once a file has been read and its content acted on, the raw read result can be masked |
| **Repetitive search results** | Keep only the relevant excerpts, not full returned content |
| **Verbose directory listings** | Replace with file-count summaries or compact paths |
| **Failed attempts (intermediate)** | Keep the *outcome* ("approach X failed because Y") not the full attempt transcript |
| **Conversational filler** | "Sure, I'll do that" type turns with no information content |
| **Superseded plan steps** | If a plan was revised, the original plan steps can be dropped |

### 3.3 Use Breadcrumbs, Not Full Content

Keep references (file path + function name) for content that's been masked, so the agent can re-fetch on demand. This is cheaper than keeping the content and more reliable than summarizing it.

**Key insight (Factory.ai):** A ChatGPT conversation can forget earlier topics. A coding agent that forgets it modified `auth.controller.ts` will produce inconsistent work. The **artifact trail is uniquely critical** for coding tasks vs. general conversation.

**Sources:**
- [Factory.ai: Compressing Context](https://factory.ai/news/compressing-context)
- [Anthropic: Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [OpenCode GitHub issue #16512 on exact technical detail loss](https://github.com/anomalyco/opencode/issues/16512)
- [pi-mono compaction discussion (badlogic's gist)](https://gist.github.com/badlogic/cd2ef65b0697c4dbe2d13fbecb0a0a5f)

---

## 4. Task-Aware and Domain-Specific Compaction

### 4.1 ACON — Failure-Driven Task-Aware Compression

ACON (2025) optimizes compressor prompts via **failure analysis** — it examines what information loss caused task failures and refines the compressor guidelines to preserve those categories. Results: 26–54% peak token reduction while maintaining task performance; enables small LMs to achieve 20–46% improvement over baseline.

**Source:** [ACON arxiv paper](https://arxiv.org/html/2510.00615v1)

### 4.2 Active Context Compression (Focus) — Agent-Controlled Triggering

The agent declares what it's investigating (e.g., "Debug the database connection"), marking a checkpoint. The agent has full autonomy over when to invoke compression — no external timers or token thresholds. The agent compresses the preceding span when it deems it complete.

Results on exploration-heavy debugging tasks (matplotlib, sympy): 50–57% token savings.

**Source:** [Active Context Compression arxiv](https://arxiv.org/html/2601.07190)

### 4.3 Progressive Multi-Stage Compaction

A staged system that monitors token utilization and applies increasingly aggressive strategies as pressure rises:

1. **70% utilization** — Warning / soft alert
2. **80%** — Observation masking (hide old tool outputs)
3. **85%** — Fast pruning (structural removal)
4. **90%** — Aggressive masking
5. **99%** — Full LLM-based compaction

This avoids premature expensive LLM calls and gives reversible options priority.

**Source:** [OPENDEV terminal agent arxiv](https://arxiv.org/html/2603.05344v2)

### 4.4 ZenML Production Pattern — Compact Before Summarize

From 1,200+ production deployments:
> "Compaction is reversible, summarisation is not."

Pattern:
1. First pass: compact oldest 50% of tool calls, keeping newer ones in full detail
2. Only when multiple compaction rounds yield diminishing returns: summarize
3. Even then, preserve the last few tool calls in full to maintain behavioral continuity (the model needs recent tool use examples)

**Source:** [ZenML: What 1,200 production deployments reveal](https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025)

### 4.5 Factory.ai — Code-Specific Structured Summarization

Factory maintains a rolling, persistent summary with these explicit sections:
- Session intent
- Artifact trail (files touched and key changes)
- Decisions made
- Next steps
- User constraints

Each summarization **only processes the newly dropped span and merges it into the existing persistent summary** — not a full re-summarization from scratch.

Comparative evaluation (36K+ real agent sessions): Factory's structured summaries retained more actionable technical detail than both Anthropic's and OpenAI's generic summarization approaches. Specifically, OpenAI responses lost nearly all technical detail; Anthropic responses lost endpoint paths.

**Source:** [Factory.ai: Evaluating Compression](https://factory.ai/news/evaluating-compression)

### 4.6 Koog (JetBrains) — Fact Extraction with Continuity

The failure mode this solves: when compression triggers mid-task, the agent restarts from scratch ("complete amnesia") instead of continuing with extracted facts. Koog preserves continuity by extracting specific facts: `"The bug is in sympy/parsing/latex/_parse_latex.py"`, `"Tests are located in sympy/parsing/tests/"`.

**Source:** [JetBrains Koog debugging patterns](https://blog.jetbrains.com/ai/2025/07/when-tool-calling-becomes-an-addiction-debugging-llm-patterns-in-koog/)

---

## 5. Multi-Compaction Degradation

### 5.1 Quantified Degradation

- Quality erosion rises in **80% of coding agent trajectories** over iterations
- Code verbosity increases in **89.8% of trajectories** (2.2× more verbose vs. human code)
- **50% longer conversations → 3–5% efficiency losses** with non-linear compounding (not linear)
- The "Lost in the Middle" effect compounds across summarization cycles — information in the middle of long contexts is systematically overlooked

**Sources:**
- [SlopCodeBench](https://www.emergentmind.com/papers/2603.24755) — quantified coding agent degradation
- [LoCoBench-Agent](https://arxiv.org/pdf/2511.13998) — non-linear degradation mechanics

### 5.2 Prevention Techniques

#### Anchored Incremental Updates (best practice)

Instead of re-summarizing the full history each cycle, maintain a **persistent summary document** that is updated incrementally. Each update is anchored to a specific message boundary. The summary accumulates rather than regenerates.

Analogy: a living document vs. a meeting summary written fresh each time from memory.

**Source:** [Factory.ai: Compressing Context](https://factory.ai/news/compressing-context)

#### Structured Sections as Checklists

Unstructured prose summarization silently drops information because there's no forcing function. **Explicit sections** (session intent / artifact trail / decisions / next steps / constraints) act as checklists — the LLM can't omit a file path if there's a dedicated "Files Modified" section that requires entries.

**Source:** [Factory.ai: Evaluating Compression](https://factory.ai/news/evaluating-compression)

#### Map-Reduce Chunking for Long Histories

Divide conversation history into segments → summarize each independently → synthesize partial summaries. This mitigates the Lost-in-the-Middle effect by ensuring each chunk is processed at full attention density.

**Source:** [Frontiers AI: Summarization methods comparison](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1604034/full)

#### Self-Consistency Testing (EVALOOOP)

Test models' ability to iteratively summarize code back to specification using cyclic loops. Measured by Average Sustainable Loops (ASL) — how many iterations before functional correctness fails. Use this to evaluate compaction prompts.

**Source:** [EVALOOOP arxiv](https://arxiv.org/pdf/2505.12185)

#### Probe-Based Evaluation

Don't use ROUGE to measure summary quality. Instead, use probes:
- *Recall probe*: Can the agent answer "what files were modified?" from just the summary?
- *Artifact probe*: Does the summary contain enough to reconstruct the artifact trail?
- *Decision probe*: Are key architectural decisions preserved?
- *Continuity probe*: Can a fresh agent start from the summary and continue without re-asking questions?

**Source:** [Factory.ai: Evaluating Compression](https://factory.ai/news/evaluating-compression)

---

## 6. Recent Innovations (2024–2026)

### 6.1 MemGPT / Letta — OS-Inspired Memory Hierarchies (2023–2024)

MemGPT implements tiered memory (main context / archival storage / recall storage) with the LLM as its own memory manager via tool calls. It actively decides what to store, summarize, and forget. Letta is the productized evolution (renamed September 2024).

**Source:** [MemGPT Research](https://research.memgpt.ai/)

### 6.2 A-MEM — Zettelkasten Agentic Memory (Feb 2025)

Dynamically organizes memories as interconnected knowledge networks, inspired by the Zettelkasten note-taking system. Claims 85–93% reduction in token usage vs. LoCoMo and MemGPT baselines.

**Source:** [A-MEM arxiv](https://arxiv.org/abs/2502.12110)

### 6.3 Model Context Protocol (MCP) — November 2024

Anthropic's open standard for connecting AI assistants to external data systems (content repositories, dev tools). 10,000+ active public servers as of late 2025, 97M monthly SDK downloads. This is the standardized path for pulling external context on-demand rather than keeping everything in the context window.

**Source:** [MCP Wikipedia](https://en.wikipedia.org/wiki/Model_Context_Protocol)

### 6.4 ACON — Adaptive Context Optimization (Oct 2025)

Generalizable framework for compressing environment observations and interaction histories in long-horizon agents. Failure-driven guideline optimization. 26–54% peak token reduction. See §4.1.

**Source:** [ACON arxiv](https://arxiv.org/html/2510.00615v1)

### 6.5 Repository-Level RAG for Code (2025)

Embedding code chunks into vector spaces for semantic retrieval rather than keyword search. Enables agents to pull relevant context on-demand rather than maintaining it in-window. Caution: retrieving "similar code" from unrelated parts of the repository can introduce noise.

**Source:** [RACG survey arxiv](https://arxiv.org/abs/2510.04905)

### 6.6 Spotify's Background Coding Agent (Nov 2025)

Production case study: automated merging of thousands of PRs across hundreds of repositories using Claude Agent SDK. Deep context engineering (not just compaction) was critical for reliable, mergeable PRs at scale.

**Source:** [Spotify Engineering Blog](https://engineering.atspotify.com/2025/11/context-engineering-background-coding-agents-part-2)

### 6.7 Multi-Agent Context Isolation

Rather than compacting within one agent, some architectures spawn sub-agents with isolated context windows and pass only summarized results back. The coordinator's context stays bounded; intermediate tool-call sprawl is discarded at the sub-agent boundary. Claude Code's subagents use this pattern.

**Source:** [Context Engineering 101](https://newsletter.victordibia.com/p/context-engineering-101-how-agents)

---

## 7. Structured vs. Prose Summaries

### 7.1 Format Efficiency Benchmarks

| Format | Token Efficiency | LLM Accuracy | Reasoning Impact | Best For |
|---|---|---|---|---|
| **Markdown with headings** | Best overall | High | Minimal | Mixed content, agent summaries |
| **YAML** | −10% vs. Markdown | Best for nested | Low | Structured config, nested data |
| **JSON** | −18% vs. YAML | Good | Low | Machine parsing |
| **Prose** | Variable | Good for simple | None | Conversational content |
| **TOON** | 30–60% better than JSON for flat | n/a | n/a | High-volume tabular data only |

Key numbers:
- Markdown: ~20–30% fewer tokens than unstructured text; improves RAG accuracy 35%
- YAML: 18% more efficient than formatted JSON
- **Forcing JSON output degrades LLM reasoning by 10–15%**

**Sources:**
- [Improving Agents: Best Nested Data Format](https://www.improvingagents.com/blog/best-nested-data-format/)
- [arXiv: Format restrictions degrade reasoning](https://arxiv.org/html/2408.02442v1)
- [AnythingMD: Why LLMs need clean Markdown](https://anythingmd.com/blog/why-llms-need-clean-markdown)

### 7.2 The Two-Step Pattern

**Problem:** Forcing structured output (JSON/YAML) during the summarization call degrades reasoning quality by 10–15%.

**Solution:**
1. Let the compaction LLM reason freely in prose / chain-of-thought
2. Convert the output to structured format in a separate pass (constrained decoding or a lightweight second call)

This preserves reasoning quality while guaranteeing structured output for downstream consumption.

**Source:** [Beyond JSON: Picking the right format](https://medium.com/@michael.hannecke/beyond-json-picking-the-right-format-for-llm-pipelines-b65f15f77f7d)

### 7.3 Recommendation for Coding Agent Summaries

**Use structured Markdown with mandatory sections:**

```markdown
## Session Intent
[single sentence: what this session is trying to accomplish]

## Files Modified
- `path/to/file.ts` — [what changed and why]

## Decisions Made
- [decision] — [rationale]

## Ruled Out
- [approach] — [why it was rejected]

## Current State
[what's done, what's in progress, what's blocked]

## Constraints
- [user-stated preferences, things not to do]

## Next Steps
1. [immediate next action]
2. ...

## Key Error / Stack Trace (verbatim if relevant)
[exact text, never paraphrased]
```

**Rationale:** Sections act as checklists (nothing silently drops). Markdown is more token-efficient than JSON/YAML for mixed content. The format is human-readable for debugging. Verbatim error sections prevent hallucination of exact details.

---

## 8. Practical Recommendations for dragon-digestion

Based on the research synthesis, here are actionable recommendations for the pi compaction extension:

### 8.1 Trigger Strategies

| Strategy | When to Use | Implementation |
|---|---|---|
| **Conservative (60%)** | Debugging sessions, complex refactors | Trigger before context rots; model still has full uncompressed access |
| **Standard (80%)** | General coding tasks | Balance between prompt cache efficiency and quality |
| **Aggressive (95%)** | Simple tasks, Q&A, exploration | Let default behavior run; compact only when forced |
| **Task-event triggered** | When user starts a new task | Compact at task boundaries, not token boundaries |
| **Manual** | User-controlled | Let user decide when context is "safe to compact" |

**Key insight:** Task boundaries (starting a new feature, switching files, ending a debugging session) are better compaction moments than fixed token thresholds. Compacting mid-refactor is destructive.

### 8.2 Strategy Templates

Expose named strategies that configure what the compaction LLM prompt preserves:

- **`code`** — Emphasizes artifact trail, exact file paths, function names, error messages. Minimal prose. Uses the structured Markdown template above.
- **`debug`** — Preserves full debugging state (tried/ruled-out/evidence). Higher threshold — don't compact if actively in a diagnostic loop.
- **`conversation`** — More aggressive on tool results, preserves conversational decisions and intent. Lower fidelity for exact code content.
- **`task-tracking`** — Summary structured as a todo list of completed/pending items. Good for long multi-file refactors.
- **`minimal`** — Observation masking only (no LLM). Zero cost. Suitable when context is mostly old tool outputs.

### 8.3 Compaction Prompt Engineering

The compaction prompt should:
1. **Use structured Markdown output format** (see §7.3) — not free-form prose
2. **Explicitly call out categories to preserve verbatim**: file paths, function/variable names, error messages, version numbers, URLs
3. **Include the existing summary** if this is an incremental update (anchor pattern)
4. **Name recent files** as anchor points that shouldn't be dropped
5. **Prohibit generalization**: "Never write 'a configuration file' — preserve the exact path"

### 8.4 Anti-Degradation Guards

- **Never fully re-summarize** from scratch on repeated compactions — always include the previous summary as input
- **Keep the last N tool calls verbatim** (ZenML pattern) — model needs recent behavioral examples
- **Protect the artifact trail section** from being compressed: it must remain as a list of exact paths, not a prose description
- **Probe test the output**: after compaction, verify the summary can answer "what files were modified?" and "what is the current task?" without access to the original history

### 8.5 Suggested Settings Additions for `hoard.digestion.*`

```json
{
  "hoard": {
    "digestion": {
      "triggerMode": "threshold",
      "triggerThreshold": 0.8,
      "strategy": "code",
      "keepRecentToolCalls": 5,
      "anchoredUpdates": true,
      "promptTemplate": "structured-markdown",
      "probeCheck": false,
      "taskBoundaryCompaction": true
    }
  }
}
```

---

## Sources

### Kept

| Source | URL | Why Relevant |
|---|---|---|
| Claude Code's Compaction Engine (reverse-engineered) | https://barazany.dev/blog/claude-codes-compaction-engine | Most detailed technical breakdown of Claude Code's 3-tier compaction |
| Anthropic: Server-Side Compaction API | https://platform.claude.com/docs/en/build-with-claude/compaction | Official API documentation |
| Anthropic: Effective Context Engineering | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents | Official guidance on what to preserve |
| Factory.ai: Compressing Context | https://factory.ai/news/compressing-context | Best production-tested anchored incremental summarization |
| Factory.ai: Evaluating Compression | https://factory.ai/news/evaluating-compression | Probe-based evaluation methodology; structured vs. prose comparison |
| JetBrains: Efficient Context Management | https://blog.jetbrains.com/research/2025/12/efficient-context-management/ | Empirical proof that observation masking beats LLM summarization |
| Morph: Compaction vs. Summarization | https://www.morphllm.com/compaction-vs-summarization | Clear taxonomy of compaction strategies and trade-offs |
| Morph: FlashCompact | https://www.morphllm.com/flashcompact | Comparison of 8 compression methods with benchmarks |
| ACON arxiv | https://arxiv.org/html/2510.00615v1 | Task-aware failure-driven compression framework |
| Active Context Compression (Focus) | https://arxiv.org/html/2601.07190 | Agent-controlled compression; 50–57% savings on debugging tasks |
| OPENDEV terminal agent arxiv | https://arxiv.org/html/2603.05344v2 | Multi-stage progressive compaction for terminal agents |
| SlopCodeBench | https://www.emergentmind.com/papers/2603.24755 | Quantified coding agent degradation over iterations |
| ZenML: 1,200 production deployments | https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025 | Compact-before-summarize production pattern |
| Improving Agents: Best Nested Data Format | https://www.improvingagents.com/blog/best-nested-data-format/ | Empirical YAML vs. JSON vs. Markdown comparison |
| arXiv: Format restrictions degrade reasoning | https://arxiv.org/html/2408.02442v1 | 10–15% reasoning degradation evidence |
| Google ADK Compaction | https://google.github.io/adk-docs/context/compaction/ | Production sliding window implementation |
| Windsurf Flow Context Engine | https://markaicode.com/windsurf-flow-context-engine/ | Flow-aware dynamic context assembly |
| MCP Wikipedia | https://en.wikipedia.org/wiki/Model_Context_Protocol | Standardized external context integration |
| MemGPT Research | https://research.memgpt.ai/ | OS-inspired memory hierarchy foundation |
| A-MEM arxiv | https://arxiv.org/abs/2502.12110 | Zettelkasten memory, 85–93% token reduction claim |
| Spotify Engineering Blog | https://engineering.atspotify.com/2025/11/context-engineering-background-coding-agents-part-2 | Production-scale coding agent context engineering |
| JetBrains Koog debugging patterns | https://blog.jetbrains.com/ai/2025/07/when-tool-calling-becomes-an-addiction-debugging-llm-patterns-in-koog/ | Fact extraction + continuity preservation |
| Context Engineering 101 | https://newsletter.victordibia.com/p/context-engineering-101-how-agents | Multi-agent context isolation pattern |
| Pi-mono compaction docs | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md | Pi's own implementation reference |
| LoCoBench-Agent | https://arxiv.org/pdf/2511.13998 | Non-linear degradation mechanics |
| Frontiers AI: Summarization methods | https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1604034/full | Map-Reduce vs. Stuff method comparison |
| MindStudio: Compact command guide | https://www.mindstudio.ai/blog/claude-code-compact-command-context-management | Best practice timing (60% vs. 95%) |

### Dropped

| Source | Reason Excluded |
|---|---|
| Various SEO blog posts comparing "top 10 AI coding tools" | No technical depth, marketing copy |
| TOON format blog post | Only relevant for tabular data, not coding agent summaries |
| EVALOOOP arxiv | Useful metric (ASL) but limited practical guidance vs. other sources |
| RACG survey | Relevant for RAG but not directly for compaction strategy |

---

## Gaps

### What Couldn't Be Fully Answered

1. **Windsurf internals**: No published technical breakdown of how Windsurf handles the 32K token limit on individual cascade turns (if any). Marketing claims only.

2. **Cline in-session compaction**: Cline's Memory Bank is cross-session persistence, but there's no clear public documentation on whether/how Cline handles context overflow mid-session beyond truncation.

3. **Comparative benchmarks across tools**: No study that benchmarks Claude Code vs. Cursor vs. Aider on the *same task* with context overflow, measuring task completion rate. Most evidence is tool-specific.

4. **Optimal compaction prompt templates**: Factory.ai describes their structured approach qualitatively but hasn't published the exact prompts. No public dataset of high-quality compaction prompts for coding tasks.

5. **Interaction with prompt caching**: How do different compaction strategies affect Anthropic prompt cache hit rates? The Claude Code architecture optimizes aggressively for cache preservation (the `cache_edits` approach), but no third-party analysis exists.

### Suggested Next Steps

- Read the full [pi-mono compaction source code](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/) to understand current `CompactionEntry` structure
- Read [Factory.ai's compressing-context post](https://factory.ai/news/compressing-context) in full (fetch content) for the exact rolling summary structure
- Fetch [barazany.dev's Claude Code compaction post](https://barazany.dev/blog/claude-codes-compaction-engine) in full for the 9-section summary structure
- Prototype the structured Markdown compaction prompt template and test on a real session with the probe questions
- Investigate whether `keepRecentTokens: 20000` in pi is configurable enough, or whether task-boundary triggering requires event hook integration in dragon-digestion
