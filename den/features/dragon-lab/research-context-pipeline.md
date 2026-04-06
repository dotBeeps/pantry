# Code Context: pi-mono Context Management Investigation

## Files Retrieved

1. **`/home/dot/Development/pi-mono/packages/ai/src/providers/anthropic.ts`** (lines 1-900+)
   - Complete Anthropic provider implementation
   - Payload construction, client creation, beta headers
   - Cache control implementation for prompt caching

2. **`/home/dot/Development/pi-mono/packages/ai/src/types.ts`** (lines 60-110)
   - StreamOptions interface with onPayload callback
   - ProviderStreamOptions type definition

3. **`/home/dot/Development/pi-mono/packages/coding-agent/src/core/sdk.ts`** (lines 310-330)
   - onPayload callback wiring into provider options
   - Extension runner integration

4. **`/home/dot/Development/pi-mono/packages/coding-agent/src/core/extensions/runner.ts`** (lines 746-775)
   - emitBeforeProviderRequest event handler
   - Payload pass-through mechanism

5. **`/home/dot/Development/pi-mono/packages/coding-agent/src/core/extensions/types.ts`** (lines 540-560)
   - BeforeProviderRequestEvent interface definition

6. **`/home/dot/Development/pi-mono/packages/coding-agent/examples/extensions/provider-payload.ts`** (full file)
   - Example extension showing before_provider_request usage

7. **`/home/dot/Development/pi-mono/packages/coding-agent/src/core/agent-session.ts`** (lines 1584-1700+)
   - compact() method implementation
   - Compaction event flow

8. **`/home/dot/Development/pi-mono/packages/coding-agent/src/core/compaction/compaction.ts`** (lines 1-150)
   - Compaction logic and types

---

## Key Code Findings

### 1. Anthropic Provider Implementation

**File:** `packages/ai/src/providers/anthropic.ts`

#### Payload Construction (`buildParams` function, lines 615-750)

The Anthropic provider builds a **fresh `MessageCreateParamsStreaming` object** with explicitly selected fields:

```typescript
function buildParams(
	model: Model<"anthropic-messages">,
	context: Context,
	isOAuthToken: boolean,
	options?: AnthropicOptions,
): MessageCreateParamsStreaming {
	const { cacheControl } = getCacheControl(model.baseUrl, options?.cacheRetention);
	const params: MessageCreateParamsStreaming = {
		model: model.id,
		messages: convertMessages(context.messages, model, isOAuthToken, cacheControl),
		max_tokens: options?.maxTokens || (model.maxTokens / 3) | 0,
		stream: true,
	};
	// ... system prompt, tools, thinking, metadata, toolChoice added explicitly ...
	return params;
}
```

**Critical insight:** This is NOT a spread operation. The function manually picks known fields and constructs a typed object. Any extra fields must either:
- Be added explicitly in this function, OR
- Be added via the `onPayload` callback

#### onPayload Callback Integration (lines 254-259)

```typescript
let params = buildParams(model, context, isOAuth, options);
const nextParams = await options?.onPayload?.(params, model);
if (nextParams !== undefined) {
	params = nextParams as MessageCreateParamsStreaming;
}
const anthropicStream = client.messages.stream({ ...params, stream: true }, { signal: options?.signal });
```

**Critical insight:**
- Extensions can modify the payload via `onPayload`
- The returned payload is **spread into the stream call**: `{ ...params, stream: true }`
- This means extra fields in the payload **will be passed to the Anthropic SDK**

**Key question:** Does the Anthropic SDK pass unknown fields through to the API?
- **Short answer:** Likely YES, but with caveats (see below)
- The SDK is used as `client.messages.stream(requestPayload, options)` where requestPayload is spread from params
- Modern Anthropic SDK versions are designed to be forward-compatible with new API fields
- However, fields not in the TypeScript types will need `as any` casting or be handled via the `MessageCreateParamsStreaming` type union

#### Client Creation & Beta Headers (lines 524-600)

The Anthropic client is created with `defaultHeaders` that include beta features:

```typescript
// For standard API key auth:
const client = new Anthropic({
	apiKey,
	baseURL: model.baseUrl,
	dangerouslyAllowBrowser: true,
	defaultHeaders: mergeHeaders(
		{
			accept: "application/json",
			"anthropic-dangerous-direct-browser-access": "true",
			"anthropic-beta": betaFeatures.join(","),
		},
		model.headers,
		optionsHeaders,
	),
});
```

Current beta features (line 560):
- `"fine-grained-tool-streaming-2025-05-14"`
- `"interleaved-thinking-2025-05-14"` (conditionally)

**Critical insight:** Beta headers are hardcoded per auth type:
- **API key auth:** `fine-grained-tool-streaming-2025-05-14` + optional `interleaved-thinking-2025-05-14`
- **OAuth (Claude Code):** `claude-code-20250219,oauth-2025-04-20` + full betaFeatures
- **GitHub Copilot:** Selective beta features (no fine-grained-tool-streaming)

**MISSING:** `anthropic-beta: context-management-2025-06-27` is NOT currently included.

### 2. Prompt Caching Implementation

**File:** `packages/ai/src/providers/anthropic.ts`

Anthropic prompt caching (cache_control) IS implemented:

#### Cache Control Setup (lines 49-64)

```typescript
function getCacheControl(
	baseUrl: string,
	cacheRetention?: CacheRetention,
): { retention: CacheRetention; cacheControl?: { type: "ephemeral"; ttl?: "1h" } } {
	const retention = resolveCacheRetention(cacheRetention);
	if (retention === "none") {
		return { retention };
	}
	const ttl = retention === "long" && baseUrl.includes("api.anthropic.com") ? "1h" : undefined;
	return {
		retention,
		cacheControl: { type: "ephemeral", ...(ttl && { ttl }) },
	};
}
```

#### Applied to Content Blocks (lines 840-860)

Cache control is added to:
1. **System prompt** (lines 627, 634, 643)
2. **Last user message** (lines 850-860)

```typescript
// Add cache_control to the last user message to cache conversation history
if (cacheControl && params.length > 0) {
	const lastMessage = params[params.length - 1];
	if (lastMessage.role === "user") {
		if (Array.isArray(lastMessage.content)) {
			const lastBlock = lastMessage.content[lastMessage.content.length - 1];
			if (lastBlock && (lastBlock.type === "text" || lastBlock.type === "image" || lastBlock.type === "tool_result")) {
				(lastBlock as any).cache_control = cacheControl;
			}
		} else if (typeof lastMessage.content === "string") {
			lastMessage.content = [
				{
					type: "text",
					text: lastMessage.content,
					cache_control: cacheControl,
				},
			] as any;
		}
	}
}
```

**Insight:** Cache control is applied as a content block property, not at the message level. This means `context_management` (which operates on cached content) could work with existing cache blocks.

### 3. before_provider_request Event Flow

**Files:**
- `coding-agent/src/core/extensions/runner.ts` (lines 746-775)
- `coding-agent/src/core/sdk.ts` (lines 310-330)
- `coding-agent/src/core/extensions/types.ts` (lines 546-548)

#### Event Definition

```typescript
export interface BeforeProviderRequestEvent {
	type: "before_provider_request";
	payload: unknown;
}

export type BeforeProviderRequestEventResult = unknown;
```

#### Handler Execution (runner.ts)

```typescript
async emitBeforeProviderRequest(payload: unknown): Promise<unknown> {
	let currentPayload = payload;
	for (const ext of this.extensions) {
		const handlers = ext.handlers.get("before_provider_request");
		if (!handlers || handlers.length === 0) continue;

		for (const handler of handlers) {
			try {
				const event: BeforeProviderRequestEvent = {
					type: "before_provider_request",
					payload: currentPayload,
				};
				const handlerResult = await handler(event, ctx);
				if (handlerResult !== undefined) {
					currentPayload = handlerResult;
				}
			} catch (err) {
				// Error handling...
			}
		}
	}
	return currentPayload;
}
```

**Key behavior:**
- Payload is passed through handlers in extension load order
- Each handler can return `undefined` (keep payload) or a new payload
- Returned payload becomes input to next handler
- Final payload is used directly for the API request

#### Hook Location (sdk.ts)

```typescript
onPayload: async (payload, _model) => {
	const runner = extensionRunnerRef.current;
	if (!runner?.hasHandlers("before_provider_request")) {
		return payload;
	}
	return runner.emitBeforeProviderRequest(payload);
},
```

### 4. Type System for Payload Modification

**File:** `packages/ai/src/types.ts`

#### StreamOptions.onPayload Definition (lines 77-81)

```typescript
/**
 * Optional callback for inspecting or replacing provider payloads before sending.
 * Return undefined to keep the payload unchanged.
 */
onPayload?: (payload: unknown, model: Model<Api>) => unknown | undefined | Promise<unknown | undefined>;
```

#### ProviderStreamOptions (line 105)

```typescript
export type ProviderStreamOptions = StreamOptions & Record<string, unknown>;
```

**Critical insight:** `ProviderStreamOptions` allows any additional fields beyond `StreamOptions`. This is the type hint that extensions can pass arbitrary fields.

### 5. Compact() Implementation

**File:** `packages/coding-agent/src/core/agent-session.ts` (lines 1584-1700)

```typescript
async compact(customInstructions?: string): Promise<CompactionResult> {
	// ... abort and setup ...
	
	// Hook 1: session_before_compact event
	if (this._extensionRunner?.hasHandlers("session_before_compact")) {
		const result = (await this._extensionRunner.emit({
			type: "session_before_compact",
			preparation,
			branchEntries: pathEntries,
			customInstructions,
			signal: this._compactionAbortController.signal,
		})) as SessionBeforeCompactResult | undefined;

		if (result?.cancel) {
			throw new Error("Compaction cancelled");
		}

		if (result?.compaction) {
			extensionCompaction = result.compaction;
			fromExtension = true;
		}
	}

	// Actual compaction (if not overridden by extension)
	if (extensionCompaction) {
		summary = extensionCompaction.summary;
		// ...
	} else {
		const result = await compact(preparation, this.model, apiKey, headers, customInstructions, signal);
		// ...
	}

	// Hook 2: session_compact event (after compaction saved)
	if (this._extensionRunner && savedCompactionEntry) {
		await this._extensionRunner.emit({
			type: "session_compact",
			compactionEntry: savedCompactionEntry,
			fromExtension,
		});
	}

	return compactionResult;
}
```

**Key insight:** Compaction calls the `compact()` function with the model, apiKey, and headers. This function will use the normal provider request flow, including `before_provider_request` event handling. This means context_management could be applied during compaction if the extension adds it to the payload.

---

## Architecture & Payload Flow

```
Extension (before_provider_request)
    ↓
    return { ...payload, context_management: {...} }
    ↓
sdk.ts onPayload callback
    ↓
anthropic.ts streamAnthropic() receives modified params
    ↓
client.messages.stream({ ...params, stream: true })
    ↓
Anthropic SDK
    ↓
HTTP request to API with spread params
```

**Critical flow points:**

1. **buildParams()** creates typed `MessageCreateParamsStreaming` object
2. **onPayload callback** can replace entire payload (runs before provider call)
3. **Spread into stream()** passes all payload fields to SDK
4. **SDK forwards** to API (depending on type compatibility)

---

## Analysis: Can extensions add context_management?

### YES, with caveats:

**The mechanism exists:**
- `onPayload` callback accepts `unknown` type
- Returned payload is spread directly into `client.messages.stream()`
- No field filtering occurs between extension hook and API call

**The payload reaches the API:**
```typescript
const anthropicStream = client.messages.stream({ ...params, stream: true }, { signal: options?.signal });
```
- The Anthropic SDK's stream() method will receive a request object with `context_management` field
- If the SDK is version 0.73.0+ (it is), it likely has union types that include optional new fields
- Unknown fields may be dropped by the SDK's type system OR passed through depending on how the SDK handles extras

### NO/MAYBE, depending on:

1. **Anthropic SDK type constraints** — If `MessageCreateParamsStreaming` type explicitly lists allowed fields (strict union), new fields will cause TypeScript errors or be dropped at runtime
2. **Beta header requirement** — The `context-management-2025-06-27` beta header may be required for the field to be recognized by the API
3. **SDK serialization** — If the SDK serializes only known fields, `context_management` won't reach the API even if included in the payload

### What needs to happen for full support:

1. **Add beta header** — Include `context-management-2025-06-27` in `anthropic-beta` header (modify lines 560, 576)
2. **Type the field** — Either:
   - Cast the extended payload as `any`, OR
   - Update `MessageCreateParamsStreaming` union to include `context_management`, OR
   - Create intermediate type with `& Record<string, any>` before spreading
3. **Test with API** — Verify the SDK forwards the field to the API

---

## Current State: What EXISTS

✅ **Prompt caching:** Fully implemented with `cache_control` on content blocks
✅ **before_provider_request hook:** Fully functional, tested example exists
✅ **Payload modification:** Extensions can return modified payloads
✅ **Header injection:** Beta headers are set in client defaultHeaders
✅ **Compaction integration:** compact() flow includes before_provider_request

❌ **context_management field:** Not present anywhere
❌ **context-management beta header:** Not in default headers
❌ **cache_edits/clear_tool_uses:** Not referenced
❌ **Type support for new fields:** MessageCreateParamsStreaming is strictly typed

---

## Start Here

### 1. Verify SDK Capabilities (First Priority)

Check if `@anthropic-ai/sdk@0.73.0` accepts extra fields:
```bash
cd /home/dot/Development/pi-mono
# Look at node_modules/@anthropic-ai/sdk/resources/messages.d.ts
# Search for MessageCreateParamsStreaming definition
```

The SDK should have a TypeScript type that either:
- A) Unions with `& Record<string, any>` (allows extra fields)
- B) Has exhaustive literal types (rejects extra fields)
- C) Uses `[key: string]: unknown` (allows extras)

If (A), `context_management` will pass through. If (B/C), we need workarounds.

### 2. To Add context_management Support

**Minimal changes needed:**

1. **File:** `packages/ai/src/providers/anthropic.ts`
   - **Line 560** (API key auth): Add `"context-management-2025-06-27"` to betaFeatures
   - **buildParams function:** If SDK types don't accept it, cast: `(params as any).context_management = extensionContext?.context_management`

2. **File:** `packages/coding-agent/docs/extensions.md`
   - Document that `context_management` can be returned from `before_provider_request` event
   - Show example of adding context management edits

3. **Test:** Create example extension that adds context_management during compaction

### 3. Full Implementation Path

```
Step 1: Add beta header
  → Modify anthropic.ts createClient() to include context-management-2025-06-27

Step 2: Enable payload field
  → buildParams() or onPayload stage, ensure context_management reaches SDK

Step 3: Document for extensions
  → Show how to detect cached content in messages
  → Show how to build cache_edits array
  → Show how to return context_management in before_provider_request

Step 4: Integrate with compaction
  → Track cached tool uses during session
  → Clear cache on unused tools when compacting
  → Apply cache_edits to preserve prompt cache efficiency
```

---

## Recommendations

### Short Term (Verification)

1. ✓ Check Anthropic SDK 0.73.0 type definitions for `MessageCreateParamsStreaming`
2. ✓ Test if unknown fields are dropped by SDK or passed through
3. ✓ Verify API accepts fields sent by SDK

### Medium Term (Implementation)

1. Add `context-management-2025-06-27` beta header
2. Create buildContextManagement() helper to track cache state
3. Wire cache tracking into compaction flow
4. Document for extension developers

### Long Term (Integration)

1. Automatic cache optimization during compaction
2. Extension hooks for cache decisions
3. Session metrics tracking cache efficiency
4. UX for visualizing cache usage in panels

---

## References

- **Anthropic API Docs:** https://docs.anthropic.com (context management field details)
- **SDK Type Source:** `node_modules/@anthropic-ai/sdk/resources/messages.d.ts`
- **Example Extension:** `packages/coding-agent/examples/extensions/provider-payload.ts`
- **Test Fixtures:** `packages/coding-agent/test/compaction-*`
