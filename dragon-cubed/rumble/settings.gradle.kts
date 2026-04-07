// Standalone settings for building rumble independently.
// When building from the repo root, the root settings.gradle.kts takes precedence.
pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
        maven("https://maven.neoforged.net/releases")
    }
}

rootProject.name = "rumble"
