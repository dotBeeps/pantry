---
name: qtquick
description: Qt Quick / QML UI-layer conventions. Use when working with Qt Quick visual components and QML UI.
license: MIT
---

# Qt Quick Conventions

Qt Quick / QML UI-layer rules. For C++ backend conventions see `qt.md`.

## Component Design

- One component per `.qml` file, filename matches component name (PascalCase)
- Use `required property` for component APIs — never rely on context properties
- Declare a `default property alias` when your component wraps children
- Group declarations in order: `id`, required properties, custom properties, standard properties, signals, signal handlers, functions, child items
- Keep components small — extract reusable pieces into separate files early

## Bindings & State

- **Declarative bindings over imperative assignments** — avoid setting properties in `Component.onCompleted` when a binding works
- Minimize JavaScript in QML — complex logic belongs in C++ exposed via `Q_INVOKABLE` or properties
- Use `readonly property` for computed values that shouldn't be assigned
- Avoid binding loops — if two properties depend on each other, restructure with an intermediate state
- Use `Qt.binding()` only when you need to restore a broken binding programmatically

## Layouts & Positioning

- Prefer `anchors` over manual x/y for relative positioning — more efficient than bindings on position
- Use `ColumnLayout` / `RowLayout` / `GridLayout` for responsive UIs, plain `Column` / `Row` for fixed
- In delegates, bind `width` to the view (`listView.width`), never to `parent.width`
- Use `Layout.fillWidth` / `Layout.fillHeight` instead of `anchors.fill` inside Layouts

## ListView & Delegates

- Always set `cacheBuffer` for smooth scrolling on long lists
- Keep delegates lightweight — avoid nested `Loader`s or heavy components inside delegates
- Use `required property` in delegates to receive model roles — don't access `model.roleName` directly
- Set `clip: true` on views to prevent delegate overflow
- Use `DelegateModel` / `DelegateChooser` when you need heterogeneous delegates

## Performance

- Use `Loader` for conditionally instantiated heavy components (`active: false` by default)
- Set `asynchronous: true` on `Loader` and `Image` for off-thread loading
- Prefer `Animator` types (`OpacityAnimator`, `XAnimator`) over `Animation` — they run on the render thread
- Avoid `clip: true` on items that don't need it — it disables batching in the scene graph
- Use `shader effect` sparingly — each one creates a separate render pass
- Use `sourceComponent` over `source` (URL) on `Loader` when the component is local

## Controls & Theming

- Build on `Qt Quick Controls` types, don't reimplement buttons/sliders from raw Items
- Use a single `Material` or `Universal` style per app — don't mix styles
- Customize via attached properties (`Material.accent`, `Material.theme`) not by overriding templates
- Use `Palette` for color customization that respects system themes

## Signals

- Name signals as past-tense events: `clicked`, `itemSelected`, `dragFinished`
- Signal handlers: `onClicked`, `onItemSelected` — auto-generated, don't declare handlers manually
- For component-to-parent communication, emit signals; don't call parent functions directly

## File Structure

- `qml/` — all QML files, organized by feature or screen
- `qml/components/` — reusable UI components
- `qml/views/` or `qml/pages/` — top-level screens
- Register C++ types via `qt_add_qml_module` in CMake — no manual `qmlRegisterType`

## Testing

- Use `TestCase` from `Qt Quick Test` for QML unit tests
- Use `SignalSpy` to verify signal emissions from QML components
- Use `createTemporaryObject` / `createTemporaryQmlObject` for test isolation
- Test visual behavior with `compare()`, `tryCompare()`, and `waitForRendering()`
