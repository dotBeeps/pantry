import QtQuick
import QtQuick.Layouts

Item {
    id: delegateRoot

    property string content: ""
    property date timestamp

    implicitHeight: bubble.implicitHeight + 12

    Rectangle {
        id: bubble
        anchors.right: parent.right
        anchors.rightMargin: 12
        anchors.left: parent.left
        anchors.leftMargin: 52
        anchors.top: parent.top
        anchors.topMargin: 4
        implicitHeight: msgRow.implicitHeight + 12
        radius: 6
        color: Qt.rgba(0.1, 0.16, 0.23, 1.0)

        RowLayout {
            id: msgRow
            anchors.fill: parent
            anchors.margins: 6
            spacing: 8

            Text {
                text: Qt.formatTime(timestamp, "HH:mm")
                font.pixelSize: 11
                font.family: "monospace"
                color: Theme.textDim
                Layout.alignment: Qt.AlignTop
            }
            Text {
                text: "dot"
                font.pixelSize: 11
                font.family: "monospace"
                font.bold: true
                color: "#7ec8e3"
                Layout.alignment: Qt.AlignTop
            }
            Text {
                text: content
                font.pixelSize: 13
                font.family: "monospace"
                color: Theme.text
                wrapMode: Text.Wrap
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignTop
            }
        }
    }
}
