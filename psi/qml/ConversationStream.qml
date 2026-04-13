import QtQuick
import QtQuick.Controls.Material
import QtQuick.Layouts

Rectangle {
    id: streamRoot
    color: Theme.background

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        StreamFilter {
            Layout.fillWidth: true
            Layout.preferredHeight: 36
        }

        Rectangle {
            height: 1
            Layout.fillWidth: true
            color: Theme.border
        }

        ListView {
            id: streamView
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: 2
            cacheBuffer: 2000

            model: Conversation

            delegate: Loader {
                required property int entryType
                required property string roleName
                required property string content
                required property date timestamp
                required property string source
                required property string allyName
                required property string typeLabel
                required property string vaultKey

                width: streamView.width

                sourceComponent: {
                    switch (entryType) {
                    case 0: return thoughtDelegate
                    case 1: return dotDelegate
                    case 2: return stoneDelegate
                    case 3: return questDelegate
                    case 4: return summaryDelegate
                    default: return thoughtDelegate
                    }
                }
            }

            onContentYChanged: {
                if (!streamView.atYEnd) {
                    Conversation.autoScroll = false
                }
            }

            onCountChanged: {
                if (Conversation.autoScroll) {
                    Qt.callLater(streamView.positionViewAtEnd)
                }
            }
        }

        Rectangle {
            visible: !Conversation.autoScroll && Conversation.count > 0
            Layout.alignment: Qt.AlignHCenter
            Layout.preferredWidth: 140
            Layout.preferredHeight: 28
            Layout.bottomMargin: 8
            radius: 14
            color: Theme.surfaceRaised
            border.width: 1
            border.color: Theme.border

            Text {
                anchors.centerIn: parent
                text: "scroll to bottom"
                font.pixelSize: 11
                color: Theme.textMuted
            }

            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    Conversation.autoScroll = true
                    streamView.positionViewAtEnd()
                }
            }
        }
    }

    Component {
        id: thoughtDelegate
        ThoughtDelegate {
            required property string typeLabel
            required property string content
            type: typeLabel
            text: content
        }
    }

    Component {
        id: dotDelegate
        DotMessageDelegate {}
    }

    Component {
        id: stoneDelegate
        StoneDelegate {}
    }

    Component {
        id: questDelegate
        QuestEventDelegate {}
    }

    Component {
        id: summaryDelegate
        SummaryDelegate {}
    }
}
