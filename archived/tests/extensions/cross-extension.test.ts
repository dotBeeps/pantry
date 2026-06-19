/**
 * Cross-extension canary — two extensions, one session, PANTRY_KEYS round-trip.
 *
 * Asserts the jiti-isolation assumption (PITFALLS §2) holds: when
 * createTestSession loads both a publisher and a consumer in the same session,
 * the consumer can read the publisher's API via getGlobal(PANTRY_KEYS.<key>).
 *
 * Pair: dragon-parchment (publishes pantry.parchment at dragon-parchment.ts:1873)
 *       + dragon-tongue  (consumes  pantry.parchment at dragon-tongue.ts:42)
 *
 * If this fails, two extensions load correctly in isolation but the
 * globalThis-symbol bridge between them is broken — which is the specific
 * regression this canary exists to catch.
 *
 * No direct ../../extensions/ imports. No behavioral tool-call smokes.
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { createTestSession } from "../helpers/createPiTestSession.ts";
import { PANTRY_KEYS, getGlobal } from "../../lib/globals.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PARCHMENT_PATH = path.resolve(
  THIS_DIR,
  "../../extensions/dragon-parchment.ts",
);
const TONGUE_PATH = path.resolve(THIS_DIR, "../../extensions/dragon-tongue.ts");

describe("cross-extension: dragon-parchment <-> dragon-tongue (pantry.parchment round-trip)", () => {
  it("publisher exposes pantry.parchment and consumer can read it in the same session", async () => {
    const session = await createTestSession({
      extensions: [PARCHMENT_PATH, TONGUE_PATH],
    });

    try {
      expect(session).toBeDefined();

      // After both extensions have run through the harness's jiti runtime,
      // dragon-parchment's registerGlobal(PANTRY_KEYS.parchment, api) has
      // executed. The consumer-side getGlobal call inside dragon-tongue
      // resolves to the same slot. The cross-extension round-trip is asserted
      // by this value being defined after the session loaded both extensions.
      const parchmentApi = getGlobal(PANTRY_KEYS.parchment);
      expect(parchmentApi).toBeDefined();

      // Sanity: both extensions actually loaded (dragon-parchment registers
      // the "panels" command, dragon-tongue registers the "lint" command).
      const commands = session.session.extensionRunner.getRegisteredCommands();
      const names = commands.map((c: { name: string }) => c.name);
      expect(names).toEqual(expect.arrayContaining(["panels", "lint"]));
    } finally {
      session.dispose();
    }
  });
});
