/**
 * Integration test for berrygems/extensions/dragon-parchment.ts
 *
 * SC-minimum bar per D-04:
 *   1. Extension loads without error via createTestSession.
 *   2. Registers 1 command: "panels". Registers 0 tools.
 *   3. Publication: publishes Symbol.for("pantry.parchment") at line 1873.
 *
 * No direct ../../extensions/ imports (SC #5 grep gate).
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { createTestSession } from "../helpers/createPiTestSession.ts";
import { PANTRY_KEYS, getGlobal } from "../../lib/globals.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(THIS_DIR, "../../extensions/dragon-parchment.ts");

const EXPECTED_COMMANDS = ["panels"];

describe("extension: dragon-parchment", () => {
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

  it("registers zero tools", async () => {
    const session = await createTestSession({ extensions: [EXT_PATH] });
    try {
      const tools = session.session.extensionRunner.getAllRegisteredTools();
      expect(tools).toEqual([]);
    } finally {
      session.dispose();
    }
  });

  it("publishes Symbol.for('pantry.parchment') on globalThis", async () => {
    const session = await createTestSession({ extensions: [EXT_PATH] });
    try {
      expect(getGlobal(PANTRY_KEYS.parchment)).toBeDefined();
    } finally {
      session.dispose();
    }
  });
});
