import QtQuick
import QtQuick.Controls.Material
import QtQuick.Layouts

Rectangle {
    color: Theme.surface

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 16

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4

            Text {
                text: "ATTENTION"
                font.pixelSize: 10
                font.bold: true
                font.letterSpacing: 1.5
                color: Theme.textDim
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Rectangle {
                    Layout.fillWidth: true
                    height: 8
                    radius: 4
                    color: Theme.border

                    Rectangle {
                        width: parent.width * Math.min(Daemon.attention / 1000, 1.0)
                        height: parent.height
                        radius: 4
                        color: {
                            var ratio = Daemon.attention / 1000
                            if (ratio > 0.5) return "#4ade80"
                            if (ratio > 0.25) return Theme.accentMuted
                            return "#ef4444"
                        }

                        Behavior on width {
                            NumberAnimation { duration: 300; easing.type: Easing.OutCubic }
                        }
                    }
                }

                Text {
                    text: Daemon.attention + " / 1000"
                    font.pixelSize: 11
                    font.family: "monospace"
                    color: Theme.textMuted
                }
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4

            Text {
                text: "NERVES"
                font.pixelSize: 10
                font.bold: true
                font.letterSpacing: 1.5
                color: Theme.textDim
            }

            Text {
                visible: Daemon.nerves.length === 0
                text: "no nerves connected"
                font.pixelSize: 11
                color: Theme.textDim
                font.italic: true
            }

            Repeater {
                model: Daemon.nerves

                RowLayout {
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: 6

                    Rectangle {
                        width: 8
                        height: 8
                        radius: 4
                        color: modelData.active ? "#4ade80" : Theme.textDim
                    }

                    Text {
                        text: modelData.name || modelData.id || "nerve"
                        font.pixelSize: 12
                        color: Theme.text
                    }
                }
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4

            Text {
                text: "CONTRACTS"
                font.pixelSize: 10
                font.bold: true
                font.letterSpacing: 1.5
                color: Theme.textDim
            }

            Text {
                visible: Daemon.contracts.length === 0
                text: "no contracts loaded"
                font.pixelSize: 11
                color: Theme.textDim
                font.italic: true
            }

            Repeater {
                model: Daemon.contracts

                RowLayout {
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: 6

                    Rectangle {
                        width: 8
                        height: 8
                        radius: 4
                        color: {
                            var s = modelData.status || "ok"
                            if (s === "ok") return "#4ade80"
                            if (s === "warning") return Theme.accentMuted
                            return "#ef4444"
                        }
                    }

                    Text {
                        text: modelData.name || modelData.id || "contract"
                        font.pixelSize: 12
                        color: Theme.text
                    }
                }
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4

            Text {
                text: "STONE"
                font.pixelSize: 10
                font.bold: true
                font.letterSpacing: 1.5
                color: Theme.textDim
            }

            Text {
                text: Mcp.connected ? "connected" : "disconnected"
                font.pixelSize: 11
                color: Mcp.connected ? "#4ade80" : Theme.textDim
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4

            Text {
                text: "LAST BEAT"
                font.pixelSize: 10
                font.bold: true
                font.letterSpacing: 1.5
                color: Theme.textDim
            }

            Text {
                id: beatLabel
                font.pixelSize: 12
                font.family: "monospace"
                color: Theme.textMuted

                readonly property bool hasBeat: Daemon.lastBeat.getTime() > 0
                text: hasBeat ? beatAge() : "no beats yet"

                function beatAge() {
                    var ms = Date.now() - Daemon.lastBeat.getTime()
                    var s = Math.floor(ms / 1000)
                    if (s < 60) return s + "s ago"
                    var m = Math.floor(s / 60)
                    return m + "m ago"
                }

                Timer {
                    running: beatLabel.hasBeat
                    interval: 1000
                    repeat: true
                    onTriggered: beatLabel.text = beatLabel.beatAge()
                }
            }
        }

        Item { Layout.fillHeight: true }
    }
}
