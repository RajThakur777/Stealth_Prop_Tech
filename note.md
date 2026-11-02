# 🏠 Shared Bill Splitter

A full-stack bill-splitting application designed to help people living in a shared home manage bills, divide expenses fairly, track payments, and calculate outstanding balances.

Built as part of the **SDE Intern Assignment at Stealth Prop Tech**, this project focuses on correctness, data integrity, concurrency safety, and clean TypeScript code.

## 📌 Overview

The application allows users to create homes, add members, create bills, automatically split expenses among all members, and track payments.

The primary goal is to build a reliable application that handles both normal operations and edge cases, including uneven bill splits, duplicate payment requests, concurrent payments, and API failures.

### ✨ Key Features

- 🏠 **Home Management** — Create homes and manage their members.
- 👥 **Member Management** — Add members to a home while preserving their joining order.
- 🧾 **Bill Creation** — Create bills with amounts represented as integer cents.
- ⚖️ **Fair Bill Splitting** — Automatically divide bills among all members, distributing remainder cents in joining order.
- 💳 **Payment Tracking** — Allow members to pay their individual shares.
- 🔁 **Idempotent Payments** — Prevent duplicate payments when requests are retried.
- 🔒 **Concurrency Safety** — Use atomic database updates to prevent simultaneous requests from paying the same share twice.
- 📊 **Balance Calculation** — Calculate each member's total outstanding balance across all unpaid bills.
- 🛡️ **Database Integrity** — Enforce data consistency through named SQL constraints.
- ⚠️ **Error Handling** — Return consistent JSON error responses and handle invalid requests.
- ⏳ **Resilient UI** — Handle loading, empty, and error states without crashing when the API fails or responds slowly.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| TypeScript | Type-safe development across the application |
| React | Frontend user interface |
| Vite | Frontend development server and build tool |
| TanStack Router | Frontend routing |
| Hono | Lightweight API framework |
| Cloudflare Workers | Serverless API runtime |
| Cloudflare D1 | SQLite-based relational database |
| SQL Migrations | Database schema and constraint management |
| Vitest | Automated testing in the Workers runtime |
| Biome | Formatting and linting |
| pnpm | Package management and workspace tooling |

---

## 🏗️ Architecture

The application follows a simple client-server architecture.

```text
                 ┌────────────────────────┐
                 │       React UI         │
                 │                        │
                 │   Vite + TypeScript    │
                 │   TanStack Router      │
                 └────────────┬───────────┘
                              │
                              │ HTTP / JSON
                              ▼
                 ┌────────────────────────┐
                 │       Hono API         │
                 │                        │
                 │   Cloudflare Workers   │
                 │                        │
                 │  Validation & Logic    │
                 └────────────┬───────────┘
                              │
                              │ SQL Queries
                              ▼
                 ┌────────────────────────┐
                 │    Cloudflare D1       │
                 │                        │
                 │   SQLite Database      │
                 │                        │
                 │ Homes, Members, Bills, │
                 │        Shares          │
                 └────────────────────────┘
```

### Data Flow

1. A user creates a home through the frontend.
2. Members are added to that home in a defined order.
3. A bill is created with a positive integer amount in cents.
4. The API retrieves the home's members and calculates each member's share.
5. The bill and its shares are stored in the D1 database.
6. A member pays an individual share through the payment endpoint.
7. The API validates the payment request and atomically updates the share.
8. The frontend refreshes the payment status and displays updated balances.

---

## 📂 Project Structure

```text
.
├── api/
│   ├── migrations/
│   │   └── 0001_init.sql
│   ├── test/
│   │   ├── helpers.ts
│   │   ├── homes.test.ts
│   │   ├── bills.test.ts
│   │   └── payments.test.ts
│   ├── src/
│   │   └── ...
│   └── wrangler.jsonc
│
├── web/
│   ├── src/
│   │   └── ...
│   └── ...
│
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

> The structure above illustrates the intended organization. Adjust the paths to match the final repository structure.

---

## 🚀 Getting Started

### Prerequisites

Make sure the following tools are installed:

- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/)
- Git

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd <your-project-directory>
```

Replace the placeholders with your repository URL and project directory.

### 2. Install Dependencies

Run the following command from the project root:

```bash
pnpm install
```

If pnpm reports that build scripts were ignored, approve the required scripts:

```bash
pnpm approve-builds
```

Allow the required `esbuild` and `workerd` packages when prompted.

### 3. Start the Development Servers

```bash
pnpm dev
```

The development environment starts:

- **Frontend:** http://localhost:5173
- **API:** http://localhost:8787
- **Health Check:** http://localhost:8787/api/health

The development setup applies the database migrations before starting the API.

### 4. Verify the API

Open the health-check endpoint:

```http
GET /api/health
```

Expected response:

```json
{
  "status": "ok"
}
```

---

## 📡 API Documentation

All API error responses use the following JSON format:

```json
{
  "error": "Descriptive error message"
}
```

### 1. Create a Home

**Endpoint:** `POST /api/homes`

Creates a new home.

**Request Body**

```json
{
  "name": "Shared Apartment"
}
```

**Success Response — `201 Created`**

```json
{
  "id": "home-id",
  "name": "Shared Apartment"
}
```

### 2. Add a Member

**Endpoint:** `POST /api/homes/:homeId/members`

Adds a member to an existing home.

**Request Body**

```json
{
  "name": "Alice"
}
```

**Success Response — `201 Created`**

```json
{
  "id": "member-id",
  "homeId": "home-id",
  "name": "Alice"
}
```

**Error Responses**

- `404 Not Found` — The specified home does not exist.

Member insertion order is preserved because it determines how remainder cents are distributed when bills are split.

### 3. Create a Bill

**Endpoint:** `POST /api/homes/:homeId/bills`

Creates a bill and automatically generates a share for every member of the home.

**Request Body**

```json
{
  "title": "Electricity Bill",
  "totalCents": 1000
}
```

**Success Response — `201 Created`**

```json
{
  "id": "bill-id",
  "homeId": "home-id",
  "title": "Electricity Bill",
  "totalCents": 1000,
  "shares": [
    {
      "id": "share-1",
      "memberId": "member-1",
      "amountCents": 334,
      "paidAt": null
    },
    {
      "id": "share-2",
      "memberId": "member-2",
      "amountCents": 333,
      "paidAt": null
    },
    {
      "id": "share-3",
      "memberId": "member-3",
      "amountCents": 333,
      "paidAt": null
    }
  ]
}
```

**Error Responses**

- `404 Not Found` — The specified home does not exist.
- `422 Unprocessable Content` — The bill amount is not a positive whole number, or the home has no members.

### 4. Pay a Bill Share

**Endpoint:** `POST /api/bills/:billId/shares/:shareId/pay`

Marks an individual share as paid.

**Required Header**

```http
Idempotency-Key: unique-payment-request-key
```

**Success Response — `200 OK`**

```json
{
  "id": "share-id",
  "memberId": "member-id",
  "amountCents": 334,
  "paidAt": "2026-11-02T10:00:00.000Z"
}
```

The timestamp is illustrative.

**Error Responses**

- `400 Bad Request` — The `Idempotency-Key` header is missing.
- `404 Not Found` — The bill or share does not exist.
- `409 Conflict` — The share has already been paid using a different idempotency key.

Repeated requests using the same key for the same share return the original successful payment result without paying the share again.

### 5. Get Home Balances

**Endpoint:** `GET /api/homes/:homeId/balances`

Returns the outstanding balance for every member of a home.

**Success Response — `200 OK`**

```json
{
  "balances": [
    {
      "memberId": "member-1",
      "name": "Alice",
      "outstandingCents": 500
    },
    {
      "memberId": "member-2",
      "name": "Bob",
      "outstandingCents": 0
    }
  ]
}
```

**Error Responses**

- `404 Not Found` — The specified home does not exist.

Balances include only unpaid shares and are returned in member insertion order.

---

## 💰 Bill Splitting Logic

All monetary values are stored and calculated as integer cents. Floating-point arithmetic is not used for splitting bills.

### Example: Even Split

Suppose a bill totals `900` cents and the home has three members.

| Member | Share |
|---|---:|
| Alice | 300 cents |
| Bob | 300 cents |
| Charlie | 300 cents |
| **Total** | **900 cents** |

### Example: Uneven Split

Suppose a bill totals `1000` cents and the home has three members.

The base share is:

```text
baseShare = floor(totalCents / memberCount)
          = floor(1000 / 3)
          = 333
```

The remaining cents are:

```text
remainder = totalCents % memberCount
          = 1000 % 3
          = 1
```

The first member receives one additional cent.

| Member | Share |
|---|---:|
| Alice | 334 cents |
| Bob | 333 cents |
| Charlie | 333 cents |
| **Total** | **1000 cents** |

### Splitting Algorithm

```typescript
const baseShare = Math.floor(totalCents / members.length);
const remainder = totalCents % members.length;

const shares = members.map((member, index) => ({
  memberId: member.id,
  amountCents: baseShare + (index < remainder ? 1 : 0),
}));
```

This ensures that:

- Every member receives a share.
- The shares always sum to the original bill amount.
- No cents are lost due to rounding.
- Extra cents are distributed in member insertion order.

The API must reject bills with a non-positive or non-integer amount and bills for homes without members before performing the split.

---

## 🔐 Payment Safety and Idempotency

Payment processing must remain correct even when requests are retried or arrive simultaneously.

### Atomic Conditional Update

The payment operation uses a conditional SQL update:

```sql
UPDATE shares
SET paid_at = ?, idempotency_key = ?
WHERE id = ?
  AND bill_id = ?
  AND paid_at IS NULL;
```

The update succeeds only when the share exists for the specified bill and has not already been paid.

The API checks the affected-row count to determine whether the payment succeeded.

- **One row updated:** The payment was successfully recorded.
- **No rows updated:** The API checks the existing share and its idempotency key to determine whether this is a retry or a conflicting payment.

### Idempotent Retries

If a client retries a successful payment using the same key, the API returns the previously recorded payment result, including the original `paidAt` timestamp.

This prevents duplicate state changes when clients retry requests after network timeouts.

### Concurrent Payment Requests

If two requests attempt to pay the same share simultaneously, the conditional update allows at most one request to transition the share from unpaid to paid.

The losing request checks the committed state:

- The same key returns the original successful result.
- A different key returns `409 Conflict`.

SQLite serializes conflicting writes, while the conditional update protects the state transition. Application-level mutexes are not required for cross-request coordination.

> **Important:** The bill, its shares, and any other related database writes must be handled transactionally where supported by the D1 execution model. Idempotency must be checked against the correct share, not merely against a key in isolation.

---

## 🗄️ Database Design and Constraints

The database schema is maintained through SQL migration files in `api/migrations/`.

The schema models four core entities:

- **Homes** — Stores home information.
- **Members** — Stores members belonging to homes.
- **Bills** — Stores bills associated with homes.
- **Shares** — Stores each member's portion of a bill and its payment status.

### Database Constraints

Named constraints protect the database against invalid or inconsistent records.

| Constraint | Purpose |
|---|---|
| `fk_members_home` | Prevents members from referencing nonexistent homes. |
| `fk_bills_home` | Prevents bills from referencing nonexistent homes. |
| `fk_shares_bill` | Prevents shares from referencing nonexistent bills. |
| `fk_shares_member` | Prevents shares from referencing nonexistent members. |
| `chk_bills_total_cents_positive` | Rejects zero or negative bill totals. |
| `chk_shares_amount_cents_positive` | Rejects zero or negative share amounts. |
| `uq_shares_bill_member` | Prevents duplicate shares for the same member and bill. |
| `chk_homes_name_nonempty` | Rejects empty or whitespace-only home names. |
| `chk_members_name_nonempty` | Rejects empty or whitespace-only member names. |
| `chk_bills_title_nonempty` | Rejects empty or whitespace-only bill titles. |

Foreign keys should be configured with appropriate deletion behavior, such as cascading deletes when the application requires related records to be removed with their parent records.

**Why use database constraints?**

Application validation alone cannot guarantee data integrity. Named SQL constraints provide an additional layer of protection against invalid writes and unexpected application behavior.

Foreign-key enforcement must also be enabled and verified in the SQLite/D1 environment.

---

## 🧮 Balance Calculation

A member's outstanding balance is the sum of all unpaid shares belonging to that member across bills in the same home.

Conceptually:

```text
outstandingCents =
    SUM(amountCents of all unpaid shares)
```

A correlated SQL subquery can calculate each member's balance without multiplying rows through a multi-table join.

```sql
SELECT
    m.id AS memberId,
    m.name AS name,
    COALESCE(
        (
            SELECT SUM(s.amount_cents)
            FROM shares s
            JOIN bills b ON s.bill_id = b.id
            WHERE s.member_id = m.id
              AND b.home_id = m.home_id
              AND s.paid_at IS NULL
        ),
        0
    ) AS outstandingCents
FROM members m
WHERE m.home_id = ?
ORDER BY m.rowid ASC;
```

### Benefits

- Members without bills receive a balance of zero.
- Fully paid bills do not contribute to outstanding balances.
- Only unpaid shares are counted.
- Members are returned in insertion order.
- The query avoids accidental duplication of share amounts caused by join multiplication.

The query assumes that the schema and SQLite row-ordering strategy preserve the intended member insertion order. If the schema explicitly stores a member position, ordering by that column is preferable to relying on implicit row identifiers.

---

## 🖥️ Frontend Requirements

The React application provides a page for viewing bills, inspecting individual shares, and making payments.

### Required UI States

**1. Loading State**

Display a clear loading indicator while fetching bills or submitting a payment.

**2. Empty State**

Show a helpful message when the home has no bills or when there are no records to display.

**3. Error State**

Display a readable error message if the API returns an error, the network request fails, or the server responds unexpectedly.

**4. Payment State**

Allow a user to pay an unpaid share and update its status only after the API confirms success.

### Payment Failure Handling

If a payment fails:

- Keep the share marked as unpaid.
- Show a clear error message.
- Allow the user to retry the operation.
- Avoid displaying a false successful payment state.

### Resilience

The page must handle slow responses, HTTP `500` errors, invalid JSON responses, and network failures without crashing.

Loading states should always be cleared when a request finishes, including when it fails.

---

## 🧪 Testing

The project uses Vitest to run API tests in the Cloudflare Workers runtime.

### Run the Tests

```bash
pnpm test
```

### Visible Test Files

| Test File | Coverage |
|---|---|
| `api/test/homes.test.ts` | Home creation and member management |
| `api/test/bills.test.ts` | Bill creation, validation, and splitting |
| `api/test/payments.test.ts` | Payment processing and idempotency |

### Important Edge Cases

The implementation must correctly handle the following scenarios:

| Scenario | Expected Behavior |
|---|---|
| Home has no members | Reject bill creation with `422`. |
| Bill amount is zero | Reject bill creation with `422`. |
| Bill amount is negative | Reject bill creation with `422`. |
| Bill amount is not an integer | Reject bill creation with `422`. |
| Bill amount does not divide evenly | Distribute remainder cents in member insertion order. |
| Payment request is repeated with the same key | Return the original successful payment result. |
| Same share is paid concurrently | Allow at most one payment state transition. |
| Same share is paid with a different key | Return `409 Conflict`. |
| Home, bill, or share does not exist | Return the appropriate `404` response. |
| Idempotency key is missing | Return `400 Bad Request`. |
| API responds with `500` | Display an error without crashing the frontend. |
| API responds slowly | Keep the UI responsive and show a loading state. |
| Member has no unpaid shares | Return an outstanding balance of zero. |

The visible tests must remain unchanged. Additional tests may verify edge cases and concurrent request behavior.

---

## ✅ Code Quality

Before submitting the project, run the following commands from the repository root.

### Type Checking

```bash
pnpm typecheck
```

### Formatting and Linting

```bash
pnpm check
```

To automatically fix supported formatting and linting issues:

```bash
pnpm check:fix
```

### Production Build

```bash
pnpm build
```

### Full Test Suite

```bash
pnpm test
```

The final implementation should pass all four checks and use TypeScript without `any`.

---

## 🧠 Decisions

### 1. Atomic Conditional Updates for Payment Safety

Payment state changes use conditional SQL updates rather than in-memory locks.

**Why?**

Cloudflare Workers can handle requests in separate isolates, so an in-memory mutex cannot reliably coordinate all requests. An atomic database update ensures that only one request can transition a share from unpaid to paid.

Idempotency keys allow safe retries without changing the original payment timestamp or paying the same share twice.

### 2. Integer Cents and Deterministic Member Ordering

All monetary values are stored as integer cents, and extra cents are assigned according to member insertion order.

**Why?**

Floating-point arithmetic can introduce rounding errors in financial calculations. Integer cents make the split predictable and ensure that every cent is accounted for.

Deterministic ordering also makes the results consistent across requests and tests. An explicit member-position column can be used if insertion order must remain stable independently of database row identifiers.

### 3. Database Constraints and Explicit Error Handling

The database uses named constraints to enforce relationships, uniqueness, and valid monetary values. The API validates requests and returns consistent JSON errors.

**Why?**

Validating data only in application code is insufficient for protecting persistent state. Database constraints provide defense in depth, while explicit API and frontend error handling ensure that invalid requests and server failures do not lead to misleading payment statuses or application crashes.

---

## 📋 Assignment Checklist

- [ ] Create homes.
- [ ] Add members to homes.
- [ ] Preserve member insertion order.
- [ ] Create bills and split amounts into integer cents.
- [ ] Distribute remainder cents deterministically.
- [ ] Reject invalid bill amounts and homes without members.
- [ ] Process payments using idempotency keys.
- [ ] Prevent duplicate payment state transitions.
- [ ] Calculate outstanding balances correctly.
- [ ] Add at least three named database constraints.
- [ ] Handle missing resources and invalid requests.
- [ ] Implement loading, empty, and error states in the frontend.
- [ ] Ensure payment failures do not mark shares as paid.
- [ ] Keep visible tests and test helpers unchanged.
- [ ] Pass `pnpm check`.
- [ ] Pass `pnpm typecheck`.
- [ ] Pass `pnpm test`.
- [ ] Pass `pnpm build`.
- [ ] Record a video of three minutes or less.
- [ ] Explain the architecture, data flow, and a design trade-off.
- [ ] Update the repository with the final implementation.

---

## 🎥 Submission

As part of the assignment submission:

1. Create a public repository from the provided template.
2. Implement the required features without modifying the visible tests or their helpers.
3. Update this README with the final technical decisions.
4. Record a video of three minutes or less explaining the architecture, data flow, and one trade-off.
5. Make the video accessible to anyone with the link.
6. Submit the repository and video links through the application form.

---

## ⚠️ AI Usage

AI tools are permitted for this assignment. Any AI assistance used during development should be disclosed in the application form.

The implementation should be fully understood by the developer, including database constraints, payment idempotency, concurrency handling, and error responses.

---

## 👨‍💻 Author

**Raj Thakur**

GitHub: [RajThakur777](https://github.com/RajThakur777)

---

<p align="center">
  Built with TypeScript, React, Hono, Cloudflare Workers, and Cloudflare D1.
</p>