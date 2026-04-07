package dev.dragoncubed.leylines.state

import dev.dragoncubed.leylines.protocol.ItemStack
import dev.dragoncubed.leylines.protocol.PlayerState
import dev.dragoncubed.leylines.protocol.Vec3
import net.minecraft.client.Minecraft
import net.minecraft.core.registries.BuiltInRegistries
import net.minecraft.world.entity.player.Player

/**
 * Collects a point-in-time snapshot of the local player's state.
 *
 * **Must be called on the client game thread.**
 * Returns null if the player or level isn't loaded yet.
 */
object PlayerStateCollector {

    fun collect(): PlayerState? {
        val mc     = Minecraft.getInstance()
        val player = mc.player  ?: return null
        val level  = mc.level   ?: return null

        val pos = player.position()
        return PlayerState(
            position  = Vec3(pos.x, pos.y, pos.z),
            yaw       = player.yRot,
            pitch     = player.xRot,
            health    = player.health,
            food      = player.foodData.foodLevel,
            dimension = level.dimension().location().toString(),
            inventory = collectInventory(player),
        )
    }

    private fun collectInventory(player: Player): List<ItemStack> {
        val inv    = player.inventory
        val result = mutableListOf<ItemStack>()

        // Main inventory (36 slots) + armour (4) + offhand (1)
        val allSlots = inv.items + inv.armor + inv.offhand
        allSlots.forEachIndexed { slot, stack ->
            if (stack.isEmpty) return@forEachIndexed
            val id = BuiltInRegistries.ITEM.getKey(stack.item).toString()
            result += ItemStack(slot = slot, id = id, count = stack.count)
        }
        return result
    }
}
