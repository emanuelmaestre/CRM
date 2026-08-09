"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ExternalLink, Link2, Loader2, Plus, Search, SearchX } from "lucide-react";
import { toast } from "sonner";
import settingsConfig from "@/config/settings.json";
import { isBrandSlug, type BrandSlug } from "@/shared/config/brands";
import { actionImportarProdutoMercadoLivre, actionSalvarMapeamentoCanal } from "./actions";

const cascataLinhas = { hidden: {}, show: { transition: { staggerChildren: 0.03 } } };
const linhaVariant = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0, 0, 0.2, 1] as const } },
};

interface ProdutoConfiguracao {
  id: string;
  brandId: string;
  sku: string;
  nome: string;
}

interface CatalogItem {
  listingId: string;
  variationId: string | null;
  externalSku: string | null;
  title: string;
  variationLabel: string | null;
  availableQuantity: number;
  price: string;
  status: string;
  permalink: string | null;
  mappedProductId: string | null;
}

interface CatalogResponse {
  brand: BrandSlug;
  brandId: string;
  channelAccountId: string;
  totalListings: number;
  offset: number;
  limit: number;
  items: CatalogItem[];
}

const config = settingsConfig.mercadoLivre.catalog;

function itemKey(item: CatalogItem) {
  return `${item.listingId}:${item.variationId ?? "item"}`;
}

function normalizarSku(value: string | null | undefined) {
  return value?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "") ?? "";
}

export function MLCatalogMappingSection({
  produtos,
  onMapped,
}: {
  produtos: ProdutoConfiguracao[];
  onMapped: () => void;
}) {
  const firstBrand = settingsConfig.mercadoLivre.brands[0]?.slug ?? "karzi";
  const [brand, setBrand] = useState<BrandSlug>(isBrandSlug(firstBrand) ? firstBrand : "karzi");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [mappingKey, setMappingKey] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);
  const [, startTransition] = useTransition();

  const produtosDaMarca = useMemo(
    () => produtos.filter((produto) => !catalog || produto.brandId === catalog.brandId),
    [catalog, produtos],
  );

  const itensFiltrados = useMemo(() => {
    if (!catalog) return [];
    const termo = busca.trim().toLowerCase();
    return catalog.items.filter((item) => {
      if (soPendentes && item.mappedProductId) return false;
      if (!termo) return true;
      return (
        item.title.toLowerCase().includes(termo)
        || (item.externalSku?.toLowerCase().includes(termo) ?? false)
        || item.listingId.toLowerCase().includes(termo)
      );
    });
  }, [catalog, busca, soPendentes]);

  const totalPendentes = catalog ? catalog.items.filter((item) => !item.mappedProductId).length : 0;

  async function carregar(offset = 0) {
    setLoading(true);
    try {
      const response = await fetch(`/api/ml/catalog?brand=${brand}&offset=${offset}&limit=50`);
      const body = await response.json() as CatalogResponse | { error?: string };
      if (!response.ok || !("items" in body)) {
        throw new Error("error" in body && body.error ? body.error : config.loadError);
      }

      const next = offset === 0 || !catalog
        ? body
        : { ...body, items: [...catalog.items, ...body.items] };
      setCatalog(next);
      setSelections((current) => {
        const suggestions = { ...current };
        for (const item of body.items) {
          if (item.mappedProductId) suggestions[itemKey(item)] = item.mappedProductId;
          if (suggestions[itemKey(item)] || !item.externalSku) continue;
          const sku = normalizarSku(item.externalSku);
          const match = produtos.find((produto) =>
            produto.brandId === body.brandId && normalizarSku(produto.sku) === sku,
          );
          if (match) suggestions[itemKey(item)] = match.id;
        }
        return suggestions;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : config.loadError);
    } finally {
      setLoading(false);
    }
  }

  function mapear(item: CatalogItem) {
    if (!catalog) return;
    const key = itemKey(item);
    const produtoId = selections[key];
    if (!produtoId || !item.externalSku) return;
    setMappingKey(key);
    startTransition(async () => {
      try {
        await actionSalvarMapeamentoCanal({
          produtoId,
          channelAccountId: catalog.channelAccountId,
          externalListingId: item.listingId,
          externalSkuId: item.externalSku,
          externalWarehouseId: item.variationId ?? undefined,
        });
        setCatalog((current) => current ? {
          ...current,
          items: current.items.map((candidate) => itemKey(candidate) === key
            ? { ...candidate, mappedProductId: produtoId }
            : candidate),
        } : current);
        toast.success(config.mappedSuccess);
        onMapped();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : config.mapError);
      } finally {
        setMappingKey(null);
      }
    });
  }

  function criarEMapear(item: CatalogItem) {
    if (!catalog || !item.externalSku || Number(item.price) <= 0) return;
    const key = itemKey(item);
    setMappingKey(key);
    startTransition(async () => {
      try {
        const result = await actionImportarProdutoMercadoLivre({
          brandId: catalog.brandId,
          channelAccountId: catalog.channelAccountId,
          externalListingId: item.listingId,
          externalSkuId: item.externalSku,
          variationId: item.variationId ?? undefined,
          nome: item.variationLabel ? `${item.title} — ${item.variationLabel}` : item.title,
          preco: Number(item.price).toFixed(2),
        });
        setSelections((current) => ({ ...current, [key]: result.produtoId }));
        setCatalog((current) => current ? {
          ...current,
          items: current.items.map((candidate) => itemKey(candidate) === key
            ? { ...candidate, mappedProductId: result.produtoId }
            : candidate),
        } : current);
        toast.success(result.criado ? config.createdSuccess : config.mappedSuccess);
        onMapped();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : config.mapError);
      } finally {
        setMappingKey(null);
      }
    });
  }

  const hasMore = catalog
    ? catalog.offset + catalog.limit < catalog.totalListings
    : false;

  return (
    <div className="mt-5 border-t border-border pt-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">{config.title}</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{config.description}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-muted-foreground">{config.brandLabel}</span>
            <select
              value={brand}
              onChange={(event) => {
                if (isBrandSlug(event.target.value)) {
                  setBrand(event.target.value);
                  setCatalog(null);
                  setSelections({});
                }
              }}
              className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"
            >
              {settingsConfig.mercadoLivre.brands.map((item) => (
                <option key={item.slug} value={item.slug}>{item.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void carregar(0)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {loading ? config.loading : config.load}
          </button>
        </div>
      </div>

      {catalog && (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {config.summary
                .replace("{shown}", String(catalog.items.length))
                .replace("{total}", String(catalog.totalListings))}
            </p>
            {catalog.items.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={busca}
                    onChange={(event) => setBusca(event.target.value)}
                    placeholder={config.searchPlaceholder}
                    className="h-9 w-full rounded-full border border-border bg-background pl-8 pr-3 text-xs sm:w-56"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSoPendentes((v) => !v)}
                  aria-pressed={soPendentes}
                  disabled={totalPendentes === 0}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                    soPendentes
                      ? "border-transparent bg-[#B57A00]/12 text-[#B57A00]"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {config.onlyPending} ({totalPendentes})
                </button>
              </div>
            )}
          </div>

          {catalog.items.length === 0 ? (
            <p className="rounded-xl bg-muted/60 px-4 py-5 text-sm text-muted-foreground">{config.empty}</p>
          ) : itensFiltrados.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10">
              <SearchX size={22} className="text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">{config.emptyFiltered}</p>
              <button
                type="button"
                onClick={() => { setBusca(""); setSoPendentes(false); }}
                className="text-xs font-semibold text-foreground underline underline-offset-2"
              >
                {config.clearFilter}
              </button>
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="show"
              variants={cascataLinhas}
              className="divide-y divide-border rounded-xl border border-border"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {itensFiltrados.map((item) => {
                const key = itemKey(item);
                const selectedProduct = produtosDaMarca.find((produto) => produto.id === selections[key]);
                const suggested = Boolean(
                  selectedProduct
                  && item.externalSku
                  && normalizarSku(selectedProduct.sku) === normalizarSku(item.externalSku),
                );
                const mapeado = Boolean(item.mappedProductId);
                const podeVincular = Boolean(selections[key]);

                return (
                  <motion.div
                    key={key}
                    layout
                    variants={linhaVariant}
                    exit={{ opacity: 0, height: 0 }}
                    className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(180px,.8fr)_auto] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                        {item.permalink && (
                          <a
                            href={item.permalink}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={config.openListing}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {config.listing}: {item.listingId}
                        {item.variationLabel ? ` · ${item.variationLabel}` : ""}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex h-6 items-center rounded-md bg-muted px-2 text-[11px] font-semibold tabular-nums text-foreground">
                          {config.stock}: {item.availableQuantity}
                        </span>
                        <span className="inline-flex h-6 items-center rounded-md bg-muted px-2 text-[11px] font-semibold tabular-nums text-foreground">
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(item.price))}
                        </span>
                        <span className={`inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold ${
                          item.externalSku ? "bg-muted text-foreground" : "bg-[#B57A00]/10 text-[#B57A00]"
                        }`}>
                          {item.externalSku ? `SKU: ${item.externalSku}` : config.missingSku}
                        </span>
                      </div>
                    </div>

                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                        {config.internalProduct}
                        {suggested && !mapeado && (
                          <span className="rounded-full bg-[#B57A00]/10 px-2 py-0.5 text-[10px] text-[#B57A00]">
                            {config.suggestion}
                          </span>
                        )}
                      </span>
                      <select
                        value={selections[key] ?? ""}
                        disabled={!item.externalSku || mapeado}
                        onChange={(event) => setSelections((current) => ({ ...current, [key]: event.target.value }))}
                        className={`min-h-11 min-w-0 rounded-xl border bg-background px-3 text-sm disabled:opacity-60 ${
                          podeVincular && !mapeado ? "border-[var(--brand-primary,#7C3AED)]" : "border-border"
                        }`}
                      >
                        <option value="">{config.selectProduct}</option>
                        {produtosDaMarca.map((produto) => (
                          <option key={produto.id} value={produto.id}>{produto.sku} — {produto.nome}</option>
                        ))}
                      </select>
                    </label>

                    <div className="flex items-center gap-1.5">
                      {mapeado ? (
                        <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1F8A4C]/10 px-4 text-sm font-semibold text-[#1F8A4C]">
                          <Check size={15} /> {config.mapped}
                        </span>
                      ) : podeVincular ? (
                        <button
                          type="button"
                          disabled={mappingKey === key}
                          onClick={() => mapear(item)}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60"
                          style={{ background: "var(--gradient-signature)" }}
                        >
                          {mappingKey === key ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                          {mappingKey === key ? config.creating : config.vincular}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!item.externalSku || Number(item.price) <= 0 || mappingKey === key}
                          onClick={() => criarEMapear(item)}
                          title={config.createAndMap}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                        >
                          {mappingKey === key ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                          {mappingKey === key ? config.creating : config.createAndMap}
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
                })}
              </AnimatePresence>
            </motion.div>
          )}

          {hasMore && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void carregar(catalog.offset + catalog.limit)}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {config.loadMore}
            </button>
          )}
        </>
      )}
    </div>
  );
}
