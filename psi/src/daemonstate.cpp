#include "daemonstate.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkRequest>

DaemonState::DaemonState(QObject *parent)
    : QObject(parent)
{
}

int DaemonState::attention() const { return m_attention; }
QVariantList DaemonState::nerves() const { return m_nerves; }
QVariantList DaemonState::contracts() const { return m_contracts; }
QDateTime DaemonState::lastBeat() const { return m_lastBeat; }
bool DaemonState::isConnected() const { return m_connected; }

void DaemonState::setConnected(bool connected)
{
    if (m_connected != connected) {
        m_connected = connected;
        emit connectedChanged();
    }
}

void DaemonState::pollState(const QUrl &baseUrl)
{
    QUrl url = baseUrl;
    url.setPath("/state");

    QNetworkRequest req(url);
    QNetworkReply *reply = m_nam.get(req);

    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError)
            return;

        QJsonDocument doc = QJsonDocument::fromJson(reply->readAll());
        if (!doc.isObject())
            return;

        QJsonObject obj = doc.object();

        int att = obj.value("attention").toInt();
        if (att != m_attention) {
            m_attention = att;
            emit attentionChanged();
        }

        QVariantList newNerves = obj.value("nerves").toArray().toVariantList();
        if (newNerves != m_nerves) {
            m_nerves = newNerves;
            emit nervesChanged();
        }

        QVariantList newContracts = obj.value("contracts").toArray().toVariantList();
        if (newContracts != m_contracts) {
            m_contracts = newContracts;
            emit contractsChanged();
        }
    });
}

void DaemonState::onStateReceived(const QVariantMap &state)
{
    int att = state.value("attention").toInt();
    if (att != m_attention) {
        m_attention = att;
        emit attentionChanged();
    }

    QVariantList newNerves = state.value("nerves").toList();
    if (newNerves != m_nerves) {
        m_nerves = newNerves;
        emit nervesChanged();
    }

    QVariantList newContracts = state.value("contracts").toList();
    if (newContracts != m_contracts) {
        m_contracts = newContracts;
        emit contractsChanged();
    }
}

void DaemonState::onThoughtReceived(const QString &type, const QString &text)
{
    Q_UNUSED(text)
    if (type == "beat") {
        m_lastBeat = QDateTime::currentDateTime();
        emit lastBeatChanged();
    }
}
