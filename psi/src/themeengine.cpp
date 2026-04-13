#include "themeengine.h"

ThemeEngine::ThemeEngine(QObject *parent)
    : QObject(parent)
{
}

QColor ThemeEngine::background() const { return QColor("#1a1a1a"); }
QColor ThemeEngine::surface() const { return QColor("#141414"); }
QColor ThemeEngine::surfaceRaised() const { return QColor("#1e1e1e"); }
QColor ThemeEngine::border() const { return QColor("#2a2a2a"); }
QColor ThemeEngine::accent() const { return QColor("#e85d26"); }
QColor ThemeEngine::accentMuted() const { return QColor("#e8a849"); }
QColor ThemeEngine::text() const { return QColor("#cccccc"); }
QColor ThemeEngine::textMuted() const { return QColor("#888888"); }
QColor ThemeEngine::textDim() const { return QColor("#555555"); }

QColor ThemeEngine::colorThink() const { return QColor("#9b7dd4"); }
QColor ThemeEngine::colorSpeak() const { return QColor("#e8a849"); }
QColor ThemeEngine::colorText() const { return QColor("#cccccc"); }
QColor ThemeEngine::colorObserve() const { return QColor("#5bc4bf"); }
QColor ThemeEngine::colorBeat() const { return QColor("#555555"); }

QColor ThemeEngine::tierPuppy() const { return QColor("#4ade80"); }
QColor ThemeEngine::tierDog() const { return QColor("#3b82f6"); }
QColor ThemeEngine::tierAlly() const { return QColor("#f59e0b"); }
QColor ThemeEngine::tierDragon() const { return QColor("#e85d26"); }
