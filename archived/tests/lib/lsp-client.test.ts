/**
 * Unit tests for berrygems/lib/lsp-client.ts
 *
 * Coverage: pure helpers exposed from the module — languageIdForFile() mapping.
 * NOT covered here: child_process.spawn, JSON-RPC request/response loop,
 * LSP framing (Content-Length header + body) read/write, diagnostic stream,
 * server lifecycle (start/openFile/dispose). The framing writer is
 * module-private and the transport requires a real LSP server; those paths
 * are exercised indirectly via TEST-03 extension integration tests.
 * See 02-CONTEXT.md §D-07.
 */
import { describe, it, expect } from "vitest";
import { LspClient, languageIdForFile } from "../../lib/lsp-client.ts";

describe("lib/lsp-client — languageIdForFile", () => {
  it("maps common extensions to their LSP languageIds", () => {
    expect(languageIdForFile("src/foo.ts", "plain")).toBe("typescript");
    expect(languageIdForFile("src/foo.tsx", "plain")).toBe("typescriptreact");
    expect(languageIdForFile("src/foo.go", "plain")).toBe("go");
    expect(languageIdForFile("src/foo.py", "plain")).toBe("python");
    expect(languageIdForFile("src/foo.rs", "plain")).toBe("rust");
  });

  it("returns the provided default for unrecognized extensions", () => {
    expect(languageIdForFile("README.md", "plain")).toBe("plain");
    expect(languageIdForFile("archive.tar.gz", "whatever")).toBe("whatever");
  });
});

describe("lib/lsp-client — LspClient construction", () => {
  it("reports isRunning=false and isReady=false before start()", () => {
    const client = new LspClient("/tmp/nowhere", {
      name: "FakeLSP",
      command: "nonexistent-server",
      args: ["--stdio"],
      languageId: "typescript",
      fileExtensions: [".ts"],
      watchDirs: ["."],
    });
    expect(client.isRunning).toBe(false);
    expect(client.isReady).toBe(false);
    expect(client.serverName).toBe("FakeLSP");
  });

  it("dispose() on an unstarted client is a no-op that does not throw", async () => {
    const client = new LspClient("/tmp/nowhere", {
      name: "FakeLSP",
      command: "nonexistent-server",
      args: [],
      languageId: "typescript",
      fileExtensions: [".ts"],
      watchDirs: ["."],
    });
    await expect(client.dispose()).resolves.toBeUndefined();
  });
});
