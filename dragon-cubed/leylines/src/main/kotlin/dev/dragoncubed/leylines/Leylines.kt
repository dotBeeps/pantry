package dev.dragoncubed.leylines

import dev.dragoncubed.leylines.extension.ExtensionRegistry
import dev.dragoncubed.leylines.server.LeylineServer
import net.neoforged.api.distmarker.Dist
import net.neoforged.fml.common.Mod
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent
import net.neoforged.fml.loading.FMLEnvironment
import org.apache.logging.log4j.LogManager
import org.apache.logging.log4j.Logger
import thedarkcolour.kotlinforforge.neoforge.forge.MOD_BUS

/**
 * D3-Leylines — Dragon Cubed nervous system.
 *
 * Client-side NeoForge mod. On login:
 *  1. Discovers Leyline extensions via ServiceLoader.
 *  2. Starts a Netty WebSocket server on [DEFAULT_PORT].
 *  3. Sends a capability handshake to every connecting SoulGem instance.
 *  4. Broadcasts player state every second and forwards chat events.
 */
@Mod(Leylines.MOD_ID)
object Leylines {
    const val MOD_ID      = "leylines"
    const val VERSION     = "0.1.0"
    const val DEFAULT_PORT = 8765

    val LOGGER: Logger = LogManager.getLogger(MOD_ID)

    /** Null before client setup completes — guard with `?: return` before use. */
    var server: LeylineServer? = null
        private set

    var extensionRegistry: ExtensionRegistry? = null
        private set

    init {
        // Only wire client-setup listener on the client dist.
        // This mod has no server-side logic.
        if (FMLEnvironment.dist == Dist.CLIENT) {
            MOD_BUS.addListener(::onClientSetup)
        }
    }

    private fun onClientSetup(event: FMLClientSetupEvent) {
        LOGGER.info("[Leylines] Initializing...")

        val registry = ExtensionRegistry().also { it.discoverExtensions() }
        extensionRegistry = registry

        val extSummary = if (registry.extensions.isEmpty()) "none" else registry.extensions.keys.joinToString()
        LOGGER.info("[Leylines] Extensions loaded: $extSummary")

        val srv = LeylineServer(DEFAULT_PORT, registry)
        server = srv
        srv.start()

        LOGGER.info("[Leylines] WebSocket server listening on ws://localhost:$DEFAULT_PORT/leylines")
    }

    /** Called on game exit / log-out to cleanly shut down the WebSocket server. */
    fun shutdown() {
        server?.stop()
        server = null
        extensionRegistry = null
        LOGGER.info("[Leylines] Shut down.")
    }
}
