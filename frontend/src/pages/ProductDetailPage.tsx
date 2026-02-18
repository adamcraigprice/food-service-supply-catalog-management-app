import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, Package, Check, X, Loader2, AlertCircle } from "lucide-react";
import { fetchProduct, deleteProduct, updateVariant } from "@/lib/api";
import type { ProductDetail, Variant } from "@/types";
import { formatPrice, cn } from "@/lib/utils";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProduct = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    fetchProduct(Number(id))
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => null);
          throw new Error(data?.error ?? `Server error (${r.status})`);
        }
        return r.json();
      })
      .then(setProduct)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load product");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  // Delete handler — sends soft-delete request.
  // FIXME: The button does not disable while the request is in flight,
  //        so rapid clicks can send multiple DELETE requests.
  const handleDelete = async () => {
    if (!id) return;
    if (!window.confirm("Are you sure you want to delete this product?"))
      return;
    await deleteProduct(Number(id));
    navigate("/products");
  };

  /** Called by VariantRow after a successful update to refresh local state. */
  const handleVariantUpdated = (updated: Variant) => {
    setProduct((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        variants: prev.variants.map((v) => (v.id === updated.id ? updated : v)),
      };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div>
        <Link
          to="/products"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to products
        </Link>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-4 rounded-full bg-destructive/10 p-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <p className="text-lg font-medium text-foreground">
            {error === "Product not found" ? "Product not found" : "Something went wrong"}
          </p>
          <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
            {error ?? "The product could not be loaded."}
          </p>
          <button
            onClick={loadProduct}
            className="mt-4 inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Back link */}
      <Link
        to="/products"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to products
      </Link>

      {/* Product header — card style */}
      <div className="mb-6 rounded-lg border bg-card p-6 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {product.name}
            </h1>
            {product.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {product.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  product.status === "active"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : product.status === "draft"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-gray-200 bg-gray-100 text-gray-600"
                )}
              >
                {product.status}
              </span>
              {product.category_name && (
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  {product.category_name}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Variants table — card wrapped like CatalogList */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Variants ({product.variants.length})
        </h2>

        <div className="overflow-hidden rounded-lg border bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b bg-muted/50 transition-colors">
                  <th className="h-12 px-4 text-left align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    SKU
                  </th>
                  <th className="h-12 px-4 text-left align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Name
                  </th>
                  <th className="h-12 px-4 text-right align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Price
                  </th>
                  <th className="h-12 px-4 text-right align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Inventory
                  </th>
                  <th className="h-12 px-4 text-right align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {product.variants.map((v) => (
                  <VariantRow
                    key={v.id}
                    variant={v}
                    onUpdated={handleVariantUpdated}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function VariantRow({
  variant,
  onUpdated,
}: {
  variant: Variant;
  onUpdated: (v: Variant) => void;
}) {
  const lowStock =
    variant.inventory_count > 0 && variant.inventory_count <= 10;
  const outOfStock = variant.inventory_count === 0;

  // Edit state
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState("");
  const [inventory, setInventory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Enter edit mode — seed inputs from current values. */
  const startEditing = () => {
    setPrice((variant.price_cents / 100).toFixed(2));
    setInventory(String(variant.inventory_count));
    setError(null);
    setEditing(true);
  };

  /** Cancel without saving. */
  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  /** Validate locally, then PUT to the server. */
  const save = async () => {
    const parsedPrice = parseFloat(price);
    const parsedInventory = parseInt(inventory, 10);

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError("Price must be ≥ 0");
      return;
    }
    if (isNaN(parsedInventory) || parsedInventory < 0) {
      setError("Inventory must be ≥ 0");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await updateVariant(variant.id, {
        price_cents: Math.round(parsedPrice * 100),
        inventory_count: parsedInventory,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Server error (${res.status})`);
      }

      const updated: Variant = await res.json();
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  /** Allow Enter to save, Escape to cancel. */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
    if (e.key === "Escape") cancel();
  };

  const inputCls =
    "h-8 w-24 rounded-md border border-input bg-background px-2 text-sm text-right tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <>
      <tr className="border-b transition-colors hover:bg-muted/50">
        <td className="p-4 align-middle font-mono text-xs">{variant.sku}</td>
        <td className="p-4 align-middle font-medium">{variant.name}</td>

        {/* Price cell */}
        <td className="p-4 text-right align-middle tabular-nums">
          {editing ? (
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={handleKeyDown}
              className={inputCls}
              autoFocus
            />
          ) : (
            formatPrice(variant.price_cents)
          )}
        </td>

        {/* Inventory cell */}
        <td className="p-4 text-right align-middle tabular-nums">
          {editing ? (
            <input
              type="number"
              step="1"
              min="0"
              value={inventory}
              onChange={(e) => setInventory(e.target.value)}
              onKeyDown={handleKeyDown}
              className={inputCls}
            />
          ) : (
            <span
              className={cn(
                outOfStock && "text-destructive",
                lowStock && "text-amber-600"
              )}
            >
              {variant.inventory_count}
              {outOfStock && (
                <Package className="ml-1 inline h-3.5 w-3.5 text-destructive/60" />
              )}
            </span>
          )}
        </td>

        {/* Actions cell */}
        <td className="p-4 text-right align-middle">
          {editing ? (
            <div className="inline-flex items-center gap-1">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                Save
              </button>
              <button
                onClick={cancel}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={startEditing}
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          )}
        </td>
      </tr>

      {/* Error row — shown below the variant row when editing fails */}
      {error && editing && (
        <tr>
          <td colSpan={5} className="px-4 pb-2 pt-0">
            <p className="text-xs text-destructive">{error}</p>
          </td>
        </tr>
      )}
    </>
  );
}
