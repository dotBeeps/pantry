---
name: python-testing
description: "Python testing with pytest, unittest, and testing best practices. Covers fixtures, parametrize, mocking, assertions, markers, plugins, coverage, and debugging. Use when writing Python tests, debugging test failures, or setting up pytest."
license: MIT
---

# Python Testing

Run tests with pytest. This skill covers **test patterns, fixtures, mocking, and debugging** — see the `python` skill for code conventions.

## Quick Reference

```bash
# Run all tests
pytest

# Run with output (no capture)
pytest -s

# Verbose — show each test name
pytest -v

# Stop on first failure
pytest -x

# Stop after N failures
pytest --maxfail=3

# Run tests matching a name pattern (-k uses and/or/not)
pytest -k "user"
pytest -k "test_create or test_delete"
pytest -k "not slow"

# Run a specific file
pytest tests/test_user.py

# Run a specific test
pytest tests/test_user.py::test_create_user

# Run a specific parametrize case
pytest tests/test_user.py::test_create_user[admin]

# Show locals on failure
pytest -l

# Show full traceback
pytest --tb=long      # default
pytest --tb=short     # shorter
pytest --tb=no        # no traceback
pytest --tb=line      # one line per failure

# Drop into pdb on failure
pytest --pdb

# Drop into pdb at start of each test
pytest --pdb --capture=no

# Run tests in parallel (pytest-xdist)
pytest -n auto        # use all CPUs
pytest -n 4           # use 4 workers
```

## Test Discovery Conventions

```
project/
  src/
    mypackage/
      user.py
  tests/
    conftest.py          ← shared fixtures (discovered automatically)
    test_user.py         ← file must start with test_
    user_test.py         ← also discovered (less common)
    integration/
      conftest.py        ← fixtures scoped to this directory
      test_db.py
```

Rules:
- File names: `test_*.py` or `*_test.py`
- Function/method names: `test_*`
- Class names: `Test*` (no `__init__`)

## Fixtures

```python
import pytest

# Basic fixture
@pytest.fixture
def user():
    return User(name="Dot", email="dot@example.com")

# Use in test — pytest injects by parameter name
def test_user_name(user):
    assert user.name == "Dot"

# Yield fixture — teardown after yield
@pytest.fixture
def db_connection():
    conn = create_connection()
    yield conn           # test runs here
    conn.close()         # teardown

# Fixture scope
@pytest.fixture(scope="function")  # default — new instance per test
@pytest.fixture(scope="class")     # one per test class
@pytest.fixture(scope="module")    # one per test file
@pytest.fixture(scope="session")   # one for entire test run

# autouse — applies to all tests in scope without explicit parameter
@pytest.fixture(autouse=True)
def reset_db():
    yield
    Database.reset()

# Fixtures can depend on other fixtures
@pytest.fixture
def admin_user(user):
    user.role = "admin"
    return user

# Parametrize a fixture (each test using it runs once per value)
@pytest.fixture(params=["sqlite", "postgres"])
def db(request):
    return create_db(request.param)
```

### conftest.py

```python
# tests/conftest.py — fixtures here are available to all tests below this directory
# No import needed — pytest discovers conftest.py automatically

@pytest.fixture(scope="session")
def app():
    return create_app(testing=True)

@pytest.fixture
def client(app):
    return app.test_client()
```

## Parametrize

```python
@pytest.mark.parametrize("input,expected", [
    (2, 4),
    (3, 9),
    (0, 0),
    (-1, 1),
])
def test_square(input, expected):
    assert square(input) == expected

# Named cases (shown in test ID)
@pytest.mark.parametrize("role,can_delete", [
    pytest.param("admin", True, id="admin-can-delete"),
    pytest.param("viewer", False, id="viewer-cannot-delete"),
])
def test_delete_permission(role, can_delete):
    user = User(role=role)
    assert user.can_delete() == can_delete

# Stack multiple parametrize — creates cartesian product
@pytest.mark.parametrize("x", [1, 2])
@pytest.mark.parametrize("y", [10, 20])
def test_multiply(x, y):   # runs 4 times: (1,10), (1,20), (2,10), (2,20)
    assert multiply(x, y) == x * y
```

## Assertions

```python
# Plain assert — pytest rewrites for detailed output on failure
assert result == expected
assert user.name == "Dot"
assert items == ["a", "b", "c"]
assert "error" in response.text

# Exceptions
with pytest.raises(ValueError):
    parse("")

with pytest.raises(ValueError, match="cannot be empty"):
    parse("")

with pytest.raises(ValueError) as exc_info:
    parse("")
assert exc_info.value.code == 400

# Warnings
with pytest.warns(DeprecationWarning):
    legacy_function()

# Floating point
assert result == pytest.approx(0.1 + 0.2)
assert result == pytest.approx(1.0, rel=1e-3)   # relative tolerance
assert result == pytest.approx(1.0, abs=0.01)    # absolute tolerance
```

## Mocking

### unittest.mock (stdlib)

```python
from unittest.mock import MagicMock, patch, call

# patch as decorator — restored after test
@patch("myapp.services.send_email")
def test_sends_welcome(mock_send):
    register_user("dot@example.com")
    mock_send.assert_called_once_with("dot@example.com", subject="Welcome")

# patch as context manager
def test_sends_welcome():
    with patch("myapp.services.send_email") as mock_send:
        register_user("dot@example.com")
        assert mock_send.called

# patch on an object attribute
@patch.object(UserService, "find_by_email", return_value=None)
def test_new_user(mock_find):
    ...

# MagicMock — auto-creates attributes and supports magic methods
mock = MagicMock()
mock.query.return_value = [{"id": 1}]
mock.query.side_effect = DatabaseError("down")   # raise on call

# Call assertions
mock.assert_called_once()
mock.assert_called_with(arg1, arg2)
mock.assert_not_called()
assert mock.call_count == 2
assert mock.call_args_list == [call("a"), call("b")]
```

### monkeypatch (pytest built-in)

```python
# Patch any attribute in scope of the test
def test_env_override(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setattr(config, "debug", True)
    monkeypatch.delitem(os.environ, "SECRET_KEY", raising=False)

# Patch a function
def test_no_network(monkeypatch):
    monkeypatch.setattr(requests, "get", lambda url: FakeResponse(200))
```

### pytest-mock (third-party, thin wrapper around unittest.mock)

```python
# pip install pytest-mock
def test_sends_email(mocker):
    mock_send = mocker.patch("myapp.services.send_email")
    register_user("dot@example.com")
    mock_send.assert_called_once()

# mocker.spy — wraps real implementation, records calls
def test_calls_validator(mocker):
    spy = mocker.spy(UserService, "validate")
    create_user("dot@example.com")
    assert spy.call_count == 1
```

## Markers

```python
# Skip — always
@pytest.mark.skip(reason="broken upstream")
def test_something():
    ...

# Skip conditionally
@pytest.mark.skipif(sys.platform == "win32", reason="unix only")
def test_unix_feature():
    ...

# Expected failure
@pytest.mark.xfail(reason="bug #123 not fixed yet")
def test_future_feature():
    ...

# Expected failure on specific condition
@pytest.mark.xfail(strict=True)   # fails if test unexpectedly passes
def test_must_fail():
    ...
```

### Custom Markers

Register in `pytest.ini` or `pyproject.toml` to avoid warnings:

```toml
# pyproject.toml
[tool.pytest.ini_options]
markers = [
    "slow: mark test as slow (deselect with '-m not slow')",
    "integration: mark as integration test",
]
```

```python
@pytest.mark.slow
@pytest.mark.integration
def test_full_pipeline():
    ...
```

```bash
pytest -m "not slow"           # skip slow tests
pytest -m "integration"        # only integration tests
pytest -m "slow and not db"    # combine markers
```

## Plugins

| Plugin | Install | Use |
|--------|---------|-----|
| **pytest-cov** | `pip install pytest-cov` | Coverage reports |
| **pytest-asyncio** | `pip install pytest-asyncio` | Async test functions |
| **pytest-xdist** | `pip install pytest-xdist` | Parallel test execution |
| **pytest-randomly** | `pip install pytest-randomly` | Randomize test order |
| **pytest-mock** | `pip install pytest-mock` | `mocker` fixture |
| **pytest-httpx** | `pip install pytest-httpx` | Mock httpx requests |
| **respx** | `pip install respx` | Mock httpx/requests |
| **factory-boy** | `pip install factory-boy` | Object factories for fixtures |

### pytest-asyncio

```python
import pytest

# Mark async tests (or configure asyncio_mode = "auto" in config)
@pytest.mark.asyncio
async def test_async_fetch():
    result = await fetch_user(1)
    assert result["id"] == 1

# Async fixture
@pytest.fixture
async def async_client():
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
```

```toml
# pyproject.toml — auto mode (no decorator needed)
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

## Coverage

```bash
# Run with coverage (pytest-cov)
pytest --cov=mypackage

# Coverage with branch analysis
pytest --cov=mypackage --cov-branch

# HTML report
pytest --cov=mypackage --cov-report=html
open htmlcov/index.html

# Fail if below threshold
pytest --cov=mypackage --cov-fail-under=80

# Show missing lines in terminal
pytest --cov=mypackage --cov-report=term-missing
```

Configure in `pyproject.toml`:
```toml
[tool.coverage.run]
branch = true
source = ["mypackage"]
omit = ["*/migrations/*", "*/conftest.py"]

[tool.coverage.report]
fail_under = 80
show_missing = true
```

## Common Patterns and Anti-Patterns

```python
# ✓ One assertion concept per test
def test_user_created():
    user = create_user("dot@example.com")
    assert user.id is not None

def test_user_has_default_role():
    user = create_user("dot@example.com")
    assert user.role == "viewer"

# ✗ Multiple unrelated assertions (hard to diagnose failures)
def test_user():
    user = create_user("dot@example.com")
    assert user.id is not None
    assert user.role == "viewer"
    assert user.created_at is not None
    assert send_email.called    # ← if this fails, role test is skipped

# ✓ Use fixtures for repeated setup
@pytest.fixture
def admin(db):
    return db.create_user(role="admin")

# ✗ Repeating setup in every test
def test_admin_can_delete():
    db = setup_db()
    admin = db.create_user(role="admin")   # repeated in 10 tests

# ✓ Test edge cases explicitly
@pytest.mark.parametrize("email", ["", "not-an-email", "a" * 256 + "@x.com"])
def test_invalid_email_rejected(email):
    with pytest.raises(ValueError):
        create_user(email)
```

## Debugging Failing Tests

```bash
# Most useful flags combined
pytest -xvs tests/test_user.py::test_create_user

# -x   stop on first failure
# -v   verbose test names
# -s   no output capture (see print/logging)

# Show full diff for assert failures
pytest --tb=long -v

# Drop into debugger on failure
pytest --pdb

# Set a breakpoint in test code (no flags needed)
def test_something():
    breakpoint()    # drops into pdb
    assert compute() == 42

# Run only last failed tests (requires pytest-cache)
pytest --lf              # last failed
pytest --ff              # failed first, then rest

# Show why a test was collected/skipped
pytest --collect-only
pytest --collect-only -q  # quiet list
```

### Common Failures and Fixes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `fixture not found` | Typo in fixture name or not in conftest.py | Check spelling, move fixture to conftest.py |
| Test passes alone, fails in suite | Test order dependency / shared state | Use `pytest-randomly`, isolate state in `beforeEach` |
| Mock not intercepting | Patching wrong path | Patch where the name is **used**, not defined |
| `ImportError` during collection | Circular import or missing `__init__.py` | Add `__init__.py`, fix circular imports |
| Async test never awaited | Missing `@pytest.mark.asyncio` | Add marker or set `asyncio_mode = "auto"` |
| `ResourceWarning: unclosed` | Fixture not closing resource | Use `yield` fixture with cleanup after yield |
| Parametrize ID collision | Duplicate parameter values | Add explicit `id=` to `pytest.param()` |
