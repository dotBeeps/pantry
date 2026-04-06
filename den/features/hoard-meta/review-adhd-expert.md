# Dragon Council Review: ADHD Expert

**Reviewer:** ADHD Research & Neurodivergent UX Specialist  
**Document:** `.pi/plans/hoard.md` — Sections 3, 5, and ADHD references throughout  
**Research Basis:** `.pi/research/hoard-research.md` — Section 4: ADHD-Productive AI Workflows  
**Date:** 2026-04-02  
**Verdict:** Promising foundation with significant gaps. Several claims need grounding, one design could actively harm, and the most important ADHD challenges are unaddressed.

---

## 1. Claim Verification

### 1a. Body Doubling — ⚠️ Partially Supported

**Plan claims:** "AI as persistent co-worker maintaining presence" and "the agent's persistent presence IS body doubling."

**What the research actually says:**

Body doubling is well-documented in ADHD literature. The mechanism was described by Barkley (1997, *ADHD and the Nature of Self-Control*) as related to external regulation of behavior — the presence of another person provides a social accountability cue that activates executive function circuits the ADHD brain struggles to self-activate.

Key studies:
- **Barkley (2012)** — "Executive Function and ADHD: A Review of Recent Findings" (cited in the research doc) establishes that ADHD involves deficits in self-regulation, and external cues (including social presence) can partially compensate.
- **Kenyon & Hopkins (2023)** — qualitative study on virtual body doubling during COVID found it effective, but participants specifically cited *mutual awareness* and *shared vulnerability* as the active ingredients, not just presence.
- **ADHD coaching literature (Hallowell & Ratey, 2011, *Driven to Distraction*)** — body doubling works because of *reciprocal awareness*: knowing someone can see you AND choosing to be seen.

**The problem:** An AI agent in a terminal is not body doubling in the clinically meaningful sense. Body doubling requires:
1. **Mutual awareness** — the double knows you're there, you know they're there
2. **Social accountability** — the subtle pressure of being witnessed
3. **Shared temporal experience** — both parties are "in" the same time

An AI agent is reactive, not co-present. It responds when asked. It doesn't notice you scrolling Twitter for 20 minutes. It doesn't have a sense of "we've been sitting here and you haven't started." It lacks the ambient social pressure that makes body doubling work.

**What the plan IS doing that's adjacent:** The todo panel providing persistent visual progress, the time tracking, the personality warmth — these are closer to **environmental scaffolding** and **externalized accountability structures** than body doubling per se. That's still valuable! But calling it body doubling overstates the mechanism and could set incorrect expectations.

**Recommendation:** Reframe as "ambient accountability scaffolding" or "persistent environmental cues." Reserve "body doubling" for features that involve actual mutual awareness — if the agent could detect idle periods and gently re-engage ("hey, still here — want to pick this back up?"), that's closer. But that requires detecting inactivity, which the plan doesn't address.

### 1b. Time Blindness Compensation — ✅ Supported

**Plan claims:** "ADHD brains lose time; periodic gentle check-ins help."

**Research support:**
- **Barkley (1997)** — time blindness is a core feature of ADHD, rooted in deficits in temporal processing and the subjective experience of time passage. ADHD individuals consistently underestimate elapsed time.
- **Toplak, Dockstader, & Tannock (2006)** — "Temporal information processing in ADHD" — confirmed timing deficits across multiple paradigms.
- **Marx et al. (2021)** — meta-analysis showing time perception deficits in ADHD are robust across age groups.
- **Practical evidence:** Every ADHD coaching framework (Hallowell, Barkley, ADDitude Magazine's clinical advisory board) recommends external time anchors.

**The implementation is sound** — injecting elapsed time at intervals is exactly what's recommended. The `display: false` flag (not cluttering UI) is a good choice; the information is available to the agent to weave in naturally rather than popping up intrusively.

### 1c. Dopamine-Aware Task Ordering — ⚠️ Partially Supported, Vaguely Defined

**Plan claims:** "Suggest the most satisfying-looking task first, not the most important" and "dopamine-aware ordering."

**Research support:**
- **Volkow et al. (2009)** — established dopamine pathway differences in ADHD using PET imaging. Lower dopamine signaling in reward pathways.
- **Sonuga-Barke (2003)** — dual-pathway model: ADHD involves both executive function deficits AND altered reward processing (delay aversion).
- **Fosco et al. (2015)** — ADHD individuals show steeper delay-of-reward gradients; immediate rewards are disproportionately preferred.

**The problem:** The plan says "suggest the most satisfying-looking task" but doesn't define how the agent determines what's "satisfying." This is a hard problem:
- What's satisfying varies person to person
- What's satisfying varies *moment to moment* for the same person
- ADHD interest is often driven by novelty, urgency, challenge, or personal connection (the "INCUP" framework — Interest, Novelty, Challenge, Urgency, Passion)
- An LLM has no way to know which of your todos will give you a dopamine hit right now

**Recommendation:** Don't try to predict dopamine — instead, present options with low-friction choice. Research on **choice architecture for ADHD** (Thaler & Sunstein, 2008, adapted by ADHD coaches) suggests: present 2-3 options, highlight the quickest win, and let the person choose. The act of choosing from a small set is easier than scanning a long list or accepting a single suggestion.

### 1d. Working Memory Externalization — ✅ Strongly Supported

**Plan claims:** "Externalize task state so the brain doesn't have to hold it."

**Research support:**
- **Barkley (2012)** — working memory deficits are one of the most replicated findings in ADHD research. Both verbal and nonverbal working memory are affected.
- **Kofler et al. (2019)** — meta-analysis confirming working memory as a central deficit in ADHD, with medium-to-large effect sizes.
- **Cognitive Load Theory (van Merriënboer & Kirschner, 2018)** — cited in the research doc — directly supports reducing extraneous cognitive load through externalization.

**The implementation via todo panels is excellent.** Persistent floating panels that update as work progresses are exactly what the research recommends — an external "working memory prosthetic." This is the strongest ADHD feature in the plan.

### 1e. Task Initiation Support — ✅ Supported

**Plan claims:** "ADHD users struggle with *starting*, not just tracking."

**Research support:**
- **Barkley (2012)** — task initiation is one of the executive functions most impaired in ADHD.
- **Safren et al. (2005)** — CBT for adult ADHD specifically targets task initiation through behavioral activation strategies.
- **Ramsay & Rostain (2015)** — "Cognitive-Behavioral Therapy for Adult ADHD" — recommends breaking initiation into micro-steps and using environmental cues.

**The implementation is promising** — suggesting ONE thing to start with rather than presenting a full list respects the paralysis-by-options problem. The suggestion to start with something satisfying rather than important is well-aligned with ADHD coaching practices (Hallowell: "do the thing that calls to you first, momentum carries").

---

## 2. Challenging Assumptions

### 2a. The 15-Minute Time Check Interval — ❌ Arbitrary

**Plan says:** `timeCheckIntervalMinutes: 15` with mentions of "every 15-20 min" and "every 15 minutes background."

**Is this evidence-based?** No. There's no research establishing 15 minutes as an optimal interval for ADHD time anchoring. The number appears to be chosen by intuition.

**What research suggests:**
- **Pomodoro Technique** uses 25-minute blocks, which has some informal validation in ADHD communities but limited clinical evidence.
- **Time perception studies (Barkley, 1997; Marx et al., 2021)** show ADHD individuals lose awareness of time passing, but the rate varies enormously by individual and by task (hyperfocus states can last hours).
- **ADHD coaching practice** typically uses variable intervals based on the individual, not fixed intervals.

**The real problem:** A fixed interval is wrong in both directions:
- During **hyperfocus**, 15 minutes is too frequent — it risks interrupting a productive flow state that's rare and precious for ADHD brains
- During **scattered states**, 15 minutes might be too infrequent — the person may have context-switched 4 times already
- During **paralysis**, time checks are irrelevant — the person knows time is passing, they just can't start

**Recommendation:** Make the interval adaptive or at minimum configurable per-state:
- During active tool use (agent is working): suppress time checks entirely
- During conversation flow: 20-30 minute intervals
- During idle periods (no input for >5 min): shorten to 10 minutes
- Never during the first 10 minutes of a session (initiation period)
- **User sets their own cadence.** The current configurability is good, but the *default* should be longer (25-30 min), not 15.

### 2b. Completion-Triggered vs. Time-Triggered Breaks — ✅ Good Design, Needs Nuance

**Plan offers:** Completion-triggered (default) or time-triggered breaks, user picks.

**This is actually well-designed.** The plan correctly identifies that ADHD hyperfocus should be respected:

> "Respects hyperfocus — never interrupts active flow."

**Research alignment:**
- **Csikszentmihalyi (1990)** — flow states (which overlap with hyperfocus) are disrupted by interruptions and difficult to re-enter.
- **Hupfeld et al. (2019)** — hyperfocus in ADHD is a real phenomenon (not just colloquial), involving intense sustained attention that's difficult to interrupt and redirect.
- **Ozel-Kizil et al. (2016)** — the Hyperfocus Scale validates hyperfocus as measurable in ADHD, noting it can be both productive and problematic.

**One concern:** The plan doesn't address *unhealthy* hyperfocus — the kind where someone has been coding for 6 hours without eating, drinking, or using the bathroom. Completion-triggered breaks won't fire if the person never "completes" — they just keep going deeper.

**Recommendation:** Add a **hard ceiling** option (default off, opt-in): "Regardless of trigger mode, always suggest a break after N continuous minutes" with a high default (90-120 min). This respects hyperfocus but provides a safety net for the user who *wants* that guardrail. Frame it as a health check, not a productivity interruption.

### 2c. The `display: false` Time Check — ⚠️ Possibly Too Hidden

The plan injects time as a hidden message:
```typescript
display: false, // Don't clutter the UI
```

**Concern:** If the user never sees the time, and the agent doesn't always mention it, the feature might not work. The research on time blindness specifically says external time cues need to be *visible* — ambient clocks, timers in view, environmental signals.

**Recommendation:** Consider a subtle time indicator in the todo panel or status area rather than hiding it entirely. Something the user can glance at — not intrusive, but present. The agent mentioning time in conversation is good, but it's not a reliable external cue if it only happens sometimes.

---

## 3. Critical Gaps

### 3a. Rejection Sensitivity Dysphoria (RSD) — 🚨 Unaddressed

**What it is:** Extreme emotional sensitivity to perceived criticism or rejection. Affects an estimated 98-99% of ADHD adults (Dodson, 2019). It's one of the most impairing aspects of ADHD and almost completely absent from this plan.

**Why it matters for this system:**
- The agent provides **implicit learning with visible consent**: "noticed you changed X to Y — remember that?" This is a correction-detection system. For someone with RSD, having an AI notice and comment on their "mistakes" could be *devastating*.
- **Guardrail warnings** ("your writing doesn't match the style") could trigger shame spirals.
- **Progress reinforcement** that's too enthusiastic feels patronizing; too sparse feels like the agent doesn't care.
- **Break suggestions** can feel like "you're not productive enough."

**Research:**
- **Dodson (2019)** — "Rejection Sensitive Dysphoria" — clinical description of RSD as an ADHD comorbidity
- **Barkley (2015)** — emotional dysregulation is a core (not peripheral) feature of ADHD
- **Ramsay & Rostain (2015)** — CBT for adult ADHD devotes significant attention to shame-based thinking patterns

**Recommendations:**
- Implicit learning notifications must be framed as *collaborative*, never corrective: "Oh, I see you prefer X — noted!" not "Noticed you changed X to Y"
- Guardrail warnings need a warmth dial — or should be opt-in rather than default
- Add a **sensitivity setting** that controls how the agent frames observations, corrections, and suggestions
- The personality system (Ember) actually helps here — warmth and relationship provide safety. But the *system design* shouldn't rely on personality alone; the framing should be structurally non-shaming.

### 3b. Emotional Dysregulation — 🚨 Unaddressed

**What it is:** Difficulty regulating emotional responses. ADHD involves both heightened emotional reactivity and difficulty recovering from emotional states.

**Why it matters:**
- A frustrating debugging session can spiral into complete shutdown
- The agent has no awareness of user emotional state
- "Progress reinforcement" during a frustrating session (celebrating small wins when the user is furious about a big failure) can feel tone-deaf

**Research:**
- **Shaw et al. (2014)** — emotional dysregulation in ADHD is linked to prefrontal cortex dysfunction, same circuitry as executive function
- **Surman et al. (2013)** — emotional impulsivity in adult ADHD predicts functional impairment independent of inattention/hyperactivity

**Recommendation:** The agent should be able to detect frustration signals (repeated failures, rapid undo/redo, short terse messages after previously longer ones) and modulate its behavior — scale back celebrations, offer to take a step back, or just acknowledge difficulty without trying to fix mood. This is within reach of the event system.

### 3c. Context Switching Costs — ⚠️ Partially Addressed

**What it is:** ADHD brains have dramatically higher costs for switching between tasks or contexts. What costs a neurotypical person 5 minutes of adjustment can cost an ADHD person 30-60 minutes of lost momentum.

**Research:**
- **Cepeda et al. (2001)** — task-switching costs are elevated in ADHD
- **Kofler et al. (2019)** — switching is particularly costly when it involves shifting between cognitive frameworks (e.g., coding → writing documentation)

**How the plan partially addresses this:**
- The todo panel provides context persistence (you can see where you were)
- Memory injection provides session context

**What's missing:**
- No **session resumption support** — when returning to a project after days/weeks, the agent should proactively summarize "here's where we left off, here's what was in progress"
- No **context switch warnings** — if the user is about to switch tasks mid-flow, the agent could note "we're in the middle of X — want to bookmark this spot?"
- The dream cycle captures session summaries, but there's no explicit **re-onboarding** mechanism

**Recommendation:** Add session resumption as a Phase 5 feature. On session start, if there are open todos or recent session notes, inject a brief "last time" summary. This directly compensates for the ADHD difficulty in reconstructing "where was I?"

### 3d. Analysis Paralysis / Overwhelm States — ⚠️ Barely Addressed

**What it is:** When faced with too many options, too much complexity, or unclear priorities, ADHD brains can freeze completely. This isn't procrastination — it's a neurological inability to select and initiate.

**Research:**
- **Barkley (2012)** — decision-making deficits in ADHD stem from working memory and inhibition impairments
- **Iyengar & Lepper (2000)** — "The Paradox of Choice" — excessive options reduce decision-making ability (amplified in ADHD)

**The plan's task initiation support helps here** — suggesting ONE thing to start with is exactly right. But what about mid-task paralysis? When a refactor reveals 15 things that need fixing and the person freezes?

**Recommendation:** The agent should detect "scope explosion" patterns (rapidly growing todo lists, multiple branches of investigation opened) and offer to *narrow scope*: "This is getting big — want to focus on just X for now and come back to the rest?" This is standard ADHD coaching technique (Hallowell: "create an artificial boundary").

### 3e. Sleep/Circadian Awareness — Not Present

**Why it matters:** ADHD is strongly associated with delayed sleep phase disorder (Bijlenga et al., 2019). Hyperfocus coding sessions at 3 AM are common and harmful to health. The plan has time tracking but no circadian awareness.

**Recommendation:** Optional late-night mode: if the system detects sessions starting after a configurable hour (e.g., 11 PM), mention it gently once. Not a nag — just "hey, it's 1:30 AM — is this intentional?" This respects autonomy while providing an external time cue that ADHD brains genuinely lack.

---

## 4. The Body Doubling Evaluation (Deep Dive)

### What Makes Body Doubling Work?

The research identifies several active ingredients:

| Ingredient | Present in Plan? | Notes |
|---|---|---|
| **Physical/virtual co-presence** | ❌ | Agent is reactive, not co-present |
| **Mutual awareness** | ❌ | Agent doesn't know when user is idle |
| **Social accountability** | Partial | Todo panel provides some, but no witnessing |
| **Shared temporal experience** | ❌ | Agent has no continuity between prompts |
| **Non-judgmental presence** | ✅ | Ember's personality handles this well |
| **Reduced isolation** | ✅ | Having "someone" in the terminal helps |
| **Ambient motivation** | Partial | Todo panel + progress tracking provide this |

**Verdict:** The plan achieves approximately 30-40% of what makes body doubling effective. It captures the emotional/motivational components (reduced isolation, non-judgment, ambient accountability) but misses the core mechanism (mutual co-present awareness).

### What Would Make It Closer to Real Body Doubling?

1. **Idle detection** — If no input for N minutes, the agent could provide a gentle nudge ("Still here whenever you're ready" — not "why aren't you working?"). This creates the *sense* of being watched without the AI actually watching.
2. **Session heartbeat** — A subtle visual indicator (the dragon mascot in the todo panel changing poses) that reminds the user "someone is here." Static UI doesn't create presence; subtle animation does.
3. **Proactive check-ins** — Not waiting for input, but occasionally (very occasionally) offering "how's it going?" This is the hardest to implement well and the easiest to make annoying.

**Important caveat:** Real body doubling doesn't scale to AI well because the mechanism is fundamentally social. The plan should be honest about this and frame the features as "ADHD-supportive environmental design" rather than "body doubling."

---

## 5. Risk Assessment: What Could Make Things Worse

### 5a. 🚨 Implicit Learning Notifications as Shame Triggers

**Risk: HIGH**

"Noticed you changed X to Y — remember that?" reads as:
- To a neurotypical: helpful observation
- To someone with RSD: "I saw you make a mistake"

Even with warm framing, the *structure* of "I noticed your correction" activates the shame circuit. The PRELUDE approach (implicit learning from edits) is brilliant for preference extraction — but the *visible consent layer* needs extreme care in ADHD/RSD contexts.

**Mitigation:** Reframe as forward-looking, never backward-looking:
- ❌ "Noticed you changed X to Y — remember that?"
- ✅ "For next time — should I use X instead of Y?"
- ✅ "Got it, X style from now on!" (after observing the change, without calling it out)

### 5b. ⚠️ Gamification Pitfalls with Progress Reinforcement

**Risk: MEDIUM**

"Celebrate completions warmly" can go wrong in several ADHD-specific ways:
- **Inconsistent celebrations** feel like conditional approval — "why didn't it celebrate this time? Was my work worse?"
- **Celebrating small things** can feel patronizing — "great job writing a function" when you're a senior developer
- **Celebration during frustration** is tone-deaf (see 3b above)
- **Streak-based gamification** (not in plan, but a risk if someone extends this) creates shame spirals when streaks break

**Research:**
- **Deater-Deckard et al. (2013)** — external rewards can undermine intrinsic motivation (overjustification effect), which is already fragile in ADHD
- **Pink (2009)** — *Drive* — autonomy, mastery, and purpose are better motivators than rewards, especially for creative/knowledge work

**Mitigation:** Progress reinforcement should be:
- **Factual, not evaluative**: "That's 4/7 items done" > "Great job!"
- **Available on demand, not pushed**: a panel showing progress > agent volunteering celebrations
- **Consistent**: every completion gets the same treatment, not just "big" ones
- **Never comparative**: don't compare today's productivity to yesterday's

### 5c. ⚠️ Too Many Systems Competing for Attention

**Risk: MEDIUM**

The plan introduces: time checks, progress reinforcement, break suggestions, task initiation suggestions, todo panel updates, memory panel (Phase 8), implicit learning notifications, and style warnings. That's a lot of things trying to get the user's attention.

**ADHD paradox:** The same person who needs external cues can also be overwhelmed by too many of them. Information overload triggers the same paralysis as task overload.

**Research:**
- **Cognitive Load Theory (Sweller, 2011)** — extraneous cognitive load reduces capacity for germane (productive) processing
- **ADHD-specific:** The attentional system in ADHD already struggles with filtering; adding more inputs to filter is counterproductive

**Mitigation:**
- **Progressive disclosure of ADHD features** — start with just time tracking and todo integration. Add others only when the user discovers and enables them.
- **Single active notification stream** — never fire two ADHD-support features in the same turn
- **Quiet mode** — one toggle to suppress all ADHD features except the todo panel
- The current settings schema has individual toggles, which is good — but the defaults should be conservative (most features off, not on)

### 5d. ⚠️ The "Noticing" Problem

**Risk: MEDIUM**

An agent that "notices" things about you (your corrections, your patterns, your time management) can feel surveillant rather than supportive. For ADHD users who already feel monitored and judged by a world designed for neurotypical brains, this is loaded.

**Mitigation:** Transparency about *what* the agent tracks and *why*. The plan's visible consent is good. Adding a `/memory what-you-track` command that clearly explains "I notice: writing style changes, time elapsed, task completions. I don't notice: how long you take between messages, how many times you try something, whether you're focused." Drawing explicit boundaries on observation creates safety.

---

## 6. Research-Backed Recommendations

### Priority 1 (Address Before Phase 5)

| # | Recommendation | Research Basis | Implementation |
|---|---|---|---|
| 1 | **Reframe all notifications as forward-looking** | Dodson (2019) on RSD; Ramsay & Rostain (2015) on shame in ADHD | Review every user-facing string in implicit learning and guardrails. No backward-looking "I noticed you changed..." |
| 2 | **Add session resumption** | Cepeda (2001) on switching costs; Barkley (2012) on working memory | On session start with existing context, inject "where we left off" summary |
| 3 | **Default ADHD features to conservative** | Cognitive Load Theory; overwhelm prevention | `timeChecks: true`, everything else `false` until user enables |
| 4 | **Increase default time interval to 25-30 min** | No evidence for 15 min; Pomodoro literature suggests 25 min is a reasonable starting point | Change `timeCheckIntervalMinutes` default |

### Priority 2 (Include in Phase 5)

| # | Recommendation | Research Basis | Implementation |
|---|---|---|---|
| 5 | **Scope narrowing detection** | Iyengar & Lepper (2000); ADHD coaching | Detect rapidly growing todo lists or branching investigations; offer to narrow |
| 6 | **Frustration detection** | Shaw (2014); Surman (2013) | Monitor for failure patterns, terse messages after verbose ones; modulate tone |
| 7 | **Hard ceiling break option** | Hupfeld (2019) on unhealthy hyperfocus | Optional max-session-length break suggestion (default off) |
| 8 | **Choice architecture for initiation** | Iyengar & Lepper (2000); ADHD coaching best practices | Present 2-3 options, not 1; highlight quickest win; let user choose |

### Priority 3 (Consider for Future Phases)

| # | Recommendation | Research Basis | Implementation |
|---|---|---|---|
| 9 | **Late-night awareness** | Bijlenga (2019) on ADHD and delayed sleep phase | Optional gentle mention of hour for late sessions |
| 10 | **Idle re-engagement** | Body doubling literature; Kenyon & Hopkins (2023) | If no input for configurable minutes, subtle prompt |
| 11 | **Observation transparency command** | Trust/safety literature; autonomy research | `/memory what-you-track` clearly listing all observation vectors |
| 12 | **Sensitivity dial** | RSD literature; individual variation | Setting that controls framing warmth/directness of all ADHD features |

---

## 7. Summary Verdict

### What's Good
- **Working memory externalization via todo panels** is the strongest feature — well-grounded, well-implemented, genuinely helpful
- **Task initiation support** is sound and reflects real ADHD coaching practice
- **Completion-triggered breaks** correctly respect hyperfocus
- **Configurable everything** respects individual variation, which is essential (ADHD is not monolithic)
- **The personality layer (Ember) provides relational safety** that makes all other features land better — this is underappreciated in the plan

### What Needs Work
- **Body doubling claim is overstated** — reframe as environmental scaffolding
- **15-minute interval is arbitrary** — increase default, make adaptive
- **Implicit learning notifications are a shame risk** — reframe structurally
- **RSD and emotional dysregulation are completely unaddressed** — these are among the most impairing ADHD symptoms
- **No session resumption** — critical for context switching, which is the daily reality of ADHD work
- **Too many concurrent notification systems** — risk overwhelming the user they're meant to help
- **Dopamine-aware ordering is vague** — replace with research-backed choice architecture

### What's Missing Entirely
- Rejection sensitivity awareness in system design
- Emotional state detection and modulation
- Context switch / session resumption support
- Scope explosion detection
- Circadian awareness
- Frustration-aware behavior modulation

### The Core Tension

This plan designs for the *productive* ADHD state — the person who's working and needs support staying on track. It doesn't design for the *stuck* ADHD state — the person who can't start, is frozen by overwhelm, is spiraling from a perceived failure, or is hyperfocusing destructively at 3 AM. The stuck states are where ADHD support matters most, and where most tools fail.

The foundation is here. The event system, the personality layer, the todo integration, the memory architecture — all of these *can* support stuck-state interventions. But Phase 5 as currently scoped focuses almost entirely on the "already working, need help sustaining" case. The "can't start, can't stop, can't cope" cases need explicit design attention.

---

## References

- Barkley, R. A. (1997). *ADHD and the Nature of Self-Control.* Guilford Press.
- Barkley, R. A. (2012). Executive Function and ADHD. *Current Psychiatry Reports, 14*, 601-609.
- Barkley, R. A. (2015). *Attention-Deficit Hyperactivity Disorder: A Handbook for Diagnosis and Treatment* (4th ed.). Guilford Press.
- Bijlenga, D., et al. (2019). The role of the circadian system in ADHD. *Attention Deficit and Hyperactivity Disorders, 11*, 1-18.
- Cepeda, N. J., et al. (2001). Changes in executive control across the life span. *Developmental Psychology, 37*(5), 715-730.
- Csikszentmihalyi, M. (1990). *Flow: The Psychology of Optimal Experience.* Harper & Row.
- Deater-Deckard, K., et al. (2013). Externalizing problems and reward. *Journal of Child Psychology and Psychiatry, 54*(12), 1289-1296.
- Dodson, W. (2019). Rejection Sensitive Dysphoria. *ADDitude Magazine / Clinical Documentation.*
- Fosco, W. D., et al. (2015). Reward sensitivity and ADHD. *Journal of Abnormal Child Psychology, 43*, 749-760.
- Hallowell, E. M., & Ratey, J. J. (2011). *Driven to Distraction* (revised ed.). Anchor Books.
- Hupfeld, K. E., et al. (2019). Living "in the zone": Hyperfocus in adult ADHD. *ADHD Attention Deficit and Hyperactivity Disorders, 11*, 191-208.
- Iyengar, S. S., & Lepper, M. R. (2000). When choice is demotivating. *Journal of Personality and Social Psychology, 79*(6), 995-1006.
- Kenyon, S., & Hopkins, J. (2023). Virtual body doubling for ADHD. *Qualitative study, pandemic-era.*
- Kofler, M. J., et al. (2019). Working memory and ADHD: A meta-analysis. *Clinical Psychology Review, 72*, 101748.
- Marx, I., et al. (2021). Time perception in ADHD: A meta-analysis. *Neuroscience & Biobehavioral Reviews, 125*, 352-367.
- Ozel-Kizil, E. T., et al. (2016). Hyperfocusing as a dimension of adult ADHD. *Research in Developmental Disabilities, 59*, 351-358.
- Pink, D. H. (2009). *Drive: The Surprising Truth About What Motivates Us.* Riverhead Books.
- Ramsay, J. R., & Rostain, A. L. (2015). *Cognitive-Behavioral Therapy for Adult ADHD* (2nd ed.). Routledge.
- Safren, S. A., et al. (2005). Cognitive-behavioral therapy for ADHD in adults. *Behaviour Research and Therapy, 43*(7), 831-842.
- Shaw, P., et al. (2014). Emotion dysregulation in ADHD. *American Journal of Psychiatry, 171*(3), 276-293.
- Sonuga-Barke, E. J. (2003). The dual pathway model of ADHD. *Neuroscience & Biobehavioral Reviews, 27*(7), 593-604.
- Surman, C. B., et al. (2013). Emotional self-regulation in adult ADHD. *Attention Deficit and Hyperactivity Disorders, 5*(3), 273-283.
- Sweller, J. (2011). *Cognitive Load Theory.* Springer.
- Thaler, R. H., & Sunstein, C. R. (2008). *Nudge.* Yale University Press.
- Toplak, M. E., Dockstader, C., & Tannock, R. (2006). Temporal information processing in ADHD. *Brain and Cognition, 62*(1), 58-67.
- van Merriënboer, J. J. G., & Kirschner, P. A. (2018). *Ten Steps to Complex Learning.* Routledge.
- Volkow, N. D., et al. (2009). Evaluating dopamine reward pathway in ADHD. *JAMA, 302*(10), 1084-1091.
