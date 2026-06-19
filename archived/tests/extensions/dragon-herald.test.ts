/**
 * Integration test for berrygems/extensions/dragon-herald.ts
 *
 * SC-minimum bar per D-04:
 *   1. Extension loads without error via createTestSession.
 *   2. Registers 0 commands and 0 tools (live inventory: no pi.registerTool
 *      or pi.registerCommand calls — dragon-herald integrates via other
 *      surfaces, e.g. event hooks).
 *   3. Publication: N/A — does not call registerGlobal.
 *
 * No direct ../../extensions/ imports (SC #5 grep gate).
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { createTestSession } from "../helpers/createPiTestSession.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(THIS_DIR, "../../extensions/dragon-herald.ts");

describe("extension: dragon-herald", () => {
  it("loads via createTestSession without error", async () => {
    const session = await createTestSession({ extensions: [EXT_PATH] });
    expect(session).toBeDefined();
    expect(session.session).toBeDefined();
    session.dispose();
  });

  it("registers zero commands and zero tools (integrates via other surfaces)", async () => {
    const session = await createTestSession({ extensions: [EXT_PATH] });
    try {
      const commands = session.session.extensionRunner.getRegisteredCommands();
      const tools = session.session.extensionRunner.getAllRegisteredTools();
      expect(commands).toEqual([]);
      expect(tools).toEqual([]);
    } finally {
      session.dispose();
    }
  });
});
