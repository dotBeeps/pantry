#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQuickStyle>

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    QGuiApplication::setApplicationName("psi");
    QGuiApplication::setOrganizationName("hoard");

    QQuickStyle::setStyle("Material");

    QQmlApplicationEngine engine;
    engine.loadFromModule("Psi", "Main");

    if (engine.rootObjects().isEmpty())
        return -1;

    return QGuiApplication::exec();
}
