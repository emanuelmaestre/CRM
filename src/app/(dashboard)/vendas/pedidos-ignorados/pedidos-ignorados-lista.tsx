"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, ChevronDown, CircleSlash, Clock3, Loader2, RotateCw, Undo2,
  PackageSearch, UserRoundX, Bug, HelpCircle, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { isBrandSlug } from "@/shared/config/brands";
import { moeda } from "@/shared/design-system/format";
import { springs, stagger, fadeUp } from "@/shared/design-system/motion-variants";
import { mapearStatusPedido } from "@/modules/canais/domain/order-status";
import pagesConfig from "@/config/pages.json";
import type { ItemPedidoIgnorado, PedidoIgnoradoLinha } from "@/modules/vendas/application/pedidos-ignorados.service";
import { actionDescartarPedidoIgnorado, actionReprocessarPedidoIgnorado } from "./actions";

/* ── Por que esta tela é agrupada por causa ────────────────────────────
   A versão anterior era uma lista plana em que cada cartão repetia, por
   extenso, a explicação da sua causa. Com trinta pendências de SKU sem
   produto, o mesmo parágrafo aparecia trinta vezes e a informação que
   diferencia uma linha da outra (qual pedido, de quem, há quanto tempo)
   ficava espremida entre repetições.

   Agrupar inverte isso: a explicação aparece UMA vez, no topo do grupo, com
   espaço para ser didática de verdade; as linhas embaixo ficam curtas e
   comparáveis entre si. É o mesmo conteúdo ocupando menos tela e dizendo
   mais — e o número de blocos de texto passa a crescer com o número de
   CAUSAS (no máximo quatro), não com o número de pedidos. */

type Tom = "voce" | "sozinho" | "nosso" | "neutro";

/** Onde a pendência se resolve — o eixo que realmente muda o que a pessoa
 *  faz depois de ler. Sem isso, as quatro causas parecem a mesma coisa:
 *  "deu erro". Com isso, a fila se divide em "eu preciso agir", "vai sair
 *  sozinho" e "não adianta insistir". */
const TONS: Record<Tom, { etiqueta: string; cor: string }> = {
  voce:    { etiqueta: "Depende de você", cor: "var(--warning)" },
  sozinho: { etiqueta: "Sai sozinho",     cor: "var(--info)" },
  nosso:   { etiqueta: "É problema do CRM", cor: "var(--destructive)" },
  neutro:  { etiqueta: "Sem classificação", cor: "var(--muted-foreground)" },
};

const CAUSAS: Record<string, {
  rotulo: string;
  icone: LucideIcon;
  tom: Tom;
  aconteceu: string;
  fazer: string;
}> = {
  sku_sem_produto: {
    rotulo: "SKU sem produto",
    icone: PackageSearch,
    tom: "sozinho",
    aconteceu: "O pedido cita um SKU que ainda não existe como produto no CRM. Sem o produto, não há onde pendurar o item vendido, e o pedido inteiro fica de fora.",
    fazer: "Nada, na maioria das vezes: quando o catálogo do canal sincronizar e trouxer esse SKU, a pendência entra sozinha. Se o SKU não existe nem no canal, ele foi apagado ou renomeado lá — aí é corrigir no anúncio.",
  },
  cliente_duplicado: {
    rotulo: "Cliente duplicado",
    icone: UserRoundX,
    tom: "voce",
    aconteceu: "O comprador colidiu com um cadastro que já existe. Na Shopee isso é comum e não é erro seu: o telefone vem mascarado, então compradores diferentes chegam com o mesmo valor e disputam o mesmo cliente.",
    fazer: "Resolve-se aqui dentro, não na loja. Tentar novamente costuma bastar quando o cadastro conflitante já foi ajustado; se insistir, o caminho é separar os clientes antes de reprocessar.",
  },
  payload_invalido: {
    rotulo: "Formato inesperado",
    icone: Bug,
    tom: "nosso",
    aconteceu: "O canal devolveu o pedido num formato que o CRM não sabe ler. A falha está do nosso lado, não no seu cadastro nem no anúncio.",
    fazer: "Não há botão de tentar novamente de propósito: o mesmo pedido passaria pelo mesmo validador e daria exatamente o mesmo erro. Some quando o CRM aprender esse formato.",
  },
  desconhecida: {
    rotulo: "Não classificada",
    icone: HelpCircle,
    tom: "neutro",
    aconteceu: "A importação falhou por um motivo que ainda não tem classificação própria no CRM.",
    fazer: "Vale tentar novamente: falhas passageiras (rede, limite da API do canal) caem aqui e costumam passar na segunda tentativa.",
  },
};

/* Ordem dos grupos: pelo que a pessoa pode fazer, não pelo tamanho. O grupo
   que exige ação humana vem primeiro mesmo tendo duas linhas; o que se
   resolve sozinho vem depois mesmo tendo trinta. Ordenar por quantidade
   colocaria no topo justamente o bloco que não pede nada de ninguém. */
const ORDEM_CAUSAS = ["cliente_duplicado", "desconhecida", "sku_sem_produto", "payload_invalido"];

function causaDe(chave: string) {
  return CAUSAS[chave] ?? CAUSAS.desconhecida;
}

function diasParado(desde: Date): number {
  return Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 86_400_000));
}

function dataCurta(valor: string | Date | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? "—"
    : data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Uma linha da fila. Curta de propósito: tudo que ela NÃO precisa dizer
 *  (o que aconteceu, o que fazer) já foi dito uma vez no cabeçalho do grupo. */
function Pendencia({ linha, podeDescartar }: {
  linha: PedidoIgnoradoLinha;
  podeDescartar: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const reduzir = useReducedMotion();
  const fechado = linha.descartadoEm !== null;
  const parado = diasParado(linha.primeiraVezEm);

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
        <span className="font-mono text-sm font-bold tracking-tight text-foreground">{linha.providerOrderId}</span>
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
            className="press-feedback inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted sm:ml-auto"
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

const STATUS_LABELS: Record<string, string> = pagesConfig.pedidos.statusLabels;

/** O status vem cru do canal ("completed", "cancelled"). Traduz pelo MESMO
 *  mapa que o resto de Vendas usa — dois vocabularios para o mesmo pedido
 *  seria pior que nao mostrar. */
function rotuloStatus(statusCanal: string | null): string | null {
  if (!statusCanal) return null;
  return STATUS_LABELS[mapearStatusPedido(statusCanal)] ?? statusCanal;
}

/** Uma medida do detalhe. `tabular-nums` em tudo que e numero para as colunas
 *  alinharem verticalmente mesmo com larguras diferentes. */
function Medida({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
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
 *  mais — so nao estava sendo lido. Fica fechado por padrao porque a fila
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
              <Medida rotulo="Total" valor={dinheiro(linha.total)} />
              <Medida rotulo="Frete" valor={dinheiro(linha.frete)} />
              <Medida rotulo="Desconto" valor={dinheiro(linha.desconto)} />
              <Medida rotulo="Acrescimo" valor={dinheiro(linha.acrescimo)} />
              <Medida rotulo="Taxa do canal" valor={taxaTotal > 0 ? moeda.format(taxaTotal) : "—"} />
              <Medida
                rotulo="Repasse"
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
              <Medida rotulo="Comprador" valor={linha.compradorNome ?? "—"} />
              <Medida rotulo="Usuario no canal" valor={linha.compradorUsuario ?? "—"} />
              <Medida rotulo="Telefone" valor={linha.compradorTelefone ?? "—"} />
              <Medida rotulo="Tentativas" valor={String(linha.tentativas)} />
            </dl>

            {/* O motivo cru fecha o bloco: e o texto que o desenvolvedor le
                quando a causa classificada nao basta. */}
            <p className="mt-3 break-words border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Erro registrado:</span> {linha.motivo}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Um grupo = uma causa. O cabeçalho carrega a explicação inteira, e é o
 *  único lugar da tela onde ela aparece. */
function GrupoCausa({ chave, linhas, podeDescartar }: {
  chave: string;
  linhas: PedidoIgnoradoLinha[];
  podeDescartar: boolean;
}) {
  const causa = causaDe(chave);
  const tom = TONS[causa.tom];
  const Icone = causa.icone;
  const abertas = linhas.filter((l) => l.descartadoEm === null).length;

  return (
    <motion.section layout variants={fadeUp} className="mb-5">
      <div
        className="rounded-[1.1rem] border p-4"
        style={{
          borderColor: `color-mix(in srgb, ${tom.cor} 22%, transparent)`,
          background: `color-mix(in srgb, ${tom.cor} 5%, var(--card))`,
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full"
            style={{ background: `color-mix(in srgb, ${tom.cor} 14%, transparent)`, color: tom.cor }}
          >
            <Icone size={16} />
          </span>
          <h2 className="text-sm font-bold text-foreground">{causa.rotulo}</h2>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
            style={{ background: `color-mix(in srgb, ${tom.cor} 14%, transparent)`, color: tom.cor }}
          >
            {abertas} {abertas === 1 ? "pedido" : "pedidos"}
          </span>
          <span
            className="ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ borderColor: `color-mix(in srgb, ${tom.cor} 30%, transparent)`, color: tom.cor }}
          >
            {tom.etiqueta}
          </span>
        </div>

        {/* Rótulos explícitos em vez de um parágrafo corrido: a pessoa que já
            conhece a causa pula direto para "O que fazer" sem reler o
            diagnóstico. Dois rótulos é o limite — um terceiro (por que
            aconteceu, como evitar) transformaria a tela em manual. */}
        <dl className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Motivo</dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-foreground">{causa.aconteceu}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">O que fazer</dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-foreground">{causa.fazer}</dd>
          </div>
        </dl>
      </div>

      <motion.ul layout variants={stagger} initial="hidden" animate="show" className="mt-2 flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {linhas.map((linha) => (
            <Pendencia key={linha.id} linha={linha} podeDescartar={podeDescartar} />
          ))}
        </AnimatePresence>
      </motion.ul>
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
  const abertas = linhas.filter((linha) => linha.descartadoEm === null);
  const valorParado = abertas.reduce((soma, linha) => soma + Number(linha.total ?? 0), 0);
  const maisAntiga = abertas.reduce<number>(
    (maior, linha) => Math.max(maior, diasParado(linha.primeiraVezEm)),
    0,
  );

  const grupos = ORDEM_CAUSAS
    .map((chave) => ({ chave, linhas: linhas.filter((linha) => linha.causa === chave) }))
    .filter((grupo) => grupo.linhas.length > 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
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
        description="Pedidos que o canal entregou e o CRM não conseguiu importar. A fila se limpa sozinha na próxima sincronização quando a causa deixa de existir."
        actions={
          <a
            href={incluirFechados ? "/vendas/pedidos-ignorados" : "/vendas/pedidos-ignorados?historico=1"}
            className="press-feedback inline-flex h-10 items-center rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted"
          >
            {incluirFechados ? "Ver só a fila aberta" : "Ver histórico completo"}
          </a>
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
          {/* Uma linha de resumo, não uma grade de cards. O que importa aqui
              é quanto dinheiro está parado e há quanto tempo — dois números.
              Cards dariam a eles o mesmo peso visual dos grupos abaixo, que
              são o conteúdo de verdade desta tela. */}
          <motion.p variants={fadeUp} className="mb-4 text-xs font-semibold text-muted-foreground">
            {abertas.length} {abertas.length === 1 ? "pedido fora do CRM" : "pedidos fora do CRM"}
            {valorParado > 0 && <> · <span className="text-foreground">{moeda.format(valorParado)}</span> parados</>}
            {maisAntiga > 0 && <> · o mais antigo há {maisAntiga}d</>}
            {incluirFechados && ` · ${linhas.length - abertas.length} fechados`}
          </motion.p>

          <AnimatePresence initial={false}>
            {grupos.map((grupo) => (
              <GrupoCausa
                key={grupo.chave}
                chave={grupo.chave}
                linhas={grupo.linhas}
                podeDescartar={podeDescartar}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
