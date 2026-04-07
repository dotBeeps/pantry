package dev.dragoncubed.leylines.server

import dev.dragoncubed.leylines.Leylines
import dev.dragoncubed.leylines.extension.ExtensionRegistry
import dev.dragoncubed.leylines.protocol.ErrorMessage
import dev.dragoncubed.leylines.protocol.parseInbound
import java.util.concurrent.LinkedBlockingQueue

/**
 * Thread-safe command queue. Netty threads enqueue raw frames; the game thread
 * drains and dispatches them to the appropriate [LeylineExtension] each tick.
 *
 * This keeps all extension logic on the game thread without blocking Netty I/O.
 */
class CommandRouter(private val extensionRegistry: ExtensionRegistry) {

    private data class Pending(val session: LeylineSession, val raw: String)

    private val queue = LinkedBlockingQueue<Pending>(1024)

    /**
     * Enqueue an inbound frame from a Netty thread. Non-blocking.
     * Drops with a warning if the queue is full (backpressure — SoulGem is too fast).
     */
    fun enqueue(session: LeylineSession, raw: String) {
        if (!queue.offer(Pending(session, raw))) {
            Leylines.LOGGER.warn("[Leylines] Command queue full — dropping frame from ${session.id}")
        }
    }

    /**
     * Drain and dispatch all pending commands. **Must be called on the game thread.**
     * Invoked by [dev.dragoncubed.leylines.event.GameEventSubscriber] every tick.
     */
    fun drainQueue() {
        val batch = mutableListOf<Pending>()
        queue.drainTo(batch)
        for ((session, raw) in batch) dispatch(session, raw)
    }

    private fun dispatch(session: LeylineSession, raw: String) {
        val cmd = parseInbound(raw)
        if (cmd == null) {
            Leylines.LOGGER.warn("[Leylines] Malformed command from ${session.id}: $raw")
            session.send(ErrorMessage(cmdId = null, message = "Malformed command").toJson())
            return
        }

        val ext = extensionRegistry.findByCapability(cmd.capability)
        if (ext == null) {
            Leylines.LOGGER.warn("[Leylines] No extension handles capability '${cmd.capability}'")
            session.send(ErrorMessage(cmdId = cmd.id, message = "Unknown capability: ${cmd.capability}").toJson())
            return
        }

        runCatching {
            ext.handleCommand(session, cmd.id, cmd.action, cmd.params)
        }.onFailure { e ->
            Leylines.LOGGER.error("[Leylines] Extension '${ext.id}' threw on '${cmd.action}': ${e.message}", e)
            session.send(ErrorMessage(cmdId = cmd.id, message = "Extension error: ${e.message}").toJson())
        }
    }
}
