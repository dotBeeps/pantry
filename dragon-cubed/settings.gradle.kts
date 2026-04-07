pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
        maven("https://maven.neoforged.net/releases")
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
        maven("https://maven.neoforged.net/releases")
        maven("https://thedarkcolour.github.io/KotlinForForge/")
    }
}

rootProject.name = "dragon-cubed"

// NeoForge mods — each has its own build.gradle.kts and neoforge.mods.toml.
// Standalone builds still work from within each subdirectory.
include(":leylines")
include(":rumble")
