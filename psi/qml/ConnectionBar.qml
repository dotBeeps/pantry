import QtQuick
import QtQuick.Layouts

Rectangle {
    color: Theme.surface

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 12
        spacing: 8

        Text {
            text: "Ember (local)"
            font.pixelSize: 12
            color: Theme.textMuted
        }

        Item { Layout.fillWidth: true }

        Row {
            spacing: 12

            Row {
                spacing: 4

                Rectangle {
                    width: 8; height: 8; radius: 4
                    anchors.verticalCenter: parent.verticalCenter
                    color: Daemon.connected ? "#4ade80" : "#ef4444"

                    SequentialAnimation on opacity {
                        running: !Daemon.connected
                        loops: Animation.Infinite
                        onRunningChanged: if (!running) parent.opacity = 1.0
                        NumberAnimation { to: 0.3; duration: 800 }
                        NumberAnimation { to: 1.0; duration: 800 }
                    }
                }

                Text {
                    text: "SSE"
                    font.pixelSize: 10
                    color: Theme.textDim
                }
            }

            Row {
                spacing: 4

                Rectangle {
                    width: 8; height: 8; radius: 4
                    anchors.verticalCenter: parent.verticalCenter
                    color: Mcp.connected ? "#4ade80" : "#ef4444"
                }

                Text {
                    text: "MCP"
                    font.pixelSize: 10
                    color: Theme.textDim
                }
            }
        }

        Text {
            visible: Mcp.sessionId !== ""
            text: Mcp.sessionId
            font.pixelSize: 10
            font.family: "monospace"
            color: Theme.textDim
        }
    }
}
