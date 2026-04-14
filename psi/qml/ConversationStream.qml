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

            delegate: Item {
                id: entry

                required property int entryType
                required property string roleName
                required property string content
                required property date timestamp
                required property string source
                required property string allyName
                required property string typeLabel
                required property string vaultKey

                width: streamView.width
                implicitHeight: loader.item ? loader.item.implicitHeight : 0

                Loader {
                    id: loader
                    width: parent.width

                    sourceComponent: {
                        switch (entry.entryType) {
                        case 0: return thoughtComp
                        case 1: return dotComp
                        case 2: return stoneComp
                        case 3: return questComp
                        case 4: return summaryComp
                        default: return thoughtComp
                        }
                    }

                    onLoaded: {
                        if (!item) return
                        let props = ["content", "timestamp", "allyName", "typeLabel", "vaultKey"]
                        for (let p of props) {
                            if (p in item) {
                                item[p] = Qt.binding(function() { return entry[p] })
                            }
                        }
                        // ThoughtDelegate uses "type" and "text" instead of model role names
                        if ("type" in item)
                            item["type"] = Qt.binding(function() { return entry.typeLabel })
                        if ("text" in item && entry.entryType === 0)
                            item["text"] = Qt.binding(function() { return entry.content })
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
        id: thoughtComp
        ThoughtDelegate {}
    }

    Component {
        id: dotComp
        DotMessageDelegate {}
    }

    Component {
        id: stoneComp
        StoneDelegate {}
    }

    Component {
        id: questComp
        QuestEventDelegate {}
    }

    Component {
        id: summaryComp
        SummaryDelegate {}
    }
}
