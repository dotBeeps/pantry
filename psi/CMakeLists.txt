cmake_minimum_required(VERSION 3.21)
project(psi VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.5 REQUIRED COMPONENTS Quick Network QuickControls2)

qt_standard_project_setup(REQUIRES 6.5)

qt_add_executable(psi
    src/main.cpp
    src/sseconnection.h src/sseconnection.cpp
    src/thoughtmodel.h src/thoughtmodel.cpp
    src/daemonstate.h src/daemonstate.cpp
    src/themeengine.h src/themeengine.cpp
    src/conversationmodel.h src/conversationmodel.cpp
    src/mcpclient.h src/mcpclient.cpp
    src/stonepoller.h src/stonepoller.cpp
)

qt_add_qml_module(psi
    URI Psi
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/SessionRail.qml
        qml/ConnectionBar.qml
        qml/ConversationStream.qml
        qml/ThoughtDelegate.qml
        qml/DotMessageDelegate.qml
        qml/StoneDelegate.qml
        qml/QuestEventDelegate.qml
        qml/SummaryDelegate.qml
        qml/StreamFilter.qml
        qml/InputBar.qml
        qml/StatePanel.qml
)

target_include_directories(psi PRIVATE src)

target_link_libraries(psi PRIVATE
    Qt6::Quick
    Qt6::Network
    Qt6::QuickControls2
)
