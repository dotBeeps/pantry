#ifndef THOUGHTMODEL_H
#define THOUGHTMODEL_H

#include <QAbstractListModel>
#include <QDateTime>
#include <QQmlEngine>

class ThoughtModel : public QAbstractListModel
{
    Q_OBJECT
    QML_ELEMENT

    Q_PROPERTY(int count READ count NOTIFY countChanged FINAL)
    Q_PROPERTY(bool autoScroll READ autoScroll WRITE setAutoScroll NOTIFY autoScrollChanged FINAL)

public:
    enum Roles {
        TypeRole = Qt::UserRole + 1,
        TextRole,
        TimestampRole,
        NerveRole
    };

    explicit ThoughtModel(QObject *parent = nullptr);

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    QVariant data(const QModelIndex &index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;

    int count() const;
    bool autoScroll() const;
    void setAutoScroll(bool enabled);

    Q_INVOKABLE void clear();

public slots:
    void addThought(const QString &type, const QString &text,
                    const QString &nerve = QString());

signals:
    void countChanged();
    void autoScrollChanged();

private:
    struct Entry {
        QString type;
        QString text;
        QDateTime timestamp;
        QString nerve;
    };

    QList<Entry> m_entries;
    bool m_autoScroll = true;
};

#endif // THOUGHTMODEL_H
