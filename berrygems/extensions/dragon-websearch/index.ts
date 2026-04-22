import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readPantrySetting } from "../../lib/settings";

// ─── Settings ───────────────────────────────────────────────────────────────

interface WebSearchSettings {
  enabled: boolean;
  backend: "zai" | "brave" | "searxng";
  braveApiKey?: string;
  searxngUrl?: string;
  zaiModel?: string;
  maxResults: number;
}

function loadSettings(): WebSearchSettings {
  const raw = readPantrySetting("websearch", {}) as Partial<WebSearchSettings>;
  return {
    enabled: raw.enabled ?? true,
    backend: raw.backend ?? "zai",
    braveApiKey: raw.braveApiKey,
    searxngUrl: raw.searxngUrl,
    zaiModel: raw.zaiModel ?? "glm-4-flash",
    maxResults: raw.maxResults ?? 5,
  };
}

// ─── Search backends ────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Search via zai's regular API endpoint (NOT the coding endpoint).
 * The coding endpoint (api.z.ai) doesn't support web_search tools.
 * The regular endpoint (open.bigmodel.cn) does.
 */
async function searchZai(
  query: string,
  apiKey: string,
  model: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const res = await fetch(
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: query }],
        tools: [{ type: "web_search", web_search: { enable: true } }],
        max_tokens: 2048,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zai API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const choices = (data.choices as Array<Record<string, unknown>>) ?? [];
  const message = (choices[0]?.message as Record<string, unknown>) ?? {};
  const content = String(message.content ?? "");

  // Check for web search tool call metadata in the response
  const toolCalls = message.tool_calls as
    | Array<Record<string, unknown>>
    | undefined;
  if (toolCalls) {
    const webSearchCall = toolCalls.find(
      (t) => (t as Record<string, unknown>).type === "web_search",
    );
    if (webSearchCall) {
      const webSearch = webSearchCall.web_search as
        | Record<string, unknown>
        | undefined;
      const searchResults =
        (webSearch?.search_results as Array<Record<string, unknown>>) ?? [];
      if (searchResults.length > 0) {
        return searchResults
          .map((r) => ({
            title: String(r.title ?? ""),
            url: String(r.link ?? r.url ?? ""),
            snippet: String(r.content ?? r.description ?? ""),
          }))
          .slice(0, maxResults);
      }
    }
  }

  // Fallback: extract URLs from the response content
  const urlRegex = /https?:\/\/[^\s\])>"']+/g;
  const urls = content.match(urlRegex) ?? [];
  if (urls.length > 0) {
    return urls.slice(0, maxResults).map((url) => ({
      title: "Zai search result",
      url,
      snippet: content.slice(0, 300),
    }));
  }

  // No parseable results — return the raw content as a single result
  return [{ title: "Zai response", url: "", snippet: content }];
}

/**
 * Search via Brave Search API.
 */
async function searchBrave(
  query: string,
  apiKey: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    count: String(maxResults),
  });
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?${params}`,
    {
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
      },
    },
  );
  if (!res.ok)
    throw new Error(`Brave Search API error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as Record<string, unknown>;
  const web = (data.web as Array<Record<string, unknown>>) ?? [];
  return web
    .map((r) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      snippet: String(r.description ?? ""),
    }))
    .slice(0, maxResults);
}

/**
 * Search via a self-hosted SearXNG instance.
 */
async function searchSearxng(
  query: string,
  instanceUrl: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    max_results: String(maxResults),
  });
  const url = `${instanceUrl.replace(/\/+$/, "")}/search?${params}`;
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`SearXNG error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data
    .map((r) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      snippet: String(r.content ?? ""),
    }))
    .slice(0, maxResults);
}

// ─── Formatting ─────────────────────────────────────────────────────────────

function formatResults(results: SearchResult[]): string {
  if (results.length === 0) return "No results found.";
  return results
    .map((r, i) => {
      const urlLine = r.url ? r.url : "";
      return `**[${i + 1}] ${r.title}**\n${urlLine}\n${r.snippet}`;
    })
    .join("\n\n");
}

// ─── Auth helper ────────────────────────────────────────────────────────────

async function getZaiApiKey(): Promise<string | null> {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const home = process.env["HOME"] ?? "";
    const authPath = path.join(home, ".pi", "agent", "auth.json");
    const content = fs.readFileSync(authPath, "utf-8");
    const auth = JSON.parse(content);

    // Try common key shapes
    const entry = auth?.["zai"];
    if (!entry) return null;
    return typeof entry === "string"
      ? entry
      : (((entry as Record<string, unknown>).key as string) ?? null);
  } catch {
    return null;
  }
}

// ─── Extension entry point ─────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const settings = loadSettings();

  if (!settings.enabled) return;

  const SearchParams = Type.Object({
    query: Type.String({ description: "Search query" }),
  });

  (pi.registerTool as any)({
    name: "web_search",
    description:
      "Search the web for current information. Use when you need up-to-date facts, recent events, documentation, or anything not in your training data.",
    params: SearchParams,
    promptSnippet: "web_search — search the web for current information",
    renderCall(args: Record<string, unknown>) {
      return [`🔍 ${args.query}`];
    },
    async execute(_id: string, params: any, _signal: any, onUpdate: any) {
      onUpdate?.({
        type: "progress",
        detail: `Searching for: ${params.query}`,
      });

      try {
        let results: SearchResult[];

        switch (settings.backend) {
          case "brave": {
            if (!settings.braveApiKey) {
              return {
                output:
                  "Brave search requires `pantry.websearch.braveApiKey` in settings.",
              };
            }
            results = await searchBrave(
              params.query,
              settings.braveApiKey,
              settings.maxResults,
            );
            break;
          }

          case "searxng": {
            if (!settings.searxngUrl) {
              return {
                output:
                  "SearXNG requires `pantry.websearch.searxngUrl` in settings.",
              };
            }
            results = await searchSearxng(
              params.query,
              settings.searxngUrl,
              settings.maxResults,
            );
            break;
          }

          case "zai":
          default: {
            const apiKey = await getZaiApiKey();
            if (!apiKey) {
              onUpdate?.({ type: "progress", detail: "No zai API key found" });
              return {
                output: [
                  "No zai API key found in ~/.pi/agent/auth.json.",
                  "",
                  "Options:",
                  "- Add a `zai` entry to auth.json",
                  '- Switch backend: `pantry.websearch.backend` = "brave" or "searxng"',
                ].join("\n"),
              };
            }
            const zaiModel = settings.zaiModel ?? "glm-4-flash";
            onUpdate?.({
              type: "progress",
              detail: `Querying zai (${zaiModel})...`,
            });
            results = await searchZai(
              params.query,
              apiKey,
              zaiModel,
              settings.maxResults,
            );
            break;
          }
        }

        onUpdate?.({
          type: "progress",
          detail: `Found ${results.length} results`,
        });
        return {
          output: formatResults(results),
          details: {
            query: params.query,
            count: results.length,
            source: settings.backend,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { output: `Web search failed: ${msg}` };
      }
    },
  });
}
