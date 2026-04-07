package dev.dragoncubed.leylines.server

import dev.dragoncubed.leylines.Leylines
import dev.dragoncubed.leylines.extension.ExtensionRegistry
import dev.dragoncubed.leylines.protocol.HandshakeMessage
import io.netty.bootstrap.ServerBootstrap
import io.netty.channel.Channel
import io.netty.channel.ChannelInitializer
import io.netty.channel.ChannelOption
import io.netty.channel.nio.NioEventLoopGroup
import io.netty.channel.socket.SocketChannel
import io.netty.channel.socket.nio.NioServerSocketChannel
import io.netty.handler.codec.http.HttpObjectAggregator
import io.netty.handler.codec.http.HttpServerCodec
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler
import java.util.concurrent.CopyOnWriteArrayList

private const val WEBSOCKET_PATH    = "/leylines"
private const val MAX_FRAME_BYTES   = 65_536

/**
 * Netty WebSocket server that accepts SoulGem connections.
 *
 * Uses Minecraft's bundled Netty — no extra dependency needed.
 * Session list is a [CopyOnWriteArrayList] so [broadcast] can iterate
 * safely from the game thread while Netty adds/removes sessions.
 */
class LeylineServer(
    private val port: Int,
    private val extensionRegistry: ExtensionRegistry,
) {
    val router = CommandRouter(extensionRegistry)

    private val sessions    = CopyOnWriteArrayList<LeylineSession>()
    private val bossGroup   = NioEventLoopGroup(1)
    private val workerGroup = NioEventLoopGroup(4)
    private var serverChannel: Channel? = null

    fun start() {
        val bootstrap = ServerBootstrap()
            .group(bossGroup, workerGroup)
            .channel(NioServerSocketChannel::class.java)
            .option(ChannelOption.SO_BACKLOG, 128)
            .childOption(ChannelOption.SO_KEEPALIVE, true)
            .childHandler(object : ChannelInitializer<SocketChannel>() {
                override fun initChannel(ch: SocketChannel) {
                    ch.pipeline().apply {
                        addLast(HttpServerCodec())
                        addLast(HttpObjectAggregator(MAX_FRAME_BYTES))
                        addLast(WebSocketServerProtocolHandler(WEBSOCKET_PATH))
                        addLast(WebSocketHandler(this@LeylineServer, router))
                    }
                }
            })

        serverChannel = bootstrap.bind(port).sync().channel()
    }

    fun stop() {
        sessions.forEach { it.close() }
        sessions.clear()
        serverChannel?.close()?.sync()
        bossGroup.shutdownGracefully()
        workerGroup.shutdownGracefully()
        Leylines.LOGGER.info("[Leylines] Server stopped.")
    }

    /** Called by [WebSocketHandler] on the Netty thread after WS upgrade. */
    internal fun addSession(session: LeylineSession) = sessions.add(session)

    /** Called by [WebSocketHandler] on the Netty thread on disconnect. */
    internal fun removeSession(session: LeylineSession) = sessions.remove(session)

    /** Sends the capability handshake to a freshly connected session. */
    fun sendHandshake(session: LeylineSession) {
        session.send(
            HandshakeMessage(
                version            = Leylines.VERSION,
                extensions         = extensionRegistry.buildExtensionInfos(),
                coreCapabilities   = listOf("chat", "player_state", "inventory", "world_query"),
            ).toJson()
        )
    }

    /**
     * Broadcasts a JSON string to all active sessions.
     * Safe to call from the game thread — Netty flushes on its own threads.
     */
    fun broadcast(json: String) {
        sessions.forEach { if (it.isActive) it.send(json) }
    }

    val activeSessions: List<LeylineSession> get() = sessions.toList()
}
