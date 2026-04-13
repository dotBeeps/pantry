#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>

#include "daemonstate.h"
#include "sseconnection.h"
#include "thoughtmodel.h"
#include "themeengine.h"

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    QGuiApplication::setApplicationName("psi");
    QGuiApplication::setOrganizationName("hoard");

    QQuickStyle::setStyle("Material");

    // Create backend objects — parented to app for lifetime management.
    auto *theme = new ThemeEngine(&app);
    auto *sse = new SseConnection(&app);
    sse->setBaseUrl(QUrl("http://localhost:7432"));

    auto *thoughts = new ThoughtModel(&app);
    auto *state = new DaemonState(&app);

    // Wire SSE events → model updates.
    QObject::connect(sse, &SseConnection::thoughtReceived,
                     thoughts, [thoughts](const QString &type, const QString &text) {
        thoughts->addThought(type, text);
    });
    QObject::connect(sse, &SseConnection::thoughtReceived,
                     state, &DaemonState::onThoughtReceived);
    QObject::connect(sse, &SseConnection::stateReceived,
                     state, &DaemonState::onStateReceived);
    QObject::connect(sse, &SseConnection::connectedChanged,
                     state, [sse, state]() {
        state->setConnected(sse->isConnected());
        if (sse->isConnected())
            state->pollState(sse->baseUrl());
    });

    QQmlApplicationEngine engine;

    // Expose to QML via context properties.
    engine.rootContext()->setContextProperty("Theme", theme);
    engine.rootContext()->setContextProperty("Sse", sse);
    engine.rootContext()->setContextProperty("Thoughts", thoughts);
    engine.rootContext()->setContextProperty("State", state);

    // Load via resource URL — context properties work reliably with load().
    const QUrl mainUrl(QStringLiteral("qrc:/qt/qml/Psi/qml/Main.qml"));
    engine.load(mainUrl);

    if (engine.rootObjects().isEmpty())
        return -1;

    sse->connectToServer();

    return QGuiApplication::exec();
}
