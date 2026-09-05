"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { BadgeDollarSign, Ban, ChevronDown, CircleDollarSign, Loader2, PlugZap2, RotateCcw, Search, ShoppingBag } from "lucide-react";
import { actionListarPedidosDetalhados } from "../actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { CalendarioPopoverRange } from "@/shared/design-system/primitives/CalendarioPopoverRange";
import { SelectPopover } from "@/shared/design-system/primitives/SelectPopover";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import { springs, variantes, staggerExagerado, entradaExagerada } from "@/shared/design-system/motion-variants";
import { NumeroAnimado } from "@/shared/design-system/primitives/NumeroAnimado";
import pagesConfig from "@/config/pages.json";
import channelsConfig from "@/config/channels.json";
import {
  escopoIncompleto,
  oQueFaltaNoEscopo,
  conviteDeEscopo,
  getBrandConfig,
  isBrandSlug,
  marcaDisponivelNosCanais,
} from "@/shared/config/brands";
import { JanelaLimiteDoDia, type LimiteDoDia } from "@/shared/components/limite-do-dia";
import { useAtualizacaoLocal } from "@/shared/lib/atualizacao-local";
import { CardResumoVendas, type ExplicacaoCardVendas } from "./card-resumo-vendas";

type CanalVenda = "mercadolivre" | "shopee" | "tiktokshop";
type Pedido = Awaited<ReturnType<typeof actionListarPedidosDetalhados>>["data"][number];
type ConsultaPedidos = Awaited<ReturnType<typeof actionListarPedidosDetalhados>>;
type Marca = ConsultaPedidos["marcas"][number];
type Canal = ConsultaPedidos["canais"][number];
type Resumo = Awaited<ReturnType<typeof actionListarPedidosDetalhados>>["resumo"];

const copy = pagesConfig.pedidos;
const PAGINA = 50;

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
// Dia/mês sem ano, mais hora — no mobile a hora sozinha parecia "hoje"
// mesmo quando não era; precisa da data, só não cabe com o ano junto.
const resumoInicial: Resumo = {
  totalPedidos: 0,
  faturamento: 0,
  ticketMedio: 0,
  cancelados: 0,
  canceladosQtd: 0,
  canceladosValor: 0,
  devolvidosQtd: 0,
  devolvidosValor: 0,
  reembolsosParciaisQtd: 0,
  reembolsosParciaisValor: 0,
  totalBrutoPedidos: 0,
  totalBrutoComparavel: 0,
  liquidoTotal: 0,
};

const limiteDoDiaInicial: LimiteDoDia = { soNoMercadoLivre: [], soAqui: [] };

function inicioDoDia(data: string): string | undefined {
  return data ? `${data}T00:00:00-03:00` : undefined;
}

function fimDoDia(data: string): string | undefined {
  return data ? `${data}T23:59:59.999-03:00` : undefined;
}

// toISOString() converte pro fuso UTC — perto da meia-noite local isso troca
// o dia. Montar a string a partir de getFullYear/Month/Date mantém o dia local.
function hojeISO(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
}

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
   O Mercado Livre só devolve o status do pedido em si (pago/cancelado) —
   Entregue, Avaliação solicitada, Concluído e Devolvido nunca vêm desse
   campo: os dois primeiros exigiriam ler a API de Shipments (que esta
   integração não consulta), e os outros dois nem existem como valor real
   do Mercado Livre. Sem dado de verdade por trás, esses grupos ficavam
   sempre vazios — removidos até essa leitura existir. */
const GRUPOS_STATUS = [
  { chave: "", label: "Todos", statuses: [] as string[], dica: undefined as string | undefined },
  {
    chave: "aberto", label: "Em aberto", statuses: ["criado", "pago", "separado", "enviado"],
    dica: "O Mercado Livre não informa separadamente os estágios Criado, Pago, Separado e Enviado. Por isso, a maior parte dos pedidos permanece aqui até ser cancelada.",
  },
  { chave: "cancelado", label: "Cancelado", statuses: ["cancelado"], dica: undefined as string | undefined },
] as const;
type ChaveGrupoStatus = (typeof GRUPOS_STATUS)[number]["chave"];

/** Catálogo dos status reais do pedido — só o que o Mercado Livre de fato
 *  devolve (ver comentário de GRUPOS_STATUS acima); nada de Entregue,
 *  Concluído ou Devolvido, que não existem como dado real da API. */
const LEGENDA_STATUS_PEDIDOS: Array<{ titulo: string; cor: string; texto: string }> = [
  { titulo: "Todos", cor: "var(--muted-foreground)", texto: "Mostra os pedidos de qualquer status, sem recorte. É o ponto de partida antes de aplicar um filtro." },
  { titulo: "Em aberto", cor: "var(--info)", texto: "Criado, Pago, Separado e Enviado. O Mercado Livre não informa esses quatro estágios separadamente pelo pedido, então praticamente todo pedido ativo fica agrupado aqui até ser cancelado." },
  { titulo: "Cancelado", cor: "var(--destructive)", texto: "O pedido foi cancelado pelo comprador, pelo vendedor ou automaticamente por falta de pagamento." },
];

const EXPLICACOES_CARDS: Record<string, ExplicacaoCardVendas> = {
  totalBruto: {
    titulo: "o total bruto comparável",
    descricao: "Valor original das vendas. No Mercado Livre, o período considera a aprovação do pagamento, em Brasília, e exclui cancelamentos técnicos por divisão de pacote. Mantemos os centavos; o relatório do canal pode arredondar por dia.",
    calculo: "Faturamento confirmado mais valor cancelado ou devolvido mais valor dos reembolsos parciais.",
    inclui: [
      "O valor original dos pedidos com pagamento confirmado.",
      "O valor completo dos pedidos cancelados ou devolvidos depois da confirmação do pagamento.",
      "A parcela reembolsada que precisa ser somada de volta para reconstruir o valor original.",
    ],
    naoInclui: [
      "Pedidos criados que ainda não tiveram pagamento confirmado.",
      "Pedidos cancelados antes da confirmação do pagamento.",
      "Pedidos que o canal ainda não entregou ou que ainda não foram importados.",
      "Registros cancelados por divisão interna de pacote no Mercado Livre.",
    ],
  },
  faturamento: {
    titulo: "o faturamento confirmado",
    descricao: "Mostra a receita dos pedidos cujo pagamento foi confirmado pelo canal, descontando somente reembolsos parciais que a plataforma informou explicitamente.",
    calculo: "Soma do valor faturável de cada pedido. Em um reembolso parcial, valor faturável é o total do pedido menos a parcela reembolsada.",
    inclui: [
      "Pedidos pagos.",
      "Pedidos separados.",
      "Pedidos enviados.",
      "Pedidos entregues, concluídos ou com avaliação solicitada.",
    ],
    naoInclui: [
      "Pedidos criados ou aguardando pagamento.",
      "Pedidos cancelados.",
      "Pedidos devolvidos integralmente.",
      "A parcela de um pedido que já foi reembolsada.",
    ],
  },
  pedidos: {
    titulo: "a quantidade de pedidos faturados",
    descricao: "Conta quantos pedidos possuem pagamento confirmado. A quantidade representa pedidos, não produtos e não unidades vendidas.",
    calculo: "Cada pedido com status faturável conta uma vez, mesmo que possua vários itens ou um reembolso parcial.",
    inclui: [
      "Pedidos pagos, separados, enviados, entregues e concluídos.",
      "Pedidos com avaliação solicitada.",
      "Pedidos parcialmente reembolsados que continuam com valor faturável.",
    ],
    naoInclui: [
      "Quantidade de itens dentro do pedido.",
      "Pedidos criados sem pagamento confirmado.",
      "Pedidos cancelados ou devolvidos integralmente.",
    ],
  },
  cancelados: {
    titulo: "os cancelamentos e devoluções",
    descricao: "Mostra somente cancelamentos e devoluções que aconteceram depois de um pagamento aprovado.",
    calculo: "Soma do valor completo dos pedidos cancelados ou devolvidos que possuem evidência de pagamento anterior. A quantidade conta cada pedido uma vez.",
    inclui: [
      "Cancelamento solicitado pelo comprador depois do pagamento.",
      "Cancelamento realizado pelo vendedor depois do pagamento.",
      "Cancelamento automático depois do pagamento aprovado.",
      "Devolução integral de um pedido que havia sido pago.",
    ],
    naoInclui: [
      "Pedido cancelado ou expirado porque o cliente não pagou.",
      "Reembolso parcial de um pedido que continua faturável.",
      "Pedido apenas criado e ainda aguardando pagamento.",
      "Pedido ausente da sincronização.",
    ],
  },
  reembolsos: {
    titulo: "os reembolsos parciais",
    descricao: "Mostra somente a parte do dinheiro devolvida ao comprador quando o restante do pedido continua sendo receita.",
    calculo: "Soma dos valores positivos de reembolso informados nos pagamentos do pedido. Cada pedido afetado conta uma vez, mesmo que existam vários pagamentos.",
    inclui: [
      "Valor de reembolso informado explicitamente pela API do canal.",
      "Mais de um pagamento reembolsado dentro do mesmo pedido.",
      "Pedido ainda faturável depois do abatimento da parcela devolvida.",
    ],
    naoInclui: [
      "Campo ausente, nulo, textual ou inválido.",
      "Cancelamento ou devolução integral já contabilizada no card correspondente.",
      "Estimativa criada pelo CRM quando o canal não informou reembolso.",
    ],
  },
  quantidadeCancelados: {
    titulo: "a quantidade de cancelados e devolvidos",
    descricao: "Conta os pedidos cancelados ou devolvidos considerados no card de valor, usando os mesmos filtros e critérios financeiros.",
    calculo: "Quantidade de pedidos cancelados mais quantidade de pedidos devolvidos. Cada pedido conta uma vez, independentemente do número de itens.",
    inclui: ["Os cancelamentos e devoluções considerados no resumo financeiro do período."],
    naoInclui: ["Unidades e produtos dentro do pedido.", "Reembolsos parciais.", "Cancelamentos sem pagamento excluídos do resumo financeiro."],
  },
};


/** `compacto`: no mobile este botão mudou de lugar (ver comentário na barra
 *  de filtros mais abaixo) — foi morar na mesma linha de "Todos"/"Período",
 *  onde "Entenda os status" não cabe. "Status" sozinho já basta ali porque
 *  o ícone de info ao lado já indica que é uma explicação, não um filtro. */
function EntendaStatusPedidoBotao({ compacto }: { compacto?: boolean }) {
  return (
    <AnimatedInfoPopover
      trigger={(
        <AnimatedInfoTrigger
          title="Entenda os status dos pedidos"
          iconSize={13}
          className="press-feedback inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          {compacto ? "Status" : "Entenda os status"}
        </AnimatedInfoTrigger>
      )}
      align="end"
      sideOffset={8}
      collisionPadding={12}
      className="z-[100] w-[min(22rem,calc(100vw-1.5rem))] rounded-[1.1rem] border border-border bg-card p-5 shadow-[0_16px_40px_rgba(14,15,19,.24)]"
    >
      <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">Status do pedido</p>
      <dl className="mt-3 flex flex-col gap-3">
        {LEGENDA_STATUS_PEDIDOS.map((item) => (
          <div key={item.titulo}>
            <dt className="text-[12.5px] font-bold" style={{ color: item.cor }}>{item.titulo}</dt>
            <dd className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{item.texto}</dd>
          </div>
        ))}
      </dl>
    </AnimatedInfoPopover>
  );
}

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
function MarcaPill({ marca, ativo, indisponivelPeloCanal, onClick }: {
  marca: Marca;
  ativo: boolean;
  indisponivelPeloCanal: boolean;
  onClick: () => void;
}) {
  const reduzir = useReducedMotion();
  const { slug } = marca;
  // Zero pedido no canal escolhido = pílula travada, mesmo que a marca
  // estivesse selecionada antes da escolha do canal. O `&& !ativo` que existia
  // aqui deixava a marca vazia continuar ativa e clicável (KARZI + Shopee, por
  // exemplo, que nunca teve um pedido) — a seleção seguia valendo e entrava na
  // consulta sem nunca poder trazer nada. Quem desmarca é a lista (ver
  // `sanearMarcasSelecionadas`); esta pílula só precisa não voltar a ligar.
  const bloqueadaPorDados = marca.total === 0 && !ativo;
  const bloqueada = bloqueadaPorDados || indisponivelPeloCanal;
  const motivoIndisponivel = `${marca.nome} não opera nos canais selecionados.`;
  const temIdentidade = isBrandSlug(slug);

  return (
    <motion.button
      type="button"
      variants={entradaExagerada}
      onClick={indisponivelPeloCanal
        ? () => toast.info(motivoIndisponivel)
        : bloqueadaPorDados ? undefined : onClick}
      disabled={bloqueadaPorDados}
      aria-disabled={indisponivelPeloCanal}
      whileHover={!bloqueada && !reduzir ? { y: -2, scale: 1.04 } : undefined}
      whileTap={!bloqueada && !reduzir ? { scale: 0.92 } : undefined}
      aria-pressed={ativo}
      aria-label={marca.nome}
      title={indisponivelPeloCanal
        ? motivoIndisponivel
        : bloqueadaPorDados ? copy.brandSelector.emptyHint.replace("{marca}", marca.nome) : undefined}
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
      {indisponivelPeloCanal && <PlugZap2 size={14} className="text-muted-foreground" />}
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
      // Continua tocável mesmo desconectado — o toque mostra o motivo (toast),
      // porque `title` (tooltip) não aparece no toque em celular; mesmo
      // padrão de Estoque/Publicidade/Métricas.
      onClick={canal.conectado ? onClick : () => toast.info(copy.channelSelector.disconnectedHint.replace("{canal}", label))}
      aria-disabled={!canal.conectado}
      whileHover={!reduzir ? { y: -2, scale: 1.04 } : undefined}
      whileTap={!reduzir ? { scale: canal.conectado ? 0.92 : 0.97 } : undefined}
      aria-pressed={ativo}
      aria-label={label}
      title={canal.conectado ? label : copy.channelSelector.disconnectedHint.replace("{canal}", label)}
      className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors ${
        !canal.conectado
          ? "border border-border opacity-50"
          : ativo
            ? "border-2 bg-card/70"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={canal.conectado && ativo ? { borderColor: channelAccent(canal.tipo) } : undefined}
    >
      <HaloSelecao ativo={ativo} cor={channelAccent(canal.tipo)} reduzir={reduzir} />
      <ChannelLogo canal={canal.tipo} size="sm" variant="logo" />
      {!canal.conectado && <PlugZap2 size={14} className="text-muted-foreground" />}
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
  const [limiteDoDia, setLimiteDoDia] = useState<LimiteDoDia>(limiteDoDiaInicial);
  /* Uma janela só, para a única porta que hoje leva até ela: o card de fuso
     na grade de indicadores. Guarda PARA QUAL conjunto de pedidos foi aberta,
     e não um booleano: trocar o filtro troca os pedidos da fronteira, e um
     booleano deixaria a janela aberta sobre uma lista que ninguém pediu. */
  const [limiteAbertoPara, setLimiteAbertoPara] = useState<LimiteDoDia | null>(null);
  const limiteAberto = limiteAbertoPara === limiteDoDia;
  const setLimiteAberto = (abrir: boolean) => setLimiteAbertoPara(abrir ? limiteDoDia : null);
  const [loading, setLoading] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [canaisSel, setCanaisSel] = useState<CanalVenda[]>([]);
  const [statusGrupo, setStatusGrupo] = useState<ChaveGrupoStatus>("");
  const statusesAtivos = useMemo(
    () => GRUPOS_STATUS.find((grupo) => grupo.chave === statusGrupo)?.statuses ?? [],
    [statusGrupo],
  );
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  // Pré-selecionado em Hoje, igual ao resto do app — antes vinha sem filtro
  // (mostrando todos os pedidos).
  const [dataInicial, setDataInicial] = useState(hojeISO);
  const [dataFinal, setDataFinal] = useState(hojeISO);
  const [marcas, setMarcas] = useState<Marca[]>(marcasIniciais);
  const [canais, setCanais] = useState<Canal[]>(canaisIniciais);
  const [expandido, setExpandido] = useState<string | null>(null);
  const requestId = useRef(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const task = window.setTimeout(() => setBuscaAplicada(busca.trim()), 350);
    return () => window.clearTimeout(task);
  }, [busca]);

  const carregar = useCallback((marcas?: string[], canaisAtual?: string[], statusesAtual?: string[], buscaAtual?: string, inicio?: string, fim?: string) => {
    const currentRequest = ++requestId.current;
    startTransition(async () => {
      setLoading(true);
      try {
        const filtrosBase = {
          brandIds: marcas?.length ? marcas : undefined,
          canais: canaisAtual?.length ? canaisAtual : undefined,
          inicio: inicioDoDia(inicio ?? ""),
          fim: fimDoDia(fim ?? ""),
        };
        const res = await actionListarPedidosDetalhados({
          ...filtrosBase,
          statuses: statusesAtual?.length ? statusesAtual : undefined,
          busca: buscaAtual || undefined,
        });
        if (currentRequest !== requestId.current) return;
        setPedidos(res.data);
        setTotal(res.total);
        setResumo(res.resumo);
        setLimiteDoDia(res.limiteDoDia);
        setMarcas(res.marcas);
        /* As contagens de marca voltam já cruzadas com o canal escolhido (ver
           contarPedidosPorMarca): total 0 aqui quer dizer "esta marca não tem
           um único pedido neste canal" — KARZI + Shopee, por exemplo. Marca
           assim continuava selecionada e entrando na consulta, um filtro que
           não tem como trazer nada; agora ela se desmarca sozinha, com aviso
           do motivo. A pílula fica travada em seguida (ver MarcaPill), então
           não religa enquanto o canal for esse. */
        const invalidas = res.marcas.filter((marca) =>
          marca.total === 0
          && (marcas ?? []).includes(marca.brandId));
        if (invalidas.length > 0) {
          setBrandIds((atual) => atual.filter((id) => !invalidas.some((marca) => marca.brandId === id)));
          for (const marca of invalidas) {
            toast.info(copy.brandSelector.emptyHint.replace("{marca}", marca.nome));
          }
        }
        setCanais(res.canais);
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
  const falta = oQueFaltaNoEscopo(brandIds, canaisSel);
  const convite = conviteDeEscopo(falta ?? "ambos");
  const escopoDefinido = !escopoIncompleto(brandIds, canaisSel) && dataInicial !== "" && dataFinal !== "";

  useAtualizacaoLocal("vendas", useCallback(() => {
    if (!escopoDefinido) return;
    carregar(brandIds, canaisSel, statusesAtivos.length ? [...statusesAtivos] : undefined, buscaAplicada, dataInicial, dataFinal);
  }, [escopoDefinido, carregar, brandIds, canaisSel, statusesAtivos, buscaAplicada, dataInicial, dataFinal]), { fontes: ["pedidos"] });

  useEffect(() => {
    if (!escopoDefinido) return;
    carregar(brandIds, canaisSel, statusesAtivos.length ? [...statusesAtivos] : undefined, buscaAplicada, dataInicial, dataFinal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandIds.join(","), canaisSel.join(","), statusGrupo, buscaAplicada, dataInicial, dataFinal, carregar, escopoDefinido]);

  async function carregarMais() {
    setCarregandoMais(true);
    try {
      const res = await actionListarPedidosDetalhados({
        brandIds: brandIds.length ? brandIds : undefined,
        canais: canaisSel.length ? canaisSel : undefined,
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

  function alternarMarca(marca: Marca) {
    if (!marcaDisponivelNosCanais(marca.slug, canaisSel)) {
      toast.info(`${marca.nome} não opera nos canais selecionados.`);
      return;
    }
    setBrandIds((atual) => atual.includes(marca.brandId)
      ? atual.filter((id) => id !== marca.brandId)
      : [...atual, marca.brandId]);
  }

  function alternarCanal(tipo: CanalVenda) {
    const proximosCanais = canaisSel.includes(tipo)
      ? canaisSel.filter((canal) => canal !== tipo)
      : [...canaisSel, tipo];
    setCanaisSel(proximosCanais);
    // O canal não acende empresa nenhuma (cada clique liga só a própria
    // pílula), mas ainda PODA: empresa que não opera no canal agora escolhido
    // sairia consultando um recorte que não pode existir — e, pior, ficaria
    // marcada por trás de uma pílula travada, sem como desmarcar.
    setBrandIds((atual) => atual.filter((id) => {
      const marca = marcas.find((m) => m.brandId === id);
      return !marca || marcaDisponivelNosCanais(marca.slug, proximosCanais);
    }));
  }

  const filtrando = brandIds.length > 0 || canaisSel.length > 0 || statusGrupo !== "" || buscaAplicada !== "" || dataInicial !== "" || dataFinal !== "";

  return (
    <div>
      {/* Barra de escopo — empresa e canal. No desktop tudo numa linha,
          centralizado, com "Entenda os status" alinhado à direita; no
          mobile empilha e cada fileira rola por dentro se precisar (mesmo
          padrão já usado em Inbox e Clientes). */}
      <div className="mb-4 flex flex-col items-center gap-2 lg:relative lg:flex-row lg:justify-center">
        <motion.div
          variants={staggerExagerado}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center gap-2 lg:w-fit lg:flex-row lg:flex-wrap"
        >
          <motion.div
            variants={staggerExagerado}
            className="order-2 flex w-full justify-center gap-2 overflow-x-auto overscroll-x-contain px-0.5 scrollbar-none lg:order-none lg:w-auto lg:flex-wrap lg:overflow-visible"
          >
            {marcas.map((marca) => (
              <MarcaPill
                key={marca.brandId}
                marca={marca}
                ativo={brandIds.includes(marca.brandId)}
                indisponivelPeloCanal={!marcaDisponivelNosCanais(marca.slug, canaisSel)}
                onClick={() => alternarMarca(marca)}
              />
            ))}
          </motion.div>

          <span aria-hidden="true" className="hidden h-5 w-px bg-border lg:block" />

          <motion.div
            variants={staggerExagerado}
            className="order-1 flex w-full justify-center gap-2 overflow-x-auto overscroll-x-contain px-0.5 scrollbar-none lg:order-none lg:w-auto lg:flex-wrap lg:overflow-visible"
          >
            {canais.map((item) => (
              <CanalPill
                key={item.tipo}
                canal={item}
                ativo={canaisSel.includes(item.tipo as CanalVenda)}
                onClick={() => alternarCanal(item.tipo as CanalVenda)}
              />
            ))}
          </motion.div>
        </motion.div>

        <div className="hidden lg:absolute lg:right-0 lg:top-0 lg:block">
          <EntendaStatusPedidoBotao />
        </div>
      </div>

      {/* Filtros — no desktop, uma linha só como sempre foi (busca cresce,
          o resto tem largura própria). No mobile isso empilhava em blocos
          de largura cheia, um por baixo do outro, e os dois botões de
          calendário (De:/Até:) ficavam idênticos e sem rótulo visível, um
          embaixo do outro — impossível saber qual era qual. Agora: busca
          sozinha (é o controle principal), status+Período juntos (são
          atalhos de refinar). */}
      <div className="mb-4 flex flex-col gap-2 rounded-[1.25rem] border border-border bg-card/70 p-3 shadow-[0_2px_12px_rgba(14,15,19,.04)] md:grid md:grid-cols-[minmax(200px,1fr)_auto] md:items-center">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pedido ou cliente…" className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-selecionado" />
        </label>
        {/* Mobile: Todos/Período/Status viram 3 colunas do mesmo tamanho
            (grid, não flex), com um risco fino separando cada uma — antes
            "Todos" crescia (flex-1) e empurrava os outros dois pra direita,
            com espaçamento desigual. Do md em diante volta a ser a fileira
            de sempre, auto-ajustada ao conteúdo. */}
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 md:flex md:items-center">
          {/* buttonClassName força 44px de altura — o padrão do componente é
              36px, que ficava desalinhado ao lado dos calendários e do Hoje
              (todos 44px) nesta linha. */}
          <div className="min-w-0 md:flex-initial">
            <SelectPopover
              valor={statusGrupo}
              onChange={setStatusGrupo}
              buttonClassName="press-feedback inline-flex h-11 w-full min-w-[7rem] items-center justify-center gap-2 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:border-selecionado disabled:opacity-60 md:w-auto md:justify-between"
              itens={GRUPOS_STATUS.map((grupo) => ({
                value: grupo.chave,
                label: grupo.chave === "" ? copy.statusFilter.all : grupo.label,
              }))}
            />
          </div>
          <span aria-hidden="true" className="h-6 w-px justify-self-center bg-border md:hidden" />
          {/* "Hoje" saiu como botão avulso — o popover de Período já tem o
              mesmo atalho lá dentro (ver CalendarioPopoverRange), o botão
              daqui fora só duplicava a ação e tomava espaço na linha. */}
          <CalendarioPopoverRange
            incluirHojeAlemDoPeriodo={canaisSel.length === 1 && canaisSel[0] === "mercadolivre"}
            rotulo="Período"
            valor={{ inicio: dataInicial, fim: dataFinal }}
            onChange={({ inicio, fim }) => { setDataInicial(inicio); setDataFinal(fim); }}
          />
          <span aria-hidden="true" className="h-6 w-px justify-self-center bg-border md:hidden" />
          {/* Mobile: "Entenda os status" (virou "Status" aqui, compacto) sai
              da própria fileira acima e entra nesta linha, junto de
              Todos/Período — o desktop mantém a versão de sempre, ancorada
              no canto direito da barra de escopo (ver acima). */}
          <div className="min-w-0 lg:hidden">
            <EntendaStatusPedidoBotao compacto />
          </div>
        </div>
      </div>

      {!escopoDefinido ? (
        <motion.div
          initial={reduzir ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.settleFast}
          className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)]"
        >
          <EmptyState
            illustration="revenue"
            title={convite.titulo}
            description={convite.descricao}
          />
        </motion.div>
      ) : (
      <div className="flex flex-col gap-4">
      <motion.section
        variants={staggerExagerado}
        initial="hidden"
        animate="show"
        // A ordem fecha a conta visualmente. A primeira linha mostra o total
        // comparável, o faturamento preservado e sua quantidade. A segunda
        // mostra as parcelas que explicam a diferença e a quantidade de
        // cancelados/devolvidos. Em telas largas, os seis cards ficam na mesma linha.
        className="grid grid-cols-3 gap-1.5 sm:gap-2.5 xl:grid-cols-6"
        aria-label="Resumo das vendas filtradas"
      >
        {[
          {
            chave: "total-bruto",
            label: <><span className="sm:hidden">Total bruto</span><span className="hidden sm:inline">Total bruto comparável</span></>,
            numero: resumo.totalBrutoComparavel,
            formatar: (v: number) => dinheiro.format(v),
            icon: BadgeDollarSign,
            cor: "var(--selecionado)",
            sub: <>
              <span className="sm:hidden">{Math.round(resumo.totalBrutoPedidos).toLocaleString("pt-BR")} ped.</span>
              <span className="hidden sm:inline">{Math.round(resumo.totalBrutoPedidos).toLocaleString("pt-BR")} {resumo.totalBrutoPedidos === 1 ? "pedido no total bruto" : "pedidos no total bruto"}</span>
            </>,
            explicacao: EXPLICACOES_CARDS.totalBruto,
          },
          {
            chave: "faturamento",
            label: <><span className="sm:hidden">Confirmado</span><span className="hidden sm:inline">Faturamento confirmado</span></>,
            numero: resumo.faturamento,
            formatar: (v: number) => dinheiro.format(v),
            icon: CircleDollarSign,
            cor: "var(--success)",
            /* O líquido vive como subtítulo do bruto, não como um sexto card:
               é o mesmo dinheiro visto de outro ângulo, e separá-los em cards
               irmãos convidava a somar um com o outro. Só aparece quando é
               menor que o bruto — se nenhum pedido do filtro tem taxa nem
               repasse conhecido, os dois números seriam idênticos e a linha
               viraria ruído. */
            sub: resumo.liquidoTotal > 0 && resumo.liquidoTotal < resumo.faturamento
              ? <><span className="sm:hidden">Líq. {dinheiro.format(resumo.liquidoTotal)}</span><span className="hidden sm:inline">{dinheiro.format(resumo.liquidoTotal)} líquido</span></>
              : undefined,
            explicacao: EXPLICACOES_CARDS.faturamento,
          },
          {
            chave: "pedidos",
            label: <><span className="sm:hidden">Pedidos</span><span className="hidden sm:inline">Pedidos faturados</span></>,
            numero: resumo.totalPedidos,
            formatar: (v: number) => Math.round(v).toLocaleString("pt-BR"),
            icon: ShoppingBag,
            cor: "var(--info)",
            sub: <><span className="sm:hidden">confirmados</span><span className="hidden sm:inline">com pagamento confirmado</span></>,
            explicacao: EXPLICACOES_CARDS.pedidos,
          },
          {
            chave: "cancelados",
            label: <><span className="sm:hidden">Cancel. e devol.</span><span className="hidden sm:inline">Cancelados e devolvidos</span></>,
            numero: resumo.canceladosValor + resumo.devolvidosValor,
            formatar: (v: number) => dinheiro.format(v),
            icon: Ban,
            cor: (resumo.canceladosValor + resumo.devolvidosValor) > 0 ? "var(--destructive)" : "var(--muted-foreground)",
            sub: <>
              <span className="sm:hidden">{resumo.cancelados.toLocaleString("pt-BR")} ped.</span>
              <span className="hidden sm:inline">{resumo.cancelados.toLocaleString("pt-BR")} {resumo.cancelados === 1 ? "pedido" : "pedidos"}. {resumo.canceladosQtd.toLocaleString("pt-BR")} cancelados e {resumo.devolvidosQtd.toLocaleString("pt-BR")} devolvidos</span>
            </>,
            explicacao: EXPLICACOES_CARDS.cancelados,
          },
          {
            chave: "reembolsos-parciais",
            label: <><span className="sm:hidden">Reembolsos</span><span className="hidden sm:inline">Reembolsos parciais</span></>,
            numero: resumo.reembolsosParciaisValor,
            formatar: (v: number) => dinheiro.format(v),
            icon: RotateCcw,
            cor: resumo.reembolsosParciaisValor > 0 ? "var(--warning)" : "var(--muted-foreground)",
            sub: <>
              <span className="sm:hidden">{resumo.reembolsosParciaisQtd.toLocaleString("pt-BR")} ped.</span>
              <span className="hidden sm:inline">{resumo.reembolsosParciaisQtd.toLocaleString("pt-BR")} {resumo.reembolsosParciaisQtd === 1 ? "pedido afetado" : "pedidos afetados"}</span>
            </>,
            explicacao: EXPLICACOES_CARDS.reembolsos,
          },
          {
            chave: "quantidade-cancelados-devolvidos",
            label: <><span className="sm:hidden">Qtd. cancel./devol.</span><span className="hidden sm:inline">Pedidos cancelados/devolvidos</span></>,
            numero: resumo.canceladosQtd + resumo.devolvidosQtd,
            formatar: (v: number) => Math.round(v).toLocaleString("pt-BR"),
            icon: Ban,
            cor: resumo.cancelados > 0 ? "var(--destructive)" : "var(--muted-foreground)",
            sub: <>{resumo.canceladosQtd.toLocaleString("pt-BR")} cancelados e {resumo.devolvidosQtd.toLocaleString("pt-BR")} devolvidos</>,
            explicacao: EXPLICACOES_CARDS.quantidadeCancelados,
          },
        ].map((card) => (
          <motion.div key={card.chave} variants={variantes(reduzir, entradaExagerada)}>
            <CardResumoVendas
              label={card.label}
              valor={<NumeroAnimado valor={card.numero} formatar={card.formatar} apenasPrimeiraVez={false} duracao={0.5} />}
              icon={card.icon}
              cor={card.cor}
              sub={card.sub}
              explicacao={card.explicacao}
            />
          </motion.div>
        ))}

        <p className="col-span-full text-xs text-muted-foreground">
          Mercado Livre: vendas pela aprovação do pagamento, em Brasília. Valores com centavos.
        </p>
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

      {/* A explicação em tela cheia. Fica fora do bloco condicional dos
          indicadores porque é um Dialog em portal — o lugar dela na árvore
          não é o lugar dela na tela. */}
      <JanelaLimiteDoDia dados={limiteDoDia} aberto={limiteAberto} setAberto={setLimiteAberto} />
    </div>
  );
}
