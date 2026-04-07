package dev.dragoncubed.leylines.extension

import dev.dragoncubed.leylines.Leylines
import dev.dragoncubed.leylines.protocol.ExtensionInfo
import java.util.ServiceLoader

/**
 * Discovers [LeylineExtension] implementations via [ServiceLoader] and provides
 * a lookup map for command routing and handshake generation.
 */
class ExtensionRegistry {
    private val _extensions = mutableMapOf<String, LeylineExtension>()

    /** All loaded extensions, keyed by [LeylineExtension.id]. */
    val extensions: Map<String, LeylineExtension> get() = _extensions

    /**
     * Loads all [LeylineExtension] service providers on the current class loader.
     * Called once during client setup before the server starts.
     */
    fun discoverExtensions() {
        _extensions.clear()
        for (ext in ServiceLoader.load(LeylineExtension::class.java)) {
            if (_extensions.containsKey(ext.id)) {
                Leylines.LOGGER.warn(
                    "[Leylines] Duplicate extension ID '${ext.id}' from ${ext::class.qualifiedName} — skipping"
                )
                continue
            }
            _extensions[ext.id] = ext
            Leylines.LOGGER.info(
                "[Leylines] Extension registered: ${ext.id} v${ext.version} → [${ext.capabilities.joinToString()}]"
            )
        }
    }

    /** Builds the [ExtensionInfo] list sent in the capability handshake. */
    fun buildExtensionInfos(): List<ExtensionInfo> =
        _extensions.values.map { ExtensionInfo(it.id, it.version, it.capabilities) }

    /**
     * Returns the extension that owns [capability], or null.
     * Used by [dev.dragoncubed.leylines.server.CommandRouter] to route commands.
     */
    fun findByCapability(capability: String): LeylineExtension? =
        _extensions.values.firstOrNull { capability in it.capabilities }
}
