#ifndef STONEPOLLER_H
#define STONEPOLLER_H

#include <QThread>
#include <QVariantMap>
#include <QAtomicInt>

class McpClient;

class StonePoller : public QThread
{
    Q_OBJECT

public:
    explicit StonePoller(McpClient *client, QObject *parent = nullptr);
    ~StonePoller() override;

    void setSessionId(const QString &id);
    void stopPolling();

signals:
    void messageReceived(const QVariantMap &msg);

protected:
    void run() override;

private:
    McpClient *m_client;
    QString m_sessionId;
    QAtomicInt m_running{0};
    QString m_lastId;
};

#endif // STONEPOLLER_H
