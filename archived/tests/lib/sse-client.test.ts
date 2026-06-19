/**
 * Unit tests for berrygems/lib/sse-client.ts
 *
 * Coverage: connectSSE returns a handle whose close() is safe to call even
 * when the backing TCP connect never succeeds (http.get against a closed
 * port). The SSE data-line parser is internal and inlined inside the res.on
 * callback, so it's covered indirectly by TEST-03 extension integration
 * tests (dragon-websearch talks to a local SSE endpoint under pi-test-harness).
 * NOT covered here: live HTTP streaming, reconnect backoff timing, data
 * parsing over the wire.
 * See 02-CONTEXT.md §D-07.
 */
import { describe, it, expect } from "vitest";
import { connectSSE } from "../../lib/sse-client.ts";

describe("lib/sse-client — connectSSE", () => {
  it("returns a handle with connected and close() on an unreachable endpoint", () => {
    // Port 1 is reserved (tcpmux); in practice no server will be listening.
    // We don't assert connect success — just that the handle shape is correct
    // and close() is a no-op-safe idempotent teardown.
    const client = connectSSE({
      port: 1,
      onData: () => {},
      onError: () => {},
      reconnect: false,
    });
    expect(typeof client.close).toBe("function");
    expect(typeof client.connected).toBe("boolean");
    expect(() => client.close()).not.toThrow();
    expect(() => client.close()).not.toThrow();
  });
});
