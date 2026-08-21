"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Loader2, ChevronDown, Search, FileText, ShoppingBag, CircleDollarSign, Ban, RefreshCw, Clock3 } from "lucide-react";
import {
  actionListarPedidosDetalhados, actionListarPedidosParaPdf, actionContarPedidosPorMarca, actionContarPedidosPorCanal,
} from "../actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { CalendarioPopoverRange } from "@/shared/design-system/primitives/CalendarioPopoverRange";
import { SelectPopover } from "@/shared/design-system/primitives/SelectPopover";
import { TintedStatCard } from "@/shared/design-system/primitives/TintedStatCard";
import { springs, variantes, staggerExagerado, entradaExagerada } from "@/shared/design-system/motion-variants";
import { NumeroAnimado } from "@/shared/design-system/primitives/NumeroAnimado";
import pagesConfig from "@/config/pages.json";
import channelsConfig from "@/config/channels.json";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { exportarPedidosPdf } from "./exportar-pdf";

type CanalVenda = "mercadolivre" | "shopee" | "tiktokshop";
type Pedido = Awaited<ReturnType<typeof actionListarPedidosDetalhados>>["data"][number];
type Marca = Awaited<ReturnType<typeof actionContarPedidosPorMarca>>[number];
type Canal = Awaited<ReturnType<typeof actionContarPedidosPorCanal>>[number];
type Resumo = Awaited<ReturnType<typeof actionListarPedidosDetalhados>>["resumo"];

const copy = pagesConfig.pedidos;
const PAGINA = 50;

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
// Dia/mês sem ano, mais hora — no mobile a hora sozinha parecia "hoje"
// mesmo quando não era; precisa da data, só não cabe com o ano junto.
const dataHoraCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const resumoInicial: Resumo = {
  totalPedidos: 0,
  faturamento: 0,
  ticketMedio: 0,
  cancelados: 0,
  canceladosQtd: 0,
  canceladosValor: 0,
  devolvidosQtd: 0,
  devolvidosValor: 0,
  freteTotal: 0,
  descontosTotal: 0,
};

function inicioDoDia(data: string): string | undefined {
  return data ? `${data}T00:00:00-03:00` : undefined;
}

function fimDoDia(data: string): string | undefined {
  return data ? `${data}T23:59:59.999-03:00` : undefined;
}

// toISOString() converte pro fuso UTC — perto da meia-noite local isso troca
// o dia. Montar a string a partir de getFullYear/Month/Date mantém o dia local.
const CORES_STATUS: Record<string, string> = {
  criado: "var(--muted-foreground)",
  pago: "var(--info)",
  separado: "var(--info)",
  enviado: "var(--warning)",
  entregue: "var(--success)",
  avaliacao_solicitada: "var(--success)",
  concluido: "var(--success)",
  cancelado: "var(--destructive)",
  devolvido: "var(--destructive)",
};

function statusLabel(status: string) {
  return (pagesConfig.pedidos.statusLabels as Record<string, string>)[status] ?? status;
}

/* ── Grupos de status ──────────────────────────────────────────
   O Mercado Livre não distingue Criado/Pago/Separado/Enviado no campo de
   status do pedido — só Pago e Cancelado realmente acontecem na prática (as
   outras vêm do status de envio, que esta integração ainda não lê). Um
   filtro com 9 pílulas prometia uma granularidade que os dados quase nunca
   entregam. Agrupado em 5, cada opção que junta mais de um status ganha um
   `title` explicando o quê — a dica aparece passando o mouse, sem precisar
   de mais nenhum elemento na tela. */
const GRUPOS_STATUS = [
  { chave: "", label: "Todos", statuses: [] as string[], dica: undefined as string | undefined },
  {
    chave: "aberto", label: "Em aberto", statuses: ["criado", "pago", "separado", "enviado"],
    dica: "Criado, Pago, Separado e Enviado — o Mercado Livre não informa esses estágios separadamente, então a maior parte dos pedidos fica aqui até ser concluída ou cancelada.",
  },
  {
    chave: "concluido", label: "Concluído", statuses: ["entregue", "avaliacao_solicitada", "concluido"],
    dica: "Entregue, Avaliação solicitada e Concluído.",
  },
  { chave: "cancelado", label: "Cancelado", statuses: ["cancelado"], dica: undefined as string | undefined },
  { chave: "devolvido", label: "Devolvido", statuses: ["devolvido"], dica: undefined as string | undefined },
] as const;
type ChaveGrupoStatus = (typeof GRUPOS_STATUS)[number]["chave"];

function brandColor(slug: string) {
  return getBrandConfig(slug)?.color ?? "var(--muted-foreground)";
}

function canalLabel(canal: string) {
  const items = channelsConfig.items as Record<string, { label?: string }>;
  return items[canal]?.label ?? canal;
}

/** Pulso de seleção: anel na cor da pílula que nasce colado nela e se
 *  expande sumindo — só toca quando `ativo` PASSA a ser true (monta uma
 *  vez via AnimatePresence, não é loop). Reduced motion não monta nada. */
function HaloSelecao({ ativo, cor, reduzir }: { ativo: boolean; cor: string; reduzir: boolean | null }) {
  return (
    <AnimatePresence>
      {ativo && !reduzir && (
        <motion.span
          key="halo"
          initial={{ opacity: 0.55, scale: 0.82 }}
          animate={{ opacity: 0, scale: 1.4 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ border: `2px solid ${cor}` }}
        />
      )}
    </AnimatePresence>
  );
}

/* ── Pílula de marca/canal ──────────────────────────────────────
   Mesmo padrão compacto usado em Inbox/Estoque: uma barra só, marca e canal
   lado a lado, ao contrário do card duplo empilhado que existia antes — pra
   ocupar menos altura de tela sem perder a separação visual das duas
   perguntas (uma linha vertical entre os grupos já basta). */
function MarcaPill({ marca, ativo, onClick }: { marca: Marca; ativo: boolean; onClick: () => void }) {
  const reduzir = useReducedMotion();
  const { slug } = marca;
  const vazia = marca.total === 0;
  const bloqueada = vazia && !ativo;
  const temIdentidade = isBrandSlug(slug);

  return (
    <motion.button
      type="button"
      variants={entradaExagerada}
      onClick={bloqueada ? undefined : onClick}
      disabled={bloqueada}
      whileHover={!bloqueada && !reduzir ? { y: -2, scale: 1.04 } : undefined}
      whileTap={!bloqueada && !reduzir ? { scale: 0.92 } : undefined}
      aria-pressed={ativo}
      aria-label={marca.nome}
      title={bloqueada ? copy.brandSelector.emptyHint.replace("{marca}", marca.nome) : undefined}
      className={`relative inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 transition-colors ${
        bloqueada
          ? "border border-border opacity-40 cursor-not-allowed"
          : ativo
            ? "border-2 bg-card/70"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={ativo ? { borderColor: brandColor(slug) } : undefined}
    >
      <HaloSelecao ativo={ativo} cor={brandColor(slug)} reduzir={reduzir} />
      {temIdentidade
        ? <BrandLogo brand={slug} height={17} />
        : <span className="text-sm font-semibold text-foreground">{marca.nome}</span>}
      <span className="text-xs tabular-nums text-muted-foreground">{marca.total}</span>
    </motion.button>
  );
}

function CanalPill({ canal, ativo, onClick }: { canal: Canal; ativo: boolean; onClick: () => void }) {
  const reduzir = useReducedMotion();
  const label = canalLabel(canal.tipo);

  return (
    <motion.button
      type="button"
      variants={entradaExagerada}
      onClick={canal.conectado ? onClick : undefined}
      disabled={!canal.conectado}
      whileHover={canal.conectado && !reduzir ? { y: -2, scale: 1.04 } : undefined}
      whileTap={canal.conectado && !reduzir ? { scale: 0.92 } : undefined}
      aria-pressed={ativo}
      aria-label={label}
      title={canal.conectado ? label : copy.channelSelector.disconnectedHint.replace("{canal}", label)}
      className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors ${
        !canal.conectado
          ? "border border-border opacity-50 cursor-not-allowed"
          : ativo
            ? "border-2 bg-card/70"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={canal.conectado && ativo ? { borderColor: channelAccent(canal.tipo) } : undefined}
    >
      <HaloSelecao ativo={ativo} cor={channelAccent(canal.tipo)} reduzir={reduzir} />
      <ChannelLogo canal={canal.tipo} size="sm" variant="logo" />
      <span className="text-xs tabular-nums text-muted-foreground">{canal.total}</span>
    </motion.button>
  );
}

/* ── Linha expansível ─────────────────────────────────────────────
   Fechada mostra só o essencial pra escanear rápido (pedido, cliente, status,
   total); marca, canal e data só aparecem ao abrir. O pedido inteiro já está
   em memória desde o carregamento da lista — abrir não busca nada no
   servidor, só revela o que já veio, então é instantâneo. */
function LinhaPedido({ item, aberta, onAlternar }: { item: Pedido; aberta: boolean; onAlternar: () => void }) {
  const reduzir = useReducedMotion();
  return (
    <>
      <tr
        onClick={onAlternar}
        aria-expanded={aberta}
        className="cursor-pointer hover:bg-muted/30 transition-colors"
      >
        <td className="px-4 py-3 font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <motion.span
              animate={{ rotate: aberta ? 90 : 0, scale: aberta ? 1.15 : 1 }}
              transition={reduzir ? { duration: 0 } : springs.momentum}
              className="text-muted-foreground"
            >
              <ChevronDown size={13} className="-rotate-90" />
            </motion.span>
            #{item.providerOrderId ?? item.id.slice(0, 8)}
          </span>
        </td>
        <td className="px-4 py-3">{item.clienteNome}</td>
        <td className="px-4 py-3 tabular-nums text-muted-foreground">{dataHora.format(new Date(item.createdAt))}</td>
        <td className="px-4 py-3 tabular-nums text-muted-foreground">{Number(item.quantidadeItens)} un.</td>
        <td className="px-4 py-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              background: `color-mix(in srgb, ${CORES_STATUS[item.status] ?? "var(--muted-foreground)"} 10%, transparent)`,
              color: CORES_STATUS[item.status] ?? "var(--muted-foreground)",
            }}
          >
            {statusLabel(item.status)}
          </span>
        </td>
        <td className="px-4 py-3 tabular-nums">{dinheiro.format(Number(item.total))}</td>
      </tr>
      <AnimatePresence initial={false}>
        {aberta && (
          <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <td colSpan={6} className="bg-muted/20 px-4 pb-4 pt-0">
              <motion.div
                initial={reduzir ? false : { height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                transition={springs.settleFast}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-xs text-muted-foreground">
                  <span>
                    Empresa: <span className="font-semibold" style={{ color: brandColor(item.brandSlug) }}>{item.brandNome}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    Canal: <ChannelLogo canal={item.canal} size="xs" variant="logo" /> {canalLabel(item.canal)}
                  </span>
                  <Link href={`/vendas/pedidos/${item.id}`} className="font-semibold text-selecionado hover:underline">
                    Ver detalhe completo →
                  </Link>
                </div>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}

export function PedidosLista({ marcasIniciais = [], canaisIniciais = [] }: {
  /** Contagens já resolvidas no servidor (ver page.tsx) — chegam junto com o
   *  HTML, então as pílulas de filtro aparecem no primeiro quadro em vez de
   *  esperarem duas idas ao servidor depois que o JavaScript liga. */
  marcasIniciais?: Marca[];
  canaisIniciais?: Canal[];
}) {
  const reduzir = useReducedMotion();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<Resumo>(resumoInicial);
  const [loading, setLoading] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [canal, setCanal] = useState<CanalVenda | "">("");
  const [statusGrupo, setStatusGrupo] = useState<ChaveGrupoStatus>("");
  const statusesAtivos = GRUPOS_STATUS.find((grupo) => grupo.chave === statusGrupo)?.statuses ?? [];
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [exportando, setExportando] = useState(false);
  const [marcas, setMarcas] = useState<Marca[]>(marcasIniciais);
  const [canais, setCanais] = useState<Canal[]>(canaisIniciais);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const requestId = useRef(0);
  const [, startTransition] = useTransition();

  // A primeira execução de cada efeito é pulada só quando o servidor de fato
  // mandou a contagem pronta (ver page.tsx) — aí repeti-la no navegador seria
  // refazer o que acabou de chegar no HTML. Se a pré-busca falhou ou veio
  // vazia, a guarda nasce falsa e a tela busca normalmente, como antes.
  const primeiraContagemMarcas = useRef(marcasIniciais.length > 0);
  const primeiraContagemCanais = useRef(canaisIniciais.length > 0);

  useEffect(() => {
    if (primeiraContagemMarcas.current) { primeiraContagemMarcas.current = false; return; }
    actionContarPedidosPorMarca(canal || undefined).then(setMarcas).catch(() => setMarcas([]));
  }, [canal]);

  useEffect(() => {
    if (primeiraContagemCanais.current) { primeiraContagemCanais.current = false; return; }
    actionContarPedidosPorCanal(brandIds.length ? brandIds : undefined).then(setCanais).catch(() => setCanais([]));
  }, [brandIds]);

  useEffect(() => {
    const task = window.setTimeout(() => setBuscaAplicada(busca.trim()), 350);
    return () => window.clearTimeout(task);
  }, [busca]);

  const carregar = useCallback((marcas?: string[], canalAtual?: string, statusesAtual?: string[], buscaAtual?: string, inicio?: string, fim?: string) => {
    const currentRequest = ++requestId.current;
    startTransition(async () => {
      setLoading(true);
      try {
        const res = await actionListarPedidosDetalhados({
          brandIds: marcas?.length ? marcas : undefined,
          canal: canalAtual || undefined,
          statuses: statusesAtual?.length ? statusesAtual : undefined,
          busca: buscaAtual || undefined,
          inicio: inicioDoDia(inicio ?? ""),
          fim: fimDoDia(fim ?? ""),
        });
        if (currentRequest !== requestId.current) return;
        setPedidos(res.data);
        setTotal(res.total);
        setResumo(res.resumo);
        setAtualizadoEm(new Date());
      } catch {
        if (currentRequest !== requestId.current) return;
        toast.error(copy.loadError);
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    });
  }, []);

  // Sem marca ou canal escolhidos não há o que carregar: a tela mostra o
  // convite, e as contagens de marca/canal (rápidas) já estão aquecendo por
  // trás para quando a escolha acontecer.
  const escopoDefinido = brandIds.length > 0 || canal !== "";

  useEffect(() => {
    if (!escopoDefinido) return;
    carregar(brandIds, canal, statusesAtivos.length ? [...statusesAtivos] : undefined, buscaAplicada, dataInicial, dataFinal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandIds.join(","), canal, statusGrupo, buscaAplicada, dataInicial, dataFinal, carregar, escopoDefinido]);

  async function carregarMais() {
    setCarregandoMais(true);
    try {
      const res = await actionListarPedidosDetalhados({
        brandIds: brandIds.length ? brandIds : undefined,
        canal: canal || undefined,
        statuses: statusesAtivos.length ? [...statusesAtivos] : undefined,
        busca: buscaAplicada || undefined,
        inicio: inicioDoDia(dataInicial),
        fim: fimDoDia(dataFinal),
        offset: pedidos.length,
      });
      setPedidos((atual) => [...atual, ...res.data]);
      setTotal(res.total);
    } catch {
      toast.error(copy.loadError);
    } finally {
      setCarregandoMais(false);
    }
  }

  function atualizar() {
    if (!escopoDefinido) return;
    carregar(brandIds, canal, statusesAtivos.length ? [...statusesAtivos] : undefined, buscaAplicada, dataInicial, dataFinal);
  }

  const filtrando = brandIds.length > 0 || canal !== "" || statusGrupo !== "" || buscaAplicada !== "" || dataInicial !== "" || dataFinal !== "";

  async function exportarPdf() {
    if (pedidos.length === 0) return;
    setExportando(true);
    try {
      const relatorio = await actionListarPedidosParaPdf({
        brandIds: brandIds.length ? brandIds : undefined,
        canal: canal || undefined,
        statuses: statusesAtivos.length ? [...statusesAtivos] : undefined,
        busca: buscaAplicada || undefined,
        inicio: inicioDoDia(dataInicial),
        fim: fimDoDia(dataFinal),
      });
      await exportarPedidosPdf({ pedidos: relatorio.data, resumo: relatorio.resumo, total: relatorio.total, periodo: { inicio: dataInicial, fim: dataFinal } });
    } catch {
      toast.error("Não foi possível gerar o PDF de vendas.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div>
      {/* Barra de escopo — empresa e canal. No desktop tudo numa linha,
          centralizado; no mobile empilha e cada fileira rola por dentro se
          precisar (mesmo padrão já usado em Inbox e Clientes). */}
      <motion.div
        variants={staggerExagerado}
        initial="hidden"
        animate="show"
        className="mb-4 flex flex-col items-center gap-2 lg:w-fit lg:mx-auto lg:flex-row lg:flex-wrap"
      >
        <motion.div
          variants={staggerExagerado}
          className="flex w-full justify-center gap-2 overflow-x-auto overscroll-x-contain px-0.5 scrollbar-none lg:w-auto lg:flex-wrap lg:overflow-visible"
        >
          {marcas.map((marca) => (
            <MarcaPill
              key={marca.brandId}
              marca={marca}
              ativo={brandIds.includes(marca.brandId)}
              onClick={() => setBrandIds((atual) => atual.includes(marca.brandId)
                ? atual.filter((id) => id !== marca.brandId)
                : [...atual, marca.brandId])}
            />
          ))}
        </motion.div>

        <span aria-hidden="true" className="hidden h-5 w-px bg-border lg:block" />

        <motion.div
          variants={staggerExagerado}
          className="flex w-full justify-center gap-2 overflow-x-auto overscroll-x-contain px-0.5 scrollbar-none lg:w-auto lg:flex-wrap lg:overflow-visible"
        >
          {canais.map((item) => (
            <CanalPill
              key={item.tipo}
              canal={item}
              ativo={canal === item.tipo}
              onClick={() => setCanal((atual) => atual === item.tipo ? "" : item.tipo)}
            />
          ))}
        </motion.div>
      </motion.div>

      {/* Filtros — no desktop, uma linha só como sempre foi (busca cresce,
          o resto tem largura própria). No mobile isso empilhava em blocos
          de largura cheia, um por baixo do outro, e os dois botões de
          calendário (De:/Até:) ficavam idênticos e sem rótulo visível, um
          embaixo do outro — impossível saber qual era qual. Agora: busca
          sozinha (é o controle principal), status+Período juntos (são
          atalhos de refinar). O PDF saiu daqui — foi morar perto do
          contador de pedidos, que é o que ele exporta. */}
      <div className="mb-4 flex flex-col gap-2 rounded-[1.25rem] border border-border bg-card/70 p-3 shadow-[0_2px_12px_rgba(14,15,19,.04)] md:grid md:grid-cols-[minmax(200px,1fr)_auto] md:items-center">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pedido ou cliente…" className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-selecionado" />
        </label>
        <div className="flex items-center gap-2">
          {/* buttonClassName força 44px de altura — o padrão do componente é
              36px, que ficava desalinhado ao lado dos calendários e do Hoje
              (todos 44px) nesta linha. */}
          <div className="min-w-0 flex-1 md:flex-initial">
            <SelectPopover
              valor={statusGrupo}
              onChange={setStatusGrupo}
              buttonClassName="press-feedback inline-flex h-11 w-full min-w-[7rem] items-center justify-between gap-2 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:border-selecionado disabled:opacity-60 md:w-auto"
              itens={GRUPOS_STATUS.map((grupo) => ({
                value: grupo.chave,
                label: grupo.chave === "" ? copy.statusFilter.all : grupo.label,
              }))}
            />
          </div>
          {/* "Hoje" saiu como botão avulso — o popover de Período já tem o
              mesmo atalho lá dentro (ver CalendarioPopoverRange), o botão
              daqui fora só duplicava a ação e tomava espaço na linha. */}
          <CalendarioPopoverRange
            rotulo="Período"
            valor={{ inicio: dataInicial, fim: dataFinal }}
            onChange={({ inicio, fim }) => { setDataInicial(inicio); setDataFinal(fim); }}
            disabled={loading}
          />
        </div>
      </div>

      {!escopoDefinido ? (
        <motion.div
          initial={reduzir ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.settleFast}
          className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)]"
        >
          <EmptyState illustration="reports" title="Escolha uma empresa ou canal para começar" />
        </motion.div>
      ) : (
      <div className="flex flex-col gap-4">
      <motion.section
        variants={staggerExagerado}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-2.5 lg:grid-cols-4"
        aria-label="Resumo das vendas filtradas"
      >
        {[
          { chave: "faturamento", label: "Faturamento", numero: resumo.faturamento, formatar: (v: number) => dinheiro.format(v), icon: CircleDollarSign, cor: "var(--success)" },
          { chave: "pedidos", label: "Pedidos", numero: resumo.totalPedidos, formatar: (v: number) => Math.round(v).toLocaleString("pt-BR"), icon: ShoppingBag, cor: "var(--info)" },
          {
            chave: "cancelados",
            label: <><span className="lg:hidden">Cancel./Devol.</span><span className="hidden lg:inline">Cancelados/Devolvidos</span></>,
            numero: resumo.cancelados, formatar: (v: number) => Math.round(v).toLocaleString("pt-BR"), icon: Ban, cor: resumo.cancelados > 0 ? "var(--destructive)" : "var(--muted-foreground)",
          },
          {
            chave: "valor-cancelado",
            label: <><span className="lg:hidden">Valor cancel./devol.</span><span className="hidden lg:inline">Valor cancelado/devolvido</span></>,
            numero: resumo.canceladosValor + resumo.devolvidosValor, formatar: (v: number) => dinheiro.format(v), icon: Ban, cor: (resumo.canceladosValor + resumo.devolvidosValor) > 0 ? "var(--destructive)" : "var(--muted-foreground)",
          },
        ].map((card) => (
          <motion.div key={card.chave} variants={variantes(reduzir, entradaExagerada)}>
            <TintedStatCard
              label={card.label}
              valor={<NumeroAnimado valor={card.numero} formatar={card.formatar} apenasPrimeiraVez={false} duracao={0.5} />}
              icon={card.icon}
              cor={card.cor}
            />
          </motion.div>
        ))}
      </motion.section>
      <motion.section
        initial={reduzir ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.settleFast}
        className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden"
        data-testid="pedidos-lista"
      >
        <div className="px-5 py-4 border-b border-border flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <div className="flex items-center justify-between gap-3 sm:justify-start sm:gap-4">
            <p className="text-sm font-semibold text-foreground">{copy.title}</p>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-selecionado/10 px-2.5 py-1 text-xs font-bold text-selecionado tabular-nums">
              <NumeroAnimado valor={total} apenasPrimeiraVez={false} duracao={0.5} /> {total === 1 ? "pedido" : "pedidos"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            {atualizadoEm && (
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
                <Clock3 size={12} className="shrink-0" />
                <span className="sm:hidden">Atualizado {dataHoraCurta.format(atualizadoEm)}</span>
                <span className="hidden sm:inline">Atualizado às {dataHora.format(atualizadoEm)}</span>
              </span>
            )}
            <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={atualizar}
                disabled={loading}
                aria-label="Atualizar lista de pedidos"
                title="Atualizar"
                className="press-feedback inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-selecionado/30 hover:bg-selecionado/5 hover:text-selecionado disabled:opacity-50"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              </button>
              {/* PDF exporta o resultado filtrado atual — mora aqui, ao lado
                  do que ele exporta, em vez de competir por espaço lá em cima
                  com os controles de filtro. */}
              <button
                type="button"
                onClick={exportarPdf}
                disabled={pedidos.length === 0 || exportando}
                className="press-feedback inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} PDF
              </button>
            </div>
          </div>
        </div>

        <div
          className={loading && pedidos.length > 0 ? "pointer-events-none opacity-55 transition-opacity" : "transition-opacity"}
          aria-busy={loading || undefined}
        >
          {loading && pedidos.length === 0 ? (
            <div>{[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}</div>
          ) : pedidos.length === 0 ? (
            <EmptyState
              illustration={filtrando ? "slowMoving" : "reports"}
              title={filtrando ? copy.emptyFiltered.title : copy.empty}
              description={filtrando ? copy.emptyFiltered.description : undefined}
            />
          ) : (
            <>
              <motion.div variants={staggerExagerado} initial="hidden" animate="show" className="divide-y divide-border md:hidden" data-testid="pedidos-cards">
                {pedidos.map((item) => (
                  <motion.div key={item.id} variants={variantes(reduzir, entradaExagerada)}>
                  <Link
                    href={`/vendas/pedidos/${item.id}`}
                    className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/30 focus-visible:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-sm font-bold text-foreground">
                          <ChannelLogo canal={item.canal} size="xs" variant="logo" />
                          #{item.providerOrderId ?? item.id.slice(0, 8)}
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                          {dinheiro.format(Number(item.total))}
                        </span>
                      </div>
                      <span className="mt-1 block truncate text-sm text-muted-foreground">{item.clienteNome}</span>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                          {dataHora.format(new Date(item.createdAt))}
                          <span aria-hidden="true">·</span>
                          <span>{Number(item.quantidadeItens)} un.</span>
                        </span>
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{
                            background: `color-mix(in srgb, ${CORES_STATUS[item.status] ?? "var(--muted-foreground)"} 10%, transparent)`,
                            color: CORES_STATUS[item.status] ?? "var(--muted-foreground)",
                          }}
                        >
                          {statusLabel(item.status)}
                        </span>
                      </div>
                    </div>
                    <ChevronDown size={15} className="-rotate-90 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                  </motion.div>
                ))}
              </motion.div>
              <div className="hidden table-scroll md:block">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Pedido</th>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Data da venda</th>
                    <th className="px-4 py-3 font-semibold">Unidades</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pedidos.map((item) => (
                    <LinhaPedido
                      key={item.id}
                      item={item}
                      aberta={expandido === item.id}
                      onAlternar={() => setExpandido((atual) => atual === item.id ? null : item.id)}
                    />
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>

        {pedidos.length > 0 && pedidos.length < total && (
          <div className="border-t border-border px-5 py-4 text-center">
            <motion.button
              whileHover={reduzir ? undefined : { scale: 1.02 }}
              whileTap={reduzir ? undefined : { scale: 0.98 }}
              onClick={carregarMais}
              disabled={carregandoMais}
              className="min-h-10 inline-flex items-center gap-2 rounded-[0.75rem] border border-border px-5 text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-60"
            >
              {carregandoMais && <Loader2 size={14} className="animate-spin" />}
              {carregandoMais
                ? copy.pagination.loadingMore
                : `${copy.pagination.loadMore} ${Math.min(PAGINA, total - pedidos.length)}`}
            </motion.button>
            <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
              {copy.pagination.showing
                .replace("{carregados}", String(pedidos.length))
                .replace("{total}", String(total))}
            </p>
          </div>
        )}
      </motion.section>
      </div>
      )}
    </div>
  );
}
