---
name: python
description: "Python conventions: uv tooling, typing, project structure. Use when working with Python source files or pyproject.toml."
license: MIT
---

# Python Conventions

## Tooling

- **Package manager**: `uv` — `uv init`, `uv add`, `uv run`, `uv sync`; always `pyproject.toml`, never bare `requirements.txt`
- **Formatter + linter**: `ruff format` + `ruff check`; configure in `pyproject.toml` under `[tool.ruff]`
- **Type checker**: `pyright` — run via `pyright` or let the LSP handle it
- **Test runner**: `pytest` — `uv run pytest`

## Style

- 4 spaces, no tabs; line length 88 (ruff default)
- `snake_case` functions/variables, `PascalCase` classes, `UPPER_SNAKE` constants
- f-strings over `.format()` or `%`
- Comprehensions over explicit loops for simple transforms — don't nest more than 2 levels

## Type Hints

- Always annotate function signatures; return type always explicit
- Use `X | None` not `Optional[X]` (Python 3.10+)
- Use `X | Y` not `Union[X, Y]`
- `from __future__ import annotations` for forward references in older codebases
- Prefer `TypeAlias`, `TypeVar`, `Protocol` over runtime workarounds

## Error Handling

- Catch specific exceptions — never bare `except:`
- Custom exceptions extend `Exception`, not `BaseException`
- Re-raise with `raise` (not `raise e`) to preserve traceback
- Use `contextlib.contextmanager` for resource cleanup over explicit try/finally

## Idioms

- `with` for all resource management (files, connections, locks)
- `dataclasses.dataclass` or `NamedTuple` for structured data — not plain dicts
- Generators over building full lists when iterating once
- `__slots__` on hot-path classes to reduce memory overhead
- `match`/`case` (3.10+) for structural pattern matching over chained `if isinstance`

## Project Structure

```
src/
  mypackage/
    __init__.py
    module.py
tests/
  test_module.py
pyproject.toml
```

- `src/` layout preferred — prevents accidental imports from project root
- `__init__.py` only exports stable public API

## Testing

- `pytest` with `tests/` directory; files `test_*.py`
- Fixtures in `conftest.py`
- Use `pytest.raises` as context manager to inspect exceptions
- Never mock the DB — use real DB via pytest fixtures or testcontainers

## pyproject.toml Baseline

```toml
[tool.ruff]
line-length = 88
[tool.ruff.lint]
select = ["E", "F", "I", "UP"]

[tool.pyright]
pythonVersion = "3.12"
typeCheckingMode = "standard"
```
