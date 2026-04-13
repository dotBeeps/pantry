#ifndef SSECONNECTION_H
#define SSECONNECTION_H

#include <QObject>
#include <QVariantMap>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QQmlEngine>
#include <QTimer>
#include <QUrl>

class SseConnection : public QObject
{
    Q_OBJECT
    QML_ELEMENT

    Q_PROPERTY(bool connected READ isConnected NOTIFY connectedChanged FINAL)
    Q_PROPERTY(QUrl baseUrl READ baseUrl WRITE setBaseUrl NOTIFY baseUrlChanged FINAL)

public:
    explicit SseConnection(QObject *parent = nullptr);

    bool isConnected() const;
    QUrl baseUrl() const;
    void setBaseUrl(const QUrl &url);

    Q_INVOKABLE void connectToServer();
    Q_INVOKABLE void disconnect();
    Q_INVOKABLE void sendMessage(const QString &text);

signals:
    void connectedChanged();
    void baseUrlChanged();
    void thoughtReceived(const QString &type, const QString &text);
    void stateReceived(const QVariantMap &state);
    void messageSent();
    void messageError(const QString &error);

private slots:
    void onStreamReadyRead();
    void onStreamFinished();
    void onStreamError(QNetworkReply::NetworkError error);
    void onReconnectTimer();
    void onKeepaliveTimeout();

private:
    void startStream();
    void scheduleReconnect();
    void resetBackoff();
    void parseSSE(const QByteArray &chunk);
    void processEvent(const QString &data);

    QNetworkAccessManager m_nam;
    QNetworkReply *m_streamReply = nullptr;
    QTimer m_reconnectTimer;
    QTimer m_keepaliveTimer;
    QUrl m_baseUrl;
    QByteArray m_buffer;
    bool m_connected = false;
    bool m_intentionalDisconnect = false;
    int m_backoffMs = 1000;
    static constexpr int MaxBackoffMs = 30000;
    static constexpr int KeepaliveTimeoutMs = 45000;
};

#endif // SSECONNECTION_H
