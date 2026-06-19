---
name: database
description: "Database patterns: SQL conventions, schema design, migrations, indexing, ORMs (Prisma, SQLAlchemy, GORM, Drizzle), query optimization, and common pitfalls. Use when designing schemas, writing migrations, optimizing queries, or working with ORMs."
license: MIT
---

# Database Patterns

Covers SQL conventions, schema design, migrations, indexing, ORM usage, and optimization. Language/ORM-specific sections are independent — jump to what you need.

## SQL Conventions

### Naming

- Tables: `snake_case`, **plural** (`users`, `order_items`, `audit_logs`)
- Columns: `snake_case` (`created_at`, `first_name`)
- Foreign keys: `<table_singular>_id` (`user_id`, `order_id`)
- Indexes: `idx_<table>_<columns>` (`idx_users_email`)
- Unique constraints: `uq_<table>_<columns>` (`uq_users_email`)

### Preferred Types (PostgreSQL)

| Prefer | Over | Why |
|--------|------|-----|
| `text` | `varchar(n)` | No performance difference; avoid arbitrary limits |
| `timestamptz` | `timestamp` | Always store timezone-aware; avoids DST bugs |
| `uuid` | `char(36)` | Native type, indexed efficiently |
| `boolean` | `tinyint(1)` | Semantic clarity |
| `numeric(p,s)` | `float` | Exact arithmetic for money/quantities |
| `jsonb` | `json` | Binary storage, indexable, faster queries |

### Constraints

```sql
-- NOT NULL by default — add NULL explicitly when absence is meaningful
CREATE TABLE users (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email       text        NOT NULL UNIQUE,
    username    text        NOT NULL,
    age         integer     CHECK (age >= 0 AND age <= 150),
    role        text        NOT NULL DEFAULT 'member'
                            CHECK (role IN ('member', 'admin', 'moderator')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
```

### Common Query Patterns

```sql
-- CTE for readability
WITH active_users AS (
    SELECT id, email FROM users WHERE deleted_at IS NULL
),
recent_orders AS (
    SELECT user_id, COUNT(*) AS order_count
    FROM orders
    WHERE created_at > now() - interval '30 days'
    GROUP BY user_id
)
SELECT u.email, COALESCE(o.order_count, 0) AS orders
FROM active_users u
LEFT JOIN recent_orders o ON o.user_id = u.id;

-- Window function for ranking
SELECT
    user_id,
    amount,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
FROM orders;

-- UPSERT (PostgreSQL)
INSERT INTO user_settings (user_id, key, value)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, key)
DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

---

## Schema Design

### Normalization

- **1NF**: No repeating groups; each column holds one value
- **2NF**: No partial dependencies on composite keys
- **3NF**: No transitive dependencies (derived columns belong in their own table)

**Denormalize deliberately**: cache columns for frequently-read aggregates when joins are consistently expensive. Document the denormalization and add triggers or application logic to keep the cache fresh.

### Primary Key Strategy

| Strategy | Use When |
|----------|----------|
| `BIGSERIAL` / auto-increment | Internal tables, high insert volume, joins stay within the DB |
| `UUID v4` | Distributed systems, public-facing IDs, multi-tenant |
| `ULID` / `UUID v7` | Need sortability + uniqueness (time-ordered, index-friendly) |

Never expose auto-increment integers in public APIs — they leak record counts and are trivially enumerable.

### Soft Deletes

```sql
-- Add deleted_at column
ALTER TABLE users ADD COLUMN deleted_at timestamptz;

-- Query active records (always filter in application queries)
SELECT * FROM users WHERE deleted_at IS NULL;

-- Partial index keeps active-record queries fast
CREATE INDEX idx_users_active ON users (email) WHERE deleted_at IS NULL;
```

**Trade-offs**: soft deletes preserve audit history and allow recovery, but add WHERE clause noise everywhere, complicate UNIQUE constraints, and grow tables indefinitely. For true deletion with history, prefer an audit log table instead.

### Audit Columns

```sql
-- Standard audit columns on every table
created_at  timestamptz NOT NULL DEFAULT now(),
updated_at  timestamptz NOT NULL DEFAULT now(),
created_by  uuid REFERENCES users(id),  -- optional: who created
updated_by  uuid REFERENCES users(id)   -- optional: who last modified
```

Keep `updated_at` current with a trigger or ORM hook — don't rely on application code alone.

### JSON Columns

```sql
-- Use jsonb for semi-structured data; index with GIN
ALTER TABLE products ADD COLUMN attributes jsonb;
CREATE INDEX idx_products_attributes ON products USING GIN (attributes);

-- Query JSON fields
SELECT * FROM products WHERE attributes @> '{"color": "red"}';
SELECT * FROM products WHERE attributes->>'color' = 'red';
```

Use JSON columns for genuinely variable schemas (user preferences, metadata, feature flags). Avoid using JSON to sidestep proper schema design — it sacrifices type safety and referential integrity.

---

## Migrations

### Core Principle: Forward-Only

Never edit an existing migration. Always add new migrations. Rollback migrations are optional but write them when practical.

### Safe Migration Patterns

Dangerous operations must be split across multiple deployments:

```sql
-- Safe: add nullable column (zero downtime)
ALTER TABLE users ADD COLUMN display_name text;

-- Safe: backfill (run in batches to avoid lock escalation)
UPDATE users SET display_name = username WHERE display_name IS NULL LIMIT 10000;

-- Safe: add constraint after backfill is complete
ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;
```

### Dangerous Operations

| Operation | Risk | Safe Alternative |
|-----------|------|-----------------|
| `RENAME COLUMN` | Breaks running app instances | Add new column → copy data → update app → drop old |
| `DROP COLUMN` | Irreversible data loss | Soft-remove (stop writing/reading) → drop in later migration |
| `ALTER COLUMN TYPE` | Full table rewrite + lock | Add new column → backfill → swap in app → drop old |
| `ADD NOT NULL` without default | Fails on non-empty tables | Add nullable → backfill → add constraint |
| Adding index without `CONCURRENTLY` | Locks table during build | `CREATE INDEX CONCURRENTLY` |

```sql
-- Always create indexes concurrently in production
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders (user_id);
```

### Migration Tools

```bash
# Prisma
npx prisma migrate dev --name add_display_name   # development
npx prisma migrate deploy                         # production

# Alembic (Python)
alembic revision --autogenerate -m "add display name"
alembic upgrade head

# Goose (Go)
goose create add_display_name sql
goose up

# Knex
knex migrate:make add_display_name
knex migrate:latest
```

---

## Indexing

### Index Types

| Type | Use For |
|------|---------|
| **B-tree** (default) | Equality, range, ORDER BY — covers most cases |
| **Hash** | Equality-only lookups; rarely worth it over B-tree |
| **GIN** | Array containment, JSONB, full-text search |
| **GiST** | Geometric types, range types, full-text (lossy) |

### Composite Index Column Order

Place the **most selective / equality-filtered** column first:

```sql
-- Query: WHERE status = 'active' AND created_at > '2024-01-01'
-- status is low-cardinality but equality; created_at is high-cardinality range
CREATE INDEX idx_orders_status_created ON orders (status, created_at);
```

### Partial Indexes

```sql
-- Index only the rows you query
CREATE INDEX idx_orders_pending ON orders (created_at)
    WHERE status = 'pending';

-- Active users only
CREATE INDEX idx_users_email_active ON users (email)
    WHERE deleted_at IS NULL;
```

### Covering Indexes

```sql
-- INCLUDE avoids heap fetch for queries that select only indexed columns
CREATE INDEX idx_orders_user_covering ON orders (user_id)
    INCLUDE (status, total_amount);
-- SELECT status, total_amount FROM orders WHERE user_id = $1
-- resolved from index alone (index-only scan)
```

### When NOT to Index

- Columns with very low cardinality (`boolean`, `status` with 2–3 values) used alone
- Rarely-queried tables (< 1000 rows) — sequential scan is faster
- Write-heavy tables where index maintenance overhead dominates

### EXPLAIN ANALYZE

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT ...;
```

Key nodes to look for:
- **Seq Scan** on large tables → missing index
- **Index Scan** → index found, fetching heap rows
- **Index Only Scan** → covering index hit, no heap fetch
- **Nested Loop** with large outer set → N+1, consider Hash Join
- **Hash Join** → good for large unsorted sets
- High **Buffers: shared hit** vs **read** → cache hit ratio

---

## ORM Patterns

### Prisma (TypeScript)

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  posts     Post[]
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("users")
}
```

```typescript
// Include relations to avoid N+1
const users = await prisma.user.findMany({
    where: { deletedAt: null },
    include: { posts: { select: { id: true, title: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
    skip: offset,
});

// Transaction
await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({ data: orderData });
    await tx.inventory.update({ where: { id: itemId }, data: { stock: { decrement: 1 } } });
    return order;
});

// Raw query when ORM can't express it
const result = await prisma.$queryRaw<Row[]>`
    SELECT user_id, COUNT(*) FROM orders
    WHERE created_at > ${cutoff}
    GROUP BY user_id
`;
```

**Pitfalls**: forgetting `include` triggers N+1; Prisma generates multiple queries for nested creates — use `$transaction` explicitly for atomicity.

### Drizzle (TypeScript)

```typescript
// Schema definition
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    id:        uuid("id").primaryKey().defaultRandom(),
    email:     text("email").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Query builder
const result = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .leftJoin(orders, eq(orders.userId, users.id))
    .where(isNull(users.deletedAt))
    .limit(20);

// SQL-like syntax (type-safe)
const rows = await db.select().from(users).where(eq(users.email, email));

// Migrations
// drizzle-kit generate:pg  →  generates SQL migration files
// drizzle-kit push:pg      →  apply directly (dev only)
```

### SQLAlchemy (Python)

```python
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, DateTime, func
import uuid

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    id:         Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email:      Mapped[str]       = mapped_column(String, unique=True, nullable=False)
    posts:      Mapped[list["Post"]] = relationship(back_populates="author", lazy="select")
    created_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())
```

```python
# Session management — one session per request
async with AsyncSession(engine) as session:
    async with session.begin():
        result = await session.execute(
            select(User)
            .options(selectinload(User.posts))  # avoid lazy-load N+1
            .where(User.deleted_at.is_(None))
        )
        users = result.scalars().all()
```

**Pitfalls**: default `lazy="select"` causes N+1 — use `selectinload` or `joinedload` explicitly. Session scope too wide causes stale data; keep sessions short-lived.

### GORM (Go)

```go
type User struct {
    gorm.Model                          // adds ID, CreatedAt, UpdatedAt, DeletedAt
    Email  string  `gorm:"uniqueIndex;not null"`
    Posts  []Post  `gorm:"foreignKey:UserID"`
}

// Preload to avoid N+1
var users []User
db.Preload("Posts").Where("deleted_at IS NULL").Limit(20).Find(&users)

// Transaction
err := db.Transaction(func(tx *gorm.DB) error {
    if err := tx.Create(&order).Error; err != nil {
        return err
    }
    return tx.Model(&inventory).Update("stock", gorm.Expr("stock - 1")).Error
})

// Raw SQL when needed
db.Raw("SELECT id, email FROM users WHERE created_at > ?", cutoff).Scan(&rows)
```

**Pitfalls**: GORM returns no error on `Find` with zero results — always check `RowsAffected`. Never use `AutoMigrate` in production (no rollback, can lock tables). Silent failures on missing preloads.

---

## Query Optimization

### N+1 Problem

```
// Bad: 1 query for users + N queries for posts
users = getUsers()
for user in users:
    posts = getPosts(user.id)  # N extra queries

// Good: JOIN or eager load
users = getUsersWithPosts()    # 1 or 2 queries total
```

Solutions by ORM: Prisma `include`, Drizzle `leftJoin`, SQLAlchemy `selectinload`, GORM `Preload`.

### Pagination

```sql
-- Offset pagination (simple, but slow on large offsets)
SELECT * FROM orders ORDER BY created_at DESC LIMIT 20 OFFSET 10000;
-- Cost grows linearly — the DB must scan and discard 10000 rows

-- Cursor pagination (fast, consistent)
SELECT * FROM orders
WHERE (created_at, id) < ($last_created_at, $last_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Use cursor pagination for large tables or infinite scroll. Offset pagination is fine for admin UIs with small total row counts.

### Connection Pooling

Always use a connection pool. Recommended pool sizes:

- **PgBouncer** (external): transaction mode for stateless apps
- **Prisma**: `DATABASE_URL` with `?connection_limit=10`
- **SQLAlchemy**: `pool_size=10, max_overflow=20`
- **GORM**: `db.SetMaxOpenConns(10); db.SetMaxIdleConns(5)`

Rule of thumb: `pool_size = (num_cores * 2) + num_disks`, capped per DB server limits.

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| **SQL injection** | Always use parameterized queries — never interpolate user input |
| **Missing FK indexes** | Add index on every foreign key column |
| **Unbounded queries** | Always include `LIMIT`; add guards at the ORM layer |
| **Transaction scope too wide** | Keep transactions short; don't do HTTP calls inside a transaction |
| **Implicit type coercion** | Explicit casts avoid index misses: `WHERE id = $1::uuid` |
| **SELECT \*** | Select only needed columns; avoids over-fetching and breaks on schema changes |
| **No CONCURRENTLY on indexes** | `CREATE INDEX CONCURRENTLY` in production to avoid table lock |
| **Trusting ORM auto-migrate** | Review generated SQL; test on a staging DB first |
