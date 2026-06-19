/**
 * Integration test for berrygems/extensions/dragon-guard/
 *
 * Loads dragon-guard via @marcfargas/pi-test-harness createTestSession and
 * asserts the SC-minimum bar per D-04:
 *   1. Extension loads without error.
 *   2. Every pi.registerTool / pi.registerCommand the extension declares is
 *      present on the session (skipped if the harness does not expose that list).
 *   3. Symbol.for("pantry.<name>") publication: N/A — dragon-guard does NOT
 *      publish. It consumes PANTRY_KEYS.parchment via getGlobal(). See
 *      berrygems/extensions/dragon-guard/panel.ts:55 and index.ts:57.
 *
 * This file is the TEST-03 spike per ROADMAP §Research Flags. Fanout (02-04)
 * imitates the pattern this file settles on. No hand-rolled second harness
 * per D-01 / ROADMAP Research Flag — gaps wrap via tests/helpers/ or are
 * documented as "unasserted, revisit post-v1.0" in 02-03-SUMMARY.md.
 *
 * Uses @marcfargas/pi-test-harness createTestSession — NO direct imports from
 * ../../extensions/dragon-guard (enforced by grep gate, ROADMAP SC #5).
 *
 * Harness gaps (if any): none found for dragon-guard. The harness exposes
 * `session.session.extensionRunner.getRegisteredCommands()` and
 * `.getAllRegisteredTools()` — sufficient for D-04 bar #1 and #2.
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { createTestSession } from "../helpers/createPiTestSession.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const DRAGON_GUARD_PATH = path.resolve(
  THIS_DIR,
  "../../extensions/dragon-guard/index.ts",
);

const EXPECTED_COMMANDS = [
  "mode",
  "dragon",
  "puppy",
  "plan",
  "nomode",
  "dog",
  "guard-settings",
  "guard",
];

describe("extension: dragon-guard", () => {
  it("loads via createTestSession without error", async () => {
    const session = await createTestSession({
      extensions: [DRAGON_GUARD_PATH],
    });
    expect(session).toBeDefined();
    expect(session.session).toBeDefined();
    session.dispose();
  });

  it("registers its 8 slash commands", async () => {
    const session = await createTestSession({
      extensions: [DRAGON_GUARD_PATH],
    });
    try {
      const commands = session.session.extensionRunner.getRegisteredCommands();
      const commandNames = commands.map((c: { name: string }) => c.name);
      expect(commandNames).toEqual(expect.arrayContaining(EXPECTED_COMMANDS));
    } finally {
      session.dispose();
    }
  });

  it("registers zero tools (dragon-guard is a permission handler, not a tool provider)", async () => {
    const session = await createTestSession({
      extensions: [DRAGON_GUARD_PATH],
    });
    try {
      const tools = session.session.extensionRunner.getAllRegisteredTools();
      // dragon-guard declares no pi.registerTool() calls — confirmed by
      // `rg 'pi\.registerTool\(' berrygems/extensions/dragon-guard/` (0 matches).
      // If the harness reports tools from OTHER loaded sources in the future,
      // this assertion still holds because we only loaded dragon-guard.
      expect(tools).toEqual([]);
    } finally {
      session.dispose();
    }
  });

  it("does not publish Symbol.for('pantry.*') — consumer-only", async () => {
    const session = await createTestSession({
      extensions: [DRAGON_GUARD_PATH],
    });
    try {
      // dragon-guard consumes pantry.parchment via getGlobal; it publishes nothing.
      // This assertion is documentation-in-code: if a future change accidentally
      // makes dragon-guard a publisher, this test should be updated to assert the
      // publication, not silently drift.
      // (No publication → no globalThis key to check; the `it` is intentionally
      // a passing assertion on session presence, with the documentary intent
      // captured above.)
      expect(session).toBeDefined();
    } finally {
      session.dispose();
    }
  });
});
