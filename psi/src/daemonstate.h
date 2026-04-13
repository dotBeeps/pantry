#ifndef DAEMONSTATE_H
#define DAEMONSTATE_H

#include <QDateTime>
#include <QNetworkAccessManager>
#include <QObject>
#include <QQmlEngine>
#include <QTimer>
#include <QUrl>
#include <QVariantList>
#include <QVariantMap>

class DaemonState : public QObject
{
    Q_OBJECT
    QML_ELEMENT

    Q_PROPERTY(int attention READ attention NOTIFY attentionChanged FINAL)
    Q_PROPERTY(QVariantList nerves READ nerves NOTIFY nervesChanged FINAL)
    Q_PROPERTY(QVariantList contracts READ contracts NOTIFY contractsChanged FINAL)
    Q_PROPERTY(QDateTime lastBeat READ lastBeat NOTIFY lastBeatChanged FINAL)
    Q_PROPERTY(bool connected READ isConnected WRITE setConnected NOTIFY connectedChanged FINAL)

public:
    explicit DaemonState(QObject *parent = nullptr);

    int attention() const;
    QVariantList nerves() const;
    QVariantList contracts() const;
    QDateTime lastBeat() const;
    bool isConnected() const;
    void setConnected(bool connected);

    Q_INVOKABLE void pollState(const QUrl &baseUrl);

public slots:
    void onStateReceived(const QVariantMap &state);
    void onThoughtReceived(const QString &type, const QString &text);

signals:
    void attentionChanged();
    void nervesChanged();
    void contractsChanged();
    void lastBeatChanged();
    void connectedChanged();

private:
    QNetworkAccessManager m_nam;
    int m_attention = 0;
    QVariantList m_nerves;
    QVariantList m_contracts;
    QDateTime m_lastBeat;
    bool m_connected = false;
};

#endif // DAEMONSTATE_H
