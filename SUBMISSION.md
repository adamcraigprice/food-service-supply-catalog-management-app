# Submission

**Candidate name:** Adam Price
**Date:** 02-12
**Time spent:** ~4 hours

---

## Completed Tasks

- [x] Task 1 — Create Product
- [x] Task 2 — Update Variant
- [x] Task 3 — Fix soft-delete bug
- [x] Task 4 — Loading & error states
- [x] Task 5 — Input validation

---

## Approach & Decisions

Quick Note: for putting together this document I wrote notes as I went about development including decisions, best practices I was adhearing to, trade-offs, bug ect. Then I passed those notes through an LLM to generate a readable and well formatted reflection of those thoughts which you see here in the document.

I also wrote a second test suite (`__tests__/e2e.test.ts`) with 57 additional tests covering every route end-to-end — full CRUD lifecycles for products and variants, every error state I could think of (missing fields, bad values, duplicate SKUs, non-existent IDs, last-variant guard, etc.), search and category filtering, aggregate field presence, transaction atomicity (verifying the product row doesn't persist if a variant insert fails), and boundary conditions like zero price/inventory, whitespace trimming, and null categories. All 74 tests (57 E2E + 16 task + 1 health) pass.

### Task 1 — Create Product

Built the full create product flow end-to-end — a `POST /api/products` route on the backend and a React form on the frontend at `/products/new`.

On the backend, all validation runs before any database write. If something's invalid, the request short-circuits with a descriptive JSON error (400 for bad input, 409 for duplicate SKUs) and nothing gets written. The product and all its variants are inserted inside a single `db.transaction()`, so if any variant fails the whole thing rolls back — no orphaned products.

SKU uniqueness gets checked two ways: first in-memory against the other variants in the same request (catches duplicates within one submission), then against the database (catches global conflicts). If I only relied on the DB constraint, the error would be a raw SQLite message instead of something user-friendly.

On the frontend, the form collects all fields and runs client-side validation before sending anything. Errors are collected into a `fieldErrors` map so the user sees everything that needs fixing at once — red borders, inline text, the works. The submit button disables during flight to prevent double-submit, and if the server rejects something the client didn't catch (like a SKU that got taken between page load and submission), the error shows up in a banner.

Trade-offs I considered:
- Used inline validation instead of Zod to keep deps minimal and match the existing codebase style. In production I'd consider Zod.
- Chose `409 Conflict` for duplicate SKUs rather than lumping it into `400` — semantically cleaner and easier for clients to handle.
- Both client and server validate. Client for instant UX feedback, server as the source of truth.

### Task 2 — Update Variant

Added the `PUT /api/variants/:id` route and wired up the existing "Edit" button on the product detail page. Clicking Edit turns price and inventory cells into inputs — Save or Cancel (also supports Enter/Escape).

The backend uses a dynamic SQL builder that only touches columns actually sent in the request body. This is more efficient than the `COALESCE(?, column)` pattern used elsewhere, and it avoids accidentally overwriting a value with itself during concurrent writes. `updated_at` always gets set.

On the frontend, each variant row manages its own editing/saving/error state independently through a `VariantRow` component. On a successful save, the server-returned variant gets merged into parent state via an `onUpdated` callback — no full page refetch needed.

Trade-offs:
- Went with inline editing over a modal, a modal would be overkill for two numeric fields.
- Merged the server response into state rather than doing optimistic UI, avoids flickering if the server rejects the update.

### Task 3 — Fix soft-delete bug

The `GET /api/products` query was returning deleted products. The root cause was simple: the `conditions` array started empty, so when no search or category filters were active there was no WHERE clause at all.

The fix was one line — seed the conditions array with `"p.deleted_at IS NULL"` so the soft-delete filter is always present. Any future `conditions.push()` gets ANDed with it automatically, so it's impossible to accidentally leak deleted products.

I seeded the array instead of hardcoding a WHERE into the base SQL because the query builder conditionally appends `WHERE` hardcoding would've broken that pattern. And filtering in SQL rather than in JS after the query is the right call since it reduces data transfer and won't break pagination if we add it later.

### Task 4 — Loading & error states

Added `loading` and `error` state to ProductsPage and ProductDetailPage. Users see a spinner while data loads and a friendly error message with a "Try again" button if something goes wrong. The product grid/content is hidden during loading and error states so stale data never shows.

One thing worth mentioning — I originally used a ternary for the render logic (`products.length === 0 ? empty : grid`) and ran into a bug where the grid would render during the error state. Switched to independent `&&` guards for each state (loading, error, empty, grid) which fixed it. Mutually exclusive render paths.

The response is now checked with `r.ok` before calling `.json()`, and the detail page distinguishes between a 404 ("product not found") and other errors. This matches the pattern already on CategoriesPage, keeping the UX consistent.

Went with a spinner over skeleton loaders, simpler and fine for pages that load in under a second.

### Task 5 — Input validation

Validation lives on both sides. The server validates every field and returns structured JSON errors. The client validates before sending the request and highlights invalid fields with red borders and inline text.

Rules enforced on both layers: product name required, at least one variant, SKU required and unique, variant name required, price >= 0, inventory >= 0.

On the server, every check runs before any database write (fail-fast). On the client, errors are collected all at once so users can fix everything in one pass. If something gets past client validation — like a SKU that was taken between page load and submission — the server error gets caught and displayed in a banner. Defence in depth.

Went with manual validation over Zod/Joi to avoid adding deps. In a larger codebase, Zod would be the move.

---

## What I'd improve with more time

**Architecture** — Extract a shared validation module (or adopt Zod) so schemas are defined once and reused. Introduce a service layer to decouple business logic from HTTP concerns — routes handle HTTP, services handle rules, repos handle persistence. Add a centralised Express error handler so every unhandled error returns consistent JSON (would directly fix the Bonus B issue).

**Testing** — Add React Testing Library tests for the form and inline edit (the current suite is backend-only). Add a Playwright E2E suite covering the full create → view → edit → delete lifecycle.

**Performance** — Debounce the search input, add cursor-based pagination, and add indexes on `deleted_at`, `category_id`, and `variants.product_id`.

**UX** — Optimistic updates with rollback for variant edits, skeleton loaders instead of spinners, toast notifications for transient actions, and a custom confirmation modal to replace `window.confirm()`.

**Security** — Rate limiting on write endpoints, auth middleware with role-based access control, and input sanitisation for fields that could end up rendered as HTML.

---

## Anything else?

A few bugs I noticed in the existing codebase:

1. **Inconsistent error formats (Bonus B)** — Some routes return plain text errors (`.send(message)`) while others return JSON. I standardised all my new routes to return JSON but didn't touch existing ones to keep the diff focused on the assigned tasks.

2. **Double-submit on Delete (Bonus A)** — The delete button has no in-flight guard, so rapid clicks send multiple DELETE requests. The fix would be a `deleting` state + disabled button — same pattern I used for the variant edit Save button.

3. **No centralised error middleware** — There's a comment in `app.ts` noting this. Would be the first thing I'd add.

A few design decisions I want to call out:

- Product + variant inserts are wrapped in one `db.transaction()`. If variant #3 fails, #1 and #2 roll back. Without this you'd get orphaned products with no variants.
- SKU uniqueness is verified both in-memory (within the request) and against the DB. Without the in-memory check, two identical SKUs in one request body would hit a raw SQLite constraint error instead of a friendly message.
- Semantic status codes throughout — `201` for creation, `400` for bad input, `404` for missing, `409` for conflicts, `500` for unexpected failures.
- Client validates for UX, server validates for correctness. The frontend gracefully handles server rejections that bypass client validation.
