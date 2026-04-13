#include "thoughtmodel.h"

ThoughtModel::ThoughtModel(QObject *parent)
    : QAbstractListModel(parent)
{
}

int ThoughtModel::rowCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : static_cast<int>(m_entries.size());
}

QVariant ThoughtModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() < 0 ||
        index.row() >= static_cast<int>(m_entries.size()))
        return {};

    const Entry &e = m_entries.at(index.row());

    switch (role) {
    case TypeRole:
        return e.type;
    case TextRole:
        return e.text;
    case TimestampRole:
        return e.timestamp;
    case NerveRole:
        return e.nerve;
    default:
        return {};
    }
}

QHash<int, QByteArray> ThoughtModel::roleNames() const
{
    return {
        { TypeRole, "type" },
        { TextRole, "text" },
        { TimestampRole, "timestamp" },
        { NerveRole, "nerve" },
    };
}

int ThoughtModel::count() const
{
    return static_cast<int>(m_entries.size());
}

bool ThoughtModel::autoScroll() const { return m_autoScroll; }

void ThoughtModel::setAutoScroll(bool enabled)
{
    if (m_autoScroll != enabled) {
        m_autoScroll = enabled;
        emit autoScrollChanged();
    }
}

void ThoughtModel::addThought(const QString &type, const QString &text,
                              const QString &nerve)
{
    int row = static_cast<int>(m_entries.size());
    beginInsertRows(QModelIndex(), row, row);
    m_entries.append({ type, text, QDateTime::currentDateTime(), nerve });
    endInsertRows();
    emit countChanged();
}

void ThoughtModel::clear()
{
    if (m_entries.isEmpty())
        return;
    beginResetModel();
    m_entries.clear();
    endResetModel();
    emit countChanged();
}
