/**
 * Integration test for berrygems/extensions/kitty-gif-renderer.ts
 *
 * SC-minimum bar per D-04:
 *   1. Extension loads without error via createTestSession.
 *   2. Registers 0 commands and 0 tools.
 *   3. Publication: publishes Symbol.for("pantry.kitty") at line 181.
 *
 * No direct ../../extensions/ imports (SC #5 grep gate).
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { createTestSession } from "../helpers/createPiTestSession.ts";
import { PANTRY_KEYS, getGlobal } from "../../lib/globals.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(
  THIS_DIR,
  "../../extensions/kitty-gif-renderer.ts",
);

describe("extension: kitty-gif-renderer", () => {
  it("loads via createTestSession without error", async () => {
    const session = await createTestSession({ extensions: [EXT_PATH] });
    expect(session).toBeDefined();
    expect(session.session).toBeDefined();
    session.dispose();
  });

  it("registers zero commands and zero tools (publisher-only surface)", async () => {
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

  it("publishes Symbol.for('pantry.kitty') on globalThis", async () => {
    const session = await createTestSession({ extensions: [EXT_PATH] });
    try {
      expect(getGlobal(PANTRY_KEYS.kitty)).toBeDefined();
    } finally {
      session.dispose();
    }
  });
});
