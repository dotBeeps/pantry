#include "conversationmodel.h"

ConversationModel::ConversationModel(QObject *parent)
    : QAbstractListModel(parent)
{
}

int ConversationModel::rowCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : static_cast<int>(m_entries.size());
}

QVariant ConversationModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() < 0 ||
        index.row() >= static_cast<int>(m_entries.size()))
        return {};

    const Entry &e = m_entries.at(index.row());

    switch (role) {
    case EntryTypeRole:  return static_cast<int>(e.entryType);
    case RoleNameRole:   return e.roleName;
    case ContentRole:    return e.content;
    case TimestampRole:  return e.timestamp;
    case SourceRole:     return e.source;
    case AllyNameRole:   return e.allyName;
    case TypeLabelRole:  return e.typeLabel;
    case VaultKeyRole:   return e.vaultKey;
    default:             return {};
    }
}

QHash<int, QByteArray> ConversationModel::roleNames() const
{
    return {
        { EntryTypeRole, "entryType" },
        { RoleNameRole,  "roleName" },
        { ContentRole,   "content" },
        { TimestampRole, "timestamp" },
        { SourceRole,    "source" },
        { AllyNameRole,  "allyName" },
        { TypeLabelRole, "typeLabel" },
        { VaultKeyRole,  "vaultKey" },
    };
}

int ConversationModel::count() const
{
    return static_cast<int>(m_entries.size());
}

bool ConversationModel::autoScroll() const { return m_autoScroll; }

void ConversationModel::setAutoScroll(bool enabled)
{
    if (m_autoScroll != enabled) {
        m_autoScroll = enabled;
        emit autoScrollChanged();
    }
}

void ConversationModel::addThought(const QString &type, const QString &text)
{
    int row = static_cast<int>(m_entries.size());
    beginInsertRows(QModelIndex(), row, row);
    m_entries.append({
        Thought, QStringLiteral("ember"), text,
        QDateTime::currentDateTime(), QStringLiteral("sse"),
        {}, type, {}
    });
    endInsertRows();
    emit countChanged();
}

void ConversationModel::addDotMessage(const QString &text)
{
    int row = static_cast<int>(m_entries.size());
    beginInsertRows(QModelIndex(), row, row);
    m_entries.append({
        DotMessage, QStringLiteral("dot"), text,
        QDateTime::currentDateTime(), QStringLiteral("local"),
        {}, {}, {}
    });
    endInsertRows();
    emit countChanged();
}

void ConversationModel::addStoneMessage(const QVariantMap &msg)
{
    QString type = msg.value(QStringLiteral("type")).toString();
    QString from = msg.value(QStringLiteral("from")).toString();
    QString content = msg.value(QStringLiteral("content")).toString();

    EntryType et = StoneMessage;
    if (type == QStringLiteral("quest_completed") ||
        type == QStringLiteral("group_completed")) {
        et = QuestEvent;
    }

    int row = static_cast<int>(m_entries.size());
    beginInsertRows(QModelIndex(), row, row);
    m_entries.append({
        et, QStringLiteral("ally:") + from, content,
        QDateTime::currentDateTime(), QStringLiteral("stone"),
        from, type, {}
    });
    endInsertRows();
    emit countChanged();
}

void ConversationModel::addQuestEvent(const QString &description)
{
    int row = static_cast<int>(m_entries.size());
    beginInsertRows(QModelIndex(), row, row);
    m_entries.append({
        QuestEvent, QStringLiteral("system"), description,
        QDateTime::currentDateTime(), QStringLiteral("stone"),
        {}, {}, {}
    });
    endInsertRows();
    emit countChanged();
}

void ConversationModel::addSummary(const QString &timeRange,
                                    const QString &oneLiner,
                                    const QString &vaultKey)
{
    int row = static_cast<int>(m_entries.size());
    beginInsertRows(QModelIndex(), row, row);
    m_entries.append({
        SummaryEntry, QStringLiteral("system"), oneLiner,
        QDateTime::currentDateTime(), QStringLiteral("vault"),
        {}, timeRange, vaultKey
    });
    endInsertRows();
    emit countChanged();
}

void ConversationModel::clear()
{
    if (m_entries.isEmpty())
        return;
    beginResetModel();
    m_entries.clear();
    endResetModel();
    emit countChanged();
}
