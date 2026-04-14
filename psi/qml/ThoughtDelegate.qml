import QtQuick
import QtQuick.Layouts

Item {
    id: delegateRoot

    // These were previously injected as required properties by ThoughtStream's
    // delegate declaration. Now declared here so ThoughtDelegate is self-contained.
    property string type: ""
    property string text: ""
    property string nerve: ""
    property date timestamp

    implicitHeight: row.implicitHeight + 8

    readonly property color typeColor: {
        switch (type) {
        case "think": return Theme.colorThink
        case "speak": return Theme.colorSpeak
        case "observe": return Theme.colorObserve
        case "beat": return Theme.colorBeat
        default: return Theme.colorText
        }
    }

    readonly property string displayLabel: {
        switch (type) {
        case "think": return "think"
        case "speak": return "speak"
        case "observe": return nerve ? ("observe:" + nerve) : "observe"
        case "beat": return "beat"
        default: return ""
        }
    }

    Rectangle {
        anchors.fill: parent
        color: "transparent"

        RowLayout {
            id: row

            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 12
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
                visible: displayLabel !== ""
                text: displayLabel
                font.pixelSize: 11
                font.family: "monospace"
                font.bold: true
                color: delegateRoot.typeColor
                Layout.preferredWidth: 80
                Layout.alignment: Qt.AlignTop
            }

            Text {
                text: delegateRoot.text
                font.pixelSize: 13
                font.family: "monospace"
                color: delegateRoot.typeColor
                wrapMode: Text.Wrap
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignTop
            }
        }
    }
}
