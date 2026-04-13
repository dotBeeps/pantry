#ifndef CONVERSATIONMODEL_H
#define CONVERSATIONMODEL_H

#include <QAbstractListModel>
#include <QDateTime>
#include <QQmlEngine>
#include <QVariantMap>

class ConversationModel : public QAbstractListModel
{
    Q_OBJECT

    Q_PROPERTY(int count READ count NOTIFY countChanged FINAL)
    Q_PROPERTY(bool autoScroll READ autoScroll WRITE setAutoScroll NOTIFY autoScrollChanged FINAL)

public:
    enum EntryType {
        Thought = 0,
        DotMessage,
        StoneMessage,
        QuestEvent,
        SummaryEntry
    };
    Q_ENUM(EntryType)

    enum Roles {
        EntryTypeRole = Qt::UserRole + 1,
        RoleNameRole,
        ContentRole,
        TimestampRole,
        SourceRole,
        AllyNameRole,
        TypeLabelRole,
        VaultKeyRole
    };

    explicit ConversationModel(QObject *parent = nullptr);

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    QVariant data(const QModelIndex &index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;

    int count() const;
    bool autoScroll() const;
    void setAutoScroll(bool enabled);

    Q_INVOKABLE void clear();

public slots:
    void addThought(const QString &type, const QString &text);
    void addDotMessage(const QString &text);
    void addStoneMessage(const QVariantMap &msg);
    void addQuestEvent(const QString &description);
    void addSummary(const QString &timeRange, const QString &oneLiner, const QString &vaultKey);

signals:
    void countChanged();
    void autoScrollChanged();

private:
    struct Entry {
        EntryType entryType;
        QString roleName;
        QString content;
        QDateTime timestamp;
        QString source;
        QString allyName;
        QString typeLabel;
        QString vaultKey;
    };

    QList<Entry> m_entries;
    bool m_autoScroll = true;
};

#endif // CONVERSATIONMODEL_H
