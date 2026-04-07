# Research: Go Concurrency Best Practices and Patterns

## Summary

Go's concurrency model is built on CSP (Communicating Sequential Processes) — goroutines communicate via channels rather than sharing memory. The official guidance from the Go team centers on three pillars: **pass `context.Context` as the first parameter** to propagate cancellation/deadlines, **use channels to transfer ownership** and mutexes to protect state, and **always ensure every goroutine has a clear exit path** to prevent leaks. The Go blog's pipeline pattern, Effective Go's concurrency chapter, and the Go Wiki's MutexOrChannel page form the canonical reference set.

## Core Principles

### 1. Share Memory by Communicating

> "Do not communicate by sharing memory; instead, share memory by communicating." — [Effective Go](https://go.dev/doc/effective_go#sharing)

Traditional threading protects shared data with locks. Go inverts this: pass data ownership between goroutines via channels so only one goroutine accesses data at a time — no locks needed.

```go
// WRONG: shared state with lock
type Counter struct {
    mu    sync.Mutex
    value int
}

func (c *Counter) Increment() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.value++
}

// BETTER when ownership transfer makes sense:
// Send the value to a single goroutine that owns it
type Counter struct {
    inc chan struct{}
    get chan int
}

func NewCounter() *Counter {
    c := &Counter{inc: make(chan struct{}), get: make(chan int)}
    go func() {
        var value int
        for {
            select {
            case <-c.inc:
                value++
            case c.get <- value:
            }
        }
    }()
    return c
}
```

**Rule:** If you're passing ownership of data from one goroutine to another, use a channel. If you're guarding internal state (caches, config), a mutex is fine. See [§7 Mutex vs Channels](#7-sync-mutex-vs-channels-guidance) for the decision matrix.

---

## 2. Goroutine Lifecycle Management

**Rule: Every goroutine you start must have a clear, guaranteed exit path.**

### 2.1 The Owner Pattern

The goroutine that *starts* a goroutine is responsible for ensuring it can *stop*. The standard shape:

```go
func serve(ctx context.Context) error {
    g, ctx := errgroup.WithContext(ctx)
    
    g.Go(func() error {
        // Worker — exits when ctx is canceled or work is done
        for {
            select {
            case <-ctx.Done():
                return ctx.Err()
            case item := <-workCh:
                if err := process(item); err != nil {
                    return err
                }
            }
        }
    })
    
    return g.Wait() // Blocks until all goroutines exit
}
```

### 2.2 Never Fire-and-Forget

```go
// BAD: no way to stop, no error handling, no lifecycle tracking
go doSomething()

// GOOD: tracked, cancellable, error-propagating
g, ctx := errgroup.WithContext(ctx)
g.Go(func() error {
    return doSomething(ctx)
})
if err := g.Wait(); err != nil {
    // handle
}
```

### 2.3 Goroutine Leak Patterns to Avoid

A goroutine leaks when it blocks forever with no path to exit:

```go
// LEAK: channel send blocks forever if nobody reads
func leak() {
    ch := make(chan int)
    go func() {
        ch <- 42  // blocks forever — ch is never read
    }()
    // function returns, ch is garbage but goroutine lives on
}

// LEAK: channel receive blocks forever
func leak2() {
    ch := make(chan int)
    go func() {
        val := <-ch  // blocks forever — nothing sent, ch never closed
        fmt.Println(val)
    }()
}

// FIX: always pair with a done/context signal
func noLeak(ctx context.Context) {
    ch := make(chan int, 1) // buffer if sender shouldn't block
    go func() {
        select {
        case ch <- 42:
        case <-ctx.Done():
            return
        }
    }()
}
```

**Rules:**
- Every channel send must have a corresponding receive, or use a buffered channel
- Every blocking operation must have a `select` with `ctx.Done()` or a done channel
- Close channels from the *sender* side, never the receiver
- Use `defer close(ch)` in the goroutine that owns the channel

[Source: Go Blog — Pipelines and Cancellation](https://go.dev/blog/pipelines)

---

## 3. context.Context Propagation and Cancellation

### 3.1 Core Rules from the Go Team

> "At Google, we require that Go programmers pass a Context parameter as the first argument to every function on the call path between incoming and outgoing requests." — [Go Blog: Context](https://go.dev/blog/context)

> "Contexts should not be stored inside a struct type, but instead passed to each function that needs it." — [Go Blog: Contexts and Structs](https://go.dev/blog/context-and-structs)

```go
// CORRECT: context as first parameter
func (s *Server) HandleRequest(ctx context.Context, req *Request) (*Response, error)

// WRONG: context in struct
type Server struct {
    ctx context.Context  // Don't do this
}
```

**Why no struct storage:** It obscures the context's lifetime, prevents per-call deadlines/cancellation, and intermingles scopes. Users can't cancel one call without canceling everything.

**Exception:** Backwards compatibility (e.g., `http.Request` stores context because `Do()` couldn't change its signature).

### 3.2 Context Tree and Cancellation

```go
func handleRequest(w http.ResponseWriter, r *http.Request) {
    // Parent context from the request
    ctx := r.Context()
    
    // Derive a child with timeout — canceled when:
    //   1. timeout expires, OR
    //   2. parent is canceled, OR
    //   3. cancel() is called
    ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
    defer cancel()  // ALWAYS defer cancel to release resources
    
    result, err := fetchFromDB(ctx)
    if err != nil {
        // ...
    }
}
```

### 3.3 Respecting Cancellation in Your Code

Every long-running or blocking operation must check `ctx.Done()`:

```go
func fetchFromDB(ctx context.Context, query string) ([]Row, error) {
    // Check if already cancelled before starting work
    if err := ctx.Err(); err != nil {
        return nil, err
    }
    
    rows, err := db.QueryContext(ctx, query) // passes ctx to driver
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var results []Row
    for rows.Next() {
        // For long iterations, periodically check context
        select {
        case <-ctx.Done():
            return results, ctx.Err()
        default:
        }
        var r Row
        if err := rows.Scan(&r); err != nil {
            return nil, err
        }
        results = append(results, r)
    }
    return results, rows.Err()
}
```

### 3.4 Context Values

Use typed, unexported keys to prevent collisions:

```go
// Unexported key type prevents collisions across packages
type contextKey int

const userIPKey contextKey = 0

func NewContext(ctx context.Context, ip net.IP) context.Context {
    return context.WithValue(ctx, userIPKey, ip)
}

func FromContext(ctx context.Context) (net.IP, bool) {
    ip, ok := ctx.Value(userIPKey).(net.IP)
    return ip, ok
}
```

**Rules:**
- `context.Background()` only in `main()`, `init()`, tests, and top-level incoming request handlers
- `context.TODO()` when you know a context is needed but don't have one yet — treat as tech debt
- Never pass `nil` context; use `context.TODO()` instead
- Context values are for request-scoped data crossing API boundaries, NOT for passing optional parameters
- Always `defer cancel()` after `WithCancel`/`WithTimeout`/`WithDeadline`

[Source: Go Blog — Context](https://go.dev/blog/context) · [Go Blog — Contexts and Structs](https://go.dev/blog/context-and-structs)

---

## 4. Channel Patterns

### 4.1 Generator (Source)

A function that returns a receive-only channel. The goroutine owns the channel and closes it when done:

```go
func gen(ctx context.Context, nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out) // Close when done sending
        for _, n := range nums {
            select {
            case out <- n:
            case <-ctx.Done():
                return
            }
        }
    }()
    return out
}
```

### 4.2 Fan-Out

Distribute work: multiple goroutines read from the same channel.

```go
func fanOut(ctx context.Context, in <-chan int, workers int) []<-chan int {
    channels := make([]<-chan int, workers)
    for i := 0; i < workers; i++ {
        channels[i] = process(ctx, in) // Each worker reads from 'in'
    }
    return channels
}

func process(ctx context.Context, in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for n := range in {
            select {
            case out <- n * n:
            case <-ctx.Done():
                return
            }
        }
    }()
    return out
}
```

### 4.3 Fan-In (Merge)

Combine multiple channels into one:

```go
func merge(ctx context.Context, channels ...<-chan int) <-chan int {
    var wg sync.WaitGroup
    out := make(chan int)

    // Start a goroutine per input channel
    wg.Add(len(channels))
    for _, ch := range channels {
        go func(c <-chan int) {
            defer wg.Done()
            for n := range c {
                select {
                case out <- n:
                case <-ctx.Done():
                    return
                }
            }
        }(ch)
    }

    // Close 'out' once all input goroutines are done
    go func() {
        wg.Wait()
        close(out)
    }()

    return out
}
```

### 4.4 Done Channel (Pre-context.Context Pattern)

Before `context.Context` was standard, the done channel pattern served the same purpose. Still useful inside library internals:

```go
func worker(done <-chan struct{}, in <-chan Work) <-chan Result {
    out := make(chan Result)
    go func() {
        defer close(out)
        for w := range in {
            select {
            case out <- doWork(w):
            case <-done:
                return
            }
        }
    }()
    return out
}

// Usage:
done := make(chan struct{})
defer close(done) // Broadcast: closing a channel unblocks ALL receivers

results := worker(done, work)
```

> "Closing a channel can broadcast a 'done' signal to all the goroutines started by a pipeline." — [Go Blog: Pipelines](https://go.dev/blog/pipelines)

### 4.5 Pipeline Construction Rules

From the Go Blog's pipeline article:

1. **Stages close their outbound channels** when all send operations are done
2. **Stages keep receiving** from inbound channels until those channels are closed or senders are unblocked
3. **Unblock senders** either by ensuring sufficient buffer or by signaling via done/context

```go
// Complete pipeline example
func main() {
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()
    
    // Stage 1: Generate
    nums := gen(ctx, 2, 3, 4, 5)
    
    // Stage 2: Fan-out to 2 workers
    c1 := process(ctx, nums)
    c2 := process(ctx, nums)
    
    // Stage 3: Fan-in and consume
    for result := range merge(ctx, c1, c2) {
        fmt.Println(result)
        // cancel() here would tear down the entire pipeline
    }
}
```

### 4.6 Bounded Parallelism (Semaphore Pattern)

Control concurrency with a fixed worker pool rather than unbounded goroutines:

```go
func processAll(ctx context.Context, items []Item) error {
    const maxWorkers = 20
    
    g, ctx := errgroup.WithContext(ctx)
    g.SetLimit(maxWorkers) // errgroup semaphore (Go 1.20+)
    
    for _, item := range items {
        g.Go(func() error {
            return processItem(ctx, item)
        })
    }
    
    return g.Wait()
}
```

Or with a manual semaphore channel:

```go
sem := make(chan struct{}, maxWorkers)
for _, item := range items {
    sem <- struct{}{}  // Acquire
    go func(it Item) {
        defer func() { <-sem }()  // Release
        process(it)
    }(item)
}
// Drain semaphore to wait for completion
for i := 0; i < maxWorkers; i++ {
    sem <- struct{}{}
}
```

[Source: Go Blog — Pipelines and Cancellation](https://go.dev/blog/pipelines)

---

## 5. sync.WaitGroup Patterns

### 5.1 Basic Pattern

```go
var wg sync.WaitGroup

for i := 0; i < n; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done() // Always defer — survives panics
        // work
    }()
}

wg.Wait()
```

### 5.2 Rules

- **Call `Add` before launching the goroutine**, never inside it
- **Always `defer wg.Done()`** — ensures it's called even if the goroutine panics
- **Never copy a WaitGroup** after first use (pass by pointer)
- **Don't `Add` after `Wait` has been called** — causes a panic

### 5.3 WaitGroup + Channel Close Pattern

When multiple goroutines send on a shared channel, WaitGroup coordinates closing it:

```go
func produce(ctx context.Context, items []string) <-chan Result {
    out := make(chan Result)
    var wg sync.WaitGroup
    
    for _, item := range items {
        wg.Add(1)
        go func(it string) {
            defer wg.Done()
            result := process(it)
            select {
            case out <- result:
            case <-ctx.Done():
            }
        }(item)
    }
    
    // Close channel AFTER all senders are done
    go func() {
        wg.Wait()
        close(out)
    }()
    
    return out
}
```

### 5.4 Prefer errgroup Over Raw WaitGroup

`golang.org/x/sync/errgroup` wraps WaitGroup + context + error propagation:

```go
import "golang.org/x/sync/errgroup"

func fetchAll(ctx context.Context, urls []string) ([]Response, error) {
    g, ctx := errgroup.WithContext(ctx)
    responses := make([]Response, len(urls))
    
    for i, url := range urls {
        g.Go(func() error {
            resp, err := fetch(ctx, url)
            if err != nil {
                return err // Cancels ctx, signals all other goroutines
            }
            responses[i] = resp // Safe: each goroutine writes to unique index
            return nil
        })
    }
    
    if err := g.Wait(); err != nil {
        return nil, err
    }
    return responses, nil
}
```

**errgroup advantages over raw WaitGroup:**
- First error cancels the derived context (other goroutines see `ctx.Done()`)
- Returns the first non-nil error
- `SetLimit(n)` for bounded parallelism (Go 1.20+)
- No separate `Add`/`Done` bookkeeping

[Source: errgroup package docs](https://pkg.go.dev/golang.org/x/sync/errgroup)

---

## 6. Avoiding Goroutine Leaks

### 6.1 Leak Symptoms

- Memory grows over time (goroutine stacks + referenced objects)
- `runtime.NumGoroutine()` increases monotonically
- `pprof` goroutine profile shows blocked goroutines

### 6.2 Common Leak Patterns

| Pattern | Cause | Fix |
|---|---|---|
| Blocked channel send | No receiver, unbuffered channel | Buffer the channel, or use `select` with `ctx.Done()` |
| Blocked channel receive | No sender, channel never closed | Close from sender side, or `select` with `ctx.Done()` |
| Infinite loop without exit | No cancellation check | Check `ctx.Done()` in loop body |
| Forgotten timer/ticker | `time.After` in loop allocates each iteration | Use `time.NewTimer`/`time.NewTicker` + `Stop()` |
| Blocked on mutex | Deadlock or very long critical section | Timeout with `context.Context`, or redesign |

### 6.3 The Timer Leak

```go
// LEAK: time.After creates a new timer EACH iteration,
// timers don't GC until they fire
for {
    select {
    case msg := <-ch:
        handle(msg)
    case <-time.After(5 * time.Second): // new timer every loop!
        return
    }
}

// FIX: reuse a single timer
timer := time.NewTimer(5 * time.Second)
defer timer.Stop()
for {
    select {
    case msg := <-ch:
        handle(msg)
        if !timer.Stop() {
            <-timer.C
        }
        timer.Reset(5 * time.Second)
    case <-timer.C:
        return
    }
}
```

### 6.4 Prevention Checklist

1. **Every `go func()` must have a context or done channel path to exit**
2. **Every channel must have a clear close/drain strategy**
3. **Use `errgroup` instead of raw goroutines** — structured lifetime
4. **Use `go test -race`** to catch data races that indicate lifecycle issues
5. **In tests, check `runtime.NumGoroutine()` before/after** to detect leaks
6. **Use `goleak` (uber-go/goleak)** for automated goroutine leak detection in tests

---

## 7. sync.Mutex vs Channels Guidance

From the [Go Wiki](https://go.dev/wiki/MutexOrChannel):

> "Use whichever is most expressive and/or most simple. A common Go newbie mistake is to over-use channels and goroutines just because it's possible."

### 7.1 Decision Matrix

| Use a **Channel** when... | Use a **Mutex** when... |
|---|---|
| Passing ownership of data | Protecting a cache |
| Distributing units of work | Guarding internal struct state |
| Communicating async results | Simple counter/flag |
| Coordinating multiple goroutines | Implementing sync.Map-like patterns |
| Building pipelines | Short critical sections |

### 7.2 Concrete Examples

**Mutex is better:** protecting a map cache

```go
type Cache struct {
    mu    sync.RWMutex
    items map[string]Item
}

func (c *Cache) Get(key string) (Item, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    item, ok := c.items[key]
    return item, ok
}

func (c *Cache) Set(key string, item Item) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.items[key] = item
}
```

**Channel is better:** distributing work to a pool

```go
func workerPool(ctx context.Context, jobs <-chan Job, results chan<- Result, n int) {
    var wg sync.WaitGroup
    for i := 0; i < n; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for job := range jobs {
                select {
                case results <- process(job):
                case <-ctx.Done():
                    return
                }
            }
        }()
    }
    go func() {
        wg.Wait()
        close(results)
    }()
}
```

### 7.3 sync.RWMutex for Read-Heavy Workloads

```go
// Multiple readers can hold RLock simultaneously
// Only one writer can hold Lock (exclusive)
type Config struct {
    mu   sync.RWMutex
    data map[string]string
}

func (c *Config) Get(key string) string {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return c.data[key]
}

func (c *Config) Set(key, value string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.data[key] = value
}
```

### 7.4 sync.Once for One-Time Initialization

```go
type Service struct {
    once   sync.Once
    client *http.Client
}

func (s *Service) getClient() *http.Client {
    s.once.Do(func() {
        s.client = &http.Client{Timeout: 10 * time.Second}
    })
    return s.client
}
```

---

## 8. Race Condition Prevention

### 8.1 Always Use the Race Detector

```bash
go test -race ./...       # Test with race detection
go build -race ./cmd/...  # Build with race detection
go run -race main.go      # Run with race detection
```

> "Data races are among the most common and hardest to debug types of bugs in concurrent systems." — [Go Race Detector docs](https://go.dev/doc/articles/race_detector)

### 8.2 Typical Data Races and Fixes

**Loop variable capture** (classic pre-Go 1.22):

```go
// RACE: goroutines share loop variable 'i'
for i := 0; i < 5; i++ {
    go func() {
        fmt.Println(i)  // Prints 5,5,5,5,5
    }()
}

// FIX (pre-Go 1.22): pass as argument
for i := 0; i < 5; i++ {
    go func(j int) {
        fmt.Println(j)  // Prints 0,1,2,3,4 (in some order)
    }(i)
}

// Go 1.22+: loop variables are per-iteration by default (GOEXPERIMENT=loopvar)
// Go 1.24+: per-iteration is the default behavior
```

**Accidentally shared variable:**

```go
// RACE: goroutines share 'err' with main goroutine
f1, err := os.Create("file1")
go func() {
    _, err = f1.Write(data)  // races with next line
}()
f2, err := os.Create("file2")

// FIX: use := inside goroutine for a local variable
go func() {
    _, err := f1.Write(data) // local err, no race
    _ = err
}()
```

**Unprotected map access:**

```go
// RACE: concurrent map read+write panics in Go
var m = make(map[string]int)

// FIX option 1: sync.Mutex
var mu sync.Mutex
mu.Lock()
m["key"] = 1
mu.Unlock()

// FIX option 2: sync.Map (for specific patterns)
var sm sync.Map
sm.Store("key", 1)
val, _ := sm.Load("key")
```

**Primitive variable access:**

```go
// RACE: concurrent read/write of int64
type Watchdog struct{ last int64 }

// FIX: use sync/atomic
func (w *Watchdog) KeepAlive() {
    atomic.StoreInt64(&w.last, time.Now().UnixNano())
}

func (w *Watchdog) Check() bool {
    return atomic.LoadInt64(&w.last) > time.Now().Add(-10*time.Second).UnixNano()
}
```

### 8.3 Race Prevention Rules

1. **Run `go test -race` in CI** — non-negotiable for concurrent code
2. **Never read and write the same variable from multiple goroutines** without synchronization
3. **Maps are not goroutine-safe** — always protect with mutex or use `sync.Map`
4. **Even `bool` and `int` need synchronization** — compiler/CPU reordering breaks assumptions
5. **Use `sync/atomic` for simple counters/flags** — faster than mutex for single variables
6. **Use `go vet`** — catches some concurrency bugs statically
7. **Immutable data is inherently safe** — create once, share freely, never modify

[Source: Go Race Detector Documentation](https://go.dev/doc/articles/race_detector)

---

## 9. Practical Patterns Summary

### 9.1 Server Lifecycle

```go
func main() {
    ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
    defer stop()
    
    srv := &http.Server{Addr: ":8080"}
    
    g, ctx := errgroup.WithContext(ctx)
    
    g.Go(func() error {
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            return err
        }
        return nil
    })
    
    g.Go(func() error {
        <-ctx.Done()
        shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
        defer cancel()
        return srv.Shutdown(shutdownCtx)
    })
    
    if err := g.Wait(); err != nil {
        log.Fatal(err)
    }
}
```

### 9.2 Ticker/Periodic Work

```go
func periodicWork(ctx context.Context, interval time.Duration) {
    ticker := time.NewTicker(interval)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            doWork(ctx)
        }
    }
}
```

### 9.3 First-Result-Wins (Hedged Requests)

```go
func hedgedFetch(ctx context.Context, urls []string) (*Response, error) {
    ctx, cancel := context.WithCancel(ctx)
    defer cancel() // Cancel losers
    
    results := make(chan *Response, len(urls))
    errs := make(chan error, len(urls))
    
    for _, url := range urls {
        go func(u string) {
            resp, err := fetch(ctx, u)
            if err != nil {
                errs <- err
                return
            }
            results <- resp
        }(url)
    }
    
    for range urls {
        select {
        case resp := <-results:
            return resp, nil // First success wins
        case <-errs:
            // One failed, wait for others
        }
    }
    return nil, errors.New("all fetches failed")
}
```

### 9.4 Rate Limiter with Channels

```go
func rateLimited(ctx context.Context, jobs <-chan Job, rps int) <-chan Result {
    results := make(chan Result)
    limiter := time.NewTicker(time.Second / time.Duration(rps))
    
    go func() {
        defer close(results)
        defer limiter.Stop()
        for job := range jobs {
            select {
            case <-limiter.C:
                results <- process(job)
            case <-ctx.Done():
                return
            }
        }
    }()
    
    return results
}
```

---

## 10. Quick Reference: Rules of Thumb

| # | Rule |
|---|---|
| 1 | Every `go func()` needs a way to exit (context, done channel, or channel close) |
| 2 | Pass `context.Context` as the first parameter, never store in structs |
| 3 | Always `defer cancel()` after `context.WithCancel`/`WithTimeout`/`WithDeadline` |
| 4 | Channels for ownership transfer and coordination; mutexes for state protection |
| 5 | Close channels from the sender, never the receiver |
| 6 | Call `wg.Add(n)` before `go func()`, `defer wg.Done()` inside |
| 7 | Prefer `errgroup` over raw `sync.WaitGroup` for structured concurrency |
| 8 | Run `go test -race` in CI — always |
| 9 | Bound parallelism — never spawn unbounded goroutines per input |
| 10 | Immutable data needs no synchronization; mutable shared data always does |

---

## Sources

### Kept
- **Effective Go: Concurrency** (https://go.dev/doc/effective_go#concurrency) — Canonical reference for goroutines, channels, "share by communicating" principle, parallelization patterns
- **Go Blog: Pipelines and Cancellation** (https://go.dev/blog/pipelines) — Definitive source for fan-in, fan-out, done channel, bounded parallelism, pipeline construction rules
- **Go Blog: Context** (https://go.dev/blog/context) — Official context.Context patterns, WithCancel/WithTimeout usage, context value keys
- **Go Blog: Contexts and Structs** (https://go.dev/blog/context-and-structs) — Why context must be passed as argument not stored in structs, backward compat exception
- **Go Wiki: MutexOrChannel** (https://go.dev/wiki/MutexOrChannel) — Official mutex vs channel decision matrix, WaitGroup guidance
- **Go Race Detector Documentation** (https://go.dev/doc/articles/race_detector) — Race detector usage, typical data race patterns (loop capture, shared vars, maps, primitives), fixes
- **errgroup package** (https://pkg.go.dev/golang.org/x/sync/errgroup) — Structured goroutine groups with error propagation and context cancellation

### Related Talks (Referenced in Sources)
- **Go Concurrency Patterns** — Rob Pike, Google I/O 2012 ([slides](https://go.dev/talks/2012/concurrency.slide#1), [video](https://www.youtube.com/watch?v=f6kdp27TYZs)) — Foundation: generators, multiplexing, select
- **Advanced Go Concurrency Patterns** — Sameer Ajmani, Google I/O 2013 ([blog](https://go.dev/blog/advanced-go-concurrency-patterns), [video](http://www.youtube.com/watch?v=QDDwwePbDtw)) — Complex select patterns, state machines

### Dropped
- General blog posts and tutorials — Redundant with official Go sources; primary docs are more authoritative and precise
- Go memory model spec — Important but too low-level for a patterns guide; relevant rules captured in §8

## Gaps

1. **`sync.Cond` patterns** — Rarely used but important for publisher-subscriber within a process. Official docs cover API but not best practices.
2. **Structured concurrency proposals** — Go doesn't have formal structured concurrency (like Kotlin's coroutine scopes). `errgroup` is the closest. Active discussion in the community.
3. **Benchmarks: mutex vs channel vs atomic** — Official docs don't provide throughput comparisons. Real-world: mutex is ~2-3x faster than channels for simple state protection, atomic is ~10x faster than mutex for single variables.
4. **`sync.Pool` patterns** — Useful for reducing GC pressure in high-throughput concurrent code, not covered here.
5. **Testing concurrent code** — Beyond `-race`, patterns for deterministic concurrency testing (e.g., `go.uber.org/goleak`) deserve dedicated coverage.
