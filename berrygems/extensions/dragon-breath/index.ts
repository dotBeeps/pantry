/**
 * Dragon Breath — Carbon and energy tracking for LLM inference.
 *
 * Every dragon needs to know how much fire they're breathing.
 * Computation has weight — each token generated costs electricity,
 * and that electricity leaves a carbon trace in the world.
 * This extension makes that visible.
 *
 * Tracks kWh and gCO₂ per request and across the entire session,
 * displayed as a quiet footer widget. Use /carbon for a full breakdown.
 *
 * A small dog and a large dragon made this together.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import type { Usage } from "@mariozechner/pi-ai";
import { readPantrySetting, readPantryKey } from "../../lib/settings.ts";

// ── Energy Model ──────────────────────────────────────────────────────────────

/**
 * Wh consumed per 1,000 output tokens.
 * Input tokens cost roughly 0.1× (prefill is ~10× cheaper than decode).
 * Sources: various published estimates from MLCommons, Hugging Face, and
 * operator disclosures, normalised to a single Wh/1K-output baseline.
 */
const ENERGY_WH_PER_1K_OUTPUT: Record<string, number> = {
  // Anthropic
  "claude-haiku": 1.4,
  "claude-sonnet": 1.7,
  "claude-opus-4-5": 4.3,
  "claude-opus": 19.8,
  // OpenAI
  "gpt-4o": 1.7,
  "gpt-4o-mini": 0.8,
  "gpt-4": 17.8,
  o1: 10.0,
  o3: 15.0,
  // Google
  "gemini-flash": 0.8,
  "gemini-pro": 3.0,
  // Fallback
  default: 2.0,
};

/** Input tokens are ~10× cheaper than output (prefill vs decode). */
const INPUT_ENERGY_RATIO = 0.1;

// ── Grid Carbon Intensity ─────────────────────────────────────────────────────

/**
 * gCO₂ per kWh by cloud region.
 * AWS: estimated from co-located GCP data and EIA regional figures.
 * GCP: official 2024 carbon-free energy / grid intensity disclosures.
 */
const GRID_INTENSITY: Record<string, number> = {
  // AWS regions
  "us-west-2": 79, // Oregon (BPA hydro)
  "us-east-1": 300, // Virginia
  "eu-west-1": 200, // Ireland
  "eu-central-1": 276, // Frankfurt
  "ap-northeast-1": 453, // Tokyo
  // GCP regions
  "us-west1": 79,
  "us-central1": 413,
  "us-east1": 576,
  "europe-west1": 103,
  "europe-west4": 209,
  "europe-west9": 16, // Paris (nuclear)
  "europe-north1": 39,
  "northamerica-northeast1": 5, // Montréal (hydro)
  "asia-northeast1": 453,
  "southamerica-east1": 67,
  // Fallback — conservative global average
  default: 475,
};

// ── Session State ─────────────────────────────────────────────────────────────

interface BreathStats {
  /** Wh consumed in the most recent request */
  lastWh: number;
  /** gCO₂ emitted in the most recent request */
  lastGCO2: number;
  /** Cumulative Wh for the session */
  sessionWh: number;
  /** Cumulative gCO₂ for the session */
  sessionGCO2: number;
  /** Total input tokens for the session */
  sessionInputTokens: number;
  /** Total output tokens for the session */
  sessionOutputTokens: number;
  /** Model name of the most recent request */
  lastModel: string;
  /** Wh/1K-output rate used for the most recent request */
  lastRateWh: number;
}

function emptyStats(): BreathStats {
  return {
    lastWh: 0,
    lastGCO2: 0,
    sessionWh: 0,
    sessionGCO2: 0,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    lastModel: "",
    lastRateWh: ENERGY_WH_PER_1K_OUTPUT["default"]!,
  };
}

// ── Settings ──────────────────────────────────────────────────────────────────

function getEnabled(): boolean {
  return readPantrySetting<boolean>("breath.enabled", true);
}

function getGridIntensity(): number {
  // Direct override takes highest priority
  const override = readPantrySetting<number>("breath.gridIntensity", 0);
  if (override > 0) return override;
  // Region lookup
  const region = readPantryKey("breath.gridRegion", "default");
  return GRID_INTENSITY[region] ?? GRID_INTENSITY["default"]!;
}

// ── Energy Calculation ────────────────────────────────────────────────────────

/**
 * Fuzzy-match a model name to our energy table.
 * Uses substring matching with longest-match-wins to handle versioned names
 * like "claude-sonnet-4-20250514" → "claude-sonnet".
 */
function resolveEnergyRate(modelName: string): { key: string; wh: number } {
  const name = modelName.toLowerCase();
  let bestKey = "default";
  let bestLen = 0;

  for (const key of Object.keys(ENERGY_WH_PER_1K_OUTPUT)) {
    if (key === "default") continue;
    if (name.includes(key) && key.length > bestLen) {
      bestKey = key;
      bestLen = key.length;
    }
  }

  return { key: bestKey, wh: ENERGY_WH_PER_1K_OUTPUT[bestKey]! };
}

/**
 * Compute energy in Wh for a single inference request.
 *
 *   totalWh = (output/1000 × whPerK) + (input/1000 × whPerK × INPUT_RATIO)
 */
function computeWh(
  inputTokens: number,
  outputTokens: number,
  whPer1KOutput: number,
): number {
  const outputWh = (outputTokens / 1000) * whPer1KOutput;
  const inputWh = (inputTokens / 1000) * whPer1KOutput * INPUT_ENERGY_RATIO;
  return outputWh + inputWh;
}

/**
 * Convert Wh → gCO₂ using the active grid carbon intensity.
 *
 *   gCO₂ = Wh × gCO₂_per_kWh / 1000
 */
function computeGCO2(wh: number, gridIntensity: number): number {
  return (wh * gridIntensity) / 1000;
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtWh(wh: number): string {
  if (wh >= 1000) return `${(wh / 1000).toFixed(2)} kWh`;
  if (wh >= 1) return `${wh.toFixed(2)} Wh`;
  return `${(wh * 1000).toFixed(1)} mWh`;
}

function fmtGCO2(g: number): string {
  if (g >= 1000) return `${(g / 1000).toFixed(2)} kgCO₂`;
  if (g >= 1) return `${g.toFixed(2)} gCO₂`;
  return `${(g * 1000).toFixed(1)} mgCO₂`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Color bucket for Wh: green < 1, yellow 1–10, red > 10 */
function whColor(wh: number): "success" | "warning" | "error" {
  if (wh < 1) return "success";
  if (wh <= 10) return "warning";
  return "error";
}

// ── Equivalence Comparisons ───────────────────────────────────────────────────

/**
 * Things that use known amounts of energy, sorted by Wh ascending.
 * Each entry: [Wh per unit, singular label, plural label].
 *
 * Sources:
 *   - Carroll & Heiser, USENIX ATC 2010 — phone screen, SMS
 *   - Google Official Blog (Urs Hölzle, 2009) — Google search 0.3 Wh
 *   - DOE Building Technologies Office — microwave, AC, water heating
 *   - Energy Star product databases — washing machine, dishwasher, coffee
 *   - Lawrence Berkeley National Lab (2019) — gaming PC 200–350 W range
 *   - EPA fueleconomy.gov (2024 model year) — EV 25–33 kWh/100 mi
 *   - EIA FAQ #97 (2022) — US household 10,791 kWh/yr
 *   - NEC 210.19 + DOE — space heater 1500 W
 */
const EQUIVALENCES: [number, string, string][] = [
  // Tiny digital
  [0.001, "SMS text message", "SMS text messages"], // Carroll & Heiser 2010
  [0.01, "minute of a phone screen", "minutes of a phone screen"], // typical brightness, Carroll & Heiser 2010
  [0.3, "Google search", "Google searches"], // Google official blog 2009
  // Small
  [1.0, "minute of a laptop", "minutes of a laptop"], // ~60 W avg
  [10, "hour of an LED bulb", "hours of an LED bulb"], // standard 10 W LED
  [15, "smartphone charge", "smartphone charges"], // ~3500–4000 mAh @ 3.7 V
  [17, "minute of a microwave", "minutes of a microwave"], // 1000 W × 1 min = 16.7 Wh, DOE BTO
  [38, "single-serve coffee", "single-serve coffees"], // Keurig, Energy Star data
  // Medium
  [95, "pot of drip coffee", "pots of drip coffee"], // 900–1200 W drip, Energy Star
  [100, "laptop full charge", "laptop full charges"], // 60–100 Wh battery range
  [280, "mile driven in an EV", "miles driven in an EV"], // EPA fueleconomy.gov 2024, ~25–33 kWh/100 mi
  [300, "hour of a gaming PC", "hours of a gaming PC"], // LBNL 2019, 200–350 W under load
  [
    500,
    "hour of a window air conditioner",
    "hours of a window air conditioner",
  ], // 5000 BTU unit, DOE/AHRI
  // Large
  [1290, "load of laundry", "loads of laundry"], // Energy Star certified, cold wash
  [1500, "hour of a space heater", "hours of a space heater"], // 1500 W, NEC 210.19
  [1620, "dishwasher cycle", "dishwasher cycles"], // Energy Star standard cycle
  [3180, "hot shower", "hot showers"], // DOE Energy Saver, electric WH, 10 min @ 2 GPM
  // Very large
  [29563, "day of a US household", "days of a US household"], // EIA FAQ #97 2022: 10,791 kWh/yr ÷ 365
  [899000, "month of a US household", "months of a US household"], // EIA FAQ #97 2022: 10,791 kWh/yr ÷ 12
];

/**
 * Pick the best equivalence for a given Wh value.
 * Finds the comparison that produces the most human-readable number
 * (ideally 0.5–10 range, not "0.0003 showers" or "9000 LED blinks").
 */
function bestEquivalence(wh: number): string {
  if (wh <= 0) return "";

  let bestLabel = "";
  let bestScore = Infinity;

  for (const [unitWh, singular, plural] of EQUIVALENCES) {
    const count = wh / unitWh;
    let score: number;
    if (count >= 0.5 && count <= 10) score = 0;
    else if (count >= 0.1 && count <= 50) score = 1;
    else if (count >= 0.01 && count <= 200) score = 2;
    else score = 3 + Math.abs(Math.log10(count));

    if (score < bestScore) {
      bestScore = score;
      const n = count < 1.005 && count > 0.995 ? "1" : count.toFixed(1);
      const label = count < 1.005 && count > 0.995 ? singular : plural;
      bestLabel = `\u2248 ${n} ${label}`;
    }
  }

  return bestLabel;
}

/**
 * Pick the top N most readable equivalences for the /carbon command.
 */
function topEquivalences(wh: number, count: number = 2): string[] {
  if (wh <= 0) return [];

  type Scored = { label: string; score: number; unitWh: number };
  const scored: Scored[] = [];

  for (const [unitWh, singular, plural] of EQUIVALENCES) {
    const n = wh / unitWh;
    let score: number;
    if (n >= 0.5 && n <= 10) score = 0;
    else if (n >= 0.1 && n <= 50) score = 1;
    else if (n >= 0.01 && n <= 200) score = 2;
    else score = 3 + Math.abs(Math.log10(n));

    const fmt =
      n < 1.005 && n > 0.995
        ? `1 ${singular}`
        : n >= 100
          ? `${Math.round(n)} ${plural}`
          : `${n.toFixed(1)} ${plural}`;
    scored.push({ label: `\u2248 ${fmt}`, score, unitWh });
  }

  scored.sort((a, b) => a.score - b.score || a.unitWh - b.unitWh);

  const results: string[] = [];
  for (const entry of scored) {
    if (results.length >= count) break;
    results.push(entry.label);
  }
  return results;
}

// ── Session Reconstruction ────────────────────────────────────────────────────

/**
 * Walk the session branch and sum up energy from all assistant messages
 * that have usage data. Called on session_start and session_switch to
 * restore totals after reload or branch switch.
 */
function reconstructStats(ctx: ExtensionContext): BreathStats {
  const stats = emptyStats();
  const gridIntensity = getGridIntensity();

  try {
    const branch = ctx.sessionManager.getBranch();
    for (const entry of branch) {
      const e = entry as { role?: string; usage?: Usage; model?: string };
      if (e.role !== "assistant" || !e.usage) continue;

      const { key: _key, wh: rateWh } = resolveEnergyRate(e.model ?? "");
      const inputTokens = e.usage.input + (e.usage.cacheRead ?? 0);
      const outputTokens = e.usage.output;

      const wh = computeWh(inputTokens, outputTokens, rateWh);
      const gco2 = computeGCO2(wh, gridIntensity);

      stats.sessionWh += wh;
      stats.sessionGCO2 += gco2;
      stats.sessionInputTokens += inputTokens;
      stats.sessionOutputTokens += outputTokens;
      stats.lastModel = e.model ?? stats.lastModel;
      stats.lastRateWh = rateWh;
      stats.lastWh = wh;
      stats.lastGCO2 = gco2;
    }
  } catch {
    // Session manager may not be available in all contexts
  }

  return stats;
}

// ── Widget Renderer ───────────────────────────────────────────────────────────

/**
 * Build the footer widget lines from current stats.
 * Shown as: ⚡ 0.42 Wh · 🌍 0.03 gCO₂  (session: 2.10 Wh · 0.16 gCO₂)
 */
function renderWidget(ctx: ExtensionContext, stats: BreathStats): void {
  if (!ctx.hasUI) return;

  if (stats.sessionWh === 0 && stats.sessionGCO2 === 0) {
    ctx.ui.setWidget("dragon-breath", undefined);
    return;
  }

  const theme = ctx.ui.theme;
  const lastColor = whColor(stats.lastWh);

  const lastPart =
    stats.lastWh > 0
      ? theme.fg(
          lastColor,
          `⚡ ${fmtWh(stats.lastWh)} · 🌍 ${fmtGCO2(stats.lastGCO2)}`,
        )
      : theme.fg("dim", "⚡ —");

  const equiv = bestEquivalence(stats.sessionWh);
  const equivPart = equiv ? theme.fg("dim", ` ${equiv}`) : "";
  const sessionPart = theme.fg(
    "dim",
    `(session: ${fmtWh(stats.sessionWh)} · ${fmtGCO2(stats.sessionGCO2)}${equivPart})`,
  );
  const sep = theme.fg("dim", "  ");

  ctx.ui.setWidget("dragon-breath", [lastPart + sep + sessionPart]);
}

// ── /carbon Command ───────────────────────────────────────────────────────────

function handleCarbonCommand(ctx: ExtensionContext, stats: BreathStats): void {
  const gridIntensity = getGridIntensity();
  const region = readPantryKey("breath.gridRegion", "default") as string;
  const override = readPantrySetting<number>("breath.gridIntensity", 0);
  const gridSource =
    override > 0
      ? `custom override (${override} gCO₂/kWh)`
      : `region "${region}" (${gridIntensity} gCO₂/kWh)`;

  // Real-world equivalents — pick the most readable comparisons
  const equivLines = topEquivalences(stats.sessionWh, 3);

  const { key: modelKey } = resolveEnergyRate(stats.lastModel);
  const modelLabel = stats.lastModel || "(no turns yet)";
  const rateLabel =
    modelKey === "default"
      ? `${stats.lastRateWh.toFixed(1)} Wh/1K out (default fallback)`
      : `${stats.lastRateWh.toFixed(1)} Wh/1K out (matched "${modelKey}")`;

  const lines: string[] = [
    "🐉 Dragon Breath — Session Carbon Report",
    "",
    "  Last request",
    `    Energy   ${fmtWh(stats.lastWh)}`,
    `    Carbon   ${fmtGCO2(stats.lastGCO2)}`,
    "",
    "  Session totals",
    `    Energy   ${fmtWh(stats.sessionWh)}`,
    `    Carbon   ${fmtGCO2(stats.sessionGCO2)}`,
    `    Tokens   ${fmtTokens(stats.sessionInputTokens)} in · ${fmtTokens(stats.sessionOutputTokens)} out`,
    "",
    "  Equivalents",
    ...equivLines.map((e) => `    ${e}`),
    "",
    "  Rates used",
    `    Model    ${modelLabel}`,
    `    Energy   ${rateLabel}`,
    `    Grid     ${gridSource}`,
    "",
    "  Settings  pantry.breath.{enabled,gridRegion,gridIntensity}",
  ];

  ctx.ui.notify(lines.join("\n"), "info");
}

// ── External Usage API ──────────────────────────────────────────────────────────

/** Public API surface exposed via globalThis[Symbol.for("pantry.breath")]. */
export interface BreathAPI {
  addExternalUsage(opts: {
    inputTokens: number;
    outputTokens: number;
    model: string;
  }): void;
}

// ── Extension ─────────────────────────────────────────────────────────────────

export default function dragonBreath(pi: ExtensionAPI): void {
  let stats: BreathStats = emptyStats();

  // ── Session lifecycle ──

  pi.on("session_start", async (_event, ctx) => {
    stats = reconstructStats(ctx);

    const api: BreathAPI = {
      addExternalUsage({ inputTokens, outputTokens, model }) {
        const { wh: rateWh } = resolveEnergyRate(model);
        const wh = computeWh(inputTokens, outputTokens, rateWh);
        const gco2 = computeGCO2(wh, getGridIntensity());

        stats.lastWh = wh;
        stats.lastGCO2 = gco2;
        stats.lastModel = model;
        stats.lastRateWh = rateWh;
        stats.sessionWh += wh;
        stats.sessionGCO2 += gco2;
        stats.sessionInputTokens += inputTokens;
        stats.sessionOutputTokens += outputTokens;

        renderWidget(ctx, stats);
      },
    };

    (globalThis as any)[Symbol.for("pantry.breath")] = api;
    renderWidget(ctx, stats);
  });

  pi.on("session_shutdown", async () => {
    stats = emptyStats();
    (globalThis as any)[Symbol.for("pantry.breath")] = undefined;
  });

  // ── Turn tracking ──

  pi.on("turn_end", async (event, ctx) => {
    if (!getEnabled()) return;

    const msg = event.message;
    if (msg.role !== "assistant") return;

    // AssistantMessage has usage and model; cast via any because AgentMessage is a union
    const assistant = msg as any;
    const usage: Usage | undefined = assistant.usage;
    const model: string = assistant.model ?? "";

    if (!usage) return;

    const { wh: rateWh } = resolveEnergyRate(model);
    const inputTokens = (usage.input ?? 0) + (usage.cacheRead ?? 0);
    const outputTokens = usage.output ?? 0;

    const wh = computeWh(inputTokens, outputTokens, rateWh);
    const gco2 = computeGCO2(wh, getGridIntensity());

    stats.lastWh = wh;
    stats.lastGCO2 = gco2;
    stats.lastModel = model;
    stats.lastRateWh = rateWh;
    stats.sessionWh += wh;
    stats.sessionGCO2 += gco2;
    stats.sessionInputTokens += inputTokens;
    stats.sessionOutputTokens += outputTokens;

    renderWidget(ctx, stats);
  });

  // ── /carbon command ──

  pi.registerCommand("carbon", {
    description: "Show session energy and carbon footprint breakdown",
    handler: async (_args, ctx) => {
      handleCarbonCommand(ctx, stats);
    },
  });
}
