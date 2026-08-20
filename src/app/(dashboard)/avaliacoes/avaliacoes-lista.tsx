"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Loader2, RefreshCw, Search, Star, UserCheck } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import Link from "next/link";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { CalendarioPopoverRange } from "@/shared/design-system/primitives/CalendarioPopoverRange";
import { SelectPopover } from "@/shared/design-system/primitives/SelectPopover";
import { CalculoPopover } from "@/shared/design-system/primitives/CalculoPopover";
import { springs, staggerExagerado, entradaExagerada } from "@/shared/design-system/motion-variants";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
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

export type Avaliacao = CatalogItem & { brand: string; brandLabel: string };
/** Quantos comentários deste anúncio existem mas caem fora do período
 *  escolhido — 0 quando não há filtro de data ativo. `opinioes` já vem
 *  recortada para o período; isto é só o que sobrou de fora. */
type AvaliacaoFiltrada = Avaliacao & { ocultasPorPeriodo: number };
type FiltroNota = "todas" | "com_avaliacao" | "sem_avaliacao";
type Comprador = { clienteId: string; clienteNome: string; pedidoId: string; pedidoCriadoEm: string };

const marcas = settingsConfig.mercadoLivre.brands;

const ESTRELAS: Array<{ chave: keyof MLDistribuicaoNotas; rotulo: string }> = [
  { chave: "cinco", rotulo: "5" },
  { chave: "quatro", rotulo: "4" },
  { chave: "tres", rotulo: "3" },
  { chave: "duas", rotulo: "2" },
  { chave: "uma", rotulo: "1" },
];

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

// toISOString() converte pro fuso UTC — perto da meia-noite local isso troca
// o dia. Montar a string a partir de getFullYear/Month/Date mantém o dia local.
function paraDataInput(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}
const hoje = paraDataInput(new Date());
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
// Só a hora — o botão de atualizar mostra o horário junto com o ícone no
// mobile, sem precisar do texto completo "Atualizado em DD/MM/AAAA, HH:MM".
const horaCurta = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

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
                <Star size={size} className="fill-[var(--rating)] text-[var(--rating)]" />
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
            <Star size={11} className="fill-[var(--rating)] text-[var(--rating)]" aria-hidden />
            <div className={`flex-1 overflow-hidden rounded-full bg-muted ${compacto ? "h-1.5" : "h-2"}`}>
              <motion.div
                initial={reduzido ? false : { scaleX: 0 }}
                animate={{ scaleX: proporcao }}
                transition={{ ...springs.momentum, delay: indice * 0.07 }}
                className="h-full rounded-full bg-[var(--rating)]"
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
function Opiniao({ opiniao, comprador }: { opiniao: MLOpiniao; comprador?: Comprador }) {
  return (
    <article className="border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <RatingStars nota={opiniao.nota} size={12} />
        <span className="text-[11px] tabular-nums text-muted-foreground">{formatarData(opiniao.criadaEm)}</span>
        {comprador && (
          <Link
            href={`/clientes/${comprador.clienteId}`}
            title={`Único comprador deste anúncio no período — pedido de ${formatarData(comprador.pedidoCriadoEm)}. O Mercado Livre não confirma quem escreveu a opinião; isto é dedução por cruzamento de dados, não certeza vinda do canal.`}
            className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success transition-colors hover:bg-success/20"
          >
            <UserCheck size={10} strokeWidth={2.5} /> {comprador.clienteNome}
          </Link>
        )}
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
function LinhaAnuncio({ item, aberta, onAlternar, identificacoes, ocultasPorPeriodo }: {
  item: Avaliacao;
  aberta: boolean;
  onAlternar: () => void;
  identificacoes: Record<string, Comprador>;
  /** Quantos comentários deste anúncio existem mas caíram fora do período
   *  escolhido — 0 quando não há filtro de data ativo. Sem isto, um anúncio
   *  com opinião de verdade (só que antiga) mostraria "ninguém comentou",
   *  o que seria mentira. */
  ocultasPorPeriodo: number;
}) {
  const reduzido = useReducedMotion();
  const temOpinioes = item.opinioes.length > 0;
  const temDetalhe = temOpinioes || item.ratingLevels !== null;
  const baixa = item.ratingAverage !== null && item.ratingAverage < 4;
  // opinioes já vem ordenada da mais nova pra mais antiga (ver provider), então
  // a primeira é a última opinião recebida — dá pra mostrar sem expandir a linha.
  const ultimaOpiniaoEm = temOpinioes ? formatarData(item.opinioes[0].criadaEm) : "";

  return (
    <motion.div variants={entradaExagerada} className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onAlternar}
        disabled={!temDetalhe}
        aria-expanded={aberta}
        className="press-feedback flex w-full flex-col gap-2 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent sm:flex-row sm:items-center sm:gap-4"
      >
        {/* No mobile o título vira 2 linhas em vez de truncar numa linha só
            competindo por espaço com o bloco de nota — a régua de estrelas +
            contagem + número vira uma linha própria embaixo (ver abaixo),
            então o título não sobra espremido e a seta de expandir nunca
            fica fora da tela. No desktop nada muda. */}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere] sm:line-clamp-none sm:truncate">{item.title}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="font-mono text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">Anúncio: {item.listingId}</span>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              Empresa:
              {isBrandSlug(item.brand)
                ? <BrandLogo brand={item.brand} height={12} />
                : <span className="font-semibold" style={{ color: getBrandConfig(item.brand)?.color ?? "var(--muted-foreground)" }}>{item.brandLabel}</span>}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              Canal: <ChannelLogo canal="mercadolivre" size="xs" variant="logo" />
            </span>
            {ultimaOpiniaoEm && (
              <span className="text-xs text-muted-foreground">Última opinião: {ultimaOpiniaoEm}</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
          <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-0">
            <RatingStars nota={item.ratingAverage} size={13} />
            <p className="text-[11px] tabular-nums text-muted-foreground sm:mt-0.5">
              {item.reviewsTotal ? `${item.reviewsTotal} opiniões` : "Sem opiniões"}
            </p>
          </div>
          <span className={`text-right text-xl font-black tabular-nums sm:w-10 ${baixa ? "text-destructive" : "text-foreground"}`}>
            {item.ratingAverage?.toFixed(1) ?? "Sem avaliação"}
          </span>
          {temDetalhe ? (
            <motion.span
              animate={{ rotate: aberta ? 180 : 0, scale: aberta ? 1.15 : 1 }}
              transition={reduzido ? { duration: 0 } : springs.momentum}
              className="shrink-0 text-muted-foreground"
            >
              <ChevronDown size={16} />
            </motion.span>
          ) : (
            <span className="w-4 shrink-0" />
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
                      <Opiniao key={opiniao.id} opiniao={opiniao} comprador={identificacoes[opiniao.id]} />
                    ))}
                  </>
                ) : ocultasPorPeriodo > 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    {ocultasPorPeriodo === 1
                      ? "1 comentário escrito, fora do período escolhido acima."
                      : `${ocultasPorPeriodo} comentários escritos, fora do período escolhido acima.`}
                  </p>
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
    </motion.div>
  );
}

export function AvaliacoesLista({ marcasAtivas, canaisAtivos, onContagens, itensIniciais }: {
  marcasAtivas: ReadonlySet<string>;
  canaisAtivos: ReadonlySet<string>;
  onContagens: (valores: { marcas: Record<string, number>; canais: Record<string, number> }) => void;
  /** Cache já lido no servidor (ver page.tsx). Vira o estado inicial e também
   *  semeia o cache de módulo, para que a tela não peça de volta o que acabou
   *  de receber dentro do HTML. */
  itensIniciais?: Avaliacao[];
}) {
  // O inicializador roda uma vez só, e antes dos dois `useState` abaixo — que
  // leem `cacheAvaliacoes` já semeado. `buscadoEm` é agora mesmo porque foi
  // agora que o servidor leu o cache, na mesma requisição desta página.
  const [itens, setItens] = useState<Avaliacao[]>(() => {
    if (cacheAvaliacoes) return cacheAvaliacoes.itens;
    if (itensIniciais && itensIniciais.length > 0) {
      cacheAvaliacoes = { itens: itensIniciais, buscadoEm: Date.now() };
      return itensIniciais;
    }
    return [];
  });
  const [carregando, setCarregando] = useState(() => !cacheValido());
  const [buscadoEm, setBuscadoEm] = useState<number | null>(() => cacheAvaliacoes?.buscadoEm ?? null);
  const [busca, setBusca] = useState("");
  const [nota, setNota] = useState<FiltroNota>("todas");
  // Vazio dos dois lados = sem recorte, mostra o histórico inteiro — mesmo
  // padrão dos filtros De:/Até: do resto do sistema (ver Métricas).
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set());
  const [identificacoes, setIdentificacoes] = useState<Record<string, Comprador>>({});

  // Cruzamento com pedidos é uma chamada à parte, depois que as opiniões já
  // estão na tela — não pode atrasar a primeira renderização (que já espera
  // o cache do ML), e é opcional: se falhar, as opiniões continuam visíveis
  // sem o selo de comprador, só sem essa informação a mais.
  useEffect(() => {
    if (itens.length === 0) return;
    const corpo = { itens: itens.map((item) => ({ listingId: item.listingId, opinioes: item.opinioes.map((o) => ({ id: o.id, criadaEm: o.criadaEm })) })) };
    if (corpo.itens.every((item) => item.opinioes.length === 0)) return;
    let ativo = true;
    fetch("/api/ml/avaliacoes/identificar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
      .then((response) => response.ok ? response.json() : null)
      .then((body: { identificacoes?: Record<string, Comprador> } | null) => {
        if (ativo && body?.identificacoes) setIdentificacoes(body.identificacoes);
      })
      .catch(() => {});
    return () => { ativo = false; };
  }, [itens]);

  /* Carregamento normal lê o cache mantido pelo cron A28 no banco — uma
     consulta só, sem tocar na API do ML, por isso é instantâneo. O botão
     "Atualizar" é a exceção: aí sim vale a pena esperar a consulta ao vivo,
     porque a pessoa está pedindo o dado mais fresco possível. */
  const carregarDoCache = useCallback(async () => {
    const response = await fetch("/api/ml/avaliacoes");
    const body = await response.json() as { items?: Avaliacao[]; error?: string };
    if (!response.ok || !body.items) throw new Error(body.error ?? "Não foi possível carregar as avaliações.");
    return body.items;
  }, []);

  const carregarAoVivo = useCallback(async () => {
    const resultados = await Promise.allSettled(marcas.map((item) => carregarMarca(item.slug, item.label)));
    const sucesso = resultados.flatMap((resultado) => resultado.status === "fulfilled" ? resultado.value : []);
    const falhas = resultados.filter((resultado) => resultado.status === "rejected").length;
    if (falhas === resultados.length) throw new Error("Nenhuma conta do Mercado Livre respondeu.");
    if (falhas > 0) toast.warning(`${falhas} conta(s) não puderam ser consultadas.`);
    return sucesso;
  }, []);

  const carregar = useCallback(async (forcar = false) => {
    if (!forcar && cacheValido() && cacheAvaliacoes) {
      setItens(cacheAvaliacoes.itens);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    try {
      const itens = forcar ? await carregarAoVivo() : await carregarDoCache();
      setItens(itens);
      const agora = Date.now();
      cacheAvaliacoes = { itens, buscadoEm: agora };
      setBuscadoEm(agora);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as avaliações.");
    } finally {
      setCarregando(false);
    }
  }, [carregarAoVivo, carregarDoCache]);

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

  // Reporta as contagens pra barra de escopo compartilhada (page.tsx), que
  // soma com as outras abas. Avaliações só existe pro canal Mercado Livre.
  useEffect(() => {
    const marcasCount: Record<string, number> = {};
    for (const item of itens) marcasCount[item.brand] = (marcasCount[item.brand] ?? 0) + 1;
    onContagens({ marcas: marcasCount, canais: { mercadolivre: itens.length } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens]);

  const semFiltro = marcasAtivas.size === 0 && canaisAtivos.size === 0;

  // O catálogo do Mercado Livre só dá nota média e distribuição como
  // histórico vitalício — não dá pra recortar por data (ver o aviso no
  // ícone de info ao lado de "Notas"). O que o período FILTRA de verdade
  // são os comentários com texto, que têm data própria por opinião.
  const periodoAtivo = Boolean(dataInicio || dataFim);
  const dentroDoPeriodo = useCallback((iso: string | null) => {
    if (!iso) return false;
    const dia = iso.slice(0, 10);
    if (dataInicio && dia < dataInicio) return false;
    if (dataFim && dia > dataFim) return false;
    return true;
  }, [dataInicio, dataFim]);

  const filtrados = useMemo(() => {
    const resultado = itens
      .filter((item) => {
        if (marcasAtivas.size > 0 && !marcasAtivas.has(item.brand)) return false;
        if (canaisAtivos.size > 0 && !canaisAtivos.has("mercadolivre")) return false;
        const termo = busca.trim().toLocaleLowerCase("pt-BR");
        if (termo && !item.title.toLocaleLowerCase("pt-BR").includes(termo) && !item.listingId.toLowerCase().includes(termo)) return false;
        if (nota === "com_avaliacao" && item.ratingAverage === null) return false;
        if (nota === "sem_avaliacao" && item.ratingAverage !== null) return false;
        return true;
      })
      .map((item): AvaliacaoFiltrada => {
        if (!periodoAtivo) return { ...item, ocultasPorPeriodo: 0 };
        const opinioesNoPeriodo = item.opinioes.filter((opiniao) => dentroDoPeriodo(opiniao.criadaEm));
        return { ...item, opinioes: opinioesNoPeriodo, ocultasPorPeriodo: item.opinioes.length - opinioesNoPeriodo.length };
      });

    // "Notas" (sem filtro) é o modo neutro — sem ordenar, a lista aparecia
    // numa ordem sem sentido nenhum pra quem está olhando. Opinião mais
    // recente primeiro dá pra tela um uso natural: "o que aconteceu agora".
    // Anúncio já vem com `opinioes[0]` sendo a mais nova (ver provider), então
    // isso é só reaproveitar o que já está pronto — sem opinião nenhuma,
    // não tem "recente" pra comparar, e o anúncio cai pro final da lista.
    if (nota === "todas") {
      return [...resultado].sort((a, b) => {
        const dataA = a.opinioes[0]?.criadaEm;
        const dataB = b.opinioes[0]?.criadaEm;
        if (!dataA && !dataB) return 0;
        if (!dataA) return 1;
        if (!dataB) return -1;
        return dataB.localeCompare(dataA);
      });
    }
    return resultado;
  }, [itens, busca, nota, marcasAtivas, canaisAtivos, periodoAtivo, dentroDoPeriodo]);

  // O resumo acompanha o filtro: senão o topo diz uma coisa e a lista outra.
  const distribuicao = useMemo(() => somarDistribuicoes(filtrados), [filtrados]);
  const totalOpinioes = distribuicao ? totalDe(distribuicao) : 0;
  const media = distribuicao ? mediaDe(distribuicao) : null;
  const comentadas = useMemo(
    () => filtrados.reduce((total, item) => total + item.opinioes.length, 0),
    [filtrados],
  );
  const atencao = filtrados.filter((item) => item.ratingAverage !== null && item.ratingAverage < 4).length;

  /* ── Sem filtro ── A busca ao Mercado Livre já roda em segundo plano desde
     a entrada na página; só o resultado fica escondido até uma marca ou
     canal ser escolhido acima. */
  if (semFiltro) {
    return (
      <div className="overflow-hidden rounded-[1.25rem] border border-border bg-card shadow-[0_2px_16px_rgba(14,15,19,.06)]">
        <EmptyState
          illustration="funnel"
          title="Selecione um filtro"
          description="Escolha uma marca ou canal acima para ver as opiniões."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Reputação geral — o mesmo bloco que abre a seção de opiniões no ML:
          a nota grande à esquerda, a distribuição à direita. */}
      <section className="overflow-hidden rounded-[1.25rem] border border-border bg-card shadow-[0_2px_16px_rgba(14,15,19,.06)]">
        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:items-center">
          <div className="flex flex-col items-center justify-center gap-1 md:items-start">
            <span className="flex items-center gap-1.5">
              <p className="text-[3.25rem] font-black leading-none tracking-[-0.03em] tabular-nums text-foreground">
                {carregando ? "…" : media === null ? "Sem avaliação" : media.toFixed(1).replace(".", ",")}
              </p>
              {!carregando && (
                <CalculoPopover
                  titulo="Nota média"
                  significado="Resume a experiência de quem comprou em uma nota de 1 a 5, direto do Mercado Livre."
                  formula="soma de (quantidade de opiniões × nota), dividida pelo total de opiniões"
                  resultado={media === null ? "Sem avaliação" : media.toFixed(1).replace(".", ",")}
                  itens={ESTRELAS.map(({ chave, rotulo }) => ({
                    label: `${rotulo} estrela${rotulo === "1" ? "" : "s"}`,
                    valor: String(distribuicao?.[chave] ?? 0),
                    fracao: totalOpinioes > 0 ? (distribuicao?.[chave] ?? 0) / totalOpinioes : undefined,
                  }))}
                  nota={
                    periodoAtivo
                      ? "A nota média e a distribuição por estrela são o histórico completo do Mercado Livre, o Mercado Livre não permite recortar essas duas por data. O período escolhido acima filtra só os comentários com texto, na lista abaixo."
                      : "A nota média e a distribuição por estrela são o histórico completo do Mercado Livre, sem recorte por período, porque o canal não permite. Só os comentários com texto podem ser filtrados por data (veja o filtro abaixo)."
                  }
                />
              )}
            </span>
            <RatingStars nota={media} size={18} />
            <p className="mt-1 text-xs text-muted-foreground">
              {carregando
                ? "Consultando…"
                : `${totalOpinioes.toLocaleString("pt-BR")} opiniões · ${comentadas.toLocaleString("pt-BR")} com texto`}
            </p>
            {!carregando && atencao > 0 && (
              <p className="mt-1 text-xs font-semibold text-destructive">
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
          <label className="relative min-w-[210px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar anúncio…"
              className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-[rgba(155,48,217,.5)]"
            />
          </label>
          {/* "Hoje" saiu como botão avulso — o próprio popover de Período já
              tem um atalho "Hoje" lá dentro (ver CalendarioPopoverRange), o
              botão daqui fora só duplicava a mesma ação e tomava espaço.
              Sem ele, Notas/Atualizar/Período cabem numa linha só, inclusive
              no mobile (o par que sobrava forçava a quebra em 2 duplas
              antes); flex-wrap continua de garantia pra telas bem estreitas. */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <SelectPopover
              valor={nota}
              onChange={setNota}
              itens={[
                { value: "todas", label: "Notas" },
                { value: "com_avaliacao", label: "Com avaliações" },
                { value: "sem_avaliacao", label: "Sem avaliações" },
              ]}
            />
            <button
              type="button"
              onClick={() => void carregar(true)}
              disabled={carregando}
              className="press-feedback inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              title="Atualizar avaliações"
            >
              <RefreshCw size={15} className={carregando ? "animate-spin" : ""} />
              {buscadoEm && !carregando && (
                <>
                  <span className="sm:hidden">{horaCurta.format(new Date(buscadoEm))}</span>
                  <span className="hidden sm:inline">{dataHora.format(new Date(buscadoEm))}</span>
                </>
              )}
            </button>
            {/* Filtra só os comentários com texto (ver aviso no ícone de
                info acima) — a nota média e a distribuição não têm como ser
                recortadas por data, o Mercado Livre não expõe isso. */}
            <CalendarioPopoverRange
              rotulo="Período"
              valor={{ inicio: dataInicio, fim: dataFim }}
              max={hoje}
              onChange={({ inicio, fim }) => { setDataInicio(inicio); setDataFim(fim); }}
            />
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
          <motion.div variants={staggerExagerado} initial="hidden" animate="show">
            {filtrados.map((item) => {
              const chave = `${item.brand}:${item.listingId}`;
              return (
                <LinhaAnuncio
                  key={chave}
                  item={item}
                  aberta={abertos.has(chave)}
                  onAlternar={() => alternar(chave)}
                  identificacoes={identificacoes}
                  ocultasPorPeriodo={item.ocultasPorPeriodo}
                />
              );
            })}
          </motion.div>
        )}
      </section>
    </div>
  );
}
