"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ComponentPropsWithoutRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Loader2, ChevronDown, Search, ShoppingBag, CircleDollarSign, Ban, PlugZap2, PackageX } from "lucide-react";
import { actionListarPedidosDetalhados } from "../actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { CalendarioPopoverRange } from "@/shared/design-system/primitives/CalendarioPopoverRange";
import { SelectPopover } from "@/shared/design-system/primitives/SelectPopover";
import { TintedStatCard } from "@/shared/design-system/primitives/TintedStatCard";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import { Dialog } from "@/shared/design-system/primitives/Dialog";
import { springs, variantes, staggerExagerado, entradaExagerada } from "@/shared/design-system/motion-variants";
import { NumeroAnimado } from "@/shared/design-system/primitives/NumeroAnimado";
import pagesConfig from "@/config/pages.json";
import channelsConfig from "@/config/channels.json";
import {
  ajustarMarcasSelecionadasAosCanais,
  getBrandConfig,
  isBrandSlug,
  marcaDisponivelNosCanais,
} from "@/shared/config/brands";
import { useAtualizacaoLocal } from "@/shared/lib/atualizacao-local";

type CanalVenda = "mercadolivre" | "shopee" | "tiktokshop";
type Pedido = Awaited<ReturnType<typeof actionListarPedidosDetalhados>>["data"][number];
type ConsultaPedidos = Awaited<ReturnType<typeof actionListarPedidosDetalhados>>;
type Marca = ConsultaPedidos["marcas"][number];
type Canal = ConsultaPedidos["canais"][number];
type Resumo = Awaited<ReturnType<typeof actionListarPedidosDetalhados>>["resumo"];
type LimiteDoDia = ConsultaPedidos["limiteDoDia"];
type PedidoNoLimite = LimiteDoDia["soNoMercadoLivre"][number];

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
  freteTotal: 0,
  descontosTotal: 0,
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
    dica: "Criado, Pago, Separado e Enviado — o Mercado Livre não informa esses estágios separadamente, então a maior parte dos pedidos fica aqui até ser cancelada.",
  },
  { chave: "cancelado", label: "Cancelado", statuses: ["cancelado"], dica: undefined as string | undefined },
] as const;
type ChaveGrupoStatus = (typeof GRUPOS_STATUS)[number]["chave"];

/** Catálogo dos status reais do pedido — só o que o Mercado Livre de fato
 *  devolve (ver comentário de GRUPOS_STATUS acima); nada de Entregue,
 *  Concluído ou Devolvido, que não existem como dado real da API. */
const LEGENDA_STATUS_PEDIDOS: Array<{ titulo: string; cor: string; texto: string }> = [
  { titulo: "Todos", cor: "var(--muted-foreground)", texto: "Mostra os pedidos de qualquer status, sem recorte — o ponto de partida antes de filtrar." },
  { titulo: "Em aberto", cor: "var(--info)", texto: "Criado, Pago, Separado e Enviado. O Mercado Livre não informa esses quatro estágios separadamente pelo pedido, então praticamente todo pedido ativo fica agrupado aqui até ser cancelado." },
  { titulo: "Cancelado", cor: "var(--destructive)", texto: "O pedido foi cancelado — pelo comprador, pelo vendedor ou automaticamente por falta de pagamento." },
];

/* ── Desencontro de dia com o Mercado Livre ───────────────────────────────
   Fica na linha do título, ao lado do aviso de "não importados", e agora com
   cor própria: azul de informação, nunca o âmbar/vermelho do recusado. A
   distinção continua valendo — recusado é trabalho a resolver, isto é uma
   explicação que se esgota no popover — só que ela passou a ser feita pelo
   MATIZ, e não por apagar este selo até o ponto de ninguém notar que ele
   existe. Era o que acontecia: quem estranhava o total divergir do painel do
   ML não achava a resposta, que estava na tela o tempo todo, cinza.

   O rótulo também deixou de contar ("4 em outro dia no ML"): o número mudava
   a cada filtro e o botão parecia um alerta diferente a cada visita. Nome
   fixo, contador separado numa pílula — a coisa é sempre a mesma, o que muda
   é quantos pedidos ela pegou. */
const copyLimite = copy.limiteDoDia;
const AZUL_LIMITE = "var(--info)";

/** Pedido individual da lista. Mostra o número do ML junto do nome porque é
 *  por ele que se confere pedido a pedido do outro lado — sem isso, a lista
 *  prova que a diferença existe, mas não deixa auditar. */
function LinhaPedidoNoLimite({ item }: { item: PedidoNoLimite }) {
  const foraDaSoma = item.status === "cancelado" || item.status === "devolvido";
  return (
    <li>
      <Link
        href={`/vendas/pedidos/${item.id}`}
        className="flex items-center gap-2.5 rounded-[0.6rem] px-2 py-1.5 transition-colors hover:bg-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-foreground">{item.clienteNome}</span>
          <span className="block truncate text-[10.5px] tabular-nums text-muted-foreground">
            {item.providerOrderId ? `#${item.providerOrderId}` : copyLimite.pedidoSem} · {dataHora.format(item.createdAt)}
          </span>
        </span>
        {foraDaSoma && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground">
            fora da soma
          </span>
        )}
        <span
          className={`shrink-0 text-[12.5px] font-bold tabular-nums ${foraDaSoma ? "text-muted-foreground line-through" : "text-foreground"}`}
        >
          {dinheiro.format(item.total)}
        </span>
      </Link>
    </li>
  );
}

/** Uma das duas pontas do período. `soma` vem de fora porque é a mesma conta
 *  que alimenta a reconciliação lá embaixo — calcular duas vezes deixaria o
 *  card e o total livres para discordar. */
function GrupoLimiteDoDia({ titulo, dica, linhas, soma, className }: {
  titulo: string;
  dica: string;
  linhas: PedidoNoLimite[];
  soma: number;
  className?: string;
}) {
  if (linhas.length === 0) return null;
  const resumo = (linhas.length === 1 ? copyLimite.grupoResumoUm : copyLimite.grupoResumoMuitos)
    .replace("{n}", String(linhas.length))
    .replace("{valor}", dinheiro.format(soma));

  return (
    <section className={`rounded-[0.95rem] border border-border bg-muted/30 p-3.5 ${className ?? ""}`}>
      <p className="text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: AZUL_LIMITE }}>{titulo}</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{dica}</p>
      <p className="mt-2 text-[11.5px] font-bold tabular-nums text-foreground">{resumo}</p>
      <ul className="mt-1.5 flex flex-col divide-y divide-border/70">
        {linhas.map((item) => <LinhaPedidoNoLimite key={item.id} item={item} />)}
      </ul>
    </section>
  );
}

/** O selo respira: o anel azul acende e apaga a cada ~4s em vez de ficar
 *  aceso. Um destaque estático nesta barra vira paisagem depois do segundo
 *  dia; um que pisca sem parar disputa a leitura dos pedidos. O intervalo
 *  longo é o meio-termo — reaparece de tempos em tempos para quem está
 *  procurando a explicação, some do caminho de quem não está. */
const GatilhoLimiteDoDia = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof AnimatedInfoTrigger> & { quantidade: number }
>(function GatilhoLimiteDoDia({ quantidade, ...props }, ref) {
  const reduzir = useReducedMotion();
  return (
    // `forwardRef` + `{...props}` não são cerimônia: o Popover do Radix abre
    // via `asChild`, clonando este nó para pendurar nele o ref e o onClick.
    // Um componente que não repassa os dois vira um botão bonito que não
    // abre nada — foi exatamente o que aconteceu na primeira versão.
    <AnimatedInfoTrigger
      ref={ref}
      {...props}
      title={copyLimite.badgeDica}
      iconSize={12}
      whileHover={reduzir ? undefined : { y: -1 }}
      transition={springs.settleFast}
      className="press-feedback inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors"
      style={{
        borderColor: "color-mix(in srgb, var(--info) 35%, transparent)",
        background: "color-mix(in srgb, var(--info) 8%, transparent)",
        color: AZUL_LIMITE,
      }}
    >
      {!reduzir && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ border: `1px solid ${AZUL_LIMITE}` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.55, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 3.6, ease: "easeInOut" }}
        />
      )}
      <span className="relative">{copyLimite.badge}</span>
      <span
        className="relative inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-extrabold tabular-nums text-white"
        style={{ background: AZUL_LIMITE }}
      >
        {quantidade}
      </span>
    </AnimatedInfoTrigger>
  );
});

function AvisoLimiteDoDia({ dados }: { dados: LimiteDoDia }) {
  // Antes do early return: hook não pode ficar atrás de um `return` condicional.
  const [aberto, setAberto] = useState(false);
  const { soNoMercadoLivre, soAqui } = dados;
  const quantidade = soNoMercadoLivre.length + soAqui.length;
  if (quantidade === 0) return null;

  /* Cancelado e devolvido aparecem na lista (o pedido existe e está mesmo na
     hora de virada), mas ficam fora da soma: o Faturamento desta tela também
     os exclui, e é com ele que a pessoa está comparando. */
  const somar = (linhas: PedidoNoLimite[]) => linhas
    .filter((item) => item.status !== "cancelado" && item.status !== "devolvido")
    .reduce((total, item) => total + item.total, 0);
  const somaAdiante = somar(soNoMercadoLivre);
  const somaAtras = somar(soAqui);
  const diferenca = somaAdiante - somaAtras;
  // Duas colunas só quando existem mesmo duas pontas — com um grupo só, a
  // segunda coluna viraria um vazio do tamanho do conteúdo ao lado.
  const duasPontas = soNoMercadoLivre.length > 0 && soAqui.length > 0;

  const subtitle = (quantidade === 1 ? copyLimite.subtitleUm : copyLimite.subtitleMuitos)
    .replace("{n}", String(quantidade));

  return (
    <>
      <GatilhoLimiteDoDia quantidade={quantidade} onClick={() => setAberto(true)} />
      {/* Janela centralizada, e não o popover ancorado que isto era: o popover
          só pode ocupar o espaço entre o botão e a borda da tela, e como este
          botão vive no meio da página, sobravam ~300px — a explicação inteira
          virava rolagem, justamente o que não pode acontecer. Centralizado, o
          conteúdo usa a altura da janela toda e cabe de uma vez no desktop;
          no celular ele vira folha e rola, que ali é o esperado.

          Largura até 56rem (max-w-4xl) porque é ela que troca rolagem por
          leitura: com ela os três passos ficam lado a lado e as duas pontas
          do período também, cortando a altura pela metade. */}
      <Dialog
        open={aberto}
        onOpenChange={setAberto}
        title={copyLimite.title}
        description={<span className="font-semibold" style={{ color: AZUL_LIMITE }}>{subtitle}</span>}
        className="sm:max-w-4xl"
      >
      <p className="max-w-[68ch] text-[12px] leading-relaxed text-muted-foreground">{copyLimite.explanation}</p>

      {/* Os três passos do porquê, numerados: a explicação acima resume, isto
          destrincha. Em coluna no celular, lado a lado do tablet para cima. */}
      <ol className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {copyLimite.comoFunciona.map((passo, indice) => (
          <li key={passo.titulo} className="rounded-[0.95rem] border border-border p-3.5">
            <span
              aria-hidden="true"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-extrabold text-white"
              style={{ background: AZUL_LIMITE }}
            >
              {indice + 1}
            </span>
            <p className="mt-2 text-[12px] font-bold text-foreground">{passo.titulo}</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{passo.texto}</p>
          </li>
        ))}
      </ol>

      {/* Mesma grade de três colunas dos passos, reaproveitada: as pontas do
          período e a conta que elas explicam viram três células de uma linha
          só. Empilhados, esses blocos somavam mais altura do que a janela
          tinha e traziam de volta a rolagem que a largura tinha acabado de
          eliminar. Com uma ponta só, ela ocupa duas colunas e a conta fica
          na terceira — a linha continua cheia, sem buraco. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <GrupoLimiteDoDia
          titulo={copyLimite.aheadTitle}
          dica={copyLimite.aheadHint}
          linhas={soNoMercadoLivre}
          soma={somaAdiante}
          className={duasPontas ? "" : "sm:col-span-2"}
        />
        <GrupoLimiteDoDia
          titulo={copyLimite.behindTitle}
          dica={copyLimite.behindHint}
          linhas={soAqui}
          soma={somaAtras}
          className={duasPontas ? "" : "sm:col-span-2"}
        />

        {/* Fecha a conta: é a linha que a pessoa veio buscar quando os dois
            totais não bateram. */}
        <div
          className="rounded-[0.95rem] px-4 py-3"
          style={{ background: "color-mix(in srgb, var(--info) 7%, transparent)" }}
        >
          {diferenca === 0 ? (
            <p className="text-[12px] font-semibold text-foreground">{copyLimite.reconcileZero}</p>
          ) : (
            <>
              <p className="text-[13px] font-extrabold tabular-nums" style={{ color: AZUL_LIMITE }}>
                {copyLimite.reconcile.replace("{valor}", dinheiro.format(Math.abs(diferenca)))}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{copyLimite.reconcileDica}</p>
            </>
          )}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{copyLimite.rodape}</p>
      </Dialog>
    </>
  );
}

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

export function PedidosLista({ marcasIniciais = [], canaisIniciais = [], ignorados = 0 }: {
  /** Contagens já resolvidas no servidor (ver page.tsx) — chegam junto com o
   *  HTML, então as pílulas de filtro aparecem no primeiro quadro em vez de
   *  esperarem duas idas ao servidor depois que o JavaScript liga. */
  marcasIniciais?: Marca[];
  canaisIniciais?: Canal[];
  /** Pendências em aberto na fila de recusados. Zero esconde o aviso. */
  ignorados?: number;
}) {
  const reduzir = useReducedMotion();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<Resumo>(resumoInicial);
  const [limiteDoDia, setLimiteDoDia] = useState<LimiteDoDia>(limiteDoDiaInicial);
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
        const res = await actionListarPedidosDetalhados({
          brandIds: marcas?.length ? marcas : undefined,
          canais: canaisAtual?.length ? canaisAtual : undefined,
          statuses: statusesAtual?.length ? statusesAtual : undefined,
          busca: buscaAtual || undefined,
          inicio: inicioDoDia(inicio ?? ""),
          fim: fimDoDia(fim ?? ""),
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
  const escopoDefinido = brandIds.length > 0 || canaisSel.length > 0;

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
    setBrandIds((atuais) => ajustarMarcasSelecionadasAosCanais(
      atuais,
      proximosCanais,
      marcas.map((marca) => ({ id: marca.brandId, slug: marca.slug })),
    ));
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
          atalhos de refinar). O PDF saiu daqui — foi morar perto do
          contador de pedidos, que é o que ele exporta. */}
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
          <EmptyState illustration="revenue" title="Escolha uma empresa ou canal para começar" />
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
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <AvisoLimiteDoDia dados={limiteDoDia} />
            {/* Só aparece quando há o que resolver. Um item fixo na navegação
                global disputaria espaço na barra do celular com Métricas,
                Vendas, Estoque e Publicidade por uma tela que, na operação
                saudável, fica vazia — aqui o aviso nasce junto dos pedidos e
                some sozinho quando a fila zera. */}
            {ignorados > 0 && (
              <a
                href="/vendas/pedidos-ignorados"
                className="press-feedback inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-500/20"
              >
                <PackageX size={13} />
                {ignorados} {ignorados === 1 ? "não importado" : "não importados"}
              </a>
            )}
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
