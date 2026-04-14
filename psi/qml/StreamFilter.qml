import QtQuick
import QtQuick.Controls.Material
import QtQuick.Layouts

Rectangle {
    color: Theme.surface

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 12
        spacing: 4

        Text {
            text: "STREAM"
            font.pixelSize: 10
            font.bold: true
            font.letterSpacing: 1.5
            color: Theme.textDim
            Layout.rightMargin: 8
        }

        Repeater {
            model: [
                { label: "think", color: Theme.colorThink },
                { label: "speak", color: Theme.colorSpeak },
                { label: "text", color: Theme.colorText },
                { label: "observe", color: Theme.colorObserve },
                { label: "beat", color: Theme.colorBeat },
                { label: "dot", color: "#7ec8e3" },
                { label: "ally", color: Theme.tierAlly },
                { label: "quest", color: "#c9a0dc" }
            ]

            Rectangle {
                required property var modelData
                property bool active: true

                Layout.preferredHeight: 22
                Layout.preferredWidth: label.implicitWidth + 16
                radius: 4
                color: active ? Qt.rgba(modelData.color.r, modelData.color.g,
                                        modelData.color.b, 0.15) : "transparent"
                border.width: 1
                border.color: active ? modelData.color : Theme.border

                Text {
                    id: label
                    anchors.centerIn: parent
                    text: modelData.label
                    font.pixelSize: 10
                    font.family: "monospace"
                    color: active ? modelData.color : Theme.textDim
                }

                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: parent.active = !parent.active
                }
            }
        }

        Item { Layout.fillWidth: true }

        Text {
            text: Conversation.count + " events"
            font.pixelSize: 10
            font.family: "monospace"
            color: Theme.textDim
        }
    }
}
