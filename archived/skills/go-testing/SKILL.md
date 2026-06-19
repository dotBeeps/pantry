---
name: go-testing
description: "Go testing patterns with the testing package, testify, table-driven tests, benchmarks, and fuzzing. Use when writing Go tests, debugging test failures, running benchmarks, or setting up test infrastructure."
license: MIT
---

# Go Testing

Use `go test` and the `testing` package. This skill covers **test patterns, mocking, benchmarks, and debugging** — see the `go` skill for code conventions and `go-check` for vet/lint commands.

## Quick Reference

```bash
# Run all tests
go test ./...

# Run with verbose output (show each test name)
go test -v ./...

# Run a specific test by name (regex)
go test -run TestFoo ./...
go test -run "TestUser/create" ./...   # subtest

# Run a specific package
go test ./internal/user/...

# Disable test cache (always rerun)
go test -count=1 ./...

# Stop after first failure
go test -failfast ./...

# Run with race detector
go test -race ./...

# Run with coverage
go test -cover ./...
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out       # open HTML report
go tool cover -func=coverage.out       # per-function summary

# Run benchmarks (tests are skipped by default)
go test -bench=. ./...
go test -bench=BenchmarkFoo -benchmem ./...  # show allocations
go test -bench=. -benchtime=5s ./...         # longer run

# Run fuzz test
go test -fuzz=FuzzFoo ./...
go test -fuzz=FuzzFoo -fuzztime=30s ./...
```

## Test File Conventions

```
internal/
  user/
    user.go
    user_test.go          ← _test.go suffix — compiled only for tests
    user_integration_test.go   ← separate file for integration tests
    testdata/             ← fixture files (go test is run from package dir)
      golden/
        user.json
```

```go
// White-box testing (same package — access unexported symbols)
package user

// Black-box testing (external package — only exported symbols)
package user_test

import "github.com/myorg/myapp/internal/user"
```

Test functions: `TestXxx(t *testing.T)` — `Xxx` must start with uppercase.

## Table-Driven Tests

The standard Go idiom. Prefer this over separate test functions for variations.

```go
func TestParseDate(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    time.Time
        wantErr bool
    }{
        {
            name:  "valid ISO date",
            input: "2024-01-15",
            want:  time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC),
        },
        {
            name:    "empty string",
            input:   "",
            wantErr: true,
        },
        {
            name:    "invalid format",
            input:   "15/01/2024",
            wantErr: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := ParseDate(tt.input)
            if (err != nil) != tt.wantErr {
                t.Errorf("ParseDate(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
                return
            }
            if !tt.wantErr && !got.Equal(tt.want) {
                t.Errorf("ParseDate(%q) = %v, want %v", tt.input, got, tt.want)
            }
        })
    }
}
```

## Subtests

```go
func TestUser(t *testing.T) {
    t.Run("create", func(t *testing.T) {
        user, err := CreateUser("dot@example.com")
        if err != nil {
            t.Fatal(err)         // t.Fatal stops this subtest only
        }
        if user.Email != "dot@example.com" {
            t.Errorf("got %q, want %q", user.Email, "dot@example.com")
        }
    })

    t.Run("duplicate email", func(t *testing.T) {
        _, err := CreateUser("used@example.com")
        if err == nil {
            t.Error("expected error, got nil")
        }
    })
}
```

Run specific subtest: `go test -run "TestUser/create"` (uses regex — `/` separates levels)

## Test Helpers

```go
// t.Helper() — marks function as helper, errors point to caller not helper
func requireNoError(t *testing.T, err error) {
    t.Helper()
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
}

// t.Cleanup() — runs after test or subtest, even on failure
func TestWithServer(t *testing.T) {
    srv := startServer()
    t.Cleanup(func() { srv.Stop() })   // registered cleanups run LIFO
    // test...
}

// t.TempDir() — creates a temp directory, deleted after test
func TestWriteFile(t *testing.T) {
    dir := t.TempDir()
    path := filepath.Join(dir, "output.txt")
    // write and assert...
}

// t.Setenv() — sets env var, restored after test (Go 1.17+)
func TestWithEnv(t *testing.T) {
    t.Setenv("DATABASE_URL", "sqlite:///:memory:")
    // test uses env var...
}

// t.Parallel() — runs test concurrently with other parallel tests
func TestConcurrent(t *testing.T) {
    t.Parallel()
    // ...
}
```

## Testify

```bash
go get github.com/stretchr/testify
```

### assert vs require

```go
import (
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

// assert — logs failure, test continues
assert.Equal(t, expected, actual)
assert.Equal(t, expected, actual, "optional message")

// require — fails and stops test immediately (like t.Fatal)
require.NoError(t, err)       // use require when subsequent code would panic on failure
require.NotNil(t, user)
user.DoSomething()             // safe to call — require stopped test if user was nil
```

### Common Matchers

```go
// Equality
assert.Equal(t, 42, result)
assert.NotEqual(t, 0, result)
assert.EqualValues(t, int64(42), int32(42))   // cross-type

// Nil / zero
assert.Nil(t, err)
assert.NotNil(t, user)
assert.Zero(t, count)
assert.NotZero(t, id)

// Boolean
assert.True(t, user.Active)
assert.False(t, user.Deleted)

// Collections
assert.Len(t, items, 3)
assert.Contains(t, items, "admin")
assert.ElementsMatch(t, expected, actual)     // order-independent
assert.Empty(t, list)
assert.NotEmpty(t, list)

// Errors
assert.NoError(t, err)
assert.Error(t, err)
assert.ErrorIs(t, err, ErrNotFound)
assert.ErrorAs(t, err, &target)

// Strings
assert.Contains(t, s, "substring")
assert.HasPrefix(t, s, "http")
```

### Testify Suites

```go
type UserSuite struct {
    suite.Suite
    db *Database
}

func (s *UserSuite) SetupSuite()  { s.db = connectTestDB() }
func (s *UserSuite) TearDownTest() { s.db.Reset() }

func (s *UserSuite) TestCreate() {
    user, err := s.db.CreateUser("dot@example.com")
    s.Require().NoError(err)
    s.Equal("dot@example.com", user.Email)
}

func TestUserSuite(t *testing.T) { suite.Run(t, new(UserSuite)) }
```

## HTTP Testing

```go
import "net/http/httptest"

// Test a handler directly (no network)
func TestGetUser(t *testing.T) {
    req := httptest.NewRequest("GET", "/users/1", nil)
    w := httptest.NewRecorder()

    handler := NewUserHandler(mockRepo)
    handler.ServeHTTP(w, req)

    resp := w.Result()
    assert.Equal(t, http.StatusOK, resp.StatusCode)

    var user User
    json.NewDecoder(resp.Body).Decode(&user)
    assert.Equal(t, 1, user.ID)
}

// Start a real test server (for client code testing)
func TestClientFetch(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        json.NewEncoder(w).Encode(User{ID: 1, Name: "Dot"})
    }))
    defer srv.Close()

    client := NewClient(srv.URL)
    user, err := client.GetUser(1)
    require.NoError(t, err)
    assert.Equal(t, "Dot", user.Name)
}

// TLS server
srv := httptest.NewTLSServer(handler)
client := srv.Client()   // pre-configured to trust the test cert
```

## Mocking Approaches

### Interface-Based (preferred)

```go
// Define interface in production code
type Emailer interface {
    Send(to, subject, body string) error
}

// Hand-rolled mock
type mockEmailer struct {
    calls []emailCall
    err   error
}

func (m *mockEmailer) Send(to, subject, body string) error {
    m.calls = append(m.calls, emailCall{to, subject, body})
    return m.err
}

func TestSendsWelcome(t *testing.T) {
    mock := &mockEmailer{}
    svc := NewUserService(mock)
    svc.Register("dot@example.com")
    assert.Len(t, mock.calls, 1)
    assert.Equal(t, "dot@example.com", mock.calls[0].to)
}
```

### testify/mock

```go
type MockEmailer struct{ mock.Mock }

func (m *MockEmailer) Send(to, subject, body string) error {
    return m.Called(to, subject, body).Error(0)
}

func TestSendsWelcome(t *testing.T) {
    m := new(MockEmailer)
    m.On("Send", "dot@example.com", mock.AnythingOfType("string"), mock.Anything).Return(nil)

    NewUserService(m).Register("dot@example.com")

    m.AssertExpectations(t)   // verifies all On() calls were made
}
```

## Benchmarks

```go
func BenchmarkParseDate(b *testing.B) {
    for b.Loop() {         // Go 1.24+: b.Loop() manages reset automatically
        ParseDate("2024-01-15")
    }
}

// Pre-1.24 pattern
func BenchmarkParseDate(b *testing.B) {
    b.ResetTimer()         // exclude setup from timing
    for i := 0; i < b.N; i++ {
        ParseDate("2024-01-15")
    }
}

// Report allocations
func BenchmarkJSON(b *testing.B) {
    b.ReportAllocs()
    data := []byte(`{"id":1,"name":"Dot"}`)
    for b.Loop() {
        var u User
        json.Unmarshal(data, &u)
    }
}

// Sub-benchmarks
func BenchmarkEncode(b *testing.B) {
    sizes := []int{10, 100, 1000}
    for _, n := range sizes {
        b.Run(fmt.Sprintf("n=%d", n), func(b *testing.B) {
            data := makeData(n)
            for b.Loop() {
                encode(data)
            }
        })
    }
}
```

```bash
go test -bench=. -benchmem ./...
go test -bench=BenchmarkParseDate -benchtime=10s ./...

# Compare with benchstat
go test -bench=. -count=5 ./... > old.txt && # make changes
go test -bench=. -count=5 ./... > new.txt && benchstat old.txt new.txt
```

## Fuzzing

```go
func FuzzParseDate(f *testing.F) {
    // Seed corpus — known interesting inputs
    f.Add("2024-01-15")
    f.Add("")
    f.Add("not-a-date")

    f.Fuzz(func(t *testing.T, input string) {
        // Must not panic — any panic is a failure
        // Don't assert specific values — only invariants
        result, err := ParseDate(input)
        if err == nil {
            // If no error, result must be valid
            if result.IsZero() {
                t.Errorf("ParseDate(%q) returned zero time without error", input)
            }
        }
    })
}
```

```bash
# Fuzz for 30 seconds
go test -fuzz=FuzzParseDate -fuzztime=30s ./...

# Fuzz corpus stored in testdata/fuzz/FuzzParseDate/
# Failing inputs are saved there and replayed on future runs
```

## Test Fixtures and Golden Files

```
testdata/            ← go test runs from package dir, so paths are relative
  input.json
  golden/
    output.txt
```

```go
// Golden file pattern — update with -update flag
var update = flag.Bool("update", false, "update golden files")

func TestRender(t *testing.T) {
    got := renderTemplate(readFile(t, "testdata/input.json"))
    golden := "testdata/golden/output.txt"
    if *update {
        os.WriteFile(golden, got, 0644)
    }
    want, _ := os.ReadFile(golden)
    assert.Equal(t, string(want), string(got))
}
```

```bash
go test -run TestRender -update ./...
```

## Race Detection

```bash
go test -race ./...      # ~2–20x slower, but catches real concurrency bugs
go build -race -o myapp .
```

Always run `-race` in CI. Output names the goroutines and lines involved in the race.
## Coverage

```bash
go test -cover ./...
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out                          # HTML source view
go tool cover -func=coverage.out | sort -k3 -n            # per-function, sorted
go test -coverprofile=coverage.out -coverpkg=./internal/... ./...  # scoped
```

## Debugging Failing Tests

```bash
go test -v ./...                                 # show each test name + output
go test -run TestFoo ./...                       # single test (regex)
go test -count=1 ./...                           # disable caching
go test -timeout=30s ./...                       # override 10m default
go test -v -run TestFoo ./...                    # show output even on pass
go test -cpuprofile=cpu.out ./... && go tool pprof cpu.out
```

### Common Failures and Fixes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Test passes with `-v`, fails in suite | Data race or global state | Run with `-race`, isolate state |
| `no test files` | File not named `_test.go` | Rename file |
| Test not found by `-run` | Name doesn't match regex | `-run` is regex: escape dots, use exact prefix |
| Results cached unexpectedly | `go test` caches by default | Add `-count=1` to force rerun |
| `t.Fatal` in goroutine panics | Can't call `t.Fatal` from non-test goroutine | Use channel to communicate failure back |
| Subtests don't run in parallel | `t.Parallel()` missing in subtest | Add `tt := tt; t.Run(..., func(t *testing.T) { t.Parallel(); ... })` |
| Benchmark results vary wildly | Machine under load | Use `-benchtime=10s -count=5` and `benchstat` |
| Fuzz corpus not replayed | Wrong directory | Corpus is in `testdata/fuzz/<FuncName>/` |
