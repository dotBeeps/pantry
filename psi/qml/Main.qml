import QtQuick
import QtQuick.Controls.Material
import QtQuick.Layouts

ApplicationWindow {
    id: root

    visible: true
    width: 1200
    height: 800
    title: "psi"

    Material.theme: Material.Dark
    Material.accent: Theme.accent

    color: Theme.background

    RowLayout {
        anchors.fill: parent
        spacing: 0

        SessionRail {
            Layout.fillHeight: true
            Layout.preferredWidth: 48
        }

        Rectangle {
            width: 1
            Layout.fillHeight: true
            color: Theme.border
        }

        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0

            ConnectionBar {
                Layout.fillWidth: true
                Layout.preferredHeight: 32
            }

            Rectangle {
                height: 1
                Layout.fillWidth: true
                color: Theme.border
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 0

                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    spacing: 0

                    ConversationStream {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                    }

                    Rectangle {
                        height: 1
                        Layout.fillWidth: true
                        color: Theme.border
                    }

                    InputBar {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 48
                    }
                }

                Rectangle {
                    width: 1
                    Layout.fillHeight: true
                    color: Theme.border
                }

                StatePanel {
                    Layout.fillHeight: true
                    Layout.preferredWidth: 200
                }
            }
        }
    }
}
