"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Crown } from "lucide-react";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { CalculoPopover, type CalculoItem } from "@/shared/design-system/primitives/CalculoPopover";
import { springs } from "@/shared/design-system/motion-variants";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import metricasConfig from "@/config/metricas.json";
import type { SaudeLojaResultado, SaudeMarca } from "@/modules/metricas/application/saude-loja.service";
import { BarraComLimite, Card, CardHead, NumeroAnimado } from "./metricas-primitives";
import { tint } from "@/shared/design-system/color";
import { inteiro, moeda, moedaCompacta } from "@/shared/design-system/format";
import { RefreshCw } from "lucide-react";
import type { PosVendaResultado } from "@/modules/metricas/application/pos-venda.service";

const copy = metricasConfig.comparacaoCard;
const ACENTO = "var(--acento-3)";
const dataHoraCard = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

type Criterio = "score" | "faturamento" | "pedidos" | "ticketMedio" | "notaMedia" | "cancelamento" | "recorrencia";

/** Cancelamento é o único critério onde "menor" vence — os outros ranqueiam
 *  do maior pro menor. Sem essa distinção, ordenar por Cancelamento colocaria
 *  a marca com MAIS cancelamento no topo, coroada "Líder". */
const CRITERIO_MENOR_VENCE: Partial<Record<Criterio, true>> = { cancelamento: true };

/** Valor bruto do critério — é o que ordena e o que dimensiona a barra. */
function valorDe(marca: SaudeMarca, criterio: Criterio): number | null {
  switch (criterio) {
    case "score": return marca.score;
    case "faturamento": return marca.faturamento;
    case "pedidos": return marca.pedidos;
    case "ticketMedio": return marca.ticketMedio;
    case "notaMedia": return marca.notaMedia;
    case "cancelamento": return marca.taxaCancelamento;
    case "recorrencia": return marca.taxaRecorrencia;
  }
}

/** Mesmo valor, escrito como a pessoa espera ver aquele indicador. */
function rotuloDe(marca: SaudeMarca, criterio: Criterio): string {
  switch (criterio) {
    case "score": return marca.score === null ? "Sem dado" : String(marca.score);
    case "faturamento": return marca.faturamentoLabel;
    case "pedidos": return String(marca.pedidos);
    case "ticketMedio": return marca.ticketMedioLabel;
    case "notaMedia": return marca.notaMedia === null ? "Sem avaliação" : `${marca.notaMedia.toFixed(1)} ★`;
    case "cancelamento": return marca.taxaCancelamento === null ? "Sem dado" : `${marca.taxaCancelamento}%`;
    case "recorrencia": return marca.taxaRecorrencia === null ? "Sem dado" : `${marca.taxaRecorrencia}%`;
  }
}

function corDaMarca(slug: string): string {
  return (isBrandSlug(slug) ? getBrandConfig(slug)?.color : undefined) ?? ACENTO;
}

/** Cor da barra/número quando o critério tem um "bom" e um "ruim" objetivos
 *  (Score, Nota média, Cancelamento) — aí a cor precisa significar isso
 *  (vermelho = alerta), diferente de Faturamento/Pedidos/Ticket/Recorrência,
 *  onde não existe um "ruim" absoluto e a cor é só a identidade da marca; uma
 *  marca com cor vermelha no topo do ranking de faturamento não deveria
 *  parecer um problema. Retorna `null` para esses casos — quem chama cai de
 *  volta pra cor da marca. */
function corDoIndicador(criterio: Criterio, valor: number | null): string | null {
  if (valor === null) return "var(--muted-foreground)";
  switch (criterio) {
    case "score":
      if (valor >= 80) return "var(--success)";
      if (valor >= 50) return "var(--warning)";
      return "var(--destructive)";
    case "notaMedia":
      if (valor >= 4.5) return "var(--success)";
      if (valor >= 3.5) return "var(--warning)";
      return "var(--destructive)";
    case "cancelamento":
      if (valor <= 2) return "var(--success)";
      if (valor <= 5) return "var(--warning)";
      return "var(--destructive)";
    default:
      return null;
  }
}

/* ── Tira de números ───────────────────────────────────────────
   Os outros indicadores continuam visíveis mesmo quando não são o
   critério de ordenação. É o que separa "comparar" de "olhar um
   ranking": trocar de critério não deveria esconder o resto. */

interface CampoCalculo {
  titulo: string;
  significado: string;
  formula: string;
  resultado: string;
  itens: CalculoItem[];
  nota: string;
}

interface CampoNumero {
  label: string;
  valor: string;
  alerta?: boolean;
  titulo?: string;
  calculo?: CampoCalculo | null;
  /** Quando presente, o número sobe animado até aqui em vez de aparecer
   *  pronto — `valor` continua servindo de rótulo estático (título, largura
   *  do reduced-motion, etc.), `formatarNumero` decide como mostrar cada
   *  quadro da animação. */
  valorNumerico?: number;
  formatarNumero?: (valorAnimado: number) => string;
}

/** Cada critério do seletor de cima (Score/Faturamento/Pedidos/Ticket
 *  médio/Nota média) já vira o número grande + a barra no topo do card —
 *  repeti-lo aqui embaixo, dentro da tira, seria a mesma informação duas
 *  vezes na tela. `chaveCampo` é o nome do campo que corresponde a cada
 *  critério, pra essa duplicata ser filtrada sem precisar duplicar a
 *  lista de campos. */
const CAMPO_DO_CRITERIO: Record<Criterio, string | null> = {
  score: null,
  faturamento: "Faturamento",
  pedidos: "Pedidos",
  ticketMedio: "Valor médio por pedido",
  notaMedia: "Nota",
  cancelamento: "Cancelamento",
  recorrencia: "Recorrência",
};

function TiraNumeros({ marca, periodoLabel, criterio }: { marca: SaudeMarca; periodoLabel: string; criterio: Criterio }) {
  const campos: CampoNumero[] = [
    {
      label: "Faturamento", valor: marca.faturamentoLabel, valorNumerico: marca.faturamento, formatarNumero: (v) => moeda.format(v),
      calculo: {
        titulo: "Faturamento",
        significado: "Soma do valor de todos os pedidos aprovados da marca no período, sem incluir os cancelados ou devolvidos.",
        formula: "soma do valor de cada pedido válido no período",
        resultado: marca.faturamentoLabel,
        itens: [
          { label: "Pedidos considerados", valor: inteiro.format(marca.pedidos) },
          { label: "Valor médio por pedido", valor: marca.ticketMedioLabel },
        ],
        nota: "Pedidos cancelados ou devolvidos não entram nesta soma. Eles são medidos separadamente em Cancelamento.",
      },
    },
    {
      label: "Pedidos", valor: String(marca.pedidos), valorNumerico: marca.pedidos, formatarNumero: (v) => inteiro.format(Math.round(v)),
      calculo: {
        titulo: "Pedidos",
        significado: "Quantidade de pedidos aprovados da marca no período. Esta é a mesma base usada para calcular Faturamento e Valor médio por pedido.",
        formula: "contagem de pedidos válidos (sem cancelados ou devolvidos) no período",
        resultado: String(marca.pedidos),
        itens: [{ label: "Total no período", valor: inteiro.format(marca.pedidos) }],
        nota: "Pedidos cancelados ou devolvidos ficam de fora daqui e entram na conta de Cancelamento.",
      },
    },
    {
      label: "Valor médio por pedido", valor: marca.ticketMedioLabel, valorNumerico: marca.ticketMedio, formatarNumero: (v) => moeda.format(v),
      calculo: {
        titulo: "Valor médio por pedido",
        significado: "Quanto cada pedido rendeu, em média, para a marca no período.",
        formula: "faturamento total dividido pelo número de pedidos",
        resultado: marca.ticketMedioLabel,
        itens: [
          { label: "Faturamento", valor: marca.faturamentoLabel },
          { label: "Pedidos", valor: inteiro.format(marca.pedidos) },
        ],
        nota: "O valor sobe quando poucos pedidos caros elevam a média. Analise-o junto com o volume de Pedidos, e não isoladamente.",
      },
    },
    {
      label: "Nota",
      valor: marca.notaMedia === null ? "Sem avaliação" : `${marca.notaMedia.toFixed(1)} ★`,
      ...(marca.notaMedia === null ? {} : { valorNumerico: marca.notaMedia, formatarNumero: (v: number) => `${v.toFixed(1)} ★` }),
      calculo: {
        titulo: "Nota média",
        significado: "Média das avaliações que os clientes deixaram para os pedidos da marca no período. Quanto mais próximo de 5, melhor a experiência percebida.",
        formula: "média simples das notas (1 a 5) dadas pelos clientes no período",
        resultado: marca.notaMedia === null ? "Sem avaliação" : `${marca.notaMedia.toFixed(1)} ★`,
        itens: marca.notaMedia === null ? [] : [{ label: "Nota média no período", valor: `${marca.notaMedia.toFixed(1)} ★` }],
        nota: marca.notaMedia === null
          ? "Ainda não há avaliações registradas neste período. Por isso, não existe uma nota para mostrar."
          : "Considera todas as avaliações recebidas no período, não só as 5 estrelas.",
      },
    },
    {
      label: "Reclamações",
      valor: marca.emMediacao > 0
        ? `${marca.reclamacoesAbertas} (${marca.emMediacao} em mediação)`
        : String(marca.reclamacoesAbertas),
      alerta: marca.emMediacao > 0,
      calculo: {
        titulo: "Reclamações",
        significado: "Reclamações abertas pelo cliente no Mercado Livre contra pedidos da marca no período. \"Em mediação\" é quando o próprio Mercado Livre já entrou na conversa.",
        formula: "contagem de reclamações abertas no período, com destaque para as que evoluíram para mediação",
        resultado: marca.emMediacao > 0 ? `${marca.reclamacoesAbertas} (${marca.emMediacao} em mediação)` : String(marca.reclamacoesAbertas),
        itens: [
          { label: "Reclamações abertas", valor: String(marca.reclamacoesAbertas) },
          { label: "Em mediação", valor: String(marca.emMediacao) },
        ],
        nota: "Mediação é o estágio mais sério: o Mercado Livre passa a decidir o caso em vez de só mediar a conversa entre marca e cliente.",
      },
    },
    // "Resposta" só entra quando existe mediana de verdade — um "—" solto
    // não é informação, é um buraco no meio da grade.
    ...(marca.atendimento?.medianaLabel ? [{
      label: "Resposta", valor: marca.atendimento.medianaLabel,
      calculo: {
        titulo: "Tempo de resposta",
        significado: "Mediana do tempo que a marca levou para responder as perguntas dos clientes no período.",
        formula: "mediana do tempo entre a pergunta do cliente e a primeira resposta, no período",
        resultado: marca.atendimento.medianaLabel,
        itens: [{ label: "Mediana de resposta", valor: marca.atendimento.medianaLabel }],
        nota: "Mediana, não média: uma conversa esquecida por semanas não distorce o número de todo mundo.",
      },
    }] : []),
    {
      label: "Cancelamento",
      valor: marca.taxaCancelamento === null ? "Sem dado" : `${marca.taxaCancelamento}%`,
      // Sobre TODOS os pedidos do período, não só os que entram no faturamento
      // — é a única métrica da tela que conta o que o resto exclui de propósito.
      alerta: (marca.taxaCancelamento ?? 0) > 5,
      ...(marca.taxaCancelamento === null ? {} : { valorNumerico: marca.taxaCancelamento, formatarNumero: (v: number) => `${v.toFixed(1)}%` }),
      // O ícone continua sempre visível (não depende de ter dado) — sem
      // isso, ele sumia e voltava conforme o período tinha ou não pedido
      // pra calcular, parecendo um bug de renderização em vez de "não há
      // dado nesta janela".
      calculo: marca.taxaCancelamento === null ? {
        titulo: "Cancelamento",
        significado: "Mostra a parcela de todos os pedidos que foi cancelada ou devolvida. Quanto menor, mais saudável está a operação da marca.",
        formula: "pedidos cancelados ou devolvidos, divididos pelo total de pedidos do período",
        resultado: "Sem dado",
        itens: [],
        nota: "Não há dados neste período porque a marca não teve pedidos na janela selecionada.",
      } : {
        titulo: "Cancelamento",
        significado: "Mostra a parcela de todos os pedidos que foi cancelada ou devolvida. Quanto menor, mais saudável está a operação da marca.",
        formula: "pedidos cancelados ou devolvidos, divididos pelo total de pedidos do período",
        resultado: `${marca.taxaCancelamento}%`,
        itens: [
          { label: "Cancelados ou devolvidos", valor: inteiro.format(marca.pedidosCanceladosOuDevolvidos), fracao: marca.taxaCancelamento / 100 },
          { label: "Total de pedidos", valor: inteiro.format(marca.totalPedidosBrutos) },
        ],
        nota: "Conta sobre todos os pedidos do período. Ao contrário do resto da tela, aqui o cancelado não é descartado: é o próprio alvo da medida.",
      },
    },
    {
      label: "5 produtos mais vendidos",
      valor: marca.concentracaoTop5 === null ? "Sem dado" : `${marca.concentracaoTop5}%`,
      ...(marca.concentracaoTop5 === null ? {} : { valorNumerico: marca.concentracaoTop5, formatarNumero: (v: number) => `${v.toFixed(0)}%` }),
      calculo: marca.concentracaoTop5 === null ? {
        titulo: "Concentração nos 5 mais vendidos",
        significado: "Mostra quanto da receita depende dos cinco produtos líderes. Uma concentração alta aumenta o impacto caso um desses itens pare de vender ou fique indisponível.",
        formula: "receita dos 5 produtos mais vendidos, dividida pela receita total (sem contar cancelados)",
        resultado: "Sem dado",
        itens: [],
        nota: "Não há dados neste período porque a marca não teve receita na janela selecionada.",
      } : {
        titulo: "Concentração nos 5 mais vendidos",
        significado: "Mostra quanto da receita depende dos cinco produtos líderes. Uma concentração alta aumenta o impacto caso um desses itens pare de vender ou fique indisponível.",
        formula: "receita dos 5 produtos mais vendidos, dividida pela receita total (sem contar cancelados)",
        resultado: `${marca.concentracaoTop5}%`,
        itens: [
          { label: "Receita dos 5 mais vendidos", valor: moedaCompacta.format(marca.receitaTop5), fracao: marca.concentracaoTop5 / 100 },
          { label: "Receita total da marca", valor: moedaCompacta.format(marca.receitaTotalConcentracao) },
        ],
        nota: "Quanto mais alto, mais a marca depende de poucos itens: um risco se um deles faltar.",
      },
    },
    {
      label: "Recorrência",
      valor: marca.taxaRecorrencia === null ? "Sem dado" : `${marca.taxaRecorrencia}%`,
      ...(marca.taxaRecorrencia === null ? {} : { valorNumerico: marca.taxaRecorrencia, formatarNumero: (v: number) => `${v.toFixed(0)}%` }),
      calculo: marca.taxaRecorrencia === null ? {
        titulo: "Recorrência",
        significado: "Mostra quanto da receita veio de clientes que já haviam comprado anteriormente da mesma marca. Quanto maior, maior a retenção de clientes.",
        formula: "receita de clientes que já tinham comprado antes, dividida pela receita total (sem contar cancelados)",
        resultado: "Sem dado",
        itens: [],
        nota: "Não há dados neste período porque a marca não teve receita na janela selecionada.",
      } : {
        titulo: "Recorrência",
        significado: "Mostra quanto da receita veio de clientes que já haviam comprado anteriormente da mesma marca. Quanto maior, maior a retenção de clientes.",
        formula: "receita de clientes que já tinham comprado antes, dividida pela receita total (sem contar cancelados)",
        resultado: `${marca.taxaRecorrencia}%`,
        itens: [
          { label: "Receita de clientes recorrentes", valor: moedaCompacta.format(marca.receitaRecorrente), fracao: marca.taxaRecorrencia / 100 },
          { label: "Receita total da marca", valor: moedaCompacta.format(marca.receitaTotalConcentracao) },
        ],
        nota: "\"Recorrente\" é por marca: comprar da KARZI antes não conta como recorrência na primeira compra da WUWU.",
      },
    },
  ];

  // O critério ativo no seletor de cima já virou o número grande + a barra
  // — mostrar de novo aqui embaixo seria a mesma informação duas vezes.
  const camposFiltrados = campos.filter((campo) => campo.label !== CAMPO_DO_CRITERIO[criterio]);

  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
      <AnimatePresence initial={false}>
        {camposFiltrados.map((campo, indice) => (
          <motion.div
            key={campo.label}
            layout
            initial={{ opacity: 0, scale: 0.82, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.82 }}
            transition={{ ...springs.momentum, delay: indice * 0.035 }}
            className="min-w-0"
          >
            <dt className="flex items-center gap-1 truncate text-[10px] uppercase tracking-wide text-muted-foreground/80">
              <span className="truncate">{campo.label}</span>
              {campo.calculo && (
                <CalculoPopover
                  compacto
                  titulo={campo.calculo.titulo}
                  significado={campo.calculo.significado}
                  formula={campo.calculo.formula}
                  resultado={campo.calculo.resultado}
                  itens={campo.calculo.itens}
                  periodoLabel={periodoLabel}
                  nota={campo.calculo.nota}
                />
              )}
            </dt>
            <dd
              title={campo.titulo}
              className={`truncate text-[12px] font-semibold tabular-nums ${campo.alerta ? "text-destructive" : "text-foreground"}`}
            >
              {campo.valorNumerico !== undefined && campo.formatarNumero
                ? <NumeroAnimado valor={campo.valorNumerico} formatar={campo.formatarNumero} />
                : campo.valor}
            </dd>
          </motion.div>
        ))}
      </AnimatePresence>
    </dl>
  );
}

/* ── Cumprimento de pedidos ───────────────────────────────────────
   Vem do que era o card "Pós-venda" (removido — quase tudo que ele
   media já apareceu aqui: "Taxa de problemas" era a mesma conta que
   "Cancelamento" já faz, (cancelados+devolvidos)/total). Só o que era
   genuinamente novo entrou: os números crus por trás dessa taxa
   (Entregues/Em andamento/Cancelados/Devolvidos — antes só a % existia
   aqui), a receita afetada e os motivos mais comuns. */
/** Segmento não-zero da barra — cor semântica fixa (nunca a cor da marca,
 *  que já está em uso lá em cima; aqui o que importa é status, não marca). */
const SEGMENTOS_PEDIDO = [
  { chave: "entregues" as const, label: "Entregues", cor: "var(--success)" },
  { chave: "emTransito" as const, label: "Em andamento", cor: "var(--info)" },
  { chave: "cancelados" as const, label: "Cancelados", cor: "var(--destructive)" },
  { chave: "devolvidos" as const, label: "Devolvidos", cor: "var(--warning)" },
];

function CumprimentoPedidos({ pv }: { pv: PosVendaMarcaComTaxa }) {
  const reduzir = useReducedMotion();
  const total = pv.entregues + pv.emTransito + pv.cancelados + pv.devolvidos;
  const segmentos = SEGMENTOS_PEDIDO
    .map((s) => ({ ...s, valor: pv[s.chave] }))
    .filter((s) => s.valor > 0);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[.07em] text-muted-foreground">
          <span>Cumprimento de pedidos</span>
          <CalculoPopover
            compacto
            titulo="Cumprimento de pedidos"
            significado="Mostra o que aconteceu com os pedidos da marca no período: quantos já foram entregues, quantos ainda estão a caminho, e quantos foram cancelados ou devolvidos."
            formula="contagem de pedidos por status (entregue, em andamento, cancelado, devolvido) no período"
            resultado={total > 0 ? `${inteiro.format(total)} pedidos` : "Sem pedidos"}
            itens={total > 0 ? SEGMENTOS_PEDIDO.map((s) => ({
              label: s.label,
              valor: inteiro.format(pv[s.chave]),
              fracao: pv[s.chave] / total,
            })) : []}
            periodoLabel={undefined}
            nota="Cancelados e devolvidos aqui são os mesmos que entram na taxa de Cancelamento, lá em cima, ali em porcentagem, aqui em número absoluto."
          />
        </p>
        {pv.impactoFinanceiro > 0 && (
          <span className="shrink-0 text-[11px] font-bold tabular-nums text-destructive">
            <NumeroAnimado valor={pv.impactoFinanceiro} formatar={(v) => moeda.format(v)} /> afetado
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">Sem pedidos no período.</p>
      ) : (
        <>
          {/* Uma barra só substitui 4 caixas de número soltas — o olho
              compara proporção muito mais rápido que quatro dígitos
              desconectados. Cada trecho nasce da esquerda e se estica até
              a própria largura, em cascata (delay por índice), em vez de
              tudo aparecer de uma vez. */}
          <div className="mt-2.5 flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
            {segmentos.map((s, indice) => (
              <motion.div
                key={s.chave}
                initial={reduzir ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ ...springs.momentum, delay: reduzir ? 0 : 0.1 + indice * 0.09 }}
                style={{ background: s.cor, width: `${(s.valor / total) * 100}%`, transformOrigin: "left" }}
                className="h-full first:rounded-l-full last:rounded-r-full"
              />
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1">
            {segmentos.map((s, indice) => (
              <motion.span
                key={s.chave}
                initial={reduzir ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduzir ? 0 : 0.25 + indice * 0.06, duration: 0.2 }}
                className="inline-flex items-center gap-1.5 text-[11px]"
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.cor }} />
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-bold tabular-nums" style={{ color: s.cor }}>
                  <NumeroAnimado valor={s.valor} formatar={(v) => inteiro.format(Math.round(v))} />
                </span>
              </motion.span>
            ))}
          </div>
        </>
      )}

      {pv.principaisMotivos.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {pv.principaisMotivos.map((m) => (
            <span
              key={m.motivo}
              title={m.motivo}
              className="max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {m.quantidade}× {m.motivo}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type PosVendaMarcaComTaxa = PosVendaResultado["marcas"][number];

export function ComparacaoCard({ dados, carregando, acaoSlot, atualizadoEm, posVenda }: {
  dados: SaudeLojaResultado | null;
  carregando: boolean;
  acaoSlot?: HTMLElement | null;
  /** Quando os números de cada marca foram calculados — vem de uma consulta
   *  ao vivo (não é dado sincronizado com timestamp próprio por marca), então
   *  é o mesmo instante em todos os cards, repetido em cada um a pedido:
   *  quem olha um card sozinho vê de quando é aquele número sem precisar
   *  achar o relógio lá em cima do painel. */
  atualizadoEm?: Date | null;
  /** Ex-card "Pós-venda" — ver CumprimentoPedidos acima. */
  posVenda?: PosVendaResultado | null;
}) {
  const [criterio, setCriterio] = useState<Criterio>("score");
  const reduzir = useReducedMotion();

  const ordenadas = useMemo(() => {
    const marcas = [...(dados?.marcas ?? [])];
    const menorVence = CRITERIO_MENOR_VENCE[criterio] === true;
    // Marca sem o indicador escolhido cai para o fim em vez de virar zero e
    // fingir que é a pior — "não medido" e "medido em zero" não são a mesma coisa.
    return marcas.sort((a, b) => {
      const va = valorDe(a, criterio);
      const vb = valorDe(b, criterio);
      if (va === null && vb === null) return a.marcaLabel.localeCompare(b.marcaLabel);
      if (va === null) return 1;
      if (vb === null) return -1;
      return menorVence ? va - vb : vb - va;
    });
  }, [dados, criterio]);

  const maximo = useMemo(
    () => ordenadas.reduce((maior, marca) => Math.max(maior, valorDe(marca, criterio) ?? 0), 0),
    [ordenadas, criterio],
  );

  const abasCriterio = (
    <div className="flex gap-0.5 overflow-x-auto rounded-[0.75rem] bg-muted p-1 scrollbar-none sm:flex-wrap sm:overflow-visible" role="tablist" aria-label={copy.ordenarPor}>
      {copy.criterios.map((opcao) => {
        const ativo = opcao.chave === criterio;
        return (
          <button
            key={opcao.chave}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => setCriterio(opcao.chave as Criterio)}
            className={`press-feedback relative flex h-11 shrink-0 items-center whitespace-nowrap rounded-[0.5rem] px-3 text-[11px] transition-colors ${ativo ? "font-extrabold" : "font-semibold"}`}
            style={{ color: ativo ? "var(--foreground)" : "var(--muted-foreground)" }}
          >
            {ativo && (
              <motion.span
                layoutId="metricas-criterio"
                transition={springs.settleFast}
                className="absolute inset-0 rounded-[0.5rem] border border-border bg-card shadow-[0_2px_6px_rgba(14,15,19,.14)]"
              />
            )}
            <span className="relative z-10">{opcao.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <Card>
      <CardHead />
      {acaoSlot && createPortal(abasCriterio, acaoSlot)}

      {carregando && !dados ? (
        <div className="space-y-3 px-5 pb-5 pt-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : ordenadas.length === 0 ? (
        <EmptyState illustration="reports" title={copy.vazio} />
      ) : (
        <motion.ul
          animate={{ opacity: carregando ? 0.55 : 1 }}
          transition={springs.settleFast}
          className="flex flex-col gap-3 px-4 pb-5 pt-4 sm:px-5"
        >
          {ordenadas.map((marca, indice) => {
            const valor = valorDe(marca, criterio);
            const cor = corDaMarca(marca.marca);
            // A barra e o número grande são sempre a cor da marca — é o fio
            // condutor visual do card. O alerta semântico (Score, Nota,
            // Cancelamento têm um "bom"/"ruim" objetivo) não desaparece: ele
            // migra pra um pontinho ao lado do número, em vez de tomar conta
            // da cor inteira do card.
            const corDestaque = cor;
            const corAlerta = corDoIndicador(criterio, valor);
            // Em Cancelamento, 0% é o melhor resultado possível — não faz
            // sentido negar a coroa só porque o valor "não é maior que zero".
            const lider = indice === 0 && valor !== null && (CRITERIO_MENOR_VENCE[criterio] === true || valor > 0);
            const pv = posVenda?.marcas.find((item) => item.brandId === marca.brandId);
            return (
              <motion.li
                // `layout` no <li> faz a lista reordenar deslizando quando o
                // critério muda: quem subiu e quem desceu fica evidente, em vez
                // de a lista simplesmente aparecer em outra ordem.
                key={marca.brandId}
                layout={!reduzir}
                transition={springs.settle}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                // A cor da marca deixou de aparecer só no card líder — agora
                // toda linha carrega uma faixa da própria cor da logo, numa
                // intensidade proporcional (mais forte pra quem lidera, mais
                // discreta pros demais). É a cor de identidade se espalhando
                // pelo card com a mesma "força" que ela tem na logo, em vez
                // de aparecer tudo-ou-nada.
                className="rounded-[1rem] border border-l-[3px] p-4"
                style={{
                  borderLeftColor: cor,
                  borderColor: lider ? tint(cor, 40) : "var(--border)",
                  background: lider ? `color-mix(in srgb, ${cor} 4%, transparent)` : `color-mix(in srgb, ${cor} 1.5%, transparent)`,
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {isBrandSlug(marca.marca)
                      ? (
                        <span className="inline-flex items-center rounded-[0.6rem] px-2 py-1" style={{ background: tint(cor, 8) }}>
                          <BrandLogo brand={marca.marca} height={17} />
                        </span>
                      )
                      : <span className="truncate text-sm font-bold text-foreground">{marca.marcaLabel}</span>}
                    {lider && (
                      <motion.span
                        layout={!reduzir}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: tint(cor, 10), color: cor }}
                      >
                        <Crown size={10} /> {copy.lider}
                      </motion.span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {corAlerta && (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: corAlerta }}
                      />
                    )}
                    <span className="text-[15px] font-bold tabular-nums" style={{ color: corDestaque }}>
                      {rotuloDe(marca, criterio)}
                    </span>
                  </span>
                </div>

                <div className="mt-2.5">
                  <BarraComLimite
                    valor={valor ?? 0}
                    maximo={maximo}
                    cor={corDestaque}
                    altura={8}
                    atraso={indice * 0.06}
                  />
                </div>

                <TiraNumeros marca={marca} periodoLabel={dados?.periodoLabel ?? ""} criterio={criterio} />

                {pv && <CumprimentoPedidos pv={pv} />}

                {atualizadoEm && (
                  <p className="mt-2.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <RefreshCw size={9} /> Atualizado em {dataHoraCard.format(atualizadoEm)}
                  </p>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </Card>
  );
}
