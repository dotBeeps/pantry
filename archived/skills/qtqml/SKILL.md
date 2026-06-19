---
name: qtqml
description: Qt QML language, type system, modules, and C++ interop rules. Use when working with QML type registration or modules.
license: MIT
---

# Qt QML Conventions

QML language, type system, modules, and C++ interop rules. For visual UI see `qtquick.md`, for C++ backend see `qt.md`.

## Type Registration

- Use `QML_ELEMENT` macro to expose C++ types to QML — never use `qmlRegisterType` manually
- Use `QML_SINGLETON` + `QML_ELEMENT` for C++ singletons — prefer default-constructible classes
- For QML-only singletons, use `pragma Singleton` in the QML file and declare in `qmldir`
- Mark all `Q_PROPERTY` declarations `FINAL` unless subclass override is intended
- Use `Q_GADGET` + `QML_VALUE_TYPE` for lightweight value types (not QObject-derived)
- Use `QML_STRUCTURED_VALUE` when you want JavaScript object literals to construct value types
- Use `QML_UNCREATABLE` with a reason message for types that should only be used as properties

## Modules

- Define modules via `qt_add_qml_module()` in CMake — this generates `qmldir` automatically
- One module per logical feature area — don't dump everything into a single module
- Use versioned imports in QML files: `import MyModule 1.0`
- Keep `qmldir` files in sync if maintaining them manually — mismatches cause silent failures
- Use `QML_IMPORT_NAME` and `QML_IMPORT_MAJOR_VERSION` in CMake for C++ type modules

## QML Language

- Use typed function parameters and return types: `function calculate(x: real, y: real) : real`
- Prefer `let` over `var` in JavaScript blocks
- Use `pragma ComponentBehavior: Bound` to catch unqualified property access at compile time
- Use `pragma ValueTypeBehavior: Addressable` when working with structured value types
- Avoid `eval()` and dynamic `Qt.createQmlObject()` — prefer `Component.createObject()` or `Loader`
- Use type annotations on all property declarations: `property string name` not `property var name`
- Avoid `var` / `variant` property types — use concrete types (`string`, `int`, `real`, `list<Type>`)

## JavaScript Usage

- Keep JS in QML minimal — if a function exceeds ~10 lines, move it to C++
- Use arrow functions for short callbacks in signal connections
- Never modify QML properties from JS `setTimeout` / `setInterval` — use `Timer` instead
- Avoid closures that capture QML objects — they can outlive the object and cause crashes
- Use `console.log()` / `console.warn()` for debugging, but remove before release — use `Q_LOGGING_CATEGORY` from C++ for production logging

## C++ Interop

- Expose data to QML via `Q_PROPERTY` with `NOTIFY` signals — QML relies on change notifications
- Use `Q_INVOKABLE` for functions called from QML, not `Q_SLOT` (unless also used as a slot)
- Return `QVariantList` / `QVariantMap` for dynamic data; prefer `QAbstractListModel` for large datasets
- Use `QML_ANONYMOUS` for types that should be accessible but not instantiable by name
- Pass ownership explicitly: objects returned to QML from C++ should have `QQmlEngine::setObjectOwnership`

## Tooling

- Run `qmllint` on all QML files — configure severity in `.qmllint.ini`
- Use `qmlformat` for consistent formatting
- Enable QML compiler (`qt6_add_qml_module` does this by default) — catches type errors at build time
- Use `qmlls` (QML Language Server) for IDE integration
- Run `qmlimportscanner` to verify all imports resolve correctly before packaging

## Testing

- Test QML logic with `QtTest` / `TestCase` — import the module under test
- Mock C++ backends by registering test doubles via `QML_ELEMENT` in test-only modules
- Use `SignalSpy` to assert signal emissions and property change sequences
- Prefer `tryCompare()` over `compare()` for properties that update asynchronously
