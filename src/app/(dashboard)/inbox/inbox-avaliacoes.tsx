"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, MessageSquareText, RefreshCw, Search, Star } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import settingsConfig from "@/config/settings.json";

type CatalogItem = {
  listingId: string;
  title: string;
  permalink: string | null;
  ratingAverage: number | null;
  reviewsTotal: number | null;
};

type CatalogResponse = {
  brand: string;
  totalListings: number;
  offset: number;
  limit: number;
  items: CatalogItem[];
};

type Avaliacao = CatalogItem & { brand: string; brandLabel: string };
type FiltroNota = "todas" | "excelentes" | "atencao" | "sem_avaliacao";

const marcas = settingsConfig.mercadoLivre.brands;

function estrelas(nota: number | null) {
  const preenchidas = nota === null ? 0 : Math.round(nota);
  return Array.from({ length: 5 }, (_, index) => index < preenchidas);
}

async function carregarMarca(slug: string, label: string): Promise<Avaliacao[]> {
  const acumulado: CatalogItem[] = [];
  let offset = 0;
  let total = 1;
  while (offset < total) {
    const response = await fetch(`/api/ml/catalog?brand=${slug}&offset=${offset}&limit=50`);
    const body = await response.json() as CatalogResponse | { error?: string };
    if (!response.ok || !("items" in body)) {
      throw new Error("error" in body && body.error ? body.error : `Falha ao consultar ${label}.`);
    }
    acumulado.push(...body.items);
    total = body.totalListings;
    offset += body.limit;
    if (body.items.length === 0) break;
  }

  const anuncios = new Map<string, CatalogItem>();
  for (const item of acumulado) if (!anuncios.has(item.listingId)) anuncios.set(item.listingId, item);
  return [...anuncios.values()].map((item) => ({ ...item, brand: slug, brandLabel: label }));
}

function RatingStars({ nota, size = 15 }: { nota: number | null; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={nota === null ? "Sem avaliações" : `Nota ${nota.toFixed(1)} de 5`}>
      {estrelas(nota).map((filled, index) => (
        <Star key={index} size={size} className={filled ? "fill-[#FFB900] text-[#FFB900]" : "fill-muted text-border"} />
      ))}
    </span>
  );
}

export function InboxAvaliacoes() {
  const [itens, setItens] = useState<Avaliacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [marca, setMarca] = useState("todas");
  const [nota, setNota] = useState<FiltroNota>("todas");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const resultados = await Promise.allSettled(marcas.map((item) => carregarMarca(item.slug, item.label)));
      const sucesso = resultados.flatMap((resultado) => resultado.status === "fulfilled" ? resultado.value : []);
      setItens(sucesso);
      const falhas = resultados.filter((resultado) => resultado.status === "rejected").length;
      if (falhas === resultados.length) throw new Error("Nenhuma conta do Mercado Livre respondeu.");
      if (falhas > 0) toast.warning(`${falhas} conta(s) não puderam ser consultadas.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as avaliações.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(task);
  }, [carregar]);

  const filtrados = useMemo(() => itens.filter((item) => {
    if (marca !== "todas" && item.brand !== marca) return false;
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (termo && !item.title.toLocaleLowerCase("pt-BR").includes(termo) && !item.listingId.toLowerCase().includes(termo)) return false;
    if (nota === "excelentes" && (item.ratingAverage ?? 0) < 4.5) return false;
    if (nota === "atencao" && (item.ratingAverage === null || item.ratingAverage >= 4)) return false;
    if (nota === "sem_avaliacao" && item.ratingAverage !== null) return false;
    return true;
  }), [itens, marca, busca, nota]);

  const avaliados = itens.filter((item) => item.ratingAverage !== null);
  const totalOpinioes = itens.reduce((total, item) => total + (item.reviewsTotal ?? 0), 0);
  const media = avaliados.length
    ? avaliados.reduce((total, item) => total + (item.ratingAverage ?? 0), 0) / avaliados.length
    : null;
  const atencao = itens.filter((item) => item.ratingAverage !== null && item.ratingAverage < 4).length;

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Nota média", value: media === null ? "—" : media.toFixed(2), detail: "média dos anúncios", accent: "#FFB900" },
          { label: "Avaliações", value: totalOpinioes.toLocaleString("pt-BR"), detail: "opiniões recebidas", accent: "#9B30D9" },
          { label: "Anúncios avaliados", value: String(avaliados.length), detail: `de ${itens.length} anúncios`, accent: "#2563EB" },
          { label: "Pedem atenção", value: String(atencao), detail: "nota abaixo de 4,0", accent: "#E3131B" },
        ].map((item, index) => (
          <motion.article
            key={item.label}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className="rounded-[1.1rem] border border-border bg-card p-4 shadow-[0_2px_12px_rgba(14,15,19,.05)]"
          >
            <div className="mb-3 h-1 w-9 rounded-full" style={{ background: item.accent }} />
            <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-foreground">{carregando ? "…" : item.value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{item.detail}</p>
          </motion.article>
        ))}
      </section>

      <section className="overflow-hidden rounded-[1.25rem] border border-border bg-card shadow-[0_2px_16px_rgba(14,15,19,.06)]">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="flex-1">
            <h2 className="text-base font-bold text-foreground">Reputação dos anúncios</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Acompanhe notas e volume de avaliações das três operações.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[210px] flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar anúncio…" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-[rgba(155,48,217,.5)]" />
            </label>
            <select value={marca} onChange={(e) => setMarca(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="todas">Todas as marcas</option>
              {marcas.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}
            </select>
            <select value={nota} onChange={(e) => setNota(e.target.value as FiltroNota)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="todas">Todas as notas</option>
              <option value="excelentes">4,5 ou mais</option>
              <option value="atencao">Abaixo de 4,0</option>
              <option value="sem_avaliacao">Sem avaliação</option>
            </select>
            <button type="button" onClick={() => void carregar()} disabled={carregando} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border hover:bg-muted disabled:opacity-50" title="Atualizar avaliações">
              <RefreshCw size={15} className={carregando ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {carregando ? (
          <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 size={17} className="animate-spin" /> Consultando Mercado Livre…</div>
        ) : filtrados.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
            <MessageSquareText size={25} strokeWidth={1.5} />
            <p className="text-sm font-medium">Nenhuma avaliação encontrada com estes filtros.</p>
          </div>
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {filtrados.map((item, index) => (
              <motion.article key={`${item.brand}:${item.listingId}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 12) * 0.025 }} className="group rounded-2xl border border-border p-4 transition-colors hover:border-[rgba(155,48,217,.3)] hover:bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-[#FFE600]/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground">{item.brandLabel}</span>
                  {item.permalink && <a href={item.permalink} target="_blank" rel="noreferrer" className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Abrir anúncio"><ExternalLink size={14} /></a>}
                </div>
                <h3 className="mt-3 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-foreground">{item.title}</h3>
                <p className="mt-1 text-[10px] text-muted-foreground">{item.listingId}</p>
                <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-3">
                  <div><RatingStars nota={item.ratingAverage} /><p className="mt-1 text-[11px] text-muted-foreground">{item.reviewsTotal ? `${item.reviewsTotal} avaliações` : "Ainda sem avaliações"}</p></div>
                  <span className={`text-2xl font-black tabular-nums ${item.ratingAverage !== null && item.ratingAverage < 4 ? "text-[#E3131B]" : "text-foreground"}`}>{item.ratingAverage?.toFixed(1) ?? "—"}</span>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
