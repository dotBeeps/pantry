---
name: rust
description: Rust conventions beyond clippy/rustfmt. Use when working with Rust source files or Cargo projects.
license: MIT
---

# Rust Conventions

Rust-specific rules beyond what `cargo clippy` and `rustfmt` enforce.

## Idioms

- Prefer `&str` over `&String` in function parameters — accept the most general form
- Use `impl Trait` in argument position for simple generics; named generics when trait bounds get complex
- Prefer `into()` / `from()` over explicit constructors when a `From` impl exists
- Don't fight the borrow checker — restructure ownership instead of reaching for `Rc`/`RefCell`
- Use `Cow<'_, str>` when a function may or may not need to allocate
- Prefer iterators and combinators over manual loops — `.filter().map().collect()` reads better

## Error Handling

- Use `Result<T, E>` for all recoverable errors — never `panic!` in library code
- Propagate errors with `?` — no manual `match` on `Result` just to re-wrap
- `thiserror` for library error types, `anyhow` for application/binary error types
- Always add context when propagating: `.with_context(|| format!("doing X for {id}"))`
- Custom error enums over stringly-typed errors — `#[derive(Error)]` from `thiserror`

## Ownership & Lifetimes

- Structure data as a tree — parent owns children, no circular references
- Prefer owned types (`String`, `PathBuf`) in structs; borrowed (`&str`, `&Path`) in function params
- Avoid lifetime parameters on structs unless the struct is genuinely a short-lived view
- Use indices or keys instead of references for graph-like structures
- Clone deliberately — never hide `.clone()` to silence the borrow checker without understanding why

## Testing

- Tests live in a `#[cfg(test)] mod tests` block at the bottom of the file
- Integration tests go in `tests/` directory
- Use `#[should_panic(expected = "...")]` for panic-path tests
- Prefer `assert_eq!` / `assert_ne!` over bare `assert!` for better failure messages
- Test helpers: extract into functions, not macros, unless you need call-site file/line info

## Structure

- One type per file when the type + its impls exceed ~100 lines
- `lib.rs` is the public API surface — re-export, don't define large modules inline
- Module names are snake_case, type names are PascalCase
- Feature flags for optional deps — don't compile what isn't needed
- `pub(crate)` over `pub` for internal-only items — minimize public surface

## Concurrency

- Prefer message passing (`mpsc`, `crossbeam`) over shared state (`Mutex`, `RwLock`)
- `tokio` for async runtimes — don't mix async runtimes in a single binary
- Never hold a `MutexGuard` across an `.await` point
- Use `Arc` only when ownership genuinely needs to be shared across threads
