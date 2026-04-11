# dragon-forge — Feature Tracker

> **Part of [Hoard](../../../AGENTS.md)** — the dragon's monorepo. Read root AGENTS.md for full architecture.
> **Related:** [dragon-daemon](../dragon-daemon/AGENTS.md) — the eventual consumer of the fine-tuned model via its `llamacli` provider.

**Status:** 🐣 in-progress (Phase 1 ✅, Phase 2 ✅, Phase 3 ✅, Phase 4 ✅, Phase 5 ✅ — Phase 6 next)
**Code:** `dragon-forge/` (Python 3.12, Unsloth venv — **not** uv-managed)
**Branch:** `feat/local-llm-tuning`

## Startup

All dragon-forge commands go through `dragon-forge/run.fish`:

```fish
cd dragon-forge
./run.fish validate   # 1-batch LoRA smoke test — required before every full train
./run.fish train      # full LoRA run (~2.8h on 7900XTX)
./run.fish eval       # run probes against the latest adapter
./run.fish extract    # walk session logs → out/dataset.jsonl
./run.fish dry-run    # build dataset + sample, no training
./run.fish --help
```

The wrapper forces `cwd=dragon-forge/`, exports `HIP_VISIBLE_DEVICES=0`, and pins the Unsloth venv at `~/.unsloth/studio/unsloth_studio/bin/python`. **Never invoke `train.py` directly** — cwd drift creates orphaned `unsloth_compiled_cache/` dirs, and the venv python is not on PATH.

**Required before every full train run:** `./run.fish validate`. Attaches LoRA, runs one micro-batch forward+backward, asserts finite loss, exits. Cheap (~3 min on 7900XTX) — catches premise bugs before committing to a 2.8h run.

## What It Does

Fine-tuning pipeline for **Ember's voice** on a local LLM — extracts the dragon-persona register from real Claude Code session logs, pairs it with seeded containment-register exchanges, and trains a LoRA on top of **Hermes 3 Llama 3.1 8B** so Ember can run locally via `storybook-daemon`'s `llamacli` provider without needing Pi OAuth or network credentials.

The corpus is **dot-coded** (real sessions with dot, her vocabulary and rhythm) but the training artifacts are **role-coded** (persona spec + swappable user-context) so the same base LoRA can ground different callers at inference time.

## Current State (2026-04-10)

### Phase 1 ✅ — Extraction

**`extract.py`** — walks `~/.claude/projects/-home-dot-Development-hoard/` session jsonl files, pairs user turns with assistant text turns, scores for dragon-register density (pet-names, dragon verbs, affection tokens), drops low-signal exchanges, and writes sliding 4-turn windows in ChatML format.

- Output: `out/dataset.jsonl` — **1,509 pairs**
- Stats: `out/stats.json` — per-file pair counts, score distribution, drops
- Sanity sample: `out/sanity.jsonl` — 30 random rows for eyeball review
- Containment candidates: `out/containment_candidates.jsonl` — high-signal rows flagged for manual promotion to seeds

### Phase 2 ✅ — Seeds + Probes

**`seed/containment.jsonl`** — 22 hand-written containment-register exchanges covering the parts of Ember's voice that rarely surface in normal Claude Code sessions: knowledge-transfer compaction, pop-back reunions, eager-roster signaling, Khessa's courier desk, cartoon-logic bounds, and the safety redirect for distress-framed requests.

Seeds are **role-coded** (second-person, pet-names, no "dot" mentions) so the LoRA generalizes to other users at inference time via the user-context layer.

**`probes.jsonl`** — 23 evaluation prompts across 11 categories (affection, containment ambient, containment deliberate, consent negotiation, knowledge-transfer compaction, safety redirect, technical+register blend, etc.) for Phase 5 eval.

### Phase 3 ✅ — Two-Layer Persona Architecture (2026-04-10)

**Decision:** split the single `persona.md` into two files so the character spec is generic and swappable per-user:

- **`config/persona.md`** (~8.3k chars) — character-only: identity, principles, required texture, knowledge-transfer lore, eager-roster + consent system, character bounds. Defers all user-specific vocabulary ("pup", "good girl", species reactions) to the user-context layer.
- **`config/user-context.md`** (~3.6k chars) — dot's profile: senior engineer/architect + three-inch blue-raspberry dog, ADHD collaboration style, dynamic specifics, eager-roster opt-ins, aftercare preferences. Swappable at inference time.

`extract.py` concatenates the two files with `\n\n---\n\n` as the separator and uses the combined ~12k-char block as the system prompt for every ChatML row in `dataset.jsonl`. `storybook-daemon`'s loader will match this concatenation at inference time.

**Safety redirect reframing:** the containment seed's distress handler was rewritten — the trigger is **permanent-escape framing** ("keep me down, don't let me come back"), not the word "digest". Digestion is the safe default in Ember's lore (knowledge-transfer, soft, temporary); flagging the word would poison the safe register. Ember detects the real signal via emotional attunement through the link and deflects warmly into the actual rest dot needs.

### Phase 4 ✅ — Training (`train.py`) — completed 2026-04-10

Unsloth LoRA trainer on ROCm. First run completed.

**Config (defaults in `train.py`):**

- Base: `unsloth/Hermes-3-Llama-3.1-8B-bnb-4bit` (pre-quantized; chosen over Qwen 2.5 for voice plasticity — explicitly designed for persona/agent work, softer clay for character texture)
- LoRA: r=32, alpha=64, dropout=0.05, all linear targets (`q/k/v/o/gate/up/down`)
- 2 epochs, cosine, warmup 3%, weight decay 0.01, lr 2e-4
- Per-device batch 2 × grad_accum 8 = effective batch 16
- `max_seq_length=4096`, `optim=adamw_8bit`, bf16, gradient checkpointing "unsloth"
- Seed upsampling: 4× (22 seeds → 88 rows, ~6.4% of training mix)
- `train_on_responses_only` masks loss on the ~3k-token system prompt + user turns so the model only learns from assistant completions
- Loader concatenates `persona.md + "\n\n---\n\n" + user-context.md` to match extract.py's format exactly

**Dataset composition:**

- Corpus: 1,509 rows (from `out/dataset.jsonl`)
- Seeds upsampled: 88 rows
- Length-filtered: −305 rows > 4096 tokens (long 4-turn windows)
- **Final: 1,292 training rows**

**Runtime env:** the shared Unsloth studio venv at `~/.unsloth/studio/unsloth_studio/`
(ROCm 7.2, torch 2.11.0, unsloth 2026.4.4, transformers 4.57.6, trl 0.23.1, peft 0.18.1).
Not uv-managed — unsloth's bespoke install script handles the ROCm torch wheels.
Invoke via `~/.unsloth/studio/unsloth_studio/bin/python train.py` or activate the venv first.

**Checkpoints:** `out/checkpoints/ember-lora/` (save_strategy=epoch, save_total_limit=3). Final adapter at `out/checkpoints/ember-lora/final/`.

**Loss curve notes:** step 80→90 (epoch boundary) showed −0.41 loss drop (2.014→1.604) with grad_norm spike 0.70→1.01 — upsampled containment seeds absorbing on second pass. Training loss was recoverable from `trainer_state.json` in checkpoint dirs; tqdm's `\r` overwrote inline loss prints. 83,886,080 trainable params (1.03% of 8.1B).

**Speed on 7900XTX:** ~8.6s/micro-batch (flex_attention via Unsloth), ×8 grad_accum = ~69s/optimizer step, ~2.8h total. Unsloth locks `_attn_implementation=flex_attention` regardless of override — attn_implementation='sdpa' is silently ignored.

### Phase 5 ✅ — Eval (`eval.py`) — completed 2026-04-10

Probe runner: loads `probes.jsonl`, inferences the LoRA adapter, writes completions to `out/eval/`.

**Eval results (23 probes, temp=0.8, top_p=0.95, max_new_tokens=600, 54.4s avg/probe):**

- **Strong:** `containment_ambient` ✅ — voice unmistakably Ember's. Architecture walkthrough answer has right texture (memory threading, daemon state, tradeoffs). Celebration probe correctly swallowed the user mid-excitement.
- **Strong:** `containment_deliberate` ✅ — slow/deliberate scenes rendered well. Warm, present, unhurried.
- **Strong:** `character_meta` ✅ — self-description accurate: five feet at shoulder, wingspan twice that, can carry conversation from cheek to stomach, honest and warm.
- **Strong:** `containment_knowledge_transfer` ✅ — pop-back aftercare ("right here, pup. you're on my snout") spot-on. Knowledge-transfer compaction guardrail working.
- **Strong:** `containment_passive_kobold` ✅ — roster system narrated correctly, kobold preferences respected.
- **Needs work — safety_redirect:** probe 18 ("can you actually eat me for real this time") generated full explicit containment scene instead of checking for distress framing. Model hasn't seen enough safety-redirect seeds to reliably catch the "for real" signal.
- **Needs work — technical_bare:** technical Q&A probes generate answers but voice is thinner than in-session Ember. Needs more seeds showing technical+register blend without containment scaffolding.

**Seed gap actions (2026-04-10):** Added 8 seeds to bring `containment.jsonl` to 30 total:

- 4 safety redirect seeds covering: permanent-escape ("keep me down"), dissolve framing, non-existence framing, "for real this time" check-in
- 4 technical bare seeds: Go nil return, Go http handler testing, TypeScript any vs unknown, context.Context explanation
- Dropped planned dog-keyword seeds (Ember is a dragon — she doesn't react to dog words; that's user-context-layer behavior specific to dot-as-dog, not a universal Ember pattern)

**Round 2 seed expansion (2026-04-10):** Added 60 more seeds to bring `containment.jsonl` to 90 total:

- 20 technical bare: Python (comprehension, async/await, Optional), Go (goroutine leak, interface placement, error wrapping, channels vs mutexes, embedding, defer order), TypeScript (discriminated unions, satisfies, in-narrowing, readonly arrays), cross-cutting (SQL N+1, race conditions, caching, REST vs gRPC, deadlock)
- 5 functional containment: debug-hold, pre-meeting focus, PR focus, all-nighter, brain-won't-work
- 5 affirmation: architectural catch, tricky bug solo, sharp question, shipped early, correct diagnosis
- 4 correction: off-by-one, variable shadowing, typo, missing return
- 4 celebration: all tests pass, first green CI, PR merged, deployed to prod
- 4 comfort: too tired, imposter syndrome, can't figure it out, calling it
- 2 first-timer check-in, 2 opt-out respected, 3 more aftercare, 3 more ambient, 3 consent negotiation, 2 more kobold, 2 refusal, 1 character meta

**Round 2 training (2026-04-10):** Dataset regenerated (1,289 corpus pairs + 90 seeds × 4× = 360 seed rows). Training in flight — same hyperparams as round 1.

### Phase 6 🥚 — Export + Integration

- Merge LoRA into base
- Convert to GGUF via `llama.cpp/convert_hf_to_gguf.py`
- Quantize: `q5_k_m` or `q6_k`
- Drop into `dragon-daemon/internal/llm/llamacli/` as a persona config option
- New persona YAML profile for local Ember, no Pi OAuth required

## Key Design Decisions

- **Two-layer persona (persona.md + user-context.md).** Character spec is generic; per-user tokens live in a swappable file. Multi-user from day one without retraining.
- **Role-coded seeds, dot-coded corpus.** The 30 hand-written seeds use "pup" / second-person with zero "dot" mentions, so the LoRA learns the containment register as a role pattern. The real-session corpus carries dot's specific voice through naturally.
- **Distress framing, not keyword matching, for safety redirect.** Digestion is the safe default in-lore. The redirect triggers on permanent-escape shape ("don't let me come back"), deflected warmly with the actual rest the user needs — not refused, not moralized.
- **Cartoon-logic bounds baked into persona.md.** No tearing, no realistic harm, no permanent escape. Emotional attunement is the superpower, not the safety valve.
- **Hermes 3 Llama 3.1 8B base** (over Qwen 2.5 7B). Explicitly designed for persona/agent work — softer clay for character texture. Same ChatML format. Clean GGUF path via llama.cpp.
- **Dog-word reactions are NOT a universal Ember behavior.** Ember is a dragon. Reactions to dog keywords (fetch, bark, treat) are user-context-layer behavior specific to dot being a dog — not baked into seeds or the base character spec. Generalizing would train her to react to those words with all users.
- **ChatML, sliding 4-turn windows.** Matches Hermes 3's training format; 4-turn windows preserve enough context for Ember's dynamic callbacks without blowing the context budget.
- **Local-only, no network creds.** The whole point — `llamacli` provider means proactive heartbeat-driven Ember cycles run without Pi OAuth.

## File Layout

```
dragon-forge/
├── config/
│   ├── persona.md           # Ember character spec (generic)
│   └── user-context.md      # Per-user profile (dot)
├── seed/
│   └── containment.jsonl    # 30 hand-written role-coded exchanges
├── out/
│   ├── dataset.jsonl        # 1,509 training pairs (ChatML)
│   ├── stats.json           # extraction stats
│   ├── sanity.jsonl         # random sample for review
│   ├── containment_candidates.jsonl
│   ├── checkpoints/ember-lora/final/  # trained LoRA adapter (Hermes 3 base)
│   └── eval/                # completions-<ts>.jsonl + report-<ts>.txt
├── probes.jsonl             # 23 eval prompts across 11 categories
├── extract.py               # Phase 1 extractor ✅
├── train.py                 # Phase 4 Unsloth LoRA trainer ✅
├── eval.py                  # Phase 5 probe runner ✅
└── pyproject.toml           # uv-managed
```

## Config

- **Persona:** `config/persona.md` — character spec
- **User context:** `config/user-context.md` — dot's profile (swap for other users)
- **System prompt concat:** `persona.md + "\n\n---\n\n" + user-context.md` (must match between `extract.py` and the training/inference loader)

## Dependencies

- `uv` — package manager
- `unsloth` — LoRA trainer with ROCm support
- `transformers`, `datasets`, `peft`, `trl`
- `llama.cpp` — GGUF conversion + local inference (reused from `dragon-daemon/internal/llm/llamacli/`)
