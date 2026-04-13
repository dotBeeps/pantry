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
            spacing: 6

            Rectangle {
                width: 8
                height: 8
                radius: 4
                anchors.verticalCenter: parent.verticalCenter
                color: State.connected ? "#4ade80" : "#ef4444"

                SequentialAnimation on opacity {
                    id: pulseAnim
                    running: !State.connected
                    loops: Animation.Infinite
                    onRunningChanged: if (!running) parent.opacity = 1.0
                    NumberAnimation { to: 0.3; duration: 800 }
                    NumberAnimation { to: 1.0; duration: 800 }
                }
            }

            Text {
                text: State.connected ? "SSE connected" : "SSE disconnected"
                font.pixelSize: 11
                color: Theme.textDim
            }
        }
    }
}
