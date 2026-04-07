package dev.dragoncubed.leylines.server

import dev.dragoncubed.leylines.Leylines
import io.netty.channel.ChannelHandlerContext
import io.netty.channel.SimpleChannelInboundHandler
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler.HandshakeComplete

/**
 * Netty channel handler for a single WebSocket connection.
 *
 * Lifecycle:
 *  1. [userEventTriggered] fires when the HTTP→WS upgrade completes — we
 *     register the session and send the capability handshake.
 *  2. [channelRead0] fires for each inbound text frame — enqueued for game-thread dispatch.
 *  3. [channelInactive] fires on disconnect — we clean up the session.
 */
class WebSocketHandler(
    private val server: LeylineServer,
    private val router: CommandRouter,
) : SimpleChannelInboundHandler<TextWebSocketFrame>() {

    private var session: LeylineSession? = null

    override fun userEventTriggered(ctx: ChannelHandlerContext, evt: Any) {
        if (evt is HandshakeComplete) {
            val sess = LeylineSession(ctx.channel())
            session = sess
            server.addSession(sess)
            Leylines.LOGGER.info("[Leylines] SoulGem connected: ${sess.id}")
            server.sendHandshake(sess)
        }
        super.userEventTriggered(ctx, evt)
    }

    override fun channelRead0(ctx: ChannelHandlerContext, frame: TextWebSocketFrame) {
        session?.let { router.enqueue(it, frame.text()) }
    }

    override fun channelInactive(ctx: ChannelHandlerContext) {
        session?.let { sess ->
            server.removeSession(sess)
            Leylines.LOGGER.info("[Leylines] SoulGem disconnected: ${sess.id}")
        }
        session = null
        super.channelInactive(ctx)
    }

    override fun exceptionCaught(ctx: ChannelHandlerContext, cause: Throwable) {
        Leylines.LOGGER.error("[Leylines] WS error on ${session?.id}: ${cause.message}")
        ctx.close()
    }
}
