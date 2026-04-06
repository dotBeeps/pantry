# Research: Energy Consumption & Carbon Emissions of LLM Inference

## Summary

No LLM provider (including Anthropic) publishes per-token energy numbers. The best available data comes from **EcoLogits** (open-source, peer-reviewed in JOSS 2025), which uses a parametric model fitted to ML.ENERGY benchmark data on H100 GPUs. For a Claude Sonnet 4–class model (~44–132B active parameters, MoE), the estimated energy is **~0.07–0.12 Wh per output token per GPU**, scaling to **~1.1–2.2 Wh per 1K output tokens** when accounting for multi-GPU deployment and data center PUE. At a US-average grid intensity of ~400 gCO₂/kWh, that's roughly **0.4–0.9 gCO₂ per 1K output tokens** for Sonnet-class models. Opus-class models (200–600B active) are ~10× more expensive due to needing 4× more GPUs.

## Findings

### 1. Energy Per Token — The EcoLogits Model

**The only peer-reviewed, open-source methodology for per-token energy estimation is EcoLogits** (Rincé & Banse, JOSS 2025). It uses a parametric fit to the [ML.ENERGY Leaderboard](https://ml.energy/leaderboard/) benchmark data (vLLM on H100 GPUs):

```
E_gpu(token) = α·e^(β·B)·P_active + γ    [Wh per output token per GPU]

α = 1.17 × 10⁻⁶
β = -1.12 × 10⁻²  
γ = 4.05 × 10⁻⁵
B = batch size (default: 64)
P_active = active parameters in billions
```

At B=64 this simplifies to approximately:

```
E_gpu ≈ 5.71 × 10⁻⁷ · P_active + 4.05 × 10⁻⁵   [Wh/output token]
```

The relationship is **linear with active parameter count** and **exponentially decreasing with batch size** (larger batches = more efficient per request).

[Source: EcoLogits LLM Inference Methodology](https://ecologits.ai/latest/methodology/llm_inference/)

### 2. Proprietary Model Architecture Estimates (EcoLogits)

Since Anthropic, OpenAI, and Google don't publish model sizes, EcoLogits estimates architectures from leaked data, benchmarks, and pricing signals. All frontier models are assumed to be **Sparse Mixture-of-Experts (MoE)** with 10–30% activation ratio:

| Model | Total Params (est.) | Active Params (est.) | Type | GPUs Needed¹ |
|-------|-------------------|---------------------|------|-------------|
| **Claude 3 Haiku** | 300B | 30–90B | MoE | 16 |
| **Claude Sonnet 4** | 440B | 44–132B | MoE | 16 |
| **Claude Sonnet 4.5** | 440B | 44–132B | MoE | 16 |
| **Claude Opus 4** | 2,000B | 200–600B | MoE | 64 |
| **Claude Opus 4.1** | 2,000B | 200–600B | MoE | 64 |
| **Claude Opus 4.5** | 670B | 67–200B | MoE | 32 |
| GPT-4 | 1,760B | 176–528B | MoE | 64 |
| GPT-4o | 440B | 44–132B | MoE | 16 |
| GPT-4.1 | 352B | 35–106B | MoE | 16 |
| Gemini 2.5 Pro | 2,000B | 200–600B | MoE | 64 |
| Gemini 2.0 Flash | 440B | 44–132B | MoE | 16 |

¹ H100 80GB, 16-bit weights, 1.2× memory overhead, rounded up to power of 2.

[Source: EcoLogits models.json](https://github.com/genai-impact/ecologits/blob/main/ecologits/data/models.json) and [Proprietary Models methodology](https://ecologits.ai/latest/methodology/proprietary_models/)

### 3. Complete Energy Per Request Formula

The full formula accounts for GPU energy, server overhead, data center cooling (PUE), and multi-GPU deployment:

```
E_request = PUE × (N_gpu × E_gpu + E_server_overhead)

Where:
  E_gpu = num_output_tokens × f_E(P_active, B=64)  [per GPU]
  E_server_overhead = latency × W_server × (N_gpu / N_gpu_installed) / B
  W_server = 1.2 kW (for p5.48xlarge without GPUs)
  N_gpu_installed = 8 (GPUs per server)
  PUE = 1.09–1.20 (varies by provider)
```

**Simplified version for hardcoding** (ignoring server overhead, which is small relative to GPU energy for large models):

```
E_per_1K_output_tokens ≈ N_gpu × 1000 × f_E(P_active, 64) × PUE   [Wh]
```

### 4. Concrete Wh/1K Output Token Estimates (with PUE, multi-GPU)

Using PUE=1.15 (AWS global average):

| Model | Wh per 1K output tokens (mid estimate) |
|-------|---------------------------------------|
| **Claude 3 Haiku** | **1.4 Wh** |
| **Claude Sonnet 4/4.5** | **1.7 Wh** |
| **Claude Opus 4.5** | **4.3 Wh** |
| **Claude Opus 4/4.1** | **19.8 Wh** |
| GPT-4o | 1.7 Wh |
| GPT-4.1 | 1.5 Wh |
| GPT-4 (original) | 17.8 Wh |
| Gemini 2.0 Flash | 1.7 Wh |
| Gemini 2.5 Pro | 19.8 Wh |

**Important caveats**: These are *output token* estimates only. Input tokens (prefill) consume significantly less energy per token than output tokens (decode), roughly 5-20× less depending on batch size.

### 5. Carbon Emission Formula

```
gCO₂ = tokens × Wh_per_token × grid_carbon_intensity_gCO₂_per_kWh / 1000
```

Or equivalently:

```
gCO₂_per_1K_tokens = Wh_per_1K_tokens × gCO₂_per_kWh / 1000
```

### 6. Grid Carbon Intensity by Region

These are **lifecycle** carbon intensity values (including upstream emissions) in gCO₂eq/kWh. Sources: Our World in Data, ADEME Base Empreinte, Electricity Maps, EPA eGRID.

| Region / Grid | gCO₂eq/kWh | Notes |
|--------------|-------------|-------|
| **US Average** | ~400 | EPA eGRID 2022 national average |
| US-WEST (Oregon/Washington) | ~150–250 | Hydro-heavy; AWS us-west-2 in Oregon ~190 |
| US-WEST (California) | ~200–250 | Solar/wind mix |
| US-EAST (Virginia) | ~300–350 | AWS us-east-1; some natural gas |
| US-EAST (Ohio) | ~400–500 | Coal + gas |
| **EU Average** | ~250–300 | Varies enormously by country |
| Sweden | ~30–50 | Hydro + nuclear (Mistral AI servers) |
| France | ~50–80 | Nuclear-heavy |
| Germany | ~350–400 | Still coal-heavy |
| Poland | ~700–800 | Coal-dominated |
| **UK** | ~200–250 | Gas + wind |
| **Japan** | ~450–500 | Gas + coal |
| **Australia** | ~500–600 | Coal-heavy |
| **India** | ~700–800 | Coal-dominated |
| **China** | ~550–600 | Coal + hydro mix |
| **Canada** | ~100–150 | Hydro-heavy |
| **Brazil** | ~60–100 | Hydro-heavy |
| **Norway** | ~10–30 | Nearly 100% hydro |

**Note on renewable energy claims**: AWS, Google, and Microsoft all claim 100% renewable energy matching. However, this is typically done through Renewable Energy Certificates (RECs) and does not mean the electrons powering the data center are carbon-free at any given moment. For carbon tracking, use the **grid average** for the region, not zero.

### 7. Data Center PUE Values

| Provider | PUE | Source |
|----------|-----|--------|
| AWS (global average) | **1.15** | Amazon 2024 Sustainability Report |
| AWS (best site, Europe) | 1.04 | Amazon 2024 Sustainability Report |
| AWS (best site, Americas) | 1.05 | Amazon 2024 Sustainability Report |
| Google (global average) | **1.09** | Google Environmental Report 2024 |
| Microsoft (global average) | **1.16–1.20** | Microsoft Sustainability Report |
| Industry average (hyperscale) | 1.20–1.25 | IDC 2025 |
| Industry average (enterprise) | 1.58–1.63 | IDC / Uptime Institute |

[Source: AWS Sustainability](https://sustainability.aboutamazon.com/products-services/the-cloud)

### 8. Anthropic-Specific Data

**Anthropic has published no sustainability report, no energy-per-query data, and no PUE numbers.**

What we know:
- **Cloud providers**: Anthropic uses **AWS** (primary) and **Google Cloud** for serving Claude models. [Source: EcoLogits provider data]
- **EcoLogits assigns**: PUE 1.09–1.14, WUE 0.13–0.99, location: USA
- **No official model sizes**: All parameter counts are community estimates
- Anthropic's [usage policy](https://www.anthropic.com/policies) and [research papers](https://www.anthropic.com/research) contain no energy or emissions data
- Claude model cards do not include carbon footprint information

### 9. Model Size Scaling — Multipliers

Based on the EcoLogits data, here are rough **energy multipliers relative to Claude Sonnet 4** (the mid-tier reference):

| Model | Relative to Sonnet | Why |
|-------|-------------------|-----|
| **Haiku** (small) | **~0.8×** | Fewer active params (30-90B vs 44-132B), same GPU count |
| **Sonnet** (medium) | **1.0×** (reference) | ~44-132B active, 16 GPUs |
| **Opus 4.5** (large) | **~2.6×** | More params (67-200B), needs 32 GPUs (2× more) |
| **Opus 4** (very large) | **~12×** | Much more params (200-600B), needs 64 GPUs (4× more) |

The dominant factor is **number of GPUs needed**, which jumps in powers of 2. A model that needs 64 GPUs vs 16 GPUs is ~4× more expensive even before accounting for higher per-GPU energy from more active parameters.

### 10. What Numbers Are People Actually Using?

#### EcoLogits (genai-impact/ecologits)
- **The most rigorous tool**. Python library that wraps LLM API calls and estimates energy + CO₂ per request.
- Uses the parametric model described above, with per-provider PUE/location data.
- Published in JOSS (Journal of Open Source Software), 2025.
- [GitHub](https://github.com/genai-impact/ecologits) | [Docs](https://ecologits.ai)

#### CodeCarbon (mlco2/codecarbon)
- Measures **local** GPU power draw via RAPL/NVML sensors.
- Useful for self-hosted models, not for API-based inference.
- Uses [electricityMap](https://app.electricitymaps.com/) for real-time grid carbon intensity.
- Used in the Luccioni et al. (2024) paper measuring inference costs.
- [GitHub](https://github.com/mlco2/codecarbon)

#### Luccioni et al. (2024) — "Power Hungry Processing" (ACM FAccT '24)
- First systematic comparison of inference costs across 88 models, 10 tasks.
- Key finding: **text generation uses ~0.047 kWh per 1,000 inferences** (avg across models up to ~7B params on A100 GPUs).
- For context: BLOOMz-7B used **0.104 kWh per 1,000 inferences** (average across tasks).
- These are for much smaller models than frontier LLMs, but establish the methodology.
- [arXiv:2311.16863](https://arxiv.org/abs/2311.16863)

#### IEA — Energy and AI Report (2025)
- Macro-level data: global data center consumption ~415 TWh in 2024 (~1.5% of global electricity).
- Per-query estimates cited in media: **a ChatGPT query uses ~10× the energy of a Google search** (~0.3 Wh for search vs ~3 Wh for ChatGPT).
- These are rough "back of envelope" numbers, not formally published per-token metrics.
- [IEA Report](https://www.iea.org/reports/energy-and-ai)

#### Hugging Face Emissions Dashboard
- Shows estimated CO₂ for training (not inference) of models on the Hub.
- Uses CodeCarbon under the hood.

### 11. Recommended Hardcoded Defaults

For a carbon tracking extension, here are defensible defaults with clear sourcing:

```typescript
// Energy per 1K OUTPUT tokens (Wh) — includes multi-GPU + PUE
// Source: EcoLogits parametric model + models.json estimates
// PUE: 1.15 (AWS global average 2024)
const WH_PER_1K_OUTPUT_TOKENS: Record<string, number> = {
  // Anthropic Claude
  "claude-haiku":    1.4,   // ~300B total, 30-90B active, 16 GPUs
  "claude-sonnet":   1.7,   // ~440B total, 44-132B active, 16 GPUs  
  "claude-opus-4.5": 4.3,   // ~670B total, 67-200B active, 32 GPUs
  "claude-opus":     19.8,  // ~2000B total, 200-600B active, 64 GPUs

  // OpenAI
  "gpt-4o":          1.7,   // ~440B total, 44-132B active, 16 GPUs
  "gpt-4.1":         1.5,   // ~352B total, 35-106B active, 16 GPUs
  "gpt-4":           17.8,  // ~1760B total, 176-528B active, 64 GPUs

  // Google
  "gemini-flash":    1.7,   // ~440B total, 44-132B active, 16 GPUs
  "gemini-pro":      19.8,  // ~2000B total, 200-600B active, 64 GPUs

  // Fallback for unknown models
  "default":         2.0,   // reasonable mid-range estimate
};

// Input tokens are ~10× cheaper than output tokens (prefill vs decode)
const INPUT_TOKEN_DISCOUNT = 0.1;

// Grid carbon intensity (gCO₂eq/kWh) by cloud region
const GRID_CARBON_INTENSITY: Record<string, number> = {
  "us-west-2":     190,   // Oregon (AWS default for Anthropic)
  "us-east-1":     320,   // Virginia
  "us-east-2":     450,   // Ohio
  "eu-west-1":     300,   // Ireland
  "eu-central-1":  350,   // Frankfurt
  "eu-north-1":    30,    // Stockholm
  "ap-northeast-1": 470,  // Tokyo
  "us-average":    400,
  "eu-average":    270,
  "global-average": 440,
};

// Formula:
// gCO₂ = (output_tokens / 1000 * WH_PER_1K_OUTPUT + 
//          input_tokens / 1000 * WH_PER_1K_OUTPUT * INPUT_TOKEN_DISCOUNT)
//        * grid_intensity / 1000
```

## Sources

### Kept
- **EcoLogits LLM Inference Methodology** (https://ecologits.ai/latest/methodology/llm_inference/) — Core parametric model, peer-reviewed (JOSS 2025), most rigorous available methodology
- **EcoLogits Proprietary Models** (https://ecologits.ai/latest/methodology/proprietary_models/) — How they estimate Claude/GPT architecture sizes
- **EcoLogits models.json** (https://github.com/genai-impact/ecologits/blob/main/ecologits/data/models.json) — Concrete parameter estimates for all major models
- **Luccioni et al. "Power Hungry Processing"** (https://arxiv.org/abs/2311.16863, ACM FAccT '24) — Foundational inference energy measurement study, 88 models
- **IEA Energy and AI Report 2025** (https://www.iea.org/reports/energy-and-ai) — Macro data center energy trends, 415 TWh global consumption
- **AWS Sustainability Report 2024** (https://sustainability.aboutamazon.com/products-services/the-cloud) — PUE 1.15 global average, 100% renewable matching claim
- **ML.ENERGY Leaderboard** (https://ml.energy/leaderboard/) — Benchmark data underlying EcoLogits parametric model

### Dropped
- **Alex de Vries "Growing Energy Footprint of AI" (Joule, 2023)** — Cited widely but focuses on macro projections, not per-token numbers
- **Goldman Sachs AI energy reports** — Aggregated macro estimates, no per-token methodology
- **Various blog posts claiming "ChatGPT uses 10× a Google search"** — Originated from rough IEA/SemiAnalysis estimates, not rigorous per-token data
- **Hugging Face carbon tracker** — Training-only, not relevant for inference tracking
- **Google Environmental Report** — Useful for PUE (1.09) but no AI-specific breakdowns

## Gaps

1. **No provider publishes per-token energy data.** All numbers are estimates. Anthropic, OpenAI, and Google treat this as proprietary.

2. **Model architecture is unknown.** EcoLogits' parameter estimates for proprietary models carry large uncertainty bands (10–30% activation ratio gives a 3× range). The actual architectures could be quite different.

3. **Input token energy is poorly characterized.** The prefill phase (processing input tokens) has different energy characteristics than decode (generating output tokens). The "10× cheaper" heuristic is a rough estimate; actual ratio depends on sequence length, KV-cache, and hardware.

4. **Batch size is unknown.** Providers dynamically batch requests. The B=64 default in EcoLogits is reasonable but the actual batch size at any moment affects per-request energy significantly.

5. **Thinking/reasoning tokens.** Models like Claude Sonnet 4 with extended thinking generate many hidden tokens that count as output tokens energy-wise but may not appear in the billed token count. This could significantly undercount energy for reasoning-heavy queries.

6. **Specialized hardware.** Google uses TPUs (not H100s), AWS is rolling out Trainium/Inferentia chips. The H100-based energy model may not apply.

7. **Real-time grid carbon intensity** varies hour-by-hour. Static averages are useful defaults but can be off by 2-5× depending on time of day and renewable generation.

8. **Embodied emissions** (manufacturing GPUs, servers, networking) are excluded from the per-token estimates above but account for a significant fraction of total lifecycle emissions. EcoLogits does model these separately.

## Recommended Next Steps

- Use EcoLogits defaults as starting point — they're the best available and peer-reviewed
- Allow users to override grid carbon intensity for their region
- Consider integrating with Electricity Maps API for real-time intensity
- Track thinking tokens separately (they're output tokens energy-wise)
- Display ranges (min/max) rather than point estimates to communicate uncertainty
- Add a disclaimer: "Estimates based on EcoLogits methodology. Actual energy consumption is unknown."
