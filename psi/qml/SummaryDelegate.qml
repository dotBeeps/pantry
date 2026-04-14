import QtQuick
import QtQuick.Layouts

Item {
    id: delegateRoot

    property string content: ""
    property string typeLabel: ""
    property string vaultKey: ""

    implicitHeight: 26

    Rectangle {
        anchors.fill: parent
        anchors.leftMargin: 10
        anchors.rightMargin: 10
        color: "transparent"

        Rectangle {
            width: 2
            height: parent.height
            color: Theme.border
        }

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 10
            spacing: 6

            Text {
                text: typeLabel
                font.pixelSize: 10
                font.family: "monospace"
                font.italic: true
                color: Theme.textDim
                Layout.alignment: Qt.AlignVCenter
            }
            Text {
                text: content
                font.pixelSize: 11
                font.family: "monospace"
                font.italic: true
                color: Theme.textDim
                elide: Text.ElideRight
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignVCenter
            }
        }
    }
}
