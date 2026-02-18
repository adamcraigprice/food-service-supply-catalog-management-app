import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import { createProduct, fetchCategories } from "@/lib/api";
import type { Category } from "@/types";

/** Shape of a variant row in the form (before submission). */
interface VariantFormRow {
  key: number; // local key for React reconciliation
  sku: string;
  name: string;
  price: string; // stored as string to allow free-form input; converted to cents on submit
  inventory_count: string;
}

function emptyVariant(key: number): VariantFormRow {
  return { key, sku: "", name: "", price: "", inventory_count: "" };
}

export default function CreateProductPage() {
  const navigate = useNavigate();

  // Product fields
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [status, setStatus] = useState<"active" | "draft">("active");

  // Variants (at least one required)
  const [variants, setVariants] = useState<VariantFormRow[]>([emptyVariant(0)]);
  const [nextKey, setNextKey] = useState(1);

  // Categories for the dropdown
  const [categories, setCategories] = useState<Category[]>([]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchCategories()
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
  }, []);

  // --- Client-side validation ---
  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!productName.trim()) {
      errors.productName = "Product name is required";
    }

    if (variants.length === 0) {
      errors.variants = "At least one variant is required";
    }

    const seenSkus = new Set<string>();
    variants.forEach((v, i) => {
      if (!v.sku.trim()) {
        errors[`variant_${i}_sku`] = "SKU is required";
      } else if (seenSkus.has(v.sku.trim())) {
        errors[`variant_${i}_sku`] = "Duplicate SKU";
      } else {
        seenSkus.add(v.sku.trim());
      }

      if (!v.name.trim()) {
        errors[`variant_${i}_name`] = "Variant name is required";
      }

      const price = parseFloat(v.price);
      if (v.price !== "" && (isNaN(price) || price < 0)) {
        errors[`variant_${i}_price`] = "Price must be ≥ 0";
      }

      const inv = parseInt(v.inventory_count, 10);
      if (v.inventory_count !== "" && (isNaN(inv) || inv < 0)) {
        errors[`variant_${i}_inventory`] = "Inventory must be ≥ 0";
      }
    });

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // --- Variant helpers ---
  function addVariant() {
    setVariants((prev) => [...prev, emptyVariant(nextKey)]);
    setNextKey((k) => k + 1);
  }

  function removeVariant(key: number) {
    setVariants((prev) => prev.filter((v) => v.key !== key));
  }

  function updateVariant(key: number, field: keyof VariantFormRow, value: string) {
    setVariants((prev) =>
      prev.map((v) => (v.key === key ? { ...v, [field]: value } : v))
    );
  }

  // --- Submit ---
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setSubmitting(true);

    try {
      const body = {
        name: productName.trim(),
        description: description.trim() || null,
        category_id: categoryId || null,
        status,
        variants: variants.map((v) => ({
          sku: v.sku.trim(),
          name: v.name.trim(),
          price_cents: v.price ? Math.round(parseFloat(v.price) * 100) : 0,
          inventory_count: v.inventory_count ? parseInt(v.inventory_count, 10) : 0,
        })),
      };

      const res = await createProduct(body);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Server error (${res.status})`);
      }

      const created = await res.json();
      navigate(`/products/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  // Shared input classes
  const inputCls =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const errorInputCls = "border-destructive focus-visible:ring-destructive";

  return (
    <div>
      <Link
        to="/products"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to products
      </Link>

      <h1 className="mb-6 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
        Create New Product
      </h1>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* --- Product details card --- */}
        <div className="rounded-lg border bg-card p-6 shadow-card">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Product Details</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Name */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Angus Beef Patties"
                className={`${inputCls} ${fieldErrors.productName ? errorInputCls : ""}`}
              />
              {fieldErrors.productName && (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.productName}</p>
              )}
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional product description"
                rows={3}
                className={`${inputCls} h-auto`}
              />
            </div>

            {/* Category */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Category</label>
              <select
                value={categoryId}
                onChange={(e) =>
                  setCategoryId(e.target.value ? Number(e.target.value) : "")
                }
                className={inputCls}
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "draft")}
                className={inputCls}
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>
        </div>

        {/* --- Variants card --- */}
        <div className="rounded-lg border bg-card p-6 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Variants <span className="text-destructive">*</span>
            </h2>
            <button
              type="button"
              onClick={addVariant}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              Add Variant
            </button>
          </div>

          {fieldErrors.variants && (
            <p className="mb-3 text-xs text-destructive">{fieldErrors.variants}</p>
          )}

          <div className="space-y-4">
            {variants.map((v, i) => (
              <div
                key={v.key}
                className="rounded-md border bg-background p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Variant {i + 1}
                  </span>
                  {variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeVariant(v.key)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {/* SKU */}
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      SKU <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={v.sku}
                      onChange={(e) => updateVariant(v.key, "sku", e.target.value)}
                      placeholder="e.g. ABP-4OZ"
                      className={`${inputCls} ${fieldErrors[`variant_${i}_sku`] ? errorInputCls : ""}`}
                    />
                    {fieldErrors[`variant_${i}_sku`] && (
                      <p className="mt-1 text-xs text-destructive">
                        {fieldErrors[`variant_${i}_sku`]}
                      </p>
                    )}
                  </div>

                  {/* Name */}
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={v.name}
                      onChange={(e) => updateVariant(v.key, "name", e.target.value)}
                      placeholder="e.g. 4 oz"
                      className={`${inputCls} ${fieldErrors[`variant_${i}_name`] ? errorInputCls : ""}`}
                    />
                    {fieldErrors[`variant_${i}_name`] && (
                      <p className="mt-1 text-xs text-destructive">
                        {fieldErrors[`variant_${i}_name`]}
                      </p>
                    )}
                  </div>

                  {/* Price */}
                  <div>
                    <label className="mb-1 block text-xs font-medium">Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={v.price}
                      onChange={(e) => updateVariant(v.key, "price", e.target.value)}
                      placeholder="0.00"
                      className={`${inputCls} ${fieldErrors[`variant_${i}_price`] ? errorInputCls : ""}`}
                    />
                    {fieldErrors[`variant_${i}_price`] && (
                      <p className="mt-1 text-xs text-destructive">
                        {fieldErrors[`variant_${i}_price`]}
                      </p>
                    )}
                  </div>

                  {/* Inventory */}
                  <div>
                    <label className="mb-1 block text-xs font-medium">Inventory</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={v.inventory_count}
                      onChange={(e) =>
                        updateVariant(v.key, "inventory_count", e.target.value)
                      }
                      placeholder="0"
                      className={`${inputCls} ${fieldErrors[`variant_${i}_inventory`] ? errorInputCls : ""}`}
                    />
                    {fieldErrors[`variant_${i}_inventory`] && (
                      <p className="mt-1 text-xs text-destructive">
                        {fieldErrors[`variant_${i}_inventory`]}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* --- Submit --- */}
        <div className="flex justify-end gap-3">
          <Link
            to="/products"
            className="inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#2E3330] px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#3a3f3c] disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Creating…" : "Create Product"}
          </button>
        </div>
      </form>
    </div>
  );
}
