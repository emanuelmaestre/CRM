"use client";

import { useCallback, useEffect, useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, CircleSlash, Clock3, ListChecks,
  Loader2, RotateCw, Undo2, Wallet, X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { compararPorOrdemDeMarca, getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import channelsConfig from "@/config/channels.json";
import { moeda } from "@/shared/design-system/format";
import { springs, stagger, fadeUp } from "@/shared/design-system/motion-variants";
import { mapearStatusPedido } from "@/modules/canais/domain/order-status";
import pagesConfig from "@/config/pages.json";
import type { ItemPedidoIgnorado, PedidoIgnoradoLinha } from "@/modules/vendas/application/pedidos-ignorados.service";
import {
  agruparEmTarefas, causaDe, dataCurta, diagnosticoDe, diasParado, nomeCanal, TONS,
  type Tarefa,
} from "./diagnostico";
import {
  actionDescartarPedidoIgnorado, actionReprocessarFilaAberta,
  actionReprocessarPedidoIgnorado, actionReprocessarPedidosIgnorados,
} from "./actions";

/* ── Por que esta tela é um roteiro, e não uma lista ──────────────────────
   A fila real de 30/08/2026 tinha 43 pedidos — e oito consertos. Dezessete
   deles eram o mesmo SKU, do mesmo anúncio, com exatamente os mesmos seis
   passos. A versão em lista mostrava esses seis passos dezessete vezes: quem
   abria a tela via uma parede de texto repetido e não conseguia responder a
   única pergunta que importa, que é "por onde eu começo?".

   Aqui a fila vira um roteiro de ETAPAS, uma por conserto (ver
   `agruparEmTarefas`). A trilha à esquerda mostra o roteiro inteiro de uma
   vez — nada fica escondido atrás de "próximo" —, e o painel à direita abre
   uma etapa por vez, com o passo a passo em tamanho de leitura e os pedidos
   afetados logo abaixo.

   A divisão do texto segue quem muda com o quê:
   · o PASSO A PASSO é do conserto, igual para os 17 pedidos → fica na etapa;
   · o MOTIVO é do pedido (qual SKU, qual comprador, cancelado ou não) → fica
     no cartão, sempre visível;
   · quando o estado de um pedido MUDA o roteiro dele (cancelado no canal, já
     descartado, três tentativas sem sair do lugar), aí sim o cartão carrega
     os próprios passos, destacados — porque ali a instrução da etapa não
     vale, e seguir a do topo seria trabalho jogado fora. */

const STATUS_LABELS: Record<string, string> = pagesConfig.pedidos.statusLabels;

/** O status vem cru do canal ("completed", "cancelled"). Traduz pelo MESMO
 *  mapa que o resto de Vendas usa — dois vocabularios para o mesmo pedido
 *  seria pior que nao mostrar. */
function rotuloStatus(statusCanal: string | null): string | null {
  if (!statusCanal) return null;
  return STATUS_LABELS[mapearStatusPedido(statusCanal)] ?? statusCanal;
}

function pedidosLabel(n: number): string {
  return `${n} ${n === 1 ? "pedido" : "pedidos"}`;
}

/** Uma medida do detalhe. `tabular-nums` em tudo que e numero para as colunas
 *  alinharem verticalmente mesmo com larguras diferentes. */
function Medida({ rotulo, valor, cor, dica }: { rotulo: string; valor: string; cor?: string; dica?: string }) {
  return (
    <div className="min-w-0">
      {/* A coluna só cabe uma palavra ("Repasse"), e uma palavra sozinha não
          ensina nada a quem nunca viu o termo. A dica no hover explica sem
          gastar linha na grade. */}
      <dt title={dica} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      {/* title porque o valor trunca em coluna estreita (celular em pe, nome
          de comprador longo): o texto inteiro continua alcançavel. */}
      <dd title={valor} className="truncate text-[13px] font-bold tabular-nums" style={{ color: cor ?? "var(--foreground)" }}>{valor}</dd>
    </div>
  );
}

/** Item do pedido. A taxa some quando e zero — na maioria dos pedidos
 *  recusados o repasse nem chegou a ser calculado. */
function ItemLinha({ item }: { item: ItemPedidoIgnorado }) {
  const taxa = Number(item.taxaMarketplace ?? 0);
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
      <span className="rounded-md bg-card px-1.5 py-0.5 font-mono text-[11px] text-foreground">{item.sku ?? "sem SKU"}</span>
      <span className="tabular-nums text-muted-foreground">
        {item.quantidade ?? "?"} un. × {item.precoUnitario === null ? "—" : moeda.format(Number(item.precoUnitario))}
      </span>
      {taxa > 0 && <span className="tabular-nums text-muted-foreground">· taxa {moeda.format(taxa)}</span>}
    </li>
  );
}

/** Tudo que o CRM guardou do pedido recusado.
 *
 *  O payload e gravado inteiro na fila, entao nada aqui custa uma consulta a
 *  mais — so nao estava sendo lido. Fica fechado por padrao porque a etapa
 *  existe para ser varrida rapido; quem precisa decidir sobre UM pedido abre
 *  o dele sem que os outros cresçam junto. */
function DetalhePedido({ linha, aberto, id }: { linha: PedidoIgnoradoLinha; aberto: boolean; id: string }) {
  const reduzir = useReducedMotion();
  const status = rotuloStatus(linha.statusCanal);
  const cancelado = linha.statusCanal !== null && mapearStatusPedido(linha.statusCanal) === "cancelado";
  const taxaTotal = linha.itens.reduce((soma, item) => soma + Number(item.taxaMarketplace ?? 0), 0);
  const dinheiro = (valor: string | null) => (valor === null ? "—" : moeda.format(Number(valor)));

  return (
    <AnimatePresence initial={false}>
      {aberto && (
        <motion.div
          key="detalhe"
          id={id}
          /* Altura animada em vez de fade puro: o cartao empurra os vizinhos
             para baixo, e ver esse empurrao acontecer e o que explica de onde
             o bloco saiu. Com "reduzir movimento" vira corte seco. */
          initial={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduzir ? { opacity: 1 } : { opacity: 1, height: "auto" }}
          exit={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={reduzir ? { duration: 0 } : springs.settleFast}
          className="overflow-hidden"
        >
          <div className="mt-2.5 rounded-xl border border-border bg-muted/30 p-3">
            {status && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    background: `color-mix(in srgb, ${cancelado ? "var(--destructive)" : "var(--info)"} 14%, transparent)`,
                    color: cancelado ? "var(--destructive)" : "var(--info)",
                  }}
                >
                  {status} no canal
                </span>
                {/* Pedido cancelado nunca vira receita: quem olha a fila
                    precisa saber disso ANTES de gastar tempo recuperando. */}
                {cancelado && <span className="text-[11px] text-muted-foreground">nao vira receita mesmo se entrar</span>}
              </div>
            )}

            {/* 2 colunas no celular em pe, 3 em tela media (e no celular
                deitado, que ganha largura), 6 no desktop: a linha de valores
                nunca fica com uma coluna orfa. */}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3 xl:grid-cols-6">
              <Medida rotulo="Total" valor={dinheiro(linha.total)} dica="O que o comprador pagou, do jeito que o canal informou." />
              <Medida rotulo="Frete" valor={dinheiro(linha.frete)} dica="Frete cobrado nesta venda, já incluído no total." />
              <Medida rotulo="Desconto" valor={dinheiro(linha.desconto)} dica="Descontos aplicados na venda (cupom, promoção do canal)." />
              <Medida rotulo="Acrescimo" valor={dinheiro(linha.acrescimo)} dica="Valores somados à venda pelo canal, quando houver." />
              <Medida
                rotulo="Taxa do canal"
                valor={taxaTotal > 0 ? moeda.format(taxaTotal) : "—"}
                dica="Comissão que o canal cobra desta venda, somando todos os itens. Aparece como — quando o canal ainda não calculou."
              />
              <Medida
                rotulo="Repasse"
                dica="O que sobra para você depois das taxas — é o valor que o canal deposita. Aparece como — enquanto o canal não fecha a conta desta venda."
                valor={dinheiro(linha.valorLiquido)}
                cor={linha.valorLiquido && Number(linha.valorLiquido) > 0 ? "var(--success)" : undefined}
              />
            </dl>

            {linha.itens.length > 0 && (
              <ul className="mt-3 grid gap-1.5 border-t border-border pt-3">
                {linha.itens.map((item, indice) => (
                  <ItemLinha key={`${item.sku ?? "item"}-${indice}`} item={item} />
                ))}
              </ul>
            )}

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-border pt-3 sm:grid-cols-4">
              <Medida rotulo="Comprador" valor={linha.compradorNome ?? "—"} dica="Nome como o canal entregou. É por ele (ou pelo telefone) que se procura o cadastro em Clientes." />
              <Medida
                rotulo={`ID do comprador no ${nomeCanal(linha.canal)}`}
                valor={linha.compradorUsuario ?? "—"}
                dica={`Número que identifica o comprador dentro do ${nomeCanal(linha.canal)} — não é o número da venda nem um código do CRM.`}
              />
              <Medida
                rotulo="Telefone"
                valor={linha.compradorTelefone ?? "—"}
                dica="Telefone que veio do canal. Na Shopee ele vem mascarado, e é justamente o que faz compradores diferentes colidirem no mesmo cadastro."
              />
              <Medida
                rotulo="Tentativas"
                valor={String(linha.tentativas)}
                dica="Quantas vezes este pedido já tentou entrar — contando as sincronizações automáticas, não só os seus cliques."
              />
            </dl>

            {/* O motivo cru fecha o bloco: e o texto que o desenvolvedor le
                quando a causa classificada nao basta. */}
            <p className="mt-3 break-words border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Erro registrado (texto técnico, para quem cuida do CRM):</span> {linha.motivo}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Um pedido dentro da etapa.
 *
 *  Curto de propósito: o passo a passo do conserto está no topo da etapa e
 *  vale para todos os cartões. O que sobra aqui é o que muda de um pedido
 *  para o outro — quem comprou, quanto, há quanto tempo parado, por que ELE
 *  ficou de fora — mais os botões, que agem sobre este pedido só. */
function CartaoPedido({ linha, podeDescartar, passosDaEtapa }: {
  linha: PedidoIgnoradoLinha;
  podeDescartar: boolean;
  /** Os passos que a etapa já mostrou. Quando os deste pedido são outros, o
   *  cartão os traz para dentro; quando são os mesmos, repetir seria o ruído
   *  que esta tela existe para remover. */
  passosDaEtapa: string[];
}) {
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const reduzir = useReducedMotion();
  const fechado = linha.descartadoEm !== null;
  const parado = diasParado(linha.primeiraVezEm);
  const causa = causaDe(linha.causa);
  const tom = TONS[causa.tom];
  const diagnostico = diagnosticoDe(linha);
  const passosProprios = diagnostico.passos.join("|") !== passosDaEtapa.join("|")
    ? diagnostico.passos
    : null;

  const [detalheAberto, setDetalheAberto] = useState(false);
  const idDetalhe = useId();

  function reprocessar() {
    iniciar(async () => {
      const resultado = await actionReprocessarPedidoIgnorado(linha.id);
      if (resultado.ok) {
        toast.success(resultado.jaExistia
          ? `Pedido ${linha.providerOrderId} já estava no CRM — pendência encerrada.`
          : `Pedido ${linha.providerOrderId} entrou.`);
      } else {
        // O erro novo pode ser DIFERENTE do antigo (o SKU entrou e agora
        // barra o cliente) — por isso a mensagem vem do resultado, não do
        // texto que já estava na tela.
        toast.error(`Ainda não entrou: ${resultado.motivo}`, { duration: 8000 });
      }
      // Busca o estado real em vez de adivinhar: quando o replay falha, a
      // linha CONTINUA na fila, agora com a causa e o motivo regravados.
      router.refresh();
    });
  }

  function descartar(desfazer: boolean) {
    iniciar(async () => {
      await actionDescartarPedidoIgnorado(linha.id, desfazer);
      toast.success(desfazer ? "Pendência devolvida à fila." : "Pendência descartada.");
      router.refresh();
    });
  }

  return (
    <motion.li
      layout
      variants={fadeUp}
      exit={reduzir ? { opacity: 0 } : { opacity: 0, x: 24, transition: springs.settleFast }}
      className={`group relative overflow-hidden rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:bg-muted/40 ${fechado ? "opacity-50" : ""}`}
    >
      {/* Véu de carregamento no lugar de trocar o texto do botão: a linha
          inteira fica claramente indisponível enquanto a ação viaja, e nada
          se desloca quando ela volta. */}
      {pendente && <span aria-hidden="true" className="absolute inset-0 z-10 animate-pulse bg-card/60" />}

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {/* O número da venda era o texto mais destacado do cartão e o único
            sem rótulo: dava para confundir com SKU, com o ID do comprador ou
            com um código interno do CRM. O rótulo diz o que é, o logo ao lado
            diz de onde vem, e o title soletra a frase inteira para quem
            precisa colar esse número na busca do canal. */}
        <span
          className="inline-flex items-baseline gap-1.5"
          title={`Venda ${linha.providerOrderId} no ${nomeCanal(linha.canal)} — o mesmo número que aparece no painel do canal`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Venda nº</span>
          <span className="font-mono text-sm font-bold tracking-tight text-foreground">{linha.providerOrderId}</span>
        </span>
        <ChannelLogo canal={linha.canal} size="sm" variant="logo" />
        {isBrandSlug(linha.marcaSlug)
          ? <BrandLogo brand={linha.marcaSlug} height={14} />
          : <span className="text-xs font-semibold text-muted-foreground">{linha.marca}</span>}

        {fechado && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Descartado
          </span>
        )}

        {/* Tempo parado à direita, com destaque só depois de uma semana: um
            pedido de ontem na fila é rotina, um de duas semanas é dinheiro
            que ninguém viu. Sem o corte, todos os números competem igual. */}
        <span
          className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums"
          style={{ color: parado >= 7 && !fechado ? "var(--destructive)" : "var(--muted-foreground)" }}
          title={`Primeira falha em ${dataCurta(linha.primeiraVezEm)} · ${linha.tentativas} ${linha.tentativas === 1 ? "tentativa" : "tentativas"}`}
        >
          <Clock3 size={12} />
          {parado === 0 ? "hoje" : `há ${parado}d`}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm">
        <span className="font-semibold text-foreground">{linha.compradorNome ?? "Comprador não informado"}</span>
        {linha.total && (
          <span className="font-semibold tabular-nums" style={{ color: "var(--success)" }}>
            {moeda.format(Number(linha.total))}
          </span>
        )}
        {/* "pedido de 05/06" era ambíguo ao lado de "hoje"/"há 3d", que fala
            do tempo na fila: davam a impressão de ser a mesma data medida de
            dois jeitos. O rótulo agora nomeia o que a data é. */}
        <span className="text-[11px] text-muted-foreground">Pedido criado em {dataCurta(linha.pedidoEm)}</span>
      </div>

      {linha.skus.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {linha.skus.map((sku) => (
            <span key={sku} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{sku}</span>
          ))}
        </div>
      )}

      {/* Sempre visível, nunca atrás de "Ver detalhes": quem abre esta tela
          está justamente perguntando por que o pedido não entrou. Escondê-lo
          num acordeão faria a resposta custar um clique por linha. */}
      <div
        className="mt-2.5 rounded-lg border-l-2 py-0.5 pl-2.5"
        style={{ borderColor: `color-mix(in srgb, ${tom.cor} 55%, transparent)` }}
      >
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          <span className="font-bold text-foreground">Por que este pedido ficou de fora: </span>
          {diagnostico.motivo}
        </p>

        {/* Passos próprios só quando o pedido foge do roteiro da etapa —
            cancelado no canal, já descartado, teimando na terceira tentativa.
            Nesses casos seguir a instrução do topo seria trabalho perdido, e
            o aviso precisa estar onde a pessoa está olhando. */}
        {passosProprios && (
          <>
            <p className="mt-2 text-[11.5px] font-bold" style={{ color: tom.cor }}>
              Este pedido pede outra coisa:
            </p>
            <ol className="mt-1 grid list-decimal gap-1 pl-4 marker:font-bold marker:text-muted-foreground">
              {passosProprios.map((passo, indice) => (
                <li key={indice} className="pl-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{passo}</li>
              ))}
            </ol>
          </>
        )}
      </div>

      <DetalhePedido linha={linha} aberto={detalheAberto} id={idDetalhe} />

      {/* A barra de acoes existe sempre: mesmo sem reprocessar nem descartar,
          "Ver detalhes" e uma acao — antes a linha podia terminar sem nenhum
          jeito de saber mais sobre o pedido. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {/* Sem botão de reprocessar em `payload_invalido`: a falha é
            determinística — mesmo payload, mesmo validador, mesmo erro.
            Oferecer o botão ali só gasta o tempo de quem clica. */}
        {linha.reprocessavel && !fechado && (
          <button
            type="button"
            onClick={reprocessar}
            disabled={pendente}
            title="Tenta importar este pedido de novo, agora. Quando a foto guardada está velha, o CRM rebusca o pedido no canal antes. Não duplica nada: se ele já tiver entrado, a pendência só é encerrada."
            className="press-feedback inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {pendente ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
            Tentar novamente
          </button>
        )}
        {podeDescartar && (
          <button
            type="button"
            onClick={() => descartar(fechado)}
            disabled={pendente}
            title={fechado
              ? "Devolve a pendência para a fila: ela volta a contar nos números do topo e a pedir ação."
              : "Tira da fila sem apagar nada: o pedido continua no histórico e dá para devolvê-lo depois. Use quando não há mais o que fazer — anúncio excluído, pedido cancelado."}
            className="press-feedback inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {fechado ? <Undo2 size={12} /> : <CircleSlash size={12} />}
            {fechado ? "Devolver à fila" : "Não recuperável"}
          </button>
        )}

        {/* Empurrado para a direita no desktop (ml-auto) e primeiro da
            proxima linha no celular: e leitura, nao decisao — nao deve
            disputar a atencao com "Tentar novamente". */}
        <button
          type="button"
          onClick={() => setDetalheAberto((atual) => !atual)}
          aria-expanded={detalheAberto}
          aria-controls={idDetalhe}
          /* Cinza-claro fazia o rótulo parecer legenda, não botão: já estava
             em font-bold, mas com a cor apagada o negrito não aparecia. Com
             a cor do texto normal o peso finalmente se lê. */
          className="press-feedback inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-foreground transition-colors hover:bg-muted sm:ml-auto"
        >
          <motion.span
            aria-hidden="true"
            className="inline-flex"
            animate={{ rotate: detalheAberto ? 180 : 0 }}
            transition={reduzir ? { duration: 0 } : springs.settleFast}
          >
            <ChevronDown size={12} />
          </motion.span>
          {detalheAberto ? "Ocultar detalhes" : "Ver detalhes"}
        </button>
      </div>
    </motion.li>
  );
}

function brandColor(slug: string): string {
  return getBrandConfig(slug)?.color ?? "var(--muted-foreground)";
}

function canalLabel(canal: string): string {
  const items = channelsConfig.items as Record<string, { label?: string }>;
  return items[canal]?.label ?? nomeCanal(canal);
}

/* ── Escopo: empresa e canal ──────────────────────────────────────────────
   As opções saem da PRÓPRIA fila, não do cadastro de marcas e canais. Numa
   tela de trabalho, oferecer "KARZI" quando a KARZI não tem pendência
   nenhuma é oferecer um clique que só sabe esvaziar a tela — e a contagem
   dentro de cada pílula já responde, antes do clique, onde está o problema.

   Diferente das telas de medição (Vendas, Estoque, Métricas), aqui empresa
   sem canal NÃO apaga o conteúdo: a regra de `empresaSemCanalEscolhido`
   existe porque somar faturamento ou saldo entre canais mistura réguas. Esta
   fila não mede nada — ela lista trabalho pendente, e "tudo da WUWU" é um
   recorte legítimo de trabalho. */
function PilulaEscopo({ ativo, cor, contagem, titulo, onClick, children }: {
  ativo: boolean;
  cor: string;
  contagem: number;
  titulo: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const reduzir = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={titulo}
      whileHover={reduzir ? undefined : { y: -2, scale: 1.03 }}
      whileTap={reduzir ? undefined : { scale: 0.94 }}
      className={`relative inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 transition-colors ${
        ativo ? "border-2 bg-card" : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={ativo ? { borderColor: cor } : undefined}
    >
      {children}
      <span
        className="rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums"
        style={{ background: `color-mix(in srgb, ${cor} 14%, transparent)`, color: cor }}
      >
        {contagem}
      </span>
    </motion.button>
  );
}

function BarraEscopo({ marcas, canais, marcasSel, canaisSel, alternarMarca, alternarCanal, limpar }: {
  marcas: { slug: string; nome: string; total: number }[];
  canais: { tipo: string; total: number }[];
  marcasSel: string[];
  canaisSel: string[];
  alternarMarca: (slug: string) => void;
  alternarCanal: (tipo: string) => void;
  limpar: () => void;
}) {
  const filtrando = marcasSel.length > 0 || canaisSel.length > 0;
  /* Uma pílula sozinha não é escolha: com uma empresa só na fila, a barra
     inteira vira enfeite que rouba altura da tela. */
  const mostrarMarcas = marcas.length > 1;
  const mostrarCanais = canais.length > 1;
  if (!mostrarMarcas && !mostrarCanais) return null;

  return (
    <motion.div
      variants={fadeUp}
      className="mb-4 flex flex-wrap items-center gap-2 rounded-[1.25rem] border border-border bg-card/70 p-2.5"
    >
      {mostrarMarcas && marcas.map((marca) => (
        <PilulaEscopo
          key={marca.slug}
          ativo={marcasSel.includes(marca.slug)}
          cor={brandColor(marca.slug)}
          contagem={marca.total}
          titulo={`${marca.nome} — ${pedidosLabel(marca.total)} na fila`}
          onClick={() => alternarMarca(marca.slug)}
        >
          {isBrandSlug(marca.slug)
            ? <BrandLogo brand={marca.slug} height={15} />
            : <span className="text-xs font-semibold text-foreground">{marca.nome}</span>}
        </PilulaEscopo>
      ))}

      {mostrarMarcas && mostrarCanais && (
        <span aria-hidden="true" className="mx-0.5 h-7 w-px bg-border" />
      )}

      {mostrarCanais && canais.map((canal) => (
        <PilulaEscopo
          key={canal.tipo}
          ativo={canaisSel.includes(canal.tipo)}
          cor={channelAccent(canal.tipo)}
          contagem={canal.total}
          titulo={`${canalLabel(canal.tipo)} — ${pedidosLabel(canal.total)} na fila`}
          onClick={() => alternarCanal(canal.tipo)}
        >
          <ChannelLogo canal={canal.tipo} size="sm" variant="logo" />
        </PilulaEscopo>
      ))}

      <AnimatePresence initial={false}>
        {filtrando && (
          <motion.button
            key="limpar"
            type="button"
            onClick={limpar}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={springs.settleFast}
            className="press-feedback ml-auto inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted"
          >
            <X size={13} /> Limpar filtro
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Título curto da etapa — é o que a trilha repete dezenas de vezes, então
 *  precisa caber numa linha e ainda dizer de que conserto se trata. */
function tituloTarefa(tarefa: Tarefa): string {
  const causa = causaDe(tarefa.causa);
  if (!tarefa.alvo) return causa.rotulo;
  if (tarefa.causa === "sku_sem_produto") return tarefa.alvo;
  if (tarefa.causa === "cliente_duplicado") return `Cadastro de ${tarefa.alvo}`;
  if (tarefa.causa === "payload_invalido") return `Campo "${tarefa.alvo}"`;
  return tarefa.alvo;
}

/** A trilha: o roteiro inteiro, visível de uma vez.
 *
 *  Um wizard que só mostra a etapa atual esconde o tamanho do trabalho, e o
 *  tamanho do trabalho é justamente o que decide se a pessoa começa agora ou
 *  deixa para depois. Cada item diz quantos pedidos e quanto dinheiro estão
 *  presos naquele conserto, e o marcador verde vai fechando o roteiro. */
function Trilha({ tarefas, atual, aoEscolher }: {
  tarefas: Tarefa[];
  atual: number;
  aoEscolher: (indice: number) => void;
}) {
  const reduzir = useReducedMotion();

  return (
    <ol className="flex flex-col gap-1">
      {tarefas.map((tarefa, indice) => {
        const causa = causaDe(tarefa.causa);
        const tom = TONS[causa.tom];
        const ativa = indice === atual;
        const Icone = causa.icone;
        return (
          <li key={tarefa.id}>
            <button
              type="button"
              onClick={() => aoEscolher(indice)}
              aria-current={ativa ? "step" : undefined}
              className="press-feedback relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
            >
              {/* O realce viaja de uma etapa para a outra em vez de piscar no
                  lugar novo: é o que mostra que se trocou de etapa dentro do
                  mesmo roteiro, e não que a tela inteira mudou. */}
              {ativa && (
                <motion.span
                  layoutId="etapa-ativa"
                  aria-hidden="true"
                  className="absolute inset-0 rounded-xl border"
                  style={{
                    borderColor: `color-mix(in srgb, ${tom.cor} 40%, transparent)`,
                    background: `color-mix(in srgb, ${tom.cor} 8%, var(--card))`,
                  }}
                  transition={reduzir ? { duration: 0 } : springs.settleFast}
                />
              )}
              <span
                className="relative grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums"
                style={{
                  background: tarefa.concluida
                    ? "color-mix(in srgb, var(--success) 16%, transparent)"
                    : `color-mix(in srgb, ${tom.cor} 14%, transparent)`,
                  color: tarefa.concluida ? "var(--success)" : tom.cor,
                }}
              >
                {tarefa.concluida ? <Check size={13} /> : indice + 1}
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <Icone size={12} style={{ color: tom.cor }} className="shrink-0" />
                  <span className={`truncate font-mono text-[12px] font-bold ${tarefa.concluida ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {tituloTarefa(tarefa)}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] tabular-nums text-muted-foreground">
                  {/* "fora da fila" e não "resolvida": no histórico completo
                      esta etapa pode estar fechada porque alguém a descartou,
                      que é o oposto de resolver. */}
                  {tarefa.concluida
                    ? "fora da fila"
                    : `${pedidosLabel(tarefa.abertas.length)} · ${moeda.format(tarefa.valorParado)}`}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** A etapa aberta: o conserto explicado uma vez, e os pedidos que ele
 *  destrava logo abaixo. */
function PainelTarefa({ tarefa, indice, total, podeDescartar, aoNavegar }: {
  tarefa: Tarefa;
  indice: number;
  total: number;
  podeDescartar: boolean;
  aoNavegar: (direcao: 1 | -1) => void;
}) {
  const router = useRouter();
  const reduzir = useReducedMotion();
  const causa = causaDe(tarefa.causa);
  const tom = TONS[causa.tom];
  const Icone = causa.icone;
  const [emLote, iniciarLote] = useTransition();
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  /* Lista longa começa fechada: com dezessete cartões abertos, os passos que
     acabaram de ser lidos saem da tela e a etapa vira de novo a parede de
     texto que ela veio substituir. Até seis, abre — não vale um clique. */
  const [pedidosAbertos, setPedidosAbertos] = useState(tarefa.linhas.length <= 6);

  const ids = tarefa.abertas.filter((linha) => linha.reprocessavel).map((linha) => linha.id);

  function tentarTarefa() {
    iniciarLote(async () => {
      try {
        const { tentados, resolvidos, restantes } = await actionReprocessarPedidosIgnorados(ids);
        if (resolvidos > 0) toast.success(`${resolvidos} de ${tentados} entraram no CRM.`);
        else toast.error(`Nenhum dos ${tentados} entrou — o motivo de cada um foi atualizado abaixo.`);
        if (restantes > 0) toast.info(`Faltam ${restantes} nesta etapa. Clique de novo para continuar.`);
      } catch {
        toast.error("Não foi possível tentar esta etapa agora.");
      }
      router.refresh();
    });
  }

  function descartarTarefa() {
    iniciarLote(async () => {
      for (const linha of tarefa.abertas) {
        await actionDescartarPedidoIgnorado(linha.id, false);
      }
      toast.success(`${pedidosLabel(tarefa.abertas.length)} fora da fila. Nada foi apagado.`);
      setConfirmandoDescarte(false);
      router.refresh();
    });
  }

  return (
    <motion.section
      key={tarefa.id}
      initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduzir ? { opacity: 0 } : { opacity: 0, y: -10 }}
      transition={reduzir ? { duration: 0 } : springs.settleFast}
      className="min-w-0"
      aria-label={`Etapa ${indice + 1} de ${total}: ${tituloTarefa(tarefa)}`}
    >
      <div
        className="rounded-[1.25rem] border p-4 sm:p-5"
        style={{
          borderColor: `color-mix(in srgb, ${tom.cor} 22%, transparent)`,
          background: `color-mix(in srgb, ${tom.cor} 5%, var(--card))`,
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full"
            style={{ background: `color-mix(in srgb, ${tom.cor} 14%, transparent)`, color: tom.cor }}
          >
            <Icone size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Etapa {indice + 1} de {total} · {causa.rotulo}
            </p>
            <h2 className="truncate font-mono text-base font-bold text-foreground">{tituloTarefa(tarefa)}</h2>
          </div>
          <span
            className="ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ borderColor: `color-mix(in srgb, ${tom.cor} 30%, transparent)`, color: tom.cor }}
            title={tom.explicacao}
          >
            {tom.etiqueta}
          </span>
        </div>

        {/* Os três números que decidem se esta etapa vale a próxima meia hora:
            quantos pedidos, quanto dinheiro, e há quanto tempo estão parados. */}
        <dl className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border/60 py-2.5">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-[11px] text-muted-foreground">Pedidos presos</dt>
            <dd className="text-sm font-bold tabular-nums text-foreground">{tarefa.abertas.length}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-[11px] text-muted-foreground">Fora do faturamento</dt>
            <dd className="text-sm font-bold tabular-nums" style={{ color: "var(--success)" }}>
              {moeda.format(tarefa.valorParado)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-[11px] text-muted-foreground">Parados há</dt>
            <dd
              className="text-sm font-bold tabular-nums"
              style={{ color: tarefa.diasParado >= 7 ? "var(--destructive)" : "var(--foreground)" }}
            >
              {tarefa.diasParado === 0 ? "menos de 1 dia" : `${tarefa.diasParado} ${tarefa.diasParado === 1 ? "dia" : "dias"}`}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-[11px] text-muted-foreground">Onde</dt>
            <dd className="flex items-center gap-1.5">
              <ChannelLogo canal={tarefa.canal} size="sm" variant="logo" />
              {isBrandSlug(tarefa.marcaSlug)
                ? <BrandLogo brand={tarefa.marcaSlug} height={13} />
                : <span className="text-xs font-semibold text-foreground">{tarefa.marca}</span>}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-bold text-foreground">O que aconteceu: </span>
          {causa.resumo}
        </p>

        {/* O passo a passo em tamanho de leitura, uma vez por conserto. É o
            centro da tela: tudo o mais aqui existe para explicar de que
            pedidos ele está falando. */}
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: tom.cor }}>
            <ListChecks size={14} /> Como resolver, passo a passo
          </p>
          <motion.ol
            variants={stagger}
            initial="hidden"
            animate="show"
            className="mt-2 grid gap-2"
          >
            {tarefa.diagnostico.passos.map((passo, i) => (
              <motion.li key={i} variants={fadeUp} className="flex gap-2.5">
                <span
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums"
                  style={{ background: `color-mix(in srgb, ${tom.cor} 14%, transparent)`, color: tom.cor }}
                >
                  {i + 1}
                </span>
                <span className="text-[13px] leading-relaxed text-foreground/85">{passo}</span>
              </motion.li>
            ))}
          </motion.ol>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {ids.length > 0 && (
            <button
              type="button"
              onClick={tentarTarefa}
              disabled={emLote}
              title="Tenta de uma vez todos os pedidos desta etapa. Nada é descartado: o que não entrar continua na lista, com o motivo atualizado."
              className="press-feedback inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: tom.cor }}
            >
              {emLote ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
              {emLote ? "Tentando…" : `Tentar ${ids.length === 1 ? "este pedido" : `os ${ids.length} pedidos`}`}
            </button>
          )}

          {/* Descarte em massa em dois cliques. Um clique só, com dezessete
              pedidos atrás, é o tipo de botão que se aperta sem querer — e
              embora nada seja apagado, refazer é dezessete cliques. */}
          {podeDescartar && tarefa.abertas.length > 0 && (
            confirmandoDescarte ? (
              <span className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={descartarTarefa}
                  disabled={emLote}
                  className="press-feedback inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-bold transition-colors disabled:opacity-60"
                  style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}
                >
                  {emLote ? <Loader2 size={13} className="animate-spin" /> : <CircleSlash size={13} />}
                  Confirmar: tirar {tarefa.abertas.length} da fila
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoDescarte(false)}
                  className="press-feedback inline-flex h-10 items-center rounded-xl px-3 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted"
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoDescarte(true)}
                title="Para quando não há mais o que fazer — anúncio excluído, venda cancelada. Os pedidos saem da fila e continuam guardados no histórico."
                className="press-feedback inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted"
              >
                <CircleSlash size={13} />
                Nenhum destes é recuperável
              </button>
            )
          )}
        </div>
      </div>

      {/* Os pedidos da etapa. Depois do conserto, não antes: a pergunta que
          eles respondem ("quais são?") só faz sentido quando já se sabe o que
          fazer com eles. */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setPedidosAbertos((atual) => !atual)}
          aria-expanded={pedidosAbertos}
          className="press-feedback mb-2 inline-flex items-center gap-1.5 rounded-lg py-1 text-[12px] font-bold text-foreground"
        >
          <motion.span
            aria-hidden="true"
            className="inline-flex"
            animate={{ rotate: pedidosAbertos ? 180 : 0 }}
            transition={reduzir ? { duration: 0 } : springs.settleFast}
          >
            <ChevronDown size={13} />
          </motion.span>
          {pedidosAbertos ? "Ocultar" : "Ver"} {pedidosLabel(tarefa.linhas.length)} desta etapa
        </button>

        <AnimatePresence initial={false}>
          {pedidosAbertos && (
            <motion.ul
              layout
              variants={stagger}
              initial="hidden"
              animate="show"
              exit={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }}
              className="flex flex-col gap-1.5 overflow-hidden"
            >
              {tarefa.linhas.map((linha) => (
                <CartaoPedido
                  key={linha.id}
                  linha={linha}
                  podeDescartar={podeDescartar}
                  passosDaEtapa={tarefa.diagnostico.passos}
                />
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      {/* Navegação embaixo também: depois de ler seis passos e olhar dezessete
          pedidos, obrigar a subir até o topo para ir à próxima etapa é o tipo
          de atrito que faz a pessoa fechar a tela no meio do roteiro. */}
      <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => aoNavegar(-1)}
          disabled={indice === 0}
          className="press-feedback inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          <ArrowLeft size={14} /> Etapa anterior
        </button>
        <button
          type="button"
          onClick={() => aoNavegar(1)}
          disabled={indice === total - 1}
          className="press-feedback inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          Próxima etapa <ArrowRight size={14} />
        </button>
      </div>
    </motion.section>
  );
}

export function PedidosIgnoradosLista({ linhas, podeDescartar, incluirFechados }: {
  linhas: PedidoIgnoradoLinha[];
  podeDescartar: boolean;
  incluirFechados: boolean;
}) {
  // A lista vem direto das props, sem cópia em estado local.
  //
  // A primeira versão guardava `useState(linhasIniciais)` e removia a linha
  // na mão depois de cada ação. Dois defeitos: `useState` ignora props novas,
  // então o `revalidatePath` da action recarregava o servidor e a tela
  // continuava mostrando a lista velha; e a remoção era feita mesmo quando o
  // reprocessamento FALHAVA — a pendência sumia da tela sem ter saído da
  // fila, reaparecendo no próximo carregamento. Agora quem manda é o
  // servidor, e `router.refresh()` traz o estado real depois de cada ação.
  const [etapa, setEtapa] = useState(0);

  /* ── Escopo escolhido ───────────────────────────────────────────────────
     Filtra no cliente, sobre as linhas que já vieram: a fila é curta por
     natureza (dezenas, não milhares) e o payload inteiro já está na mão.
     Ida ao servidor a cada clique de pílula só acrescentaria espera. */
  const [marcasSel, setMarcasSel] = useState<string[]>([]);
  const [canaisSel, setCanaisSel] = useState<string[]>([]);

  const marcasDaFila = useMemo(() => {
    const porSlug = new Map<string, { slug: string; nome: string; total: number }>();
    for (const linha of linhas) {
      const atual = porSlug.get(linha.marcaSlug);
      if (atual) atual.total += 1;
      else porSlug.set(linha.marcaSlug, { slug: linha.marcaSlug, nome: linha.marca, total: 1 });
    }
    return [...porSlug.values()].sort(compararPorOrdemDeMarca);
  }, [linhas]);

  const canaisDaFila = useMemo(() => {
    const porTipo = new Map<string, { tipo: string; total: number }>();
    for (const linha of linhas) {
      const atual = porTipo.get(linha.canal);
      if (atual) atual.total += 1;
      else porTipo.set(linha.canal, { tipo: linha.canal, total: 1 });
    }
    return [...porTipo.values()].sort((a, b) => b.total - a.total);
  }, [linhas]);

  const linhasNoEscopo = useMemo(() => linhas.filter((linha) =>
    (marcasSel.length === 0 || marcasSel.includes(linha.marcaSlug))
    && (canaisSel.length === 0 || canaisSel.includes(linha.canal))), [linhas, marcasSel, canaisSel]);

  const filtrando = marcasSel.length > 0 || canaisSel.length > 0;

  /* Trocar o escopo troca o roteiro inteiro: a etapa 5 do recorte anterior
     não é a etapa 5 deste. Voltar ao começo é o único comportamento que não
     deixa a pessoa numa etapa que ela não escolheu. */
  const alternarMarca = useCallback((slug: string) => {
    setEtapa(0);
    setMarcasSel((atual) => atual.includes(slug) ? atual.filter((s) => s !== slug) : [...atual, slug]);
  }, []);
  const alternarCanal = useCallback((tipo: string) => {
    setEtapa(0);
    setCanaisSel((atual) => atual.includes(tipo) ? atual.filter((t) => t !== tipo) : [...atual, tipo]);
  }, []);
  const limparEscopo = useCallback(() => {
    setEtapa(0);
    setMarcasSel([]);
    setCanaisSel([]);
  }, []);


  const abertas = linhasNoEscopo.filter((linha) => linha.descartadoEm === null);
  const valorParado = abertas.reduce((soma, linha) => soma + Number(linha.total ?? 0), 0);
  const maisAntiga = abertas.reduce<number>(
    (maior, linha) => Math.max(maior, diasParado(linha.primeiraVezEm)),
    0,
  );

  const tarefas = useMemo(() => agruparEmTarefas(linhasNoEscopo), [linhasNoEscopo]);
  /* A fila muda embaixo dos pés: um reprocesso que dá certo apaga a etapa
     inteira e o índice guardado passaria a apontar para o vazio. */
  const atual = Math.min(etapa, Math.max(tarefas.length - 1, 0));

  const navegar = useCallback((direcao: 1 | -1) => {
    setEtapa((indice) => Math.min(Math.max(indice + direcao, 0), tarefas.length - 1));
  }, [tarefas.length]);

  /* Setas do teclado percorrem o roteiro. Um roteiro de oito etapas lido no
     desktop é exatamente o caso em que a mão já está no teclado — e o atalho
     não atrapalha quem digita, porque sai de cena dentro de campo de texto. */
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      const alvo = evento.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      if (evento.key === "ArrowRight") navegar(1);
      if (evento.key === "ArrowLeft") navegar(-1);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [navegar]);

  const router = useRouter();
  const [tentandoTodos, iniciarFila] = useTransition();
  const reprocessaveis = abertas.filter((linha) => linha.reprocessavel).length;
  const resolvidas = tarefas.filter((tarefa) => tarefa.concluida).length;

  /* ── Tentar a fila inteira ────────────────────────────────────────────
     Continua existindo ao lado do roteiro, e não no lugar dele: quando a
     correção que destravou a fila é a mesma para todo mundo — foi o caso das
     40 pendências de agosto/2026 —, ler oito etapas para clicar oito vezes é
     cerimônia. O servidor tenta em fatias e devolve quantas sobraram. */
  function tentarTodos() {
    iniciarFila(async () => {
      try {
        /* Com filtro ligado, o botão só pode agir sobre o que está na tela:
           dizer "tentar todos (12)" e sair reprocessando os 43 seria mentir
           sobre o alcance do clique — e gastar chamada de API com pedidos
           que a pessoa acabou de tirar de vista. */
        const { tentados, resolvidos, restantes } = filtrando
          ? await actionReprocessarPedidosIgnorados(abertas.filter((linha) => linha.reprocessavel).map((linha) => linha.id))
          : await actionReprocessarFilaAberta();
        if (resolvidos > 0) toast.success(`${resolvidos} de ${tentados} entraram no CRM.`);
        else toast.error(`Nenhum dos ${tentados} entrou — o motivo de cada um foi atualizado abaixo.`);
        if (restantes > 0) toast.info(`Faltam ${restantes} na fila. Clique de novo para continuar.`);
      } catch {
        toast.error("Não foi possível tentar a fila agora.");
      }
      router.refresh();
    });
  }

  return (
    /* Largura cheia, não a coluna estreita de leitura: aqui a tela é uma
       bancada de trabalho — roteiro à esquerda, conserto à direita — e não um
       texto corrido. Com `max-w-4xl` a trilha não cabia ao lado do painel e o
       roteiro inteiro ficava escondido atrás de rolagem. */
    <div className="mx-auto w-full max-w-[110rem] px-4 py-6 sm:px-6">
      {/* Esta tela se chega por um link dentro de /vendas e não tem entrada
          no menu — sem a volta, a única saída era o botão do navegador ou
          reentrar por Vendas no topo. Mesmo padrão das telas de Publicidade. */}
      <Link
        href="/vendas"
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={13} /> Voltar para Vendas
      </Link>
      <PageHeader
        title="Pedidos ignorados"
        description="Vendas que aconteceram no canal mas não entraram no CRM — elas não contam em Vendas nem em Métricas enquanto estiverem aqui. A fila vira um roteiro: cada etapa é um conserto, com o passo a passo uma vez só e os pedidos que ele destrava logo abaixo."
        actions={
          <>
            {reprocessaveis > 1 && !incluirFechados && (
              <button
                type="button"
                onClick={tentarTodos}
                disabled={tentandoTodos}
                title="Tenta a fila inteira de uma vez, da pendência mais antiga para a mais nova, em fatias de 20. Nada é descartado: o que não entrar continua na lista, com o motivo atualizado."
                className="press-feedback inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                {tentandoTodos
                  ? <><Loader2 size={13} className="animate-spin" /> Tentando…</>
                  : <><RotateCw size={13} /> {filtrando ? "Tentar os do filtro" : "Tentar todos"} ({reprocessaveis})</>}
              </button>
            )}
            <a
              href={incluirFechados ? "/vendas/pedidos-ignorados" : "/vendas/pedidos-ignorados?historico=1"}
              className="press-feedback inline-flex h-10 items-center rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted"
            >
              {incluirFechados ? "Ver só a fila aberta" : "Ver histórico completo"}
            </a>
          </>
        }
      />

      {linhas.length === 0 ? (
        <EmptyState
          title="Nenhum pedido ficou de fora"
          description="Tudo que os canais entregaram foi importado. Esta tela só ganha conteúdo quando alguma importação falha — e ela some sozinha quando a causa deixa de existir."
          illustration="filaLimpa"
        />
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show">
          {/* Painel de situação: os dois números que dizem se isto é urgente
              (dinheiro parado, dias parado) e o tamanho real do trabalho —
              que é a contagem de ETAPAS, não a de pedidos. Ver a diferença
              entre "43 pedidos" e "8 consertos" é o que faz a fila deixar de
              parecer intransponível. */}
          {/* A barra fica FORA do teste de vazio: sem ela, um filtro que não
              casa com nada esconderia o próprio botão de desfazê-lo. */}
          <BarraEscopo
            marcas={marcasDaFila}
            canais={canaisDaFila}
            marcasSel={marcasSel}
            canaisSel={canaisSel}
            alternarMarca={alternarMarca}
            alternarCanal={alternarCanal}
            limpar={limparEscopo}
          />

          <motion.section
            variants={fadeUp}
            className="mb-5 grid gap-3 rounded-[1.25rem] border border-border bg-card p-4 sm:grid-cols-3 sm:items-center"
          >
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--success) 12%, transparent)", color: "var(--success)" }}>
                <Wallet size={17} />
              </span>
              <div>
                <p className="text-[11px] text-muted-foreground">Fora do faturamento</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: "var(--success)" }}>{moeda.format(valorParado)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--info) 12%, transparent)", color: "var(--info)" }}>
                <ListChecks size={17} />
              </span>
              <div>
                <p className="text-[11px] text-muted-foreground">O trabalho de verdade</p>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {tarefas.length} {tarefas.length === 1 ? "conserto" : "consertos"}
                  <span className="ml-1.5 text-[12px] font-semibold text-muted-foreground">
                    para {pedidosLabel(abertas.length)}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${maisAntiga >= 7 ? "var(--destructive)" : "var(--muted-foreground)"} 12%, transparent)`,
                  color: maisAntiga >= 7 ? "var(--destructive)" : "var(--muted-foreground)",
                }}
              >
                <Clock3 size={17} />
              </span>
              <div>
                <p className="text-[11px] text-muted-foreground">O mais antigo espera há</p>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {maisAntiga === 0 ? "menos de 1 dia" : `${maisAntiga} ${maisAntiga === 1 ? "dia" : "dias"}`}
                </p>
              </div>
            </div>
          </motion.section>

          {linhasNoEscopo.length === 0 && (
            <motion.div variants={fadeUp}>
              <EmptyState
                title="Nada na fila com esse filtro"
                description="A fila não está vazia — este recorte de empresa e canal é que não tem pendência nenhuma. Limpe o filtro para ver o resto."
                illustration="slowMoving"
              />
            </motion.div>
          )}

          {/* Duas colunas de verdade no desktop: o roteiro fica à vista
              enquanto se trabalha numa etapa, que é o que permite saber
              quanto falta sem perder o lugar. No celular a trilha vira a
              lista de cima, e o painel desce inteiro embaixo. */}
          <div className={`grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] ${linhasNoEscopo.length === 0 ? "hidden" : ""}`}>
            <motion.aside variants={fadeUp} className="lg:sticky lg:top-4 lg:self-start">
              <div className="rounded-[1.25rem] border border-border bg-card p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Roteiro</p>
                  <p className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {resolvidas} de {tarefas.length}
                  </p>
                </div>
                {/* Barra de progresso do roteiro: cresce sozinha conforme as
                    etapas fecham. É o único lugar da tela onde "quanto já
                    andei" aparece como forma, e não como número. */}
                <div className="mx-1 mb-3 h-1 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "var(--success)" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${tarefas.length === 0 ? 0 : (resolvidas / tarefas.length) * 100}%` }}
                    transition={springs.settleFast}
                  />
                </div>
                <Trilha tarefas={tarefas} atual={atual} aoEscolher={setEtapa} />
                <p className="mt-2 px-1 text-[10.5px] leading-relaxed text-muted-foreground">
                  Use as setas ← → do teclado para andar pelo roteiro.
                </p>
              </div>
            </motion.aside>

            <motion.div variants={fadeUp} className="min-w-0">
              {/* `mode="wait"` para a etapa que sai terminar antes de a nova
                  entrar: com as duas na tela ao mesmo tempo, o passo a passo
                  de uma se misturava com o da outra por um instante — e é
                  justamente esse texto que a pessoa está lendo. */}
              <AnimatePresence mode="wait" initial={false}>
                {tarefas[atual] && (
                  <PainelTarefa
                    key={tarefas[atual].id}
                    tarefa={tarefas[atual]}
                    indice={atual}
                    total={tarefas.length}
                    podeDescartar={podeDescartar}
                    aoNavegar={navegar}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
