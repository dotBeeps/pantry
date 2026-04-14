import QtQuick
import QtQuick.Controls.Material
import QtQuick.Layouts

Rectangle {
    color: Theme.surface

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 12
        spacing: 8

        TextField {
            id: input

            Layout.fillWidth: true
            Layout.fillHeight: true
            placeholderText: Daemon.connected ? "message Ember..." : "disconnected"
            enabled: Daemon.connected
            font.pixelSize: 13
            font.family: "monospace"
            color: Theme.text
            placeholderTextColor: Theme.textDim

            background: Rectangle {
                color: "transparent"
            }

            onAccepted: {
                if (input.text.trim().length === 0) return
                Conversation.addDotMessage(input.text)
                Sse.sendMessage(input.text)
                input.text = ""
            }
        }

        Rectangle {
            id: sendIndicator

            Layout.preferredWidth: 6
            Layout.preferredHeight: 6
            Layout.alignment: Qt.AlignVCenter
            radius: 3
            color: Theme.accentMuted
            opacity: 0

            SequentialAnimation {
                id: sendFlash
                NumberAnimation {
                    target: sendIndicator; property: "opacity"
                    to: 1; duration: 100
                }
                NumberAnimation {
                    target: sendIndicator; property: "opacity"
                    to: 0; duration: 400
                }
            }

            Connections {
                target: Sse
                function onMessageSent() { sendFlash.start() }
            }
        }
    }
}
