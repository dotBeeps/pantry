---
name: qt
description: Qt/C++/QML conventions beyond clang-tidy and qmllint. Use when working with Qt C++ projects.
license: MIT
---

# Qt Conventions

Qt/C++/QML rules beyond what clang-tidy and qmllint enforce.

## C++ Idioms

- Use the **Qt object tree** for memory management — pass `parent` to constructors, don't manually `delete` parented objects
- Never use raw `new` for non-QObject types — prefer `std::unique_ptr` / `std::make_unique`
- Use `QScopedPointer` or `std::unique_ptr` for QObjects only when they have **no parent**
- Connect signals to slots with the **pointer-to-member** syntax: `connect(sender, &Sender::signal, receiver, &Receiver::slot)` — never use string-based `SIGNAL()`/`SLOT()` macros
- Mark all `Q_PROPERTY` declarations `FINAL` unless subclass override is intentional
- Use `QStringLiteral` for compile-time string literals, `QLatin1StringView` for ASCII comparisons
- Prefer `qsizetype` over `int` for container sizes and indices
- Use `Q_EMIT` / `Q_SIGNAL` / `Q_SLOT` keywords over `emit` / `signals` / `slots` to avoid macro conflicts

## QML

- **Declarative bindings over imperative assignments** — avoid `Component.onCompleted` property sets when a binding works
- Keep JavaScript in QML minimal — complex logic belongs in C++ exposed via `Q_INVOKABLE` or properties
- One QML component per file, filename matches component name (PascalCase)
- Group property declarations: `id`, custom properties, standard properties, signal handlers, child objects
- Use `required property` for component APIs — don't rely on context properties
- Prefer `Loader` for conditionally instantiated heavy components
- Use `qmllint` and `qmlformat` — configure them in the project's `.qmllint.ini`

## Signals & Slots

- Prefer `&Class::method` connections over lambdas unless you need captures
- Always consider object lifetime — use `QPointer` or ensure receiver outlives the connection
- Use `Qt::QueuedConnection` explicitly only when crossing thread boundaries
- Disconnect signals in destructors only if the receiver outlives the sender

## Structure

- Separate QML from C++ backend: `qml/` for UI, `src/` for logic
- Use QML modules (`qt_add_qml_module`) — don't register types manually with `qmlRegisterType`
- CMake is the only supported build system — no qmake for new projects
- Use `qt_standard_project_setup()` in CMakeLists.txt

## Testing

- Use `QTest` framework with `QVERIFY`, `QCOMPARE`, `QTEST_MAIN`
- Test QML with `QQuickTest` and `TestCase` components
- Use `QSignalSpy` to verify signal emissions
- Mock external dependencies, but never mock Qt internals

## Threading

- Never touch GUI objects from worker threads
- Use `QThread::create()` or subclass `QObject` and `moveToThread()` — don't subclass `QThread`
- Prefer `QtConcurrent::run` for simple parallel tasks
- Use signals/slots for cross-thread communication — Qt handles marshalling

## Error Handling

- Check return values from `QFile::open`, `QProcess::start`, etc. — they return `bool`, not exceptions
- Use `qWarning()`, `qCritical()`, `qDebug()` with category logging (`Q_LOGGING_CATEGORY`)
- Never use C++ exceptions across Qt API boundaries
