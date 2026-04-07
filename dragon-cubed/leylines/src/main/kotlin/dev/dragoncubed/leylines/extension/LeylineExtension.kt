package dev.dragoncubed.leylines.extension

import com.google.gson.JsonObject
import dev.dragoncubed.leylines.server.LeylineSession

/**
 * Service interface for Leylines extensions.
 *
 * Implement this interface and register your implementation via:
 *   `META-INF/services/dev.dragoncubed.leylines.extension.LeylineExtension`
 *
 * On connect, Leylines reports all loaded extensions to SoulGem in the capability
 * handshake. SoulGem synthesizes pi tool definitions dynamically from this list —
 * so agents only ever see capabilities that are actually loaded.
 *
 * Example (D3-Rumble):
 * ```kotlin
 * class RumbleExtension : LeylineExtension {
 *     override val id = "d3-rumble"
 *     override val version = "0.1.0"
 *     override val capabilities = listOf("pathfind", "mine", "follow", "goto")
 *     override fun handleCommand(session, commandId, action, params) { ... }
 * }
 * ```
 */
interface LeylineExtension {
    /** Unique extension ID, e.g. "d3-rumble". Reported in the handshake. */
    val id: String

    /** SemVer string reported in the handshake, e.g. "0.1.0". */
    val version: String

    /**
     * Capability names this extension handles.
     * These become the `capability` field in inbound commands from SoulGem.
     * E.g. `["pathfind", "mine", "follow", "goto"]`
     */
    val capabilities: List<String>

    /**
     * Handle an inbound command. **Always called on the game thread.**
     *
     * Use [session] to send goal lifecycle events back:
     * ```kotlin
     * session.send(EventMessage(
     *     cmdId = commandId,
     *     event = "goal:started",
     * ).toJson())
     * ```
     *
     * @param session   The session that sent the command — send events back here.
     * @param commandId Unique command ID for event correlation (from the command message).
     * @param action    The action name, e.g. "pathfind". Always one of [capabilities].
     * @param params    Raw JSON params from the command message.
     */
    fun handleCommand(
        session: LeylineSession,
        commandId: String,
        action: String,
        params: JsonObject,
    )
}
