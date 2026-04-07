# Research: Go Code Style & Conventions

## Summary

Go's style philosophy is codified across four authoritative tiers: **Effective Go** (foundational idioms), **Code Review Comments** (review-time checklist), **Go Proverbs** (design philosophy), and the **Google Go Style Guide** (comprehensive decisions). The core thesis is radical simplicity — `gofmt` eliminates formatting debates, naming is short and contextual rather than descriptive, packages are small and focused, and the zero value should always be useful. Every rule traces back to one principle: **clear is better than clever**.

## Findings

### 1. Naming Conventions

#### MixedCaps — No Exceptions

1. **MixedCaps is the only casing convention** — Go uses `MixedCaps` (exported) and `mixedCaps` (unexported). Never use `snake_case` or `SCREAMING_CAPS`. An unexported constant is `maxLength`, not `MAX_LENGTH`. [Code Review Comments: Mixed Caps](https://go.dev/wiki/CodeReviewComments#mixed-caps)

2. **Initialisms retain consistent case** — Acronyms like `URL`, `HTTP`, `ID` are all-caps when exported, all-lower when unexported. Write `ServeHTTP` not `ServeHttp`; `xmlHTTPRequest` or `XMLHTTPRequest`, never `XmlHttpRequest`; `appID` not `appId`. [Code Review Comments: Initialisms](https://go.dev/wiki/CodeReviewComments#initialisms)

3. **Variable names are short, not descriptive** — The further from its declaration a name is used, the more descriptive it should be. Local loop variables can be single letters (`i`, `r`, `c`). Method receivers are 1-2 letters. Global/package-level variables need real names. [Code Review Comments: Variable Names](https://go.dev/wiki/CodeReviewComments#variable-names)
   ```go
   // Good
   for i, v := range items { ... }
   func (b *Buffer) Read(p []byte) (n int, err error)

   // Bad
   for index, value := range items { ... }
   func (buffer *Buffer) Read(data []byte) (bytesRead int, readErr error)
   ```

4. **Getters omit "Get"** — If a field is `owner`, the getter is `Owner()`, not `GetOwner()`. The setter is `SetOwner()`. Export casing already distinguishes access. [Effective Go: Getters](https://go.dev/doc/effective_go#Getters)

#### Interface Naming

5. **One-method interfaces use -er suffix** — `Reader`, `Writer`, `Formatter`, `Stringer`, `CloseNotifier`. Honor canonical names and signatures — if your type has a method with the same meaning as `String()`, call it `String` not `ToString`. [Effective Go: Interface Names](https://go.dev/doc/effective_go#interface-names)

6. **Interfaces belong to the consumer, not the producer** — Define interfaces in the package that *uses* them, not the one that *implements* them. Return concrete types; let callers create their own interfaces from what they need. [Code Review Comments: Interfaces](https://go.dev/wiki/CodeReviewComments#interfaces)
   ```go
   // GOOD: Consumer defines what it needs
   package consumer
   type Thinger interface { Thing() bool }
   func Foo(t Thinger) string { ... }

   // BAD: Producer pre-defining interfaces
   package producer
   type Thinger interface { Thing() bool }
   func NewThinger() Thinger { return defaultThinger{} }
   ```

7. **Don't define interfaces before they're used** — Without a realistic usage example, you can't know what methods an interface needs. Don't define interfaces "for mocking" — design APIs to be testable via the public API of the real implementation. [Code Review Comments: Interfaces](https://go.dev/wiki/CodeReviewComments#interfaces), [Google Style Guide: Interfaces](https://google.github.io/styleguide/go/decisions#interfaces)

#### Receiver Names

8. **Receivers are 1-2 letter type abbreviations, consistent across all methods** — `c` for `Client`, `b` for `Buffer`, `s` for `Server`. Never `this`, `self`, or `me`. If you use `c` in one method, don't use `cl` in another. The name serves no documentary purpose; its role is obvious. [Code Review Comments: Receiver Names](https://go.dev/wiki/CodeReviewComments#receiver-names)
   ```go
   func (c *Client) Get(url string) (*Response, error) { ... }
   func (c *Client) Do(req *Request) (*Response, error) { ... }
   ```

---

### 2. Package Design Principles

9. **Package names are short, lowercase, single-word** — No underscores, no mixedCaps. Err on the side of brevity (`bufio`, `fmt`, `strconv`). The package name is the base name of its source directory. [Effective Go: Package Names](https://go.dev/doc/effective_go#package-names)

10. **Don't stutter — names include the package prefix** — A type in package `chubby` should be `File`, not `ChubbyFile`, because callers write `chubby.File`. The function `ring.New` is better than `ring.NewRing`. Use the package name as context to keep exported names short. [Code Review Comments: Package Names](https://go.dev/wiki/CodeReviewComments#package-names), [Effective Go: Package Names](https://go.dev/doc/effective_go#package-names)
    ```go
    // Good
    http.Client     // not http.HTTPClient
    bytes.Buffer    // not bytes.ByteBuffer
    ring.New()      // not ring.NewRing()

    // Bad
    util.StringUtil
    common.CommonError
    ```

11. **Avoid meaningless package names** — `util`, `common`, `misc`, `api`, `types`, `interfaces` are all banned. If you can't name the package after what it *does*, the package boundary is wrong. [Code Review Comments: Package Names](https://go.dev/wiki/CodeReviewComments#package-names)

12. **A little copying is better than a little dependency** — Don't import a package for one small function. Copy it instead. Reduces coupling and build graphs. [Go Proverbs](https://go-proverbs.github.io/)

---

### 3. Comment Conventions (Godoc)

13. **Doc comments are full sentences starting with the name** — Every exported name gets a doc comment. Comments begin with the name of the thing described and end with a period. This produces clean godoc output. [Code Review Comments: Comment Sentences](https://go.dev/wiki/CodeReviewComments#comment-sentences), [Go Doc Comments](https://go.dev/doc/comment)
    ```go
    // Request represents a request to run a command.
    type Request struct { ... }

    // Encode writes the JSON encoding of req to w.
    func Encode(w io.Writer, req *Request) { ... }
    ```

14. **Package comments start with "Package name ..."** — Appears adjacent to the `package` clause, no blank line between. For multi-file packages, only one file has the package comment. For `main` packages, use "Binary/Command/Program name ..." [Go Doc Comments: Packages](https://go.dev/doc/comment#package)
    ```go
    // Package math provides basic constants and mathematical functions.
    package math
    ```

15. **Function comments explain what is returned or what side effects occur** — Focus on what the caller needs to know, not internal implementation. Use "reports whether" for boolean returns, not "returns true if". Document special cases explicitly. [Go Doc Comments: Funcs](https://go.dev/doc/comment#func)
    ```go
    // HasPrefix reports whether the string s begins with prefix.
    func HasPrefix(s, prefix string) bool

    // Sqrt returns the square root of x.
    //
    // Special cases are:
    //
    //	Sqrt(+Inf) = +Inf
    //	Sqrt(±0) = ±0
    //	Sqrt(x < 0) = NaN
    //	Sqrt(NaN) = NaN
    func Sqrt(x float64) float64 { ... }
    ```

16. **Doc links use bracket syntax** — `[io.EOF]`, `[bytes.Buffer]`, `[json.Decoder]` create hyperlinks in godoc. Full import paths can be shortened to the local import name. Reference-style links (`[Text]: URL`) keep URLs out of prose. [Go Doc Comments: Links](https://go.dev/doc/comment#links)

17. **Deprecation notices use `Deprecated:` prefix** — A paragraph starting with `Deprecated: ` triggers special handling in tools and pkg.go.dev. Include what to use instead. [Go Doc Comments: Deprecations](https://go.dev/doc/comment#syntax)
    ```go
    // Reset zeros the key data and makes the Cipher unusable.
    //
    // Deprecated: Reset can't guarantee that the key will be entirely
    // removed from the process's memory.
    func (c *Cipher) Reset()
    ```

---

### 4. Import Organization

18. **Two groups separated by a blank line: stdlib first, then everything else** — Standard library imports in the first group, third-party and internal in the second. Use `goimports` to automate this. [Code Review Comments: Imports](https://go.dev/wiki/CodeReviewComments#imports)
    ```go
    import (
        "fmt"
        "os"
        "strings"

        "github.com/foo/bar"
        "rsc.io/goversion/version"
    )
    ```

19. **Don't rename imports unless there's a collision** — Good package names shouldn't need renaming. When collision occurs, rename the most local/project-specific import. [Code Review Comments: Imports](https://go.dev/wiki/CodeReviewComments#imports)

20. **Blank imports (`import _ "pkg"`) only in main or tests** — Side-effect imports belong in the main package or tests that need them, never in library code. [Code Review Comments: Import Blank](https://go.dev/wiki/CodeReviewComments#import-blank)

21. **Dot imports (`import . "pkg"`) only for circular test deps** — The *only* acceptable use is in `_test.go` files that can't be in the package under test due to circular imports. Never in production code. [Code Review Comments: Import Dot](https://go.dev/wiki/CodeReviewComments#import-dot)

---

### 5. Philosophy of Simplicity

22. **"Clear is better than clever"** — The cardinal Go proverb. Prefer straightforward code over elegant abstractions. Readability by the next maintainer (who isn't you) is the primary design constraint. [Go Proverbs](https://go-proverbs.github.io/)

23. **"Make the zero value useful"** — Design types so `var x T` works without initialization. `sync.Mutex` is usable at zero value (unlocked). `bytes.Buffer` is ready to use at zero value (empty buffer). This is a core design principle. [Go Proverbs](https://go-proverbs.github.io/), [Effective Go: new](https://go.dev/doc/effective_go#allocation_new)
    ```go
    var mu sync.Mutex   // Ready to use, no constructor needed
    var buf bytes.Buffer // Empty buffer, ready for writes
    ```

24. **"The bigger the interface, the weaker the abstraction"** — Small interfaces (`io.Reader`: one method) are more powerful than large ones. They compose better and are easier to satisfy. `interface{}` / `any` says nothing. [Go Proverbs](https://go-proverbs.github.io/)

25. **"Errors are values"** — Errors are not exceptions. They're regular values you can program with — store, pass, inspect, wrap. Don't just check errors; handle them gracefully. Use `fmt.Errorf("context: %w", err)` for wrapping. [Go Proverbs](https://go-proverbs.github.io/)

26. **"Don't communicate by sharing memory, share memory by communicating"** — Prefer channels over shared state with mutexes. "Channels orchestrate; mutexes serialize." But keep concurrency simple — prefer synchronous functions and let callers add concurrency. [Go Proverbs](https://go-proverbs.github.io/), [Code Review Comments: Synchronous Functions](https://go.dev/wiki/CodeReviewComments#synchronous-functions)

27. **"Gofmt's style is no one's favorite, yet gofmt is everyone's favorite"** — Don't fight the formatter. Tabs for indentation, no line length limit (but be reasonable), no manual alignment. Let `gofmt` handle all mechanical formatting. [Go Proverbs](https://go-proverbs.github.io/), [Effective Go: Formatting](https://go.dev/doc/effective_go#formatting)

28. **"Don't panic"** — Use `error` and multiple return values for normal error handling. `panic` is only for truly unrecoverable situations. `Must` prefix functions (`MustParse`, `MustCompile`) may panic but should only be called during initialization. [Code Review Comments: Don't Panic](https://go.dev/wiki/CodeReviewComments#dont-panic), [Google Style Guide: Must Functions](https://google.github.io/styleguide/go/decisions#must-functions)

---

### 6. Key Structural Conventions

29. **Indent error flow, keep happy path at minimal indentation** — Handle errors first, return early. Don't use `if err != nil { ... } else { normal }`. Instead: `if err != nil { return err }` then proceed. [Code Review Comments: Indent Error Flow](https://go.dev/wiki/CodeReviewComments#indent-error-flow)
    ```go
    // Good
    x, err := f()
    if err != nil {
        return err
    }
    // use x

    // Bad
    if x, err := f(); err != nil {
        return err
    } else {
        // use x
    }
    ```

30. **Error strings are lowercase, no trailing punctuation** — Because they're composed into larger messages: `fmt.Errorf("reading config: %w", err)` not `fmt.Errorf("Reading config: %w.", err)`. Exception: proper nouns and acronyms. [Code Review Comments: Error Strings](https://go.dev/wiki/CodeReviewComments#error-strings)

31. **`context.Context` is always the first parameter** — Pass it explicitly through the call chain. Never store it in a struct field. Never create custom context types. Use `context.Background()` only in `main` or `init`. [Code Review Comments: Contexts](https://go.dev/wiki/CodeReviewComments#contexts), [Google Style Guide: Contexts](https://google.github.io/styleguide/go/decisions#contexts)
    ```go
    func (s *Server) Handle(ctx context.Context, req *Request) (*Response, error)
    ```

32. **Prefer `var s []string` over `s := []string{}`** — Nil slices are preferred (both have len/cap of 0, both work with `append`). Only use the literal form when you need non-nil encoding (JSON `[]` vs `null`). Test emptiness with `len(s) == 0`, not `s == nil`. [Code Review Comments: Declaring Empty Slices](https://go.dev/wiki/CodeReviewComments#declaring-empty-slices)

33. **Receiver type: when in doubt, use a pointer** — Use pointer receivers when: the method mutates, the struct has sync fields, the struct is large, or you're unsure. Use value receivers for: small immutable structs (like `time.Time`), maps/funcs/channels, basic types. Don't mix receiver types on one type. [Code Review Comments: Receiver Type](https://go.dev/wiki/CodeReviewComments#receiver-type)

34. **Named returns only when they clarify the API** — Don't name returns just to enable naked returns or avoid variable declarations. Use them when the same-type returns need disambiguation or to document meaning. [Code Review Comments: Named Result Parameters](https://go.dev/wiki/CodeReviewComments#named-result-parameters)
    ```go
    // Good — clarifies meaning of two float64 returns
    func (f *Foo) Location() (lat, long float64, err error)

    // Bad — redundant with type
    func (n *Node) Parent1() (node *Node) {}
    ```

35. **Accept interfaces, return concrete types** — Functions should take the narrowest interface they need and return the widest concrete type they produce. This gives callers maximum flexibility. [Google Style Guide: Interfaces](https://google.github.io/styleguide/go/decisions#interfaces)

---

### 7. Complete Go Proverbs Reference

For completeness, all 19 Go Proverbs from Rob Pike's [2015 GopherFest talk](https://www.youtube.com/watch?v=PAAkCSZUG1c):

| # | Proverb | Core Lesson |
|---|---------|-------------|
| 1 | Don't communicate by sharing memory, share memory by communicating. | Channels over mutexes |
| 2 | Concurrency is not parallelism. | Design, don't optimize |
| 3 | Channels orchestrate; mutexes serialize. | Right tool for the job |
| 4 | The bigger the interface, the weaker the abstraction. | Small interfaces compose |
| 5 | Make the zero value useful. | Design for defaults |
| 6 | `interface{}` says nothing. | Type safety matters |
| 7 | Gofmt's style is no one's favorite, yet gofmt is everyone's favorite. | Consistency over preference |
| 8 | A little copying is better than a little dependency. | Minimize coupling |
| 9 | Syscall must always be guarded with build tags. | Platform awareness |
| 10 | Cgo must always be guarded with build tags. | Platform awareness |
| 11 | Cgo is not Go. | Stay in Go when possible |
| 12 | With the unsafe package there are no guarantees. | Safety over speed |
| 13 | Clear is better than clever. | Readability first |
| 14 | Reflection is never clear. | Avoid reflect |
| 15 | Errors are values. | Program with errors |
| 16 | Don't just check errors, handle them gracefully. | Meaningful error handling |
| 17 | Design the architecture, name the components, document the details. | Intentional design |
| 18 | Documentation is for users. | Write for the reader |
| 19 | Don't panic. | Errors, not exceptions |

---

## Sources

### Kept
- **Effective Go** (https://go.dev/doc/effective_go) — The foundational document. Written 2009, still authoritative for language idioms. Covers naming, formatting, commentary, control structures, data, and concurrency.
- **Go Code Review Comments** (https://go.dev/wiki/CodeReviewComments) — Community-maintained checklist of common review comments. Supplements Effective Go with concrete rules on imports, interfaces, receivers, error handling.
- **Go Proverbs** (https://go-proverbs.github.io/) — Rob Pike's 19 principles from GopherFest 2015. Distills Go philosophy into memorable axioms.
- **Google Go Style Guide — Decisions** (https://google.github.io/styleguide/go/decisions) — Google's internal style guide, made public. The most comprehensive and current source. Covers everything from formatting to generics to testing.
- **Go Doc Comments** (https://go.dev/doc/comment) — Official spec for doc comment syntax (Go 1.19+). Covers headings, links, lists, code blocks, deprecation, doc links.

### Dropped
- Blog posts / tutorials — Redundant with the primary sources above, which are all first-party.
- `style.go.dev` overview pages — They just point to the same Google style guide documents fetched above.

## Gaps

- **Module layout conventions** — The official sources say little about how to organize packages *within* a module (e.g., `internal/`, `cmd/`, `pkg/`). The [golang-standards/project-layout](https://github.com/golang-standards/project-layout) repo fills this gap but is community-maintained and [explicitly disclaimed by the Go team](https://go.dev/doc/modules/layout).
- **Generics style** — Still evolving. The Google guide says "don't use generics just because you can" and "write code, don't design types," but detailed conventions for type parameter naming and constraint design are thin.
- **Error wrapping conventions** — `%w` vs `%v`, sentinel errors vs custom types, when to wrap vs when to create new errors — the authoritative sources cover the basics but real-world patterns deserve deeper treatment.
