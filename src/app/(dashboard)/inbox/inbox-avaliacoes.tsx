"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Loader2, RefreshCw, Search, Star } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { springs } from "@/shared/design-system/motion-variants";
import settingsConfig from "@/config/settings.json";
import type { MLDistribuicaoNotas, MLOpiniao } from "@/modules/canais/infrastructure/mercadolivre.provider";

type CatalogItem = {
  listingId: string;
  title: string;
  permalink: string | null;
  ratingAverage: number | null;
  reviewsTotal: number | null;
  ratingLevels: MLDistribuicaoNotas | null;
  opinioes: MLOpiniao[];
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

const ESTRELAS: Array<{ chave: keyof MLDistribuicaoNotas; rotulo: string }> = [
  { chave: "cinco", rotulo: "5" },
  { chave: "quatro", rotulo: "4" },
  { chave: "tres", rotulo: "3" },
  { chave: "duas", rotulo: "2" },
  { chave: "uma", rotulo: "1" },
];

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

/* Trocar de aba desmonta este componente. Sem guardar o resultado, cada volta
   refaz a consulta inteira ao Mercado Livre — que é 1 requisição por anúncio,
   porque a API não tem endpoint de nota em lote. O cache de sessão deixa a volta
   instantânea; o botão atualizar ignora ele e busca de novo. */
const CACHE_TTL_MS = 5 * 60_000;
let cacheAvaliacoes: { itens: Avaliacao[]; buscadoEm: number } | null = null;

function cacheValido(): boolean {
  return cacheAvaliacoes !== null && Date.now() - cacheAvaliacoes.buscadoEm < CACHE_TTL_MS;
}

function somarDistribuicoes(itens: Avaliacao[]): MLDistribuicaoNotas | null {
  const comNiveis = itens.filter((item) => item.ratingLevels !== null);
  if (comNiveis.length === 0) return null;
  return comNiveis.reduce<MLDistribuicaoNotas>((total, item) => ({
    uma: total.uma + (item.ratingLevels?.uma ?? 0),
    duas: total.duas + (item.ratingLevels?.duas ?? 0),
    tres: total.tres + (item.ratingLevels?.tres ?? 0),
    quatro: total.quatro + (item.ratingLevels?.quatro ?? 0),
    cinco: total.cinco + (item.ratingLevels?.cinco ?? 0),
  }), { uma: 0, duas: 0, tres: 0, quatro: 0, cinco: 0 });
}

function totalDe(niveis: MLDistribuicaoNotas): number {
  return niveis.uma + niveis.duas + niveis.tres + niveis.quatro + niveis.cinco;
}

/** Média real ponderada pelas estrelas, e não média das médias dos anúncios. */
function mediaDe(niveis: MLDistribuicaoNotas): number | null {
  const total = totalDe(niveis);
  if (total === 0) return null;
  const soma = niveis.uma + niveis.duas * 2 + niveis.tres * 3 + niveis.quatro * 4 + niveis.cinco * 5;
  return soma / total;
}

function formatarData(iso: string | null): string {
  if (!iso) return "";
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "" : dataCurta.format(data);
}

async function buscarPagina(slug: string, label: string, offset: number): Promise<CatalogResponse> {
  const response = await fetch(`/api/ml/catalog?brand=${slug}&offset=${offset}&limit=50`);
  const body = await response.json() as CatalogResponse | { error?: string };
  if (!response.ok || !("items" in body)) {
    throw new Error("error" in body && body.error ? body.error : `Falha ao consultar ${label}.`);
  }
  return body;
}

/* A primeira página sai sozinha pra saber o total de anúncios; as páginas
   seguintes já são conhecidas de antemão, então saem todas em paralelo em
   vez de uma esperando a outra — corta o tempo de carregamento à metade
   ou mais quando a marca tem muitos anúncios. */
async function carregarMarca(slug: string, label: string): Promise<Avaliacao[]> {
  const primeira = await buscarPagina(slug, label, 0);
  const acumulado: CatalogItem[] = [...primeira.items];

  if (primeira.items.length > 0 && primeira.totalListings > primeira.limit) {
    const offsets: number[] = [];
    for (let offset = primeira.limit; offset < primeira.totalListings; offset += primeira.limit) offsets.push(offset);
    const paginas = await Promise.all(offsets.map((offset) => buscarPagina(slug, label, offset)));
    for (const pagina of paginas) acumulado.push(...pagina.items);
  }

  const anuncios = new Map<string, CatalogItem>();
  for (const item of acumulado) if (!anuncios.has(item.listingId)) anuncios.set(item.listingId, item);
  return [...anuncios.values()].map((item) => ({ ...item, brand: slug, brandLabel: label }));
}

/* ── Estrelas ──────────────────────────────────────────────────
   Meia estrela importa: 4,4 e 4,6 arredondados viram a mesma fileira,
   e o número ao lado passaria a contradizer o desenho. */
function RatingStars({ nota, size = 15 }: { nota: number | null; size?: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={nota === null ? "Sem avaliações" : `Nota ${nota.toFixed(1)} de 5`}
    >
      {Array.from({ length: 5 }, (_, indice) => {
        const preenchimento = Math.min(Math.max((nota ?? 0) - indice, 0), 1);
        return (
          <span key={indice} className="relative inline-flex" aria-hidden>
            <Star size={size} className="fill-muted text-border" />
            {preenchimento > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${preenchimento * 100}%` }}>
                <Star size={size} className="fill-[#FFB900] text-[#FFB900]" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/* ── Distribuição por estrela ──────────────────────────────────
   O desenho do Mercado Livre: uma barra por estrela, da maior para a
   menor. Diz de relance se a nota vem de consenso ou de extremos. */
function Distribuicao({ niveis, compacto }: { niveis: MLDistribuicaoNotas; compacto?: boolean }) {
  const total = totalDe(niveis);
  const reduzido = useReducedMotion();

  return (
    <div className={compacto ? "flex flex-col gap-1" : "flex flex-col gap-1.5"}>
      {ESTRELAS.map(({ chave, rotulo }, indice) => {
        const quantidade = niveis[chave];
        const proporcao = total === 0 ? 0 : quantidade / total;
        return (
          <div key={chave} className="flex items-center gap-2">
            <span className="w-3 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">{rotulo}</span>
            <Star size={11} className="fill-[#FFB900] text-[#FFB900]" aria-hidden />
            <div className={`flex-1 overflow-hidden rounded-full bg-muted ${compacto ? "h-1.5" : "h-2"}`}>
              <motion.div
                initial={reduzido ? false : { scaleX: 0 }}
                animate={{ scaleX: proporcao }}
                transition={{ ...springs.settle, delay: indice * 0.04 }}
                className="h-full rounded-full bg-[#FFB900]"
                style={{ transformOrigin: "left", width: "100%" }}
              />
            </div>
            <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">{quantidade}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Uma opinião ───────────────────────────────────────────────
   Estrelas e data no topo, título em destaque, texto abaixo — a mesma
   ordem de leitura da página do anúncio no Mercado Livre. */
function Opiniao({ opiniao }: { opiniao: MLOpiniao }) {
  return (
    <article className="border-b border-border py-3 last:border-0">
      <div className="flex items-center gap-2">
        <RatingStars nota={opiniao.nota} size={12} />
        <span className="text-[11px] tabular-nums text-muted-foreground">{formatarData(opiniao.criadaEm)}</span>
      </div>
      {opiniao.titulo && <h4 className="mt-1.5 text-sm font-bold text-foreground">{opiniao.titulo}</h4>}
      {opiniao.conteudo && (
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{opiniao.conteudo}</p>
      )}
    </article>
  );
}

/* ── Linha de anúncio ──────────────────────────────────────────
   Fechada mostra o veredito (nota + volume). Aberta revela a
   distribuição e o que os compradores escreveram. */
function LinhaAnuncio({ item, aberta, onAlternar }: {
  item: Avaliacao;
  aberta: boolean;
  onAlternar: () => void;
}) {
  const reduzido = useReducedMotion();
  const temOpinioes = item.opinioes.length > 0;
  const temDetalhe = temOpinioes || item.ratingLevels !== null;
  const baixa = item.ratingAverage !== null && item.ratingAverage < 4;

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onAlternar}
        disabled={!temDetalhe}
        aria-expanded={aberta}
        className="press-feedback flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#FFE600]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
              {item.brandLabel}
            </span>
            <span className="truncate text-[10px] tabular-nums text-muted-foreground">{item.listingId}</span>
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold text-foreground">{item.title}</h3>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <RatingStars nota={item.ratingAverage} />
            <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
              {item.reviewsTotal ? `${item.reviewsTotal} opiniões` : "Sem opiniões"}
            </p>
          </div>
          <span className={`w-10 text-right text-xl font-black tabular-nums ${baixa ? "text-[#E3131B]" : "text-foreground"}`}>
            {item.ratingAverage?.toFixed(1) ?? "—"}
          </span>
          {temDetalhe ? (
            <motion.span
              animate={{ rotate: aberta ? 180 : 0 }}
              transition={reduzido ? { duration: 0 } : springs.settleFast}
              className="text-muted-foreground"
            >
              <ChevronDown size={16} />
            </motion.span>
          ) : (
            <span className="w-4" />
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {aberta && (
          <motion.div
            key="detalhe"
            initial={reduzido ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduzido ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduzido ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduzido ? { duration: 0.15 } : springs.settle}
            className="overflow-hidden"
          >
            <div className="grid gap-5 bg-muted/25 px-4 pb-5 pt-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
              <div>
                {item.ratingLevels && <Distribuicao niveis={item.ratingLevels} compacto />}
                {item.permalink && (
                  <a
                    href={item.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="press-feedback mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Ver no Mercado Livre <ExternalLink size={12} />
                  </a>
                )}
              </div>

              <div className="min-w-0">
                {temOpinioes ? (
                  <>
                    <p className="mb-1 text-label-md uppercase text-muted-foreground">
                      O que escreveram
                    </p>
                    {item.opinioes.map((opiniao) => (
                      <Opiniao key={opiniao.id} opiniao={opiniao} />
                    ))}
                  </>
                ) : (
                  <p className="py-4 text-sm text-muted-foreground">
                    Este anúncio tem estrelas, mas ninguém deixou comentário escrito.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function InboxAvaliacoes() {
  const [itens, setItens] = useState<Avaliacao[]>(() => cacheAvaliacoes?.itens ?? []);
  const [carregando, setCarregando] = useState(() => !cacheValido());
  const [busca, setBusca] = useState("");
  const [marca, setMarca] = useState("todas");
  const [nota, setNota] = useState<FiltroNota>("todas");
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set());

  const carregar = useCallback(async (forcar = false) => {
    if (!forcar && cacheValido() && cacheAvaliacoes) {
      setItens(cacheAvaliacoes.itens);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    try {
      const resultados = await Promise.allSettled(marcas.map((item) => carregarMarca(item.slug, item.label)));
      const sucesso = resultados.flatMap((resultado) => resultado.status === "fulfilled" ? resultado.value : []);
      setItens(sucesso);
      cacheAvaliacoes = { itens: sucesso, buscadoEm: Date.now() };
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

  const alternar = useCallback((chave: string) => {
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }, []);

  const filtrados = useMemo(() => itens.filter((item) => {
    if (marca !== "todas" && item.brand !== marca) return false;
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (termo && !item.title.toLocaleLowerCase("pt-BR").includes(termo) && !item.listingId.toLowerCase().includes(termo)) return false;
    if (nota === "excelentes" && (item.ratingAverage ?? 0) < 4.5) return false;
    if (nota === "atencao" && (item.ratingAverage === null || item.ratingAverage >= 4)) return false;
    if (nota === "sem_avaliacao" && item.ratingAverage !== null) return false;
    return true;
  }), [itens, marca, busca, nota]);

  // O resumo acompanha o filtro: senão o topo diz uma coisa e a lista outra.
  const distribuicao = useMemo(() => somarDistribuicoes(filtrados), [filtrados]);
  const totalOpinioes = distribuicao ? totalDe(distribuicao) : 0;
  const media = distribuicao ? mediaDe(distribuicao) : null;
  const comentadas = useMemo(
    () => filtrados.reduce((total, item) => total + item.opinioes.length, 0),
    [filtrados],
  );
  const atencao = filtrados.filter((item) => item.ratingAverage !== null && item.ratingAverage < 4).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Reputação geral — o mesmo bloco que abre a seção de opiniões no ML:
          a nota grande à esquerda, a distribuição à direita. */}
      <section className="overflow-hidden rounded-[1.25rem] border border-border bg-card shadow-[0_2px_16px_rgba(14,15,19,.06)]">
        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:items-center">
          <div className="flex flex-col items-center justify-center gap-1 md:items-start">
            <p className="text-[3.25rem] font-black leading-none tracking-[-0.03em] tabular-nums text-foreground">
              {carregando ? "…" : media === null ? "—" : media.toFixed(1).replace(".", ",")}
            </p>
            <RatingStars nota={media} size={18} />
            <p className="mt-1 text-xs text-muted-foreground">
              {carregando
                ? "Consultando…"
                : `${totalOpinioes.toLocaleString("pt-BR")} opiniões · ${comentadas.toLocaleString("pt-BR")} com texto`}
            </p>
            {!carregando && atencao > 0 && (
              <p className="mt-1 text-xs font-semibold text-[#E3131B]">
                {atencao} {atencao === 1 ? "anúncio abaixo de 4,0" : "anúncios abaixo de 4,0"}
              </p>
            )}
          </div>

          <div>
            {distribuicao && totalOpinioes > 0 ? (
              <Distribuicao niveis={distribuicao} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {carregando ? "Carregando distribuição de notas…" : "Nenhuma opinião registrada ainda."}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.25rem] border border-border bg-card shadow-[0_2px_16px_rgba(14,15,19,.06)]">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="flex-1">
            <h2 className="text-base font-bold text-foreground">Opiniões por anúncio</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Toque em um anúncio para ler o que os compradores escreveram.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[210px] flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar anúncio…"
                className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-[rgba(155,48,217,.5)]"
              />
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
            <button
              type="button"
              onClick={() => void carregar(true)}
              disabled={carregando}
              className="press-feedback flex h-10 w-10 items-center justify-center rounded-xl border border-border hover:bg-muted disabled:opacity-50"
              title="Atualizar avaliações"
            >
              <RefreshCw size={15} className={carregando ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {carregando ? (
          <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={17} className="animate-spin" /> Consultando Mercado Livre…
          </div>
        ) : filtrados.length === 0 ? (
          <EmptyState
            illustration="generic"
            title="Nenhum anúncio com estes filtros"
            description="Ajuste a busca, a marca ou a faixa de nota para ver as opiniões."
          />
        ) : (
          <div>
            {filtrados.map((item) => {
              const chave = `${item.brand}:${item.listingId}`;
              return (
                <LinhaAnuncio
                  key={chave}
                  item={item}
                  aberta={abertos.has(chave)}
                  onAlternar={() => alternar(chave)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
