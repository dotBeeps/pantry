#ifndef MCPCLIENT_H
#define MCPCLIENT_H

#include <QObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QJsonObject>
#include <QUrl>

#include <functional>

class McpClient : public QObject
{
    Q_OBJECT

    Q_PROPERTY(bool connected READ isConnected NOTIFY connectedChanged FINAL)
    Q_PROPERTY(QString sessionId READ sessionId NOTIFY sessionRegistered FINAL)
    Q_PROPERTY(QUrl baseUrl READ baseUrl WRITE setBaseUrl NOTIFY baseUrlChanged FINAL)

public:
    explicit McpClient(QObject *parent = nullptr);

    bool isConnected() const;
    QString sessionId() const;
    QUrl baseUrl() const;
    void setBaseUrl(const QUrl &url);

    Q_INVOKABLE void registerSession(const QString &sessionId,
                                     const QString &provider,
                                     const QString &model,
                                     const QString &harness);
    Q_INVOKABLE void stoneReceive(const QString &sessionId,
                                  const QString &addressedTo,
                                  int waitMs = 60000,
                                  const QString &sinceId = {});
    Q_INVOKABLE void questStatus(const QString &sessionId);

signals:
    void connectedChanged();
    void baseUrlChanged();
    void sessionRegistered();
    void stoneMessagesReceived(const QVariantList &messages);
    void questStatusReceived(const QVariantList &quests);
    void requestError(const QString &error);

private:
    void sendRpc(const QString &method, const QJsonObject &params,
                 std::function<void(const QJsonObject &)> onResult);
    void setConnected(bool connected);

    QNetworkAccessManager m_nam;
    QUrl m_baseUrl;
    QString m_sessionId;
    bool m_connected = false;
    int m_rpcId = 0;
};

#endif // MCPCLIENT_H
