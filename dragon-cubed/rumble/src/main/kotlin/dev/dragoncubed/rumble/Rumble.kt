package dev.dragoncubed.rumble

import dev.dragoncubed.rumble.baritone.BaritoneController
import net.neoforged.api.distmarker.Dist
import net.neoforged.fml.common.Mod
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent
import net.neoforged.fml.loading.FMLEnvironment
import org.apache.logging.log4j.LogManager
import org.apache.logging.log4j.Logger
import thedarkcolour.kotlinforforge.neoforge.forge.MOD_BUS

/**
 * D3-Rumble — Baritone compatibility extension for D3-Leylines.
 *
 * Discovered by Leylines at startup via ServiceLoader. The [RumbleExtension]
 * class registers in `META-INF/services/` and Leylines calls [handleCommand]
 * on the game thread when SoulGem issues a Rumble capability command.
 *
 * Load order: Leylines loads → Rumble loads AFTER → [BaritoneController.initialize]
 * runs in client setup → [RumbleExtension] is discovered by Leylines' ServiceLoader.
 */
@Mod(Rumble.MOD_ID)
object Rumble {
    const val MOD_ID = "d3_rumble"

    val LOGGER: Logger = LogManager.getLogger(MOD_ID)

    init {
        if (FMLEnvironment.dist == Dist.CLIENT) {
            MOD_BUS.addListener(::onClientSetup)
        }
    }

    private fun onClientSetup(event: FMLClientSetupEvent) {
        LOGGER.info("[Rumble] Initializing Baritone controller...")
        // BaritoneController.initialize() triggers the lazy IBaritone lookup and
        // registers the PathEvent listener. Safe here because FMLClientSetupEvent
        // fires after all mod constructors have run (Baritone is fully loaded).
        BaritoneController.initialize()
        LOGGER.info("[Rumble] Ready. Capabilities: pathfind, pathfind_near, pathfind_xz, mine, cancel")
    }
}
