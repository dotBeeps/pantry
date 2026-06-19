---
name: refactoring
description: "Code refactoring patterns: extract method/class, rename, move, inline, SOLID principles, design patterns, and safe restructuring strategies. Use when restructuring code, applying design patterns, improving code organization, or reducing technical debt."
license: MIT
---

# Refactoring Patterns

Refactoring = changing internal structure without changing external behavior. Always have tests before you start.

## When to Refactor

### Code Smells

| Smell                    | Signal                                             | Fix                              |
| ------------------------ | -------------------------------------------------- | -------------------------------- |
| **Long method**          | >20 lines, multiple `and`s in name                 | Extract Method                   |
| **Large class**          | Many fields, multiple concerns                     | Extract Class                    |
| **Feature envy**         | Method uses another class's data more than its own | Move Method                      |
| **Data clumps**          | Same 3+ fields appear together repeatedly          | Extract Class / Parameter Object |
| **Primitive obsession**  | Strings for status/type, raw numbers for money     | Replace with value objects       |
| **Switch on type**       | `switch(type)` repeated in multiple places         | Replace with polymorphism        |
| **Parallel hierarchies** | Adding a subclass forces adding one elsewhere      | Merge or rethink hierarchy       |
| **Long parameter list**  | >3–4 params, hard to remember order                | Introduce Parameter Object       |
| **Divergent change**     | One class changed for many different reasons       | Extract Class                    |
| **Shotgun surgery**      | One change requires edits in many classes          | Move / consolidate               |

### When to Refactor

- **Rule of three**: first time, do it. Second time, wince. Third time, refactor.
- **Before a feature** — make the change easy, then make the easy change.
- **After tests pass** — never refactor on red.
- **Not during a bug fix** — keep behavior change and structure change separate.
- **Not under deadline** — ship, schedule the refactor, pay the debt intentionally.

---

## Extract Patterns

### Extract Method

Pull a fragment into a named method when: a block needs a comment to explain it, a loop body is complex, or the same code appears twice.

```typescript
// Before
function printOrder(order: Order) {
  // print header
  console.log(`=== Order #${order.id} ===`);
  console.log(`Customer: ${order.customer}`);
  // print items
  let total = 0;
  for (const item of order.items) { console.log(`  ${item.name}: $${item.price}`); total += item.price; }
  console.log(`Total: $${total}`);
}

// After
function printOrder(order: Order) { printHeader(order); printItems(order.items); }
function printHeader(order: Order) { ... }
function printItems(items: Item[]) { ... }
```

**Naming**: name from the _why_, not the _what_ — `calculateDiscount()` not `doLoop()`.

### Extract Class

When a class has data and methods that form a cohesive group separate from the rest.

```typescript
// Before — Person knows too much about phone numbers
class Person {
  name: string;
  areaCode: string;
  number: string;

  getTelephone() {
    return `(${this.areaCode}) ${this.number}`;
  }
}

// After
class TelephoneNumber {
  constructor(
    readonly areaCode: string,
    readonly number: string,
  ) {}
  toString() {
    return `(${this.areaCode}) ${this.number}`;
  }
}

class Person {
  constructor(
    readonly name: string,
    readonly phone: TelephoneNumber,
  ) {}
}
```

### Extract Interface

When callers only need a subset of a class's methods, or you want to break a dependency for testing.

```typescript
// Before — hard to test, depends on real DB
class ReportGenerator {
  constructor(private db: PostgresDatabase) {}
  generate() { const data = this.db.query("..."); ... }
}

// After
interface DataSource {
  query(sql: string): Row[];
}

class ReportGenerator {
  constructor(private db: DataSource) {}
  generate() { const data = this.db.query("..."); ... }
}
// PostgresDatabase still implements DataSource; test uses a stub.
```

### Extract Variable

Name a complex expression so the reader doesn't have to parse it.

```typescript
// Before
if (order.items.length > 0 && order.customer.creditScore > 700 && !order.hasOutstandingBalance) { ... }

// After
const hasItems = order.items.length > 0;
const goodCredit = order.customer.creditScore > 700;
const accountCurrent = !order.hasOutstandingBalance;

if (hasItems && goodCredit && accountCurrent) { ... }
```

### Extract Parameter Object

Replace a recurring group of parameters with a single object.

```typescript
// Before
function createReport(startDate: Date, endDate: Date, timezone: string) { ... }
function sendAlert(startDate: Date, endDate: Date, timezone: string) { ... }

// After
interface DateRange { start: Date; end: Date; timezone: string; }

function createReport(range: DateRange) { ... }
function sendAlert(range: DateRange) { ... }
```

---

## Move / Reorganize Patterns

### Move Method (Feature Envy Fix)

Move a method to the class it uses most.

```typescript
// Before — Account.charge() is jealous of BillingPlan
class Account {
  charge(days: number) {
    return this.billingPlan.rate * days * this.billingPlan.taxRate;
  }
}

// After — move to BillingPlan, delegate from Account
class BillingPlan {
  charge(days: number) {
    return this.rate * days * this.taxRate;
  }
}
class Account {
  charge(days: number) {
    return this.billingPlan.charge(days);
  }
}
```

### Inline Method / Variable

Remove indirection that adds no clarity.

```typescript
// Inline variable
const isEligible = age >= 18;  // used once, obvious
return isEligible;             // → return age >= 18;

// Inline method — delegation with no added value
moreThanFiveDeliveries() { return this.deliveries > 5; }
getRating() { return this.moreThanFiveDeliveries() ? 2 : 1; }
// → getRating() { return this.deliveries > 5 ? 2 : 1; }
```

### Replace Temp with Query

Replace a computed temp with a method — reusable across methods, easier to test.

```typescript
// Before: temps buried in one function
function getTotal() {
  const basePrice = quantity * itemPrice;
  const discount = Math.max(0, quantity - 500) * itemPrice * 0.05;
  return basePrice - discount;
}

// After: each computation is its own query
function getTotal() {
  return basePrice() - discount();
}
function basePrice() {
  return quantity * itemPrice;
}
function discount() {
  return Math.max(0, quantity - 500) * itemPrice * 0.05;
}
```

---

## SOLID Principles

### S — Single Responsibility

One reason to change. If you find yourself saying "and" when describing a class, split it.

```typescript
// Bad — User handles both data and email
class User {
  save() { /* DB logic */ }
  sendWelcomeEmail() { /* email logic */ }
}

// Good
class User { save() { ... } }
class UserMailer { sendWelcomeEmail(user: User) { ... } }
```

### O — Open/Closed

Extend behavior without modifying existing code. Use strategy/polymorphism instead of conditionals.

```typescript
// Bad — must edit this function for every new discount type
function applyDiscount(order: Order, type: string) {
  if (type === "seasonal") return order.total * 0.9;
  if (type === "loyalty") return order.total * 0.85;
}

// Good
interface DiscountStrategy {
  apply(total: number): number;
}

class SeasonalDiscount implements DiscountStrategy {
  apply(total: number) {
    return total * 0.9;
  }
}
class LoyaltyDiscount implements DiscountStrategy {
  apply(total: number) {
    return total * 0.85;
  }
}

function applyDiscount(order: Order, strategy: DiscountStrategy) {
  return strategy.apply(order.total);
}
```

### L — Liskov Substitution

Subtypes must be drop-in replacements. Violated when an override throws, does nothing, or narrows preconditions.

```typescript
// Violation — Square breaks Rectangle's width/height contract
class Square extends Rectangle {
  setWidth(w: number) {
    this.width = this.height = w;
  } // surprise side effect!
}

// Fix — flatten the hierarchy
interface Shape {
  area(): number;
}
class Rectangle implements Shape {
  area() {
    return this.w * this.h;
  }
}
class Square implements Shape {
  area() {
    return this.side ** 2;
  }
}
```

### I — Interface Segregation

Prefer small, focused interfaces over large ones. Callers shouldn't depend on methods they don't use.

```typescript
// Bad — Printer forced to implement fax
interface Machine {
  print(doc: Document): void;
  fax(doc: Document): void;
  scan(doc: Document): void;
}

// Good
interface Printer { print(doc: Document): void; }
interface Scanner { scan(doc: Document): void; }
interface FaxMachine { fax(doc: Document): void; }

class MultiFunctionPrinter implements Printer, Scanner, FaxMachine { ... }
class SimplePrinter implements Printer { ... }
```

### D — Dependency Inversion

High-level modules shouldn't depend on low-level modules. Both should depend on abstractions.

```typescript
// Bad — OrderService is bound to EmailNotifier
class OrderService {
  private notifier = new EmailNotifier();  // concrete dependency
  placeOrder(order: Order) { ...; this.notifier.send("Order placed"); }
}

// Good
interface Notifier { send(msg: string): void; }

class OrderService {
  constructor(private notifier: Notifier) {}
  placeOrder(order: Order) { ...; this.notifier.send("Order placed"); }
}
```

---

## Design Patterns

### Strategy — Replace Conditionals

When behavior varies based on a type/flag and that flag is checked in multiple places.

```typescript
// Replace if/switch chains with a strategy object
type SortStrategy = (a: number, b: number) => number;

const ascending: SortStrategy = (a, b) => a - b;
const descending: SortStrategy = (a, b) => b - a;

function sortData(data: number[], strategy: SortStrategy) {
  return [...data].sort(strategy);
}
```

### Observer — Decouple Producers from Consumers

When one object's state change needs to notify others without tight coupling.

```typescript
class EventEmitter<T> {
  private handlers: ((data: T) => void)[] = [];
  on(h: (data: T) => void) {
    this.handlers.push(h);
  }
  off(h: (data: T) => void) {
    this.handlers = this.handlers.filter((x) => x !== h);
  }
  emit(data: T) {
    this.handlers.forEach((h) => h(data));
  }
}
```

### Factory — Encapsulate Object Creation

```typescript
function createDatabase(config: Config): Database {
  if (config.type === "postgres") return new PostgresDatabase(config);
  if (config.type === "sqlite") return new SqliteDatabase(config.file);
  throw new Error(`Unknown DB type: ${config.type}`);
}
// Callers depend on Database interface; construction details are hidden.
```

### Decorator — Add Behavior Without Subclassing

Wrap an object to add responsibilities at runtime.

```typescript
interface Logger {
  log(msg: string): void;
}

class ConsoleLogger implements Logger {
  log(msg: string) {
    console.log(msg);
  }
}
class TimestampLogger implements Logger {
  constructor(private inner: Logger) {}
  log(msg: string) {
    this.inner.log(`[${new Date().toISOString()}] ${msg}`);
  }
}

// Compose layers
const logger = new TimestampLogger(new ConsoleLogger());
```

### Adapter — Bridge Incompatible Interfaces

When integrating a third-party that doesn't match your interface.

```typescript
interface Cache { get(key: string): string | null; set(key: string, val: string): void; }

// Wrap the third-party client behind your interface
class RedisAdapter implements Cache {
  constructor(private client: RedisClient) {}
  get(key: string)              { /* bridge sync ↔ async */ ... }
  set(key: string, val: string) { ... }
}
```

### ⚠️ When NOT to Use Patterns

- **One concrete case** — YAGNI; add the pattern when the second case arrives.
- **Team unfamiliarity** — complexity without shared understanding is net negative.
- **Harder to trace** — if following a simple operation requires a debugger, reconsider.
- **Speculative abstractions** — wait for real requirements; premature generalization rots.

---

## Safe Refactoring Strategy

### Before You Start

1. **Tests must be green** — if coverage is thin, write characterization tests first.
2. **Commit the current state** — pure refactoring commits only; no logic changes mixed in.
3. **Understand the blast radius** — grep all callers before moving or renaming.

### The Cycle

```
Green → Refactor → Green → Commit → repeat
```

- One refactoring per commit — makes bisect trivial.
- Run tests after _every_ step, not at the end.
- If tests break, **revert** — don't debug a broken refactor.

### IDE Automated Refactoring

Prefer automated rename/extract/move over manual search-replace — the tool tracks all references.

- **VS Code / WebStorm**: F2 rename, Ctrl+Shift+R extract method.
- **IntelliJ / Rider**: Refactor menu, operations are preview-able before commit.
- **Go**: `gorename`, `gomove` via gopls.

### Feature Flags for Large Restructurings

```typescript
const USE_NEW_BILLING = featureFlag("new-billing");
function calculateBill(order: Order) {
  return USE_NEW_BILLING ? newCalculateBill(order) : legacyCalculateBill(order);
}
// Ship both paths, validate, then delete the old one.
```

### Strangler Fig (Legacy Systems)

Route new traffic to new code while old code handles the rest. Build a facade → implement piece by piece → remove legacy when it handles nothing.

---

## Language-Specific Tips

### TypeScript

```typescript
// Discriminated unions replace string-checked type fields
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rectangle"; width: number; height: number };

function area(s: Shape) {
  switch (s.kind) {
    case "circle":
      return Math.PI * s.radius ** 2;
    case "rectangle":
      return s.width * s.height;
  }
}

// Branded types prevent primitive obsession mix-ups
type UserId = string & { __brand: "UserId" };
type OrderId = string & { __brand: "OrderId" };
// Can't accidentally pass a UserId where OrderId is expected.
```

### Python

```python
from dataclasses import dataclass
from typing import Protocol
from abc import ABC, abstractmethod

@dataclass(frozen=True)       # Value object (replaces dict/tuple)
class Money:
    amount: float
    currency: str

class Notifier(Protocol):     # Structural typing — no explicit registration
    def send(self, msg: str) -> None: ...

class Repository(ABC):        # Enforced abstract base
    @abstractmethod
    def find_by_id(self, id: str): ...
```

### Go

```go
// Define interfaces at point of use (not in the package that implements them)
type Notifier interface { Send(msg string) error }

// Embedding for composition
type Base struct{ id string }
func (b Base) ID() string { return b.id }
type AdminUser struct {
    Base                  // inherits ID()
    permissions []string
}
```

### Rust

```rust
struct UserId(String);     // Newtype — branded primitive, compiler-enforced
struct OrderId(String);

trait Validator {          // Trait extraction (like Extract Interface)
    fn validate(&self) -> Result<(), ValidationError>;
}

enum PaymentMethod {       // Enum replaces switch-on-type smells cleanly
    CreditCard(Card),
    BankTransfer(Account),
}
match payment { PaymentMethod::CreditCard(c) => ..., ... }
```
