#include "sseconnection.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkRequest>
#include <QVariantMap>


SseConnection::SseConnection(QObject *parent)
    : QObject(parent)
{
    m_reconnectTimer.setSingleShot(true);
    connect(&m_reconnectTimer, &QTimer::timeout,
            this, &SseConnection::onReconnectTimer);

    m_keepaliveTimer.setSingleShot(true);
    m_keepaliveTimer.setInterval(KeepaliveTimeoutMs);
    connect(&m_keepaliveTimer, &QTimer::timeout,
            this, &SseConnection::onKeepaliveTimeout);
}

bool SseConnection::isConnected() const { return m_connected; }

QUrl SseConnection::baseUrl() const { return m_baseUrl; }

void SseConnection::setBaseUrl(const QUrl &url)
{
    if (m_baseUrl != url) {
        m_baseUrl = url;
        emit baseUrlChanged();
    }
}

void SseConnection::connectToServer()
{
    m_intentionalDisconnect = false;
    resetBackoff();
    startStream();
}

void SseConnection::disconnect()
{
    m_intentionalDisconnect = true;
    m_reconnectTimer.stop();
    m_keepaliveTimer.stop();

    if (m_streamReply) {
        m_streamReply->abort();
        m_streamReply->deleteLater();
        m_streamReply = nullptr;
    }

    if (m_connected) {
        m_connected = false;
        emit connectedChanged();
    }
}

void SseConnection::sendMessage(const QString &text)
{
    QUrl url = m_baseUrl;
    url.setPath("/message");

    QNetworkRequest req(url);
    req.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");

    QJsonObject body;
    body["text"] = text;
    QByteArray payload = QJsonDocument(body).toJson(QJsonDocument::Compact);

    QNetworkReply *reply = m_nam.post(req, payload);
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() == QNetworkReply::NoError) {
            emit messageSent();
        } else {
            emit messageError(reply->errorString());
        }
    });
}

void SseConnection::startStream()
{
    if (m_streamReply) {
        m_streamReply->abort();
        m_streamReply->deleteLater();
        m_streamReply = nullptr;
    }

    m_buffer.clear();

    QUrl url = m_baseUrl;
    url.setPath("/stream");

    QNetworkRequest req(url);
    req.setRawHeader("Accept", "text/event-stream");
    req.setAttribute(QNetworkRequest::CacheLoadControlAttribute,
                     QNetworkRequest::AlwaysNetwork);

    m_streamReply = m_nam.get(req);

    connect(m_streamReply, &QNetworkReply::readyRead,
            this, &SseConnection::onStreamReadyRead);
    connect(m_streamReply, &QNetworkReply::finished,
            this, &SseConnection::onStreamFinished);
    connect(m_streamReply, &QNetworkReply::errorOccurred,
            this, &SseConnection::onStreamError);
}

void SseConnection::onStreamReadyRead()
{
    if (!m_connected) {
        m_connected = true;
        resetBackoff();
        emit connectedChanged();
    }

    m_keepaliveTimer.start();

    QByteArray data = m_streamReply->readAll();
    parseSSE(data);
}

void SseConnection::parseSSE(const QByteArray &chunk)
{
    m_buffer.append(chunk);

    while (true) {
        int idx = m_buffer.indexOf("\n\n");
        if (idx == -1)
            break;

        QByteArray block = m_buffer.left(idx);
        m_buffer.remove(0, idx + 2);

        const QList<QByteArray> lines = block.split('\n');
        for (const QByteArray &line : lines) {
            if (line.startsWith("data:")) {
                QString data = QString::fromUtf8(line.mid(5)).trimmed();
                processEvent(data);
            }
        }
    }
}

void SseConnection::processEvent(const QString &data)
{
    QJsonParseError err;
    QJsonDocument doc = QJsonDocument::fromJson(data.toUtf8(), &err);
    if (err.error != QJsonParseError::NoError || !doc.isObject())
        return;

    QJsonObject obj = doc.object();
    QString type = obj.value("type").toString();

    if (type == "thought" || type == "think" || type == "speak" ||
        type == "text" || type == "observe" || type == "beat") {
        QString text = obj.value("text").toString();
        emit thoughtReceived(type, text);
    } else if (type == "state") {
        emit stateReceived(obj.toVariantMap());
    }
}

void SseConnection::onStreamFinished()
{
    if (m_connected) {
        m_connected = false;
        emit connectedChanged();
    }

    if (m_streamReply) {
        m_streamReply->deleteLater();
        m_streamReply = nullptr;
    }

    if (!m_intentionalDisconnect)
        scheduleReconnect();
}

void SseConnection::onStreamError(QNetworkReply::NetworkError /*error*/)
{
    if (m_connected) {
        m_connected = false;
        emit connectedChanged();
    }
}

void SseConnection::onReconnectTimer()
{
    if (!m_intentionalDisconnect)
        startStream();
}

void SseConnection::onKeepaliveTimeout()
{
    if (m_streamReply) {
        m_streamReply->abort();
        m_streamReply->deleteLater();
        m_streamReply = nullptr;
    }

    if (m_connected) {
        m_connected = false;
        emit connectedChanged();
    }

    scheduleReconnect();
}

void SseConnection::scheduleReconnect()
{
    m_reconnectTimer.start(m_backoffMs);
    m_backoffMs = qMin(m_backoffMs * 2, MaxBackoffMs);
}

void SseConnection::resetBackoff()
{
    m_backoffMs = 1000;
}
