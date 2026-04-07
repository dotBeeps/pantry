package dev.dragoncubed.rumble

import com.google.gson.JsonObject
import dev.dragoncubed.leylines.extension.LeylineExtension
import dev.dragoncubed.leylines.protocol.ErrorMessage
import dev.dragoncubed.leylines.server.LeylineSession
import dev.dragoncubed.rumble.baritone.BaritoneController

/**
 * D3-Rumble's [LeylineExtension] implementation.
 *
 * Registered via `META-INF/services/dev.dragoncubed.leylines.extension.LeylineExtension`
 * so Leylines discovers it automatically via ServiceLoader.
 *
 * All [handleCommand] calls arrive on the **game thread** (drained by CommandRouter each tick).
 * Baritone API calls are therefore safe here.
 *
 * ## Capabilities and params
 *
 * | Action | Required params | Optional params |
 * |--------|----------------|-----------------|
 * | `pathfind` | `x: Int, y: Int, z: Int` | — |
 * | `pathfind_near` | `x: Int, y: Int, z: Int` | `range: Int` (default 3) |
 * | `pathfind_xz` | `x: Int, z: Int` | — |
 * | `mine` | `blocks: [String]` | `quantity: Int` (default 0 = unlimited) |
 * | `cancel` | — | — |
 */
class RumbleExtension : LeylineExtension {

    override val id           = "d3-rumble"
    override val version      = "0.1.0"
    override val capabilities = listOf("pathfind", "pathfind_near", "pathfind_xz", "mine", "cancel")

    override fun handleCommand(
        session: LeylineSession,
        commandId: String,
        action: String,
        params: JsonObject,
    ) {
        runCatching {
            when (action) {
                "pathfind" -> {
                    val x = params.require("x", commandId, session) { asInt } ?: return
                    val y = params.require("y", commandId, session) { asInt } ?: return
                    val z = params.require("z", commandId, session) { asInt } ?: return
                    BaritoneController.pathfind(session, commandId, x, y, z)
                }

                "pathfind_near" -> {
                    val x     = params.require("x", commandId, session) { asInt } ?: return
                    val y     = params.require("y", commandId, session) { asInt } ?: return
                    val z     = params.require("z", commandId, session) { asInt } ?: return
                    val range = params.get("range")?.asInt ?: 3
                    BaritoneController.pathfindNear(session, commandId, x, y, z, range)
                }

                "pathfind_xz" -> {
                    val x = params.require("x", commandId, session) { asInt } ?: return
                    val z = params.require("z", commandId, session) { asInt } ?: return
                    BaritoneController.pathfindXZ(session, commandId, x, z)
                }

                "mine" -> {
                    val blocksEl = params.getAsJsonArray("blocks")
                    if (blocksEl == null || blocksEl.size() == 0) {
                        session.send(ErrorMessage(cmdId = commandId, message = "mine requires 'blocks' array").toJson())
                        return
                    }
                    val blocks   = blocksEl.map { it.asString }
                    val quantity = params.get("quantity")?.asInt ?: 0
                    BaritoneController.mine(session, commandId, blocks, quantity)
                }

                "cancel" -> BaritoneController.cancel()

                else -> session.send(
                    ErrorMessage(cmdId = commandId, message = "Unknown action '$action' for d3-rumble").toJson()
                )
            }
        }.onFailure { e ->
            Rumble.LOGGER.error("[Rumble] Error handling '$action': ${e.message}", e)
            session.send(ErrorMessage(cmdId = commandId, message = "Rumble error: ${e.message}").toJson())
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Gets a required param from the JsonObject, sending an error and returning null if missing.
 * Usage: `params.require("x", cmdId, session) { asInt } ?: return`
 */
private inline fun <T> JsonObject.require(
    key: String,
    commandId: String,
    session: LeylineSession,
    extract: com.google.gson.JsonElement.() -> T,
): T? {
    val el = get(key)
    return if (el == null || el.isJsonNull) {
        session.send(ErrorMessage(cmdId = commandId, message = "Missing required param '$key'").toJson())
        null
    } else {
        el.extract()
    }
}
