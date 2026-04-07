/**
 * D3-SoulGem pi extension
 *
 * Bridges the LLM ↔ SoulGem HTTP API ↔ D3-Leylines WebSocket.
 *
 * On session start: fetches tool definitions from SoulGem and registers them
 * with pi so the LLM can call Minecraft actions as native tools.
 *
 * Tool calls: intercepted here, forwarded to SoulGem POST /api/command,
 * awaited until Leylines resolves the goal, result returned to LLM.
 *
 * Install: symlink or copy to ~/.pi/extensions/soulgem.js
 *   ln -s /path/to/dragon-cubed/soulgem/extension/soulgem.js ~/.pi/extensions/
 */

const SOULGEM_URL = process.env.SOULGEM_URL ?? "http://localhost:8766";

// ── Tool registration ─────────────────────────────────────────────────────────

/**
 * Fetch tool definitions from SoulGem and register them with pi.
 * Called at session start. If SoulGem isn't running, logs a warning and skips.
 */
async function registerTools(pi) {
  let toolDefs;
  try {
    const res = await fetch(`${SOULGEM_URL}/api/tools`);
    if (!res.ok) {
      pi.log.warn(`[soulgem] GET /api/tools returned ${res.status} — is SoulGem running?`);
      return;
    }
    toolDefs = await res.json();
  } catch (err) {
    pi.log.warn(`[soulgem] Could not reach SoulGem at ${SOULGEM_URL}: ${err.message}`);
    return;
  }

  for (const tool of toolDefs) {
    pi.tools.register({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([k, v]) => [
            k,
            { type: v.type, description: v.description },
          ])
        ),
        required: tool.required ?? [],
      },
      // Attach routing metadata for the handler below
      _capability: tool.capability,
      _action: tool.action,
    });
  }

  pi.log.info(`[soulgem] Registered ${toolDefs.length} Minecraft tools from Leylines`);
}

// ── Tool call handler ─────────────────────────────────────────────────────────

/**
 * Intercept tool calls for registered Minecraft tools and forward to SoulGem.
 *
 * SoulGem blocks until the goal resolves (completed or failed) and returns:
 *   { cmdId, completed, event, data }
 */
async function handleToolCall(pi, toolName, params, toolMeta) {
  const capability = toolMeta._capability;
  const action     = toolMeta._action;

  if (!capability || !action) {
    return { error: `[soulgem] Tool ${toolName} has no routing metadata` };
  }

  pi.log.info(`[soulgem] → ${capability}/${action}`, params);

  let result;
  try {
    const res = await fetch(`${SOULGEM_URL}/api/command`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ capability, action, params }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { error: `[soulgem] command failed (${res.status}): ${text}` };
    }

    result = await res.json();
  } catch (err) {
    return { error: `[soulgem] network error dispatching command: ${err.message}` };
  }

  if (!result.completed) {
    return {
      result: `Action failed: ${result.event}`,
      details: result.data ?? {},
    };
  }

  return {
    result: `Action completed: ${toolName}`,
    details: result.data ?? {},
  };
}

// ── Pi extension hooks ────────────────────────────────────────────────────────

export default {
  name: "soulgem",
  version: "0.1.0",
  description: "Connects pi agents to Minecraft via D3-SoulGem and D3-Leylines",

  async onSessionStart(pi) {
    await registerTools(pi);
  },

  async onToolCall(pi, toolName, params, toolMeta) {
    // Only handle tools we registered (capability routing metadata present)
    if (!toolMeta?._capability) return null; // pass through to other handlers
    return handleToolCall(pi, toolName, params, toolMeta);
  },
};
