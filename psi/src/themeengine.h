#ifndef THEMEENGINE_H
#define THEMEENGINE_H

#include <QObject>
#include <QColor>
#include <QQmlEngine>

class ThemeEngine : public QObject
{
    Q_OBJECT
    QML_NAMED_ELEMENT(Theme)
    QML_SINGLETON

    Q_PROPERTY(QColor background READ background CONSTANT FINAL)
    Q_PROPERTY(QColor surface READ surface CONSTANT FINAL)
    Q_PROPERTY(QColor surfaceRaised READ surfaceRaised CONSTANT FINAL)
    Q_PROPERTY(QColor border READ border CONSTANT FINAL)
    Q_PROPERTY(QColor accent READ accent CONSTANT FINAL)
    Q_PROPERTY(QColor accentMuted READ accentMuted CONSTANT FINAL)
    Q_PROPERTY(QColor text READ text CONSTANT FINAL)
    Q_PROPERTY(QColor textMuted READ textMuted CONSTANT FINAL)
    Q_PROPERTY(QColor textDim READ textDim CONSTANT FINAL)

    Q_PROPERTY(QColor colorThink READ colorThink CONSTANT FINAL)
    Q_PROPERTY(QColor colorSpeak READ colorSpeak CONSTANT FINAL)
    Q_PROPERTY(QColor colorText READ colorText CONSTANT FINAL)
    Q_PROPERTY(QColor colorObserve READ colorObserve CONSTANT FINAL)
    Q_PROPERTY(QColor colorBeat READ colorBeat CONSTANT FINAL)

    Q_PROPERTY(QColor tierPuppy READ tierPuppy CONSTANT FINAL)
    Q_PROPERTY(QColor tierDog READ tierDog CONSTANT FINAL)
    Q_PROPERTY(QColor tierAlly READ tierAlly CONSTANT FINAL)
    Q_PROPERTY(QColor tierDragon READ tierDragon CONSTANT FINAL)

public:
    explicit ThemeEngine(QObject *parent = nullptr);

    QColor background() const;
    QColor surface() const;
    QColor surfaceRaised() const;
    QColor border() const;
    QColor accent() const;
    QColor accentMuted() const;
    QColor text() const;
    QColor textMuted() const;
    QColor textDim() const;

    QColor colorThink() const;
    QColor colorSpeak() const;
    QColor colorText() const;
    QColor colorObserve() const;
    QColor colorBeat() const;

    QColor tierPuppy() const;
    QColor tierDog() const;
    QColor tierAlly() const;
    QColor tierDragon() const;
};

#endif // THEMEENGINE_H
