package dev.dragoncubed.rumble.baritone

import baritone.api.BaritoneAPI
import baritone.api.IBaritone
import baritone.api.event.events.PathEvent
import baritone.api.event.listener.AbstractGameEventListener
import baritone.api.pathing.goals.Goal
import baritone.api.pathing.goals.GoalBlock
import baritone.api.pathing.goals.GoalNear
import baritone.api.pathing.goals.GoalXZ
import dev.dragoncubed.leylines.protocol.EventMessage
import dev.dragoncubed.leylines.protocol.ErrorMessage
import dev.dragoncubed.leylines.server.LeylineSession
import dev.dragoncubed.rumble.Rumble

/**
 * Wraps the Baritone API and routes D3 commands to the appropriate Baritone process.
 *
 * ## Thread model
 * All public methods are called from the Minecraft game thread (via CommandRouter.drainQueue).
 * PathEvent callbacks are also dispatched on the game thread by Baritone. `@Volatile` on
 * [active] is a belt-and-suspenders measure.
 *
 * ## Process exclusivity
 * Baritone allows only one non-temporary process active at a time. Starting a new command
 * while one is running implicitly cancels the previous (Baritone's priority system handles
 * this — the new process wins). SoulGem should track this and not issue overlapping commands.
 */
object BaritoneController {

    private enum class ProcessType { PATHFIND, MINE }

    /** Tracks which session + command is waiting for goal lifecycle events. */
    private data class ActiveCommand(
        val session: LeylineSession,
        val commandId: String,
        val type: ProcessType,
    )

    @Volatile private var active: ActiveCommand? = null
    private var initialized = false

    // Lazy — safe after FMLClientSetupEvent; never call from @Mod constructor or static init.
    private val baritone: IBaritone by lazy {
        BaritoneAPI.getProvider().primaryBaritone
    }

    // ── Initialization ────────────────────────────────────────────────────────

    /**
     * Register the PathEvent listener. Call once from client setup — idempotent.
     * Must be on the game thread (FMLClientSetupEvent is fine).
     */
    fun initialize() {
        if (initialized) return
        initialized = true
        baritone.gameEventHandler.registerEventListener(object : AbstractGameEventListener {
            override fun onPathEvent(event: PathEvent) = handlePathEvent(event)
        })
        Rumble.LOGGER.info("[Rumble] BaritoneController initialized.")
    }

    // ── Commands (called on game thread via CommandRouter) ────────────────────

    /** Pathfind to an exact block position. */
    fun pathfind(session: LeylineSession, commandId: String, x: Int, y: Int, z: Int) =
        startGoal(session, commandId, ProcessType.PATHFIND, "pathfind", GoalBlock(x, y, z))

    /** Pathfind to within [range] blocks of a position. */
    fun pathfindNear(session: LeylineSession, commandId: String, x: Int, y: Int, z: Int, range: Int) =
        startGoal(session, commandId, ProcessType.PATHFIND, "pathfind_near", GoalNear(x, y, z, range))

    /** Pathfind to an XZ coordinate (any Y). */
    fun pathfindXZ(session: LeylineSession, commandId: String, x: Int, z: Int) =
        startGoal(session, commandId, ProcessType.PATHFIND, "pathfind_xz", GoalXZ(x, z))

    /**
     * Mine blocks by registry name until [quantity] are collected (0 = no limit).
     *
     * Example block names: "minecraft:diamond_ore", "minecraft:deepslate_diamond_ore"
     */
    fun mine(session: LeylineSession, commandId: String, blocks: List<String>, quantity: Int) {
        if (blocks.isEmpty()) {
            session.send(ErrorMessage(cmdId = commandId, message = "mine requires at least one block name").toJson())
            return
        }
        setActive(session, commandId, ProcessType.MINE)
        emit("goal:started", mapOf("action" to "mine", "blocks" to blocks.joinToString(), "quantity" to quantity))

        if (quantity > 0) {
            baritone.mineProcess.mineByName(quantity, *blocks.toTypedArray())
        } else {
            baritone.mineProcess.mineByName(*blocks.toTypedArray())
        }
    }

    /**
     * Cancel any active Baritone goal. May return false if mid-parkour (unsafe to stop);
     * use [forceCancel] to stop regardless.
     */
    fun cancel() {
        val safe = baritone.pathingBehavior.cancelEverything()
        if (!safe) {
            Rumble.LOGGER.warn("[Rumble] cancelEverything returned false (mid-parkour?) — forcing cancel")
            baritone.pathingBehavior.forceCancel()
        }
        // PathEvent.CANCELED will fire and emit goal:failed back to the session
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private fun startGoal(
        session: LeylineSession,
        commandId: String,
        type: ProcessType,
        actionName: String,
        goal: Goal,
    ) {
        setActive(session, commandId, type)
        emit("goal:started", mapOf("action" to actionName))
        baritone.customGoalProcess.setGoalAndPath(goal)
    }

    private fun setActive(session: LeylineSession, commandId: String, type: ProcessType) {
        active = ActiveCommand(session, commandId, type)
    }

    private fun emit(event: String, data: Map<String, Any> = emptyMap()) {
        val cmd = active ?: return
        cmd.session.send(EventMessage(cmdId = cmd.commandId, event = event, data = data).toJson())
    }

    /**
     * PathEvent handler — dispatched on the game thread by Baritone.
     *
     * Key events:
     * - [PathEvent.AT_GOAL]                       → goal:completed, clear active
     * - [PathEvent.CANCELED]                      → goal:failed (canceled), clear active
     * - [PathEvent.CALC_FAILED]                   → check if process still active:
     *     still active → goal:progressed (recalculating) — Baritone will retry
     *     not active   → goal:failed (path_calc_failed) — Baritone gave up
     * - [PathEvent.CALC_STARTED]                  → goal:progressed (calculating)
     * - [PathEvent.CALC_FINISHED_NOW_EXECUTING]   → goal:progressed (walking)
     */
    private fun handlePathEvent(event: PathEvent) {
        val cmd = active ?: return

        when (event) {
            PathEvent.AT_GOAL -> {
                emit("goal:completed")
                active = null
            }

            PathEvent.CANCELED -> {
                emit("goal:failed", mapOf("reason" to "canceled"))
                active = null
            }

            PathEvent.CALC_FAILED, PathEvent.NEXT_CALC_FAILED -> {
                // Distinguish transient retry from terminal failure by checking isActive()
                val processStillActive = when (cmd.type) {
                    ProcessType.PATHFIND -> baritone.customGoalProcess.isActive
                    ProcessType.MINE     -> baritone.mineProcess.isActive
                }
                if (processStillActive) {
                    emit("goal:progressed", mapOf("status" to "recalculating"))
                } else {
                    emit("goal:failed", mapOf("reason" to "path_calc_failed"))
                    active = null
                }
            }

            PathEvent.CALC_STARTED,
            PathEvent.NEXT_SEGMENT_CALC_STARTED -> {
                emit("goal:progressed", mapOf("status" to "calculating"))
            }

            PathEvent.CALC_FINISHED_NOW_EXECUTING,
            PathEvent.CONTINUING_ONTO_PLANNED_NEXT,
            PathEvent.SPLICING_ONTO_NEXT_EARLY -> {
                emit("goal:progressed", mapOf("status" to "walking"))
            }

            // DISCARD_NEXT, PATH_FINISHED_NEXT_STILL_CALCULATING — no meaningful signal yet
            else -> {}
        }
    }
}
