import QtQuick
import QtQuick.Layouts

Item {
    id: delegateRoot

    property string content: ""
    property date timestamp
    property string allyName: ""
    property string typeLabel: ""

    implicitHeight: stoneRow.implicitHeight + 10

    Rectangle {
        anchors.fill: parent
        anchors.leftMargin: 10
        anchors.rightMargin: 10
        anchors.topMargin: 2
        anchors.bottomMargin: 2
        color: Qt.rgba(0.1, 0.18, 0.1, 1.0)
        radius: 6

        Rectangle {
            width: 2
            height: parent.height
            color: Theme.tierAlly
            radius: 1
        }

        RowLayout {
            id: stoneRow
            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 8
            anchors.topMargin: 4
            anchors.bottomMargin: 4
            spacing: 8

            Text {
                text: Qt.formatTime(timestamp, "HH:mm")
                font.pixelSize: 11
                font.family: "monospace"
                color: Theme.textDim
                Layout.alignment: Qt.AlignTop
            }
            Text {
                text: allyName
                font.pixelSize: 11
                font.family: "monospace"
                font.bold: true
                color: Theme.tierAlly
                Layout.alignment: Qt.AlignTop
            }
            Text {
                visible: typeLabel !== ""
                text: "(" + typeLabel + ")"
                font.pixelSize: 10
                font.family: "monospace"
                color: Theme.textDim
                Layout.alignment: Qt.AlignTop
            }
            Text {
                text: content
                font.pixelSize: 13
                font.family: "monospace"
                color: Theme.textMuted
                wrapMode: Text.Wrap
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignTop
            }
        }
    }
}
