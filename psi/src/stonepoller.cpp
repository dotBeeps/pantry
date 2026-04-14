#include "stonepoller.h"
#include "mcpclient.h"

#include <QEventLoop>
#include <QTimer>

StonePoller::StonePoller(McpClient *client, QObject *parent)
    : QThread(parent)
    , m_client(client)
{
}

StonePoller::~StonePoller()
{
    stopPolling();
    wait();
}

void StonePoller::setSessionId(const QString &id)
{
    m_sessionId = id;
}

void StonePoller::stopPolling()
{
    m_running.storeRelease(0);
}

void StonePoller::run()
{
    m_running.storeRelease(1);
    int backoffMs = 1000;
    static constexpr int MaxBackoffMs = 30000;

    while (m_running.loadAcquire()) {
        if (m_sessionId.isEmpty()) {
            QThread::msleep(500);
            continue;
        }

        QEventLoop loop;
        bool gotMessages = false;

        auto conn = connect(m_client, &McpClient::stoneMessagesReceived,
                            &loop, [&](const QVariantList &messages) {
            gotMessages = true;
            backoffMs = 1000;
            for (const auto &m : messages) {
                QVariantMap msg = m.toMap();
                QString id = msg.value(QStringLiteral("id")).toString();
                if (!id.isEmpty())
                    m_lastId = id;
                emit messageReceived(msg);
            }
            loop.quit();
        });

        auto errConn = connect(m_client, &McpClient::requestError,
                               &loop, [&](const QString &) {
            loop.quit();
        });

        QMetaObject::invokeMethod(m_client, [this]() {
            m_client->stoneReceive(m_sessionId,
                                   QStringLiteral("session-room"),
                                   60000, m_lastId);
        }, Qt::QueuedConnection);

        QTimer::singleShot(65000, &loop, &QEventLoop::quit);
        loop.exec();

        disconnect(conn);
        disconnect(errConn);

        if (!gotMessages && m_running.loadAcquire()) {
            QThread::msleep(backoffMs);
            backoffMs = qMin(backoffMs * 2, MaxBackoffMs);
        }
    }
}
