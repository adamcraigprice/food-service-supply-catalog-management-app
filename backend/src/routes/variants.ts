import { Router } from "express";
import db from "../db.js";

const router = Router();

/**
 * GET /api/variants/:id
 * Get a single variant.
 */
router.get("/:id", (req, res) => {
  try {
    const variant = db
      .prepare("SELECT * FROM variants WHERE id = ?")
      .get(Number(req.params.id));

    if (!variant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    res.json(variant);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

/**
 * PUT /api/variants/:id
 * Update a variant's price and/or inventory.
 *
 * Expected body (all fields optional):
 * {
 *   "name": "Updated Name",
 *   "sku": "NEW-SKU",
 *   "price_cents": 1999,
 *   "inventory_count": 50
 * }
 */
router.put("/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, sku, price_cents, inventory_count } = req.body;

    // 1. Verify the variant exists
    const existing = db
      .prepare("SELECT * FROM variants WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;

    if (!existing) {
      return res.status(404).json({ error: "Variant not found" });
    }

    // 2. Validate fields (only those provided)
    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      return res.status(400).json({ error: "Variant name must be a non-empty string" });
    }

    if (sku !== undefined && (typeof sku !== "string" || sku.trim().length === 0)) {
      return res.status(400).json({ error: "SKU must be a non-empty string" });
    }

    if (price_cents !== undefined) {
      if (typeof price_cents !== "number" || price_cents < 0) {
        return res.status(400).json({ error: "price_cents must be a number >= 0" });
      }
    }

    if (inventory_count !== undefined) {
      if (typeof inventory_count !== "number" || inventory_count < 0) {
        return res.status(400).json({ error: "inventory_count must be a number >= 0" });
      }
    }

    // 3. If SKU is being changed, ensure uniqueness
    if (sku !== undefined && sku.trim() !== existing.sku) {
      const conflict = db
        .prepare("SELECT id FROM variants WHERE sku = ? AND id != ?")
        .get(sku.trim(), id);
      if (conflict) {
        return res.status(409).json({ error: `SKU "${sku.trim()}" already exists` });
      }
    }

    // 4. Build a partial update — only touch supplied fields
    const updates: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name.trim());
    }
    if (sku !== undefined) {
      updates.push("sku = ?");
      params.push(sku.trim());
    }
    if (price_cents !== undefined) {
      updates.push("price_cents = ?");
      params.push(price_cents);
    }
    if (inventory_count !== undefined) {
      updates.push("inventory_count = ?");
      params.push(inventory_count);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields provided to update" });
    }

    updates.push("updated_at = datetime('now')");
    params.push(id);

    db.prepare(
      `UPDATE variants SET ${updates.join(", ")} WHERE id = ?`
    ).run(...params);

    // 5. Return the updated variant
    const updated = db.prepare("SELECT * FROM variants WHERE id = ?").get(id);
    res.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/variants/:id
 * Delete a variant permanently.
 */
router.delete("/:id", (req, res) => {
  try {
    const id = Number(req.params.id);

    const variant = db
      .prepare("SELECT * FROM variants WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;

    if (!variant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    // Prevent deleting the last variant of a product
    const siblingCount = db
      .prepare(
        "SELECT COUNT(*) AS count FROM variants WHERE product_id = ?"
      )
      .get(variant.product_id as number) as { count: number };

    if (siblingCount.count <= 1) {
      return res
        .status(400)
        .json({ error: "Cannot delete the last variant of a product" });
    }

    db.prepare("DELETE FROM variants WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
