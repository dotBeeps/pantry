// ── D3-Rumble build script ────────────────────────────────────────────────────
// Baritone compatibility extension for D3-Leylines.
// Depends on Leylines for the extension API and Baritone for pathfinding.
//
// ⚠️  Baritone API jar must be manually placed in rumble/libs/:
//     Download baritone-api-neoforge-1.13.1.jar from:
//     https://github.com/cabaletta/baritone/releases/tag/v1.13.1
//     → copy to rumble/libs/baritone-api-neoforge-1.13.1.jar

plugins {
    kotlin("jvm") version "2.1.0"
    id("net.neoforged.moddev") version "2.0.78"
}

base.archivesName = "rumble"
version = "0.1.0"
group = "dev.dragoncubed"

neoForge {
    version = "21.4.172-beta"

    parchment {
        mappingsVersion = "2024.11.17"
        minecraftVersion = "1.21.4"
    }

    runs {
        create("client") {
            client()
        }
    }

    mods {
        create("d3_rumble") {
            sourceSet(sourceSets.main.get())
        }
    }
}

dependencies {
    // KFF — bundles kotlin-stdlib, coroutines, serialization
    implementation("thedarkcolour:kotlinforforge-neoforge:5.6.0")

    // Leylines API — compileOnly because it's a separate mod at runtime
    // Build from root (./gradlew :leylines:build) or standalone first.
    compileOnly(project(":leylines"))

    // Baritone API — compileOnly; user installs baritone-standalone-neoforge-*.jar as a mod
    compileOnly(fileTree("libs") { include("baritone-api-neoforge-*.jar") })
}

kotlin {
    jvmToolchain(21)
}
