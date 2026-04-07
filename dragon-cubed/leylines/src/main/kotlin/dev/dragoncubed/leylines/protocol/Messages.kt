package dev.dragoncubed.leylines.protocol

import com.google.gson.Gson
import com.google.gson.JsonObject

/** Shared Gson instance — Gson is bundled by Minecraft, no extra dep needed. */
val GSON: Gson = Gson()

// ── Shared types ─────────────────────────────────────────────────────────────

data class Vec3(val x: Double, val y: Double, val z: Double)

data class ItemStack(val slot: Int, val id: String, val count: Int)

data class PlayerState(
    val position: Vec3,
    val yaw: Float,
    val pitch: Float,
    val health: Float,
    val food: Int,
    val dimension: String,
    val inventory: List<ItemStack>,
)

data class ExtensionInfo(
    val id: String,
    val version: String,
    val capabilities: List<String>,
)

// ── Outbound: Leylines → SoulGem ─────────────────────────────────────────────

data class HandshakeMessage(
    val type: String = "handshake",
    val version: String,
    val extensions: List<ExtensionInfo>,
    val coreCapabilities: List<String>,
) {
    fun toJson(): String = GSON.toJson(this)
}

data class StateMessage(
    val type: String = "state",
    val player: PlayerState,
) {
    fun toJson(): String = GSON.toJson(this)
}

/** Generic event — used for chat, goal lifecycle, and anything else. */
data class EventMessage(
    val type: String = "event",
    val cmdId: String? = null,
    val event: String,
    val data: Map<String, Any> = emptyMap(),
) {
    fun toJson(): String = GSON.toJson(this)
}

data class ErrorMessage(
    val type: String = "error",
    val cmdId: String?,
    val message: String,
) {
    fun toJson(): String = GSON.toJson(this)
}

// ── Inbound: SoulGem → Leylines ──────────────────────────────────────────────

data class CommandMessage(
    val id: String,
    val capability: String,
    val action: String,
    val params: JsonObject,
)

/**
 * Parses an inbound JSON frame into a [CommandMessage].
 * Returns null if the frame is malformed or not a "command" type.
 */
fun parseInbound(json: String): CommandMessage? = runCatching {
    val obj = GSON.fromJson(json, JsonObject::class.java)
    if (obj.get("type")?.asString != "command") return null
    CommandMessage(
        id         = obj.get("id")?.asString         ?: return null,
        capability = obj.get("capability")?.asString ?: return null,
        action     = obj.get("action")?.asString     ?: return null,
        params     = obj.getAsJsonObject("params")   ?: JsonObject(),
    )
}.getOrNull()
