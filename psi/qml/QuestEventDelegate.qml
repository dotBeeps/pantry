import QtQuick
import QtQuick.Layouts

Item {
    id: delegateRoot

    property string content: ""
    property date timestamp

    implicitHeight: 22

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 12
        spacing: 8

        Text {
            text: Qt.formatTime(timestamp, "HH:mm")
            font.pixelSize: 10
            font.family: "monospace"
            color: Theme.textDim
            Layout.alignment: Qt.AlignVCenter
        }
        Text {
            text: "quest"
            font.pixelSize: 10
            font.family: "monospace"
            color: "#c9a0dc"
            Layout.alignment: Qt.AlignVCenter
        }
        Text {
            text: content
            font.pixelSize: 11
            font.family: "monospace"
            color: Theme.textDim
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignVCenter
        }
    }
}
