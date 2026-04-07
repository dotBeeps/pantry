package dev.dragoncubed.leylines.event

import dev.dragoncubed.leylines.Leylines
import dev.dragoncubed.leylines.protocol.EventMessage
import dev.dragoncubed.leylines.protocol.StateMessage
import dev.dragoncubed.leylines.state.PlayerStateCollector
import net.neoforged.api.distmarker.Dist
import net.neoforged.bus.api.SubscribeEvent
import net.neoforged.fml.common.EventBusSubscriber
import net.neoforged.neoforge.client.event.ClientChatReceivedEvent
import net.neoforged.neoforge.client.event.ClientTickEvent

// Broadcast player state every N client ticks (20 = 1 s).
private const val STATE_INTERVAL_TICKS = 20

/**
 * Client-side game event subscribers.
 *
 * - [onClientTick] : drains the command queue + periodic state broadcast
 * - [onChatReceived]: forwards chat/system messages as Leylines events
 *
 * Registered on the NeoForge game bus (not the mod bus) via [EventBusSubscriber].
 */
@EventBusSubscriber(modid = Leylines.MOD_ID, value = [Dist.CLIENT])
object GameEventSubscriber {

    private var tickCounter = 0

    /**
     * Called every client tick on the game thread.
     *
     * 1. Drains queued commands from Netty and dispatches to extensions.
     * 2. Broadcasts a full state snapshot every [STATE_INTERVAL_TICKS].
     */
    @JvmStatic
    @SubscribeEvent
    fun onClientTick(event: ClientTickEvent.Post) {
        val server = Leylines.server ?: return

        // Drain and dispatch inbound commands (game thread — safe for Minecraft API)
        server.router.drainQueue()

        // Periodic state broadcast
        if (++tickCounter >= STATE_INTERVAL_TICKS) {
            tickCounter = 0
            if (server.activeSessions.isNotEmpty()) {
                PlayerStateCollector.collect()?.let { state ->
                    server.broadcast(StateMessage(player = state).toJson())
                }
            }
        }
    }

    /**
     * Captures all chat and system messages and emits them as Leylines events.
     *
     * Event name convention:
     *  - `"chat:player"` — chat message from a player
     *  - `"chat:system"` — system / server message
     */
    @JvmStatic
    @SubscribeEvent
    fun onChatReceived(event: ClientChatReceivedEvent) {
        val server = Leylines.server ?: return
        if (server.activeSessions.isEmpty()) return

        // NeoForge 21.x: message is a Component; sender UUID may be null for system msgs
        val text     = event.message.string
        val isSender = event.sender != null

        server.broadcast(
            EventMessage(
                event = if (isSender) "chat:player" else "chat:system",
                data  = buildMap {
                    put("message", text)
                    event.sender?.let { put("sender", it.toString()) }
                },
            ).toJson()
        )
    }
}
