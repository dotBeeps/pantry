/**
 * Integration test for berrygems/extensions/dragon-scroll.ts
 *
 * SC-minimum bar per D-04:
 *   1. Extension loads without error via createTestSession.
 *   2. Registers 1 command: "popup". Registers 2 tools: "popup", "close_popup".
 *   3. Publication: N/A — does not call registerGlobal (consumer).
 *
 * No direct ../../extensions/ imports (SC #5 grep gate).
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { createTestSession } from "../helpers/createPiTestSession.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(THIS_DIR, "../../extensions/dragon-scroll.ts");

const EXPECTED_COMMANDS = ["popup"];
const EXPECTED_TOOLS = ["popup", "close_popup"];

describe("extension: dragon-scroll", () => {
  it("loads via createTestSession without error", async () => {
    const session = await createTestSession({ extensions: [EXT_PATH] });
    expect(session).toBeDefined();
    expect(session.session).toBeDefined();
    session.dispose();
  });

  it("registers its 1 slash command", async () => {
    const session = await createTestSession({ extensions: [EXT_PATH] });
    try {
      const commands = session.session.extensionRunner.getRegisteredCommands();
      const names = commands.map((c: { name: string }) => c.name);
      expect(names).toEqual(expect.arrayContaining(EXPECTED_COMMANDS));
    } finally {
      session.dispose();
    }
  });

  it("registers its 2 tools", async () => {
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
