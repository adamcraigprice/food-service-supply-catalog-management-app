/**
 * End-to-end test suite — exercises every route, error state, and edge case.
 *
 * These complement the task-level tests in tasks.test.ts by covering the full
 * lifecycle (create → read → update → delete) and probing boundary conditions
 * the task tests don't reach.
 *
 * Run with: npm test
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "child_process";
import request from "supertest";
import app from "../src/app.js";
import db from "../src/db.js";

// Re-seed so every run starts from a known state.
beforeAll(() => {
  execSync("npx tsx src/seed.ts", { cwd: import.meta.dirname + "/.." });
});

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Create a product and return the response body. */
async function createProduct(overrides: Record<string, unknown> = {}) {
  const defaults = {
    name: "E2E Test Product",
    description: "Created by e2e suite",
    category_id: 1,
    status: "active",
    variants: [
      { sku: `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "Default", price_cents: 1000, inventory_count: 5 },
    ],
  };
  const body = { ...defaults, ...overrides };
  const res = await request(app).post("/api/products").send(body);
  return res;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS — full lifecycle
// ═══════════════════════════════════════════════════════════════════════════

describe("Products — full lifecycle", () => {
  let productId: number;

  it("creates a product, reads it, updates it, and soft-deletes it", async () => {
    // CREATE
    const createRes = await createProduct({
      name: "Lifecycle Product",
      variants: [{ sku: "LIFE-001", name: "Only", price_cents: 500, inventory_count: 3 }],
    });
    expect(createRes.status).toBe(201);
    productId = createRes.body.id;

    // READ single
    const getRes = await request(app).get(`/api/products/${productId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.name).toBe("Lifecycle Product");
    expect(getRes.body.variants).toHaveLength(1);

    // UPDATE
    const putRes = await request(app)
      .put(`/api/products/${productId}`)
      .send({ name: "Updated Lifecycle" });
    expect(putRes.status).toBe(200);
    expect(putRes.body.name).toBe("Updated Lifecycle");

    // DELETE (soft)
    const delRes = await request(app).delete(`/api/products/${productId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Verify excluded from listing
    const listRes = await request(app).get("/api/products");
    const ids = listRes.body.map((p: { id: number }) => p.id);
    expect(ids).not.toContain(productId);

    // But still fetchable by ID (soft-delete doesn't remove the row)
    const refetchRes = await request(app).get(`/api/products/${productId}`);
    expect(refetchRes.status).toBe(200);
    expect(refetchRes.body.deleted_at).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/products — error states & edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/products — error states", () => {
  it("rejects an empty body", async () => {
    const res = await request(app).post("/api/products").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("rejects name that is only whitespace", async () => {
    const res = await createProduct({ name: "   " });
    expect(res.status).toBe(400);
  });

  it("rejects when variants is not an array", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ name: "Bad Variants Type", variants: "not-an-array" });
    expect(res.status).toBe(400);
  });

  it("rejects when variants is missing entirely", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ name: "No Variants Field" });
    expect(res.status).toBe(400);
  });

  it("rejects a variant with empty-string SKU", async () => {
    const res = await createProduct({
      variants: [{ sku: "", name: "X", price_cents: 100, inventory_count: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it("rejects a variant with whitespace-only SKU", async () => {
    const res = await createProduct({
      variants: [{ sku: "  ", name: "X", price_cents: 100, inventory_count: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it("rejects a variant with missing name", async () => {
    const res = await createProduct({
      variants: [{ sku: "NO-NAME-E2E", price_cents: 100, inventory_count: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it("rejects negative price_cents", async () => {
    const res = await createProduct({
      variants: [{ sku: "NEG-P-E2E", name: "X", price_cents: -1, inventory_count: 0 }],
    });
    expect(res.status).toBe(400);
  });

  it("rejects negative inventory_count", async () => {
    const res = await createProduct({
      variants: [{ sku: "NEG-I-E2E", name: "X", price_cents: 0, inventory_count: -1 }],
    });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate SKUs within the same request", async () => {
    const res = await createProduct({
      variants: [
        { sku: "DUP-INTERNAL", name: "A", price_cents: 100, inventory_count: 1 },
        { sku: "DUP-INTERNAL", name: "B", price_cents: 200, inventory_count: 2 },
      ],
    });
    expect(res.status).toBe(400);
  });

  it("rejects a SKU that already exists in the database (409)", async () => {
    // First create one successfully
    const first = await createProduct({
      variants: [{ sku: "UNIQUE-ONCE", name: "X", price_cents: 100, inventory_count: 1 }],
    });
    expect(first.status).toBe(201);

    // Try to reuse the same SKU
    const second = await createProduct({
      variants: [{ sku: "UNIQUE-ONCE", name: "Y", price_cents: 200, inventory_count: 2 }],
    });
    expect(second.status).toBe(409);
    expect(second.body).toHaveProperty("error");
  });

  it("rejects an invalid status value", async () => {
    const res = await createProduct({ status: "banana" });
    expect(res.status).toBe(400);
  });

  it("rejects a non-existent category_id", async () => {
    const res = await createProduct({ category_id: 99999 });
    expect(res.status).toBe(400);
  });

  it("accepts null category_id (uncategorised)", async () => {
    const res = await createProduct({
      name: "Uncategorised Product",
      category_id: null,
      variants: [{ sku: "UNCAT-E2E", name: "Default", price_cents: 100, inventory_count: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.category_id).toBeNull();
  });

  it("accepts zero price and zero inventory", async () => {
    const res = await createProduct({
      variants: [{ sku: "ZERO-E2E", name: "Free", price_cents: 0, inventory_count: 0 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.variants[0].price_cents).toBe(0);
    expect(res.body.variants[0].inventory_count).toBe(0);
  });

  it("defaults to 'active' status when none is provided", async () => {
    const res = await createProduct({
      name: "No Status Product",
      status: undefined,
      variants: [{ sku: "NOSTAT-E2E", name: "Default", price_cents: 100, inventory_count: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("active");
  });

  it("trims whitespace from product name and variant fields", async () => {
    const res = await createProduct({
      name: "  Padded Name  ",
      variants: [{ sku: "  TRIM-E2E  ", name: "  Trimmed  ", price_cents: 100, inventory_count: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Padded Name");
    expect(res.body.variants[0].sku).toBe("TRIM-E2E");
    expect(res.body.variants[0].name).toBe("Trimmed");
  });

  it("creates a product with many variants", async () => {
    const variants = Array.from({ length: 10 }, (_, i) => ({
      sku: `BATCH-E2E-${i}`,
      name: `Variant ${i}`,
      price_cents: (i + 1) * 100,
      inventory_count: i * 5,
    }));
    const res = await createProduct({ name: "Bulk Product", variants });
    expect(res.status).toBe(201);
    expect(res.body.variants).toHaveLength(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/products — filtering & search
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/products — filtering", () => {
  it("returns all active products as an array", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("filters by category_id", async () => {
    const res = await request(app).get("/api/products?category_id=1");
    expect(res.status).toBe(200);
    for (const p of res.body) {
      expect(p.category_id).toBe(1);
    }
  });

  it("filters by search term (name match)", async () => {
    // Create a product with a unique name we can search for
    await createProduct({
      name: "Searchable Unicorn",
      variants: [{ sku: "SRCH-UNI-E2E", name: "Default", price_cents: 100, inventory_count: 1 }],
    });

    const res = await request(app).get("/api/products?search=Unicorn");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.some((p: { name: string }) => p.name.includes("Unicorn"))).toBe(true);
  });

  it("returns empty array for a search with no matches", async () => {
    const res = await request(app).get("/api/products?search=zzzznonexistentzzz");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("combines search and category_id filters", async () => {
    const res = await request(app).get("/api/products?search=a&category_id=1");
    expect(res.status).toBe(200);
    for (const p of res.body) {
      expect(p.category_id).toBe(1);
    }
  });

  it("never returns soft-deleted products regardless of filters", async () => {
    const res = await request(app).get("/api/products");
    for (const p of res.body) {
      expect(p.deleted_at).toBeNull();
    }
  });

  it("includes aggregate fields (variant_count, min/max price, total_inventory)", async () => {
    const res = await request(app).get("/api/products");
    const product = res.body[0];
    expect(product).toHaveProperty("variant_count");
    expect(product).toHaveProperty("min_price_cents");
    expect(product).toHaveProperty("max_price_cents");
    expect(product).toHaveProperty("total_inventory");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/products/:id — single product
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/products/:id", () => {
  it("returns a product with its variants", async () => {
    const created = await createProduct({
      name: "Detail Test",
      variants: [{ sku: "DETAIL-E2E", name: "Only", price_cents: 200, inventory_count: 3 }],
    });
    const res = await request(app).get(`/api/products/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Detail Test");
    expect(res.body.variants).toHaveLength(1);
    expect(res.body).toHaveProperty("category_name");
  });

  it("returns 404 for a non-existent product ID", async () => {
    const res = await request(app).get("/api/products/99999");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/products/:id — update product
// ═══════════════════════════════════════════════════════════════════════════

describe("PUT /api/products/:id", () => {
  it("updates product name", async () => {
    const created = await createProduct({
      name: "Before Update",
      variants: [{ sku: "UPD-PROD-E2E", name: "V", price_cents: 100, inventory_count: 1 }],
    });
    const res = await request(app)
      .put(`/api/products/${created.body.id}`)
      .send({ name: "After Update" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("After Update");
  });

  it("updates product status", async () => {
    const created = await createProduct({
      name: "Status Change",
      variants: [{ sku: "STAT-CHG-E2E", name: "V", price_cents: 100, inventory_count: 1 }],
    });
    const res = await request(app)
      .put(`/api/products/${created.body.id}`)
      .send({ status: "archived" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("archived");
  });

  it("returns 404 for non-existent product", async () => {
    const res = await request(app)
      .put("/api/products/99999")
      .send({ name: "Ghost" });
    expect(res.status).toBe(404);
  });

  it("preserves fields not included in the update", async () => {
    const created = await createProduct({
      name: "Preserve Test",
      description: "Keep this",
      variants: [{ sku: "PRSV-E2E", name: "V", price_cents: 100, inventory_count: 1 }],
    });
    const res = await request(app)
      .put(`/api/products/${created.body.id}`)
      .send({ name: "Changed Name" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Changed Name");
    expect(res.body.description).toBe("Keep this");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/products/:id — soft delete
// ═══════════════════════════════════════════════════════════════════════════

describe("DELETE /api/products/:id", () => {
  it("soft-deletes a product and sets deleted_at", async () => {
    const created = await createProduct({
      name: "To Delete",
      variants: [{ sku: "DEL-E2E", name: "V", price_cents: 100, inventory_count: 1 }],
    });
    const delRes = await request(app).delete(`/api/products/${created.body.id}`);
    expect(delRes.status).toBe(200);

    // Verify the row still exists but has deleted_at set
    const row = db.prepare("SELECT deleted_at FROM products WHERE id = ?").get(created.body.id) as { deleted_at: string | null };
    expect(row.deleted_at).not.toBeNull();
  });

  it("returns 404 for non-existent product", async () => {
    const res = await request(app).delete("/api/products/99999");
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VARIANTS — full lifecycle
// ═══════════════════════════════════════════════════════════════════════════

describe("Variants — full lifecycle", () => {
  it("creates via product, reads, updates, and deletes a variant", async () => {
    // Create a product with two variants (need 2 so we can delete one)
    const created = await createProduct({
      name: "Variant Lifecycle",
      variants: [
        { sku: "VLIFE-A", name: "Alpha", price_cents: 100, inventory_count: 10 },
        { sku: "VLIFE-B", name: "Beta", price_cents: 200, inventory_count: 20 },
      ],
    });
    expect(created.body.variants).toHaveLength(2);
    const variantA = created.body.variants[0];
    const variantB = created.body.variants[1];

    // READ
    const getRes = await request(app).get(`/api/variants/${variantA.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.sku).toBe("VLIFE-A");

    // UPDATE
    const putRes = await request(app)
      .put(`/api/variants/${variantA.id}`)
      .send({ price_cents: 999, inventory_count: 42 });
    expect(putRes.status).toBe(200);
    expect(putRes.body.price_cents).toBe(999);
    expect(putRes.body.inventory_count).toBe(42);

    // DELETE variant B
    const delRes = await request(app).delete(`/api/variants/${variantB.id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Verify only one variant remains on the product
    const productRes = await request(app).get(`/api/products/${created.body.id}`);
    expect(productRes.body.variants).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/variants/:id
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/variants/:id", () => {
  it("returns 404 for non-existent variant", async () => {
    const res = await request(app).get("/api/variants/99999");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/variants/:id — error states & edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe("PUT /api/variants/:id — error states", () => {
  let variantId: number;

  beforeAll(async () => {
    const created = await createProduct({
      name: "Variant Error Tests",
      variants: [{ sku: "VERR-E2E", name: "Target", price_cents: 500, inventory_count: 10 }],
    });
    variantId = created.body.variants[0].id;
  });

  it("returns 404 for non-existent variant", async () => {
    const res = await request(app)
      .put("/api/variants/99999")
      .send({ price_cents: 100 });
    expect(res.status).toBe(404);
  });

  it("rejects negative price_cents", async () => {
    const res = await request(app)
      .put(`/api/variants/${variantId}`)
      .send({ price_cents: -1 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("rejects negative inventory_count", async () => {
    const res = await request(app)
      .put(`/api/variants/${variantId}`)
      .send({ inventory_count: -5 });
    expect(res.status).toBe(400);
  });

  it("rejects empty-string name", async () => {
    const res = await request(app)
      .put(`/api/variants/${variantId}`)
      .send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("rejects empty-string SKU", async () => {
    const res = await request(app)
      .put(`/api/variants/${variantId}`)
      .send({ sku: "" });
    expect(res.status).toBe(400);
  });

  it("rejects a body with no updatable fields", async () => {
    const res = await request(app)
      .put(`/api/variants/${variantId}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no fields/i);
  });

  it("rejects a SKU that conflicts with another variant (409)", async () => {
    // Create another product with a known SKU
    await createProduct({
      name: "SKU Conflict Source",
      variants: [{ sku: "CONFLICT-TARGET-E2E", name: "V", price_cents: 100, inventory_count: 1 }],
    });

    const res = await request(app)
      .put(`/api/variants/${variantId}`)
      .send({ sku: "CONFLICT-TARGET-E2E" });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("error");
  });

  it("allows updating SKU to itself (no conflict)", async () => {
    const res = await request(app)
      .put(`/api/variants/${variantId}`)
      .send({ sku: "VERR-E2E" });
    expect(res.status).toBe(200);
    expect(res.body.sku).toBe("VERR-E2E");
  });

  it("updates only price_cents when only price is sent", async () => {
    const before = await request(app).get(`/api/variants/${variantId}`);
    const res = await request(app)
      .put(`/api/variants/${variantId}`)
      .send({ price_cents: 777 });
    expect(res.status).toBe(200);
    expect(res.body.price_cents).toBe(777);
    expect(res.body.inventory_count).toBe(before.body.inventory_count);
  });

  it("updates only inventory_count when only inventory is sent", async () => {
    const before = await request(app).get(`/api/variants/${variantId}`);
    const res = await request(app)
      .put(`/api/variants/${variantId}`)
      .send({ inventory_count: 33 });
    expect(res.status).toBe(200);
    expect(res.body.inventory_count).toBe(33);
    expect(res.body.price_cents).toBe(before.body.price_cents);
  });

  it("sets updated_at on every update", async () => {
    const before = await request(app).get(`/api/variants/${variantId}`);
    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 1100));
    const res = await request(app)
      .put(`/api/variants/${variantId}`)
      .send({ price_cents: 888 });
    expect(res.status).toBe(200);
    expect(res.body.updated_at).not.toBe(before.body.updated_at);
  });

  it("accepts zero price and zero inventory", async () => {
    const res = await request(app)
      .put(`/api/variants/${variantId}`)
      .send({ price_cents: 0, inventory_count: 0 });
    expect(res.status).toBe(200);
    expect(res.body.price_cents).toBe(0);
    expect(res.body.inventory_count).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/variants/:id — error states
// ═══════════════════════════════════════════════════════════════════════════

describe("DELETE /api/variants/:id", () => {
  it("returns 404 for non-existent variant", async () => {
    const res = await request(app).delete("/api/variants/99999");
    expect(res.status).toBe(404);
  });

  it("prevents deleting the last variant of a product", async () => {
    const created = await createProduct({
      name: "Last Variant Guard",
      variants: [{ sku: "LAST-V-E2E", name: "Only", price_cents: 100, inventory_count: 1 }],
    });
    const variantId = created.body.variants[0].id;

    const res = await request(app).delete(`/api/variants/${variantId}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last variant/i);
  });

  it("allows deleting a variant when siblings remain", async () => {
    const created = await createProduct({
      name: "Deletable Variant",
      variants: [
        { sku: "DELV-A-E2E", name: "A", price_cents: 100, inventory_count: 1 },
        { sku: "DELV-B-E2E", name: "B", price_cents: 200, inventory_count: 2 },
      ],
    });
    const toDelete = created.body.variants[1].id;

    const res = await request(app).delete(`/api/variants/${toDelete}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/categories", () => {
  it("returns all categories with product counts", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("product_count");
  });

  it("category product counts exclude soft-deleted products", async () => {
    // Create and then delete a product in category 1
    const created = await createProduct({
      name: "Category Count Ghost",
      category_id: 1,
      variants: [{ sku: "CATGHOST-E2E", name: "V", price_cents: 100, inventory_count: 1 }],
    });

    // Get count before deletion
    const beforeRes = await request(app).get("/api/categories");
    const catBefore = beforeRes.body.find((c: { id: number }) => c.id === 1);

    // Soft-delete the product
    await request(app).delete(`/api/products/${created.body.id}`);

    // Count should decrease by 1
    const afterRes = await request(app).get("/api/categories");
    const catAfter = afterRes.body.find((c: { id: number }) => c.id === 1);
    expect(catAfter.product_count).toBe(catBefore.product_count - 1);
  });
});

describe("GET /api/categories/:id", () => {
  it("returns a single category", async () => {
    const res = await request(app).get("/api/categories/1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("name");
  });

  it("returns 404 for non-existent category", async () => {
    const res = await request(app).get("/api/categories/99999");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /health", () => {
  it("returns { ok: true }", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Transaction atomicity
// ═══════════════════════════════════════════════════════════════════════════

describe("Transaction atomicity", () => {
  it("rolls back the product if a variant violates a DB constraint", async () => {
    const countBefore = (
      db.prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number }
    ).c;

    // Second variant duplicates a SKU from seed data — should fail
    const res = await createProduct({
      name: "Atomic Failure Test",
      variants: [
        { sku: "ATOM-OK-E2E", name: "Good", price_cents: 100, inventory_count: 1 },
        { sku: "ABP-4OZ", name: "Conflict", price_cents: 100, inventory_count: 1 },
      ],
    });

    // Should be rejected
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Product count should not have increased (transaction rolled back)
    const countAfter = (
      db.prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number }
    ).c;
    expect(countAfter).toBe(countBefore);
  });
});
