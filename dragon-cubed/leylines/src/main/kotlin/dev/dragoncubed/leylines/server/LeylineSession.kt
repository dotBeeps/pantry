package dev.dragoncubed.leylines.server

import dev.dragoncubed.leylines.Leylines
import io.netty.channel.Channel
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame

/**
 * Represents a single active SoulGem WebSocket connection.
 *
 * Thread-safe — [send] may be called from any thread (Netty handles the flush).
 */
class LeylineSession(private val channel: Channel) {
    /** Short Netty channel ID, e.g. "3a2b1c0d". Used in log messages. */
    val id: String = channel.id().asShortText()

    val isActive: Boolean get() = channel.isActive

    /**
     * Sends a JSON string to this client. Non-blocking, safe from any thread.
     */
    fun send(json: String) {
        if (!channel.isActive) return
        channel.writeAndFlush(TextWebSocketFrame(json)).addListener { future ->
            if (!future.isSuccess) {
                Leylines.LOGGER.warn("[Leylines] Send failed to $id: ${future.cause()?.message}")
            }
        }
    }

    fun close() = channel.close()

    override fun toString() = "LeylineSession($id)"
}
