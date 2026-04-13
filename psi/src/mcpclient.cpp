#include "mcpclient.h"

#include <QJsonArray>
#include <QJsonDocument>

McpClient::McpClient(QObject *parent)
    : QObject(parent)
{
}

bool McpClient::isConnected() const { return m_connected; }
QString McpClient::sessionId() const { return m_sessionId; }
QUrl McpClient::baseUrl() const { return m_baseUrl; }

void McpClient::setBaseUrl(const QUrl &url)
{
    if (m_baseUrl != url) {
        m_baseUrl = url;
        emit baseUrlChanged();
    }
}

void McpClient::setConnected(bool connected)
{
    if (m_connected != connected) {
        m_connected = connected;
        emit connectedChanged();
    }
}

void McpClient::registerSession(const QString &sessionId,
                                 const QString &provider,
                                 const QString &model,
                                 const QString &harness)
{
    QJsonObject params;
    params[QStringLiteral("session_id")] = sessionId;
    params[QStringLiteral("provider")] = provider;
    params[QStringLiteral("model")] = model;
    params[QStringLiteral("harness")] = harness;

    sendRpc(QStringLiteral("tools/call"), QJsonObject{
        {QStringLiteral("name"), QStringLiteral("register_session")},
        {QStringLiteral("arguments"), params}
    }, [this, sessionId](const QJsonObject &) {
        m_sessionId = sessionId;
        setConnected(true);
        emit sessionRegistered();
    });
}

void McpClient::stoneReceive(const QString &sessionId,
                              const QString &addressedTo,
                              int waitMs,
                              const QString &sinceId)
{
    QJsonObject params;
    params[QStringLiteral("session_id")] = sessionId;
    params[QStringLiteral("addressed_to")] = addressedTo;
    params[QStringLiteral("wait_ms")] = waitMs;
    if (!sinceId.isEmpty())
        params[QStringLiteral("since_id")] = sinceId;

    sendRpc(QStringLiteral("tools/call"), QJsonObject{
        {QStringLiteral("name"), QStringLiteral("stone_receive")},
        {QStringLiteral("arguments"), params}
    }, [this](const QJsonObject &result) {
        QVariantList messages;
        QJsonArray content = result[QStringLiteral("content")].toArray();
        for (const auto &item : content) {
            QJsonObject obj = item.toObject();
            QString text = obj[QStringLiteral("text")].toString();
            QJsonDocument doc = QJsonDocument::fromJson(text.toUtf8());
            if (doc.isObject()) {
                QJsonObject parsed = doc.object();
                QJsonArray msgs = parsed[QStringLiteral("messages")].toArray();
                for (const auto &m : msgs)
                    messages.append(m.toObject().toVariantMap());
            }
        }
        emit stoneMessagesReceived(messages);
    });
}

void McpClient::questStatus(const QString &sessionId)
{
    QJsonObject params;
    params[QStringLiteral("session_id")] = sessionId;

    sendRpc(QStringLiteral("tools/call"), QJsonObject{
        {QStringLiteral("name"), QStringLiteral("quest_status")},
        {QStringLiteral("arguments"), params}
    }, [this](const QJsonObject &result) {
        QVariantList quests;
        QJsonArray content = result[QStringLiteral("content")].toArray();
        for (const auto &item : content) {
            QJsonObject obj = item.toObject();
            QString text = obj[QStringLiteral("text")].toString();
            QJsonDocument doc = QJsonDocument::fromJson(text.toUtf8());
            if (doc.isObject()) {
                QJsonObject parsed = doc.object();
                QJsonArray qs = parsed[QStringLiteral("quests")].toArray();
                for (const auto &q : qs)
                    quests.append(q.toObject().toVariantMap());
            }
        }
        emit questStatusReceived(quests);
    });
}

void McpClient::sendRpc(const QString &method, const QJsonObject &params,
                         std::function<void(const QJsonObject &)> onResult)
{
    QJsonObject rpc;
    rpc[QStringLiteral("jsonrpc")] = QStringLiteral("2.0");
    rpc[QStringLiteral("id")] = ++m_rpcId;
    rpc[QStringLiteral("method")] = method;
    rpc[QStringLiteral("params")] = params;

    QUrl url = m_baseUrl;
    url.setPath(QStringLiteral("/mcp"));

    QNetworkRequest req(url);
    req.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));

    QNetworkReply *reply = m_nam.post(req, QJsonDocument(rpc).toJson(QJsonDocument::Compact));

    connect(reply, &QNetworkReply::finished, this, [this, reply, onResult]() {
        reply->deleteLater();

        if (reply->error() != QNetworkReply::NoError) {
            emit requestError(reply->errorString());
            return;
        }

        QJsonDocument doc = QJsonDocument::fromJson(reply->readAll());
        QJsonObject response = doc.object();

        if (response.contains(QStringLiteral("error"))) {
            QJsonObject err = response[QStringLiteral("error")].toObject();
            emit requestError(err[QStringLiteral("message")].toString());
            return;
        }

        if (onResult)
            onResult(response[QStringLiteral("result")].toObject());
    });
}
