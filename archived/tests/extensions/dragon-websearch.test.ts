/**
 * Integration test for berrygems/extensions/dragon-websearch/
 *
 * SC-minimum bar per D-04:
 *   1. Extension loads without error via createTestSession.
 *   2. Registers 0 commands. Registers 1 tool: "web_search" (registered via
 *      `(pi.registerTool as any)(...)` at index.ts:219).
 *   3. Publication: N/A — does not call registerGlobal.
 *
 * No direct ../../extensions/ imports (SC #5 grep gate).
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { createTestSession } from "../helpers/createPiTestSession.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(
  THIS_DIR,
  "../../extensions/dragon-websearch/index.ts",
);

const EXPECTED_TOOLS = ["web_search"];

describe("extension: dragon-websearch", () => {
  it("loads via createTestSession without error", async () => {
    const session = await createTestSession({ extensions: [EXT_PATH] });
    expect(session).toBeDefined();
    expect(session.session).toBeDefined();
    session.dispose();
  });

  it("registers zero commands", async () => {
    const session = await createTestSession({ extensions: [EXT_PATH] });
    try {
      const commands = session.session.extensionRunner.getRegisteredCommands();
      expect(commands).toEqual([]);
    } finally {
      session.dispose();
    }
  });

  it("registers its 1 tool", async () => {
    const session = await createTestSession({ extensions: [EXT_PATH] });
    try {
      const tools = session.session.extensionRunner.getAllRegisteredTools();
      const names = tools.map(
        (t: { definition: { name: string } }) => t.definition.name,
      );
      expect(names).toEqual(expect.arrayContaining(EXPECTED_TOOLS));
    } finally {
      session.dispose();
    }
  });
});
