// ── D3-Leylines build script ──────────────────────────────────────────────
// Target: Minecraft 1.21.4 + NeoForge + Kotlin for Forge (KFF 5.x)
// Note: Pin exact versions in gradle.properties once confirmed stable.

plugins {
    kotlin("jvm") version "2.1.0"
    id("net.neoforged.moddev") version "2.0.78"
}

base.archivesName = "leylines"
version = "0.1.0"
group = "dev.dragoncubed"

repositories {
    mavenCentral()
    maven("https://maven.neoforged.net/releases")
    maven("https://thedarkcolour.github.io/KotlinForForge/")
}

neoForge {
    // Update these in gradle.properties — pinned here for clarity.
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
        create("leylines") {
            sourceSet(sourceSets.main.get())
        }
    }
}

dependencies {
    // Kotlin for Forge — brings stdlib, coroutines, serialization
    implementation("thedarkcolour:kotlinforforge-neoforge:5.6.0")
    // Gson and Netty are bundled by Minecraft at runtime — no jarJar needed
}

kotlin {
    jvmToolchain(21)
}
