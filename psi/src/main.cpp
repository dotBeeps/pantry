#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>

#include "conversationmodel.h"
#include "daemonstate.h"
#include "mcpclient.h"
#include "sseconnection.h"
#include "stonepoller.h"
#include "thoughtmodel.h"
#include "themeengine.h"

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    QGuiApplication::setApplicationName("psi");
    QGuiApplication::setOrganizationName("hoard");

    QQuickStyle::setStyle("Material");

    auto *theme = new ThemeEngine(&app);
    auto *sse = new SseConnection(&app);
    sse->setBaseUrl(QUrl("http://localhost:7432"));

    auto *thoughts = new ThoughtModel(&app);
    auto *conversation = new ConversationModel(&app);
    auto *state = new DaemonState(&app);

    auto *mcp = new McpClient(&app);
    mcp->setBaseUrl(QUrl("http://localhost:9432"));

    auto *stonePoller = new StonePoller(mcp, &app);

    // Wire SSE events → models.
    QObject::connect(sse, &SseConnection::thoughtReceived,
                     thoughts, [thoughts](const QString &type, const QString &text) {
        thoughts->addThought(type, text);
    });
    QObject::connect(sse, &SseConnection::thoughtReceived,
                     conversation, [conversation](const QString &type, const QString &text) {
        conversation->addThought(type, text);
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

    // Wire stone messages → conversation model.
    QObject::connect(stonePoller, &StonePoller::messageReceived,
                     conversation, [conversation](const QVariantMap &msg) {
        conversation->addStoneMessage(msg);
    });

    // MCP: register session and start stone polling on SSE connect.
    QObject::connect(sse, &SseConnection::connectedChanged,
                     mcp, [sse, mcp, stonePoller]() {
        if (sse->isConnected()) {
            mcp->registerSession(
                QStringLiteral("psi-ember"),
                QStringLiteral("ui"),
                QStringLiteral("direct"),
                QStringLiteral("psi")
            );
        }
    });
    QObject::connect(mcp, &McpClient::sessionRegistered,
                     stonePoller, [mcp, stonePoller]() {
        stonePoller->setSessionId(mcp->sessionId());
        if (!stonePoller->isRunning())
            stonePoller->start();
    });

    QQmlApplicationEngine engine;

    engine.rootContext()->setContextProperty("Theme", theme);
    engine.rootContext()->setContextProperty("Sse", sse);
    engine.rootContext()->setContextProperty("Thoughts", thoughts);
    engine.rootContext()->setContextProperty("Conversation", conversation);
    engine.rootContext()->setContextProperty("Daemon", state);
    engine.rootContext()->setContextProperty("Mcp", mcp);

    const QUrl mainUrl(QStringLiteral("qrc:/qt/qml/Psi/qml/Main.qml"));
    engine.load(mainUrl);

    if (engine.rootObjects().isEmpty())
        return -1;

    sse->connectToServer();

    return QGuiApplication::exec();
}
