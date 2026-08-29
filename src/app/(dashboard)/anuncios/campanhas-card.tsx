"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import type { Alerta, GrupoAlertas } from "@/modules/anuncios/application/alertas";
import type { CampanhaVisaoGeral, VisaoGeralMarca } from "@/modules/anuncios/application/visao-geral.service";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import { springs } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { BadgeStatusCampanha, Card, CardHead, MarcaBadge, RotuloComInfo } from "./anuncios-primitives";
import { Roas } from "./roas";

const copy = anunciosConfig.campanhas;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const decimal2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inteiro = new Intl.NumberFormat("pt-BR");

type InfoCabecalho = {
  descricao: string;
  observacao?: string;
};

function formatarDataCriacao(valor: string | null) {
  return valor ? dataCurta.format(new Date(valor)) : "Não informada";
}

const COR_PRIORIDADE: Record<Alerta["prioridade"], string> = {
  critico: "var(--destructive)",
  importante: "var(--escala-2)",
  oportunidade: "var(--success)",
  informativo: "var(--info)",
};

// Mesma ordem de gravidade de alertas.ts (não exportada de lá) — crítico
// primeiro, para o número da linha refletir o alerta mais sério, não o mais
// recente.
const ORDEM_PRIORIDADE_LOCAL: Record<Alerta["prioridade"], number> = {
  critico: 0,
  importante: 1,
  informativo: 2,
  oportunidade: 3,
};

function plural(valor: number, singular: string, pluralTexto: string) {
  return valor === 1 ? singular : pluralTexto;
}

function alertasPorCampanha(individuais: Alerta[], grupos: GrupoAlertas[]): Map<string, Alerta[]> {
  const mapa = new Map<string, Alerta[]>();
  const adicionar = (alerta: Alerta) => {
    const lista = mapa.get(alerta.campanhaId);
    if (lista) lista.push(alerta);
    else mapa.set(alerta.campanhaId, [alerta]);
  };
  individuais.forEach(adicionar);
  grupos.forEach((grupo) => grupo.alertas.forEach(adicionar));
  return mapa;
}

/** Mesmo sinal do resumo do cabeçalho, mas escopado à campanha da linha —
 *  quem está olhando "Liquida 7.7" não deveria precisar abrir o resumo geral
 *  e caçar o próprio nome no meio de outras 10 campanhas. */
function AtencaoLinha({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) return null;
  const maisGrave = alertas.reduce((pior, atual) => (
    ORDEM_PRIORIDADE_LOCAL[atual.prioridade] < ORDEM_PRIORIDADE_LOCAL[pior.prioridade] ? atual : pior
  ));
  const cor = COR_PRIORIDADE[maisGrave.prioridade];
  const resumo = `${alertas.length} ${plural(alertas.length, "sinal", "sinais")} de atenção nesta campanha`;
  /* Duas colunas só quando há o que pôr nas duas. O `ul` desenha as
     divisórias com o próprio fundo (bg-border) aparecendo pelo gap-px entre
     os `li`; com um alerta só, a segunda célula do grid não existe e esse
     fundo cinza fica exposto como um bloco vazio ao lado do texto. Pela mesma
     razão a largura larga (38rem) só vale no caso de duas colunas: com um
     alerta ela deixava metade do balão em branco. */
  const duasColunas = alertas.length > 1;

  return (
    <AnimatedInfoPopover
      trigger={(
        <AnimatedInfoTrigger
          aria-label={resumo}
          title={resumo}
          onClick={(e) => e.stopPropagation()}
          iconSize={11}
          iconStrokeWidth={2.5}
          className="press-feedback inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110"
          style={{ color: cor }}
        />
      )}
      align="start"
      sideOffset={6}
      collisionPadding={12}
      className={`z-[100] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card text-left shadow-[0_16px_40px_rgba(14,15,19,.20)]${duasColunas ? " lg:w-[min(38rem,calc(100vw-1.5rem))]" : ""}`}
    >
          <ul className={`grid gap-px overflow-hidden rounded-xl bg-border${duasColunas ? " lg:grid-cols-2" : ""}`}>
            {alertas.map((alerta, indice) => (
              /* Número ímpar de alertas deixa a última célula sozinha na
                 linha, e a metade vazia mostra o mesmo fundo cinza. Ela
                 ocupa as duas colunas para fechar a grade. */
              <li
                key={alerta.chave}
                className={`flex items-start gap-2 bg-card px-3 py-2.5${
                  duasColunas && alertas.length % 2 === 1 && indice === alertas.length - 1 ? " lg:col-span-2" : ""
                }`}
              >
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: COR_PRIORIDADE[alerta.prioridade] }} />
                <p className="text-[12px] leading-relaxed text-foreground">{alerta.descricao}</p>
              </li>
            ))}
          </ul>
    </AnimatedInfoPopover>
  );
}

function descricaoStatus(campanhas: CampanhaVisaoGeral[]) {
  const contagem = campanhas.reduce<Record<string, number>>((total, campanha) => {
    total[campanha.status] = (total[campanha.status] ?? 0) + 1;
    return total;
  }, {});
  // Os dois canais nomeiam os mesmos estados de formas diferentes (o ML manda
  // active/paused, a Shopee ongoing/paused/ended/closed). Contar só os nomes do
  // ML jogava toda campanha da Shopee em "outro status" — a frase dizia "0
  // ativas, 0 pausadas, 11 em outro status" para uma lista onde 8 estavam
  // rodando. Mesma unificação da tabela, ver STATUS_CAMPANHA.
  const ativas = (contagem.active ?? 0) + (contagem.ongoing ?? 0);
  const pausadas = contagem.paused ?? 0;
  const encerradas = (contagem.ended ?? 0) + (contagem.closed ?? 0);
  const outros = campanhas.length - ativas - pausadas - encerradas;
  const partes = [
    `${inteiro.format(ativas)} ${plural(ativas, "ativa", "ativas")}`,
    `${inteiro.format(pausadas)} ${plural(pausadas, "pausada", "pausadas")}`,
  ];

  if (encerradas > 0) partes.push(`${inteiro.format(encerradas)} ${plural(encerradas, "encerrada", "encerradas")}`);
  if (outros > 0) partes.push(`${inteiro.format(outros)} em outro status`);

  return {
    descricao: `Status mostra se a campanha pode rodar agora. Nesta lista, são ${partes.join(", ")}.`,
    observacao: "Campanha pausada normalmente não deveria gastar. Se houver gasto em uma campanha pausada, pode ser dado herdado do período ou mudança recente de status.",
  };
}

function descricaoCriacao(campanhas: CampanhaVisaoGeral[]) {
  const datas = campanhas
    .map((campanha) => campanha.criadaEm ? new Date(campanha.criadaEm) : null)
    .filter((data): data is Date => data !== null && !Number.isNaN(data.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const semData = campanhas.length - datas.length;

  if (datas.length === 0) {
    return {
      descricao: "Criada em mostra a data original de criação no Mercado Livre. Nesta lista, nenhuma campanha trouxe essa data na sincronização.",
      observacao: "Essa data não é a última atualização nem o período do relatório; é quando a campanha nasceu na plataforma.",
    };
  }

  const primeira = dataCurta.format(datas[0]);
  const ultima = dataCurta.format(datas[datas.length - 1]);
  const complemento = semData > 0 ? ` ${inteiro.format(semData)} ${plural(semData, "campanha está", "campanhas estão")} sem data informada.` : "";

  return {
    descricao: `Criada em mostra quando cada campanha foi criada. Nesta lista, a mais antiga é de ${primeira} e a mais recente é de ${ultima}.${complemento}`,
    observacao: "Campanhas antigas podem ter histórico acumulado, mas os números da tabela respeitam apenas o período selecionado na tela.",
  };
}

function descricaoCabecalhos(campanhas: CampanhaVisaoGeral[]): Record<string, InfoCabecalho> {
  const totalCampanhas = campanhas.length;
  const comOrcamento = campanhas.filter((campanha) => campanha.orcamento !== null);
  const orcamentoTotal = comOrcamento.reduce((total, campanha) => total + (campanha.orcamento ?? 0), 0);
  const investimentoTotal = campanhas.reduce((total, campanha) => total + campanha.investimento, 0);
  const receitaTotal = campanhas.reduce((total, campanha) => total + campanha.receita, 0);
  const roasPonderado = investimentoTotal > 0 ? receitaTotal / investimentoTotal : null;

  return {
    Campanha: {
      descricao: `Mostra o nome de cada campanha sincronizada. Esta tabela tem ${inteiro.format(totalCampanhas)} ${plural(totalCampanhas, "campanha", "campanhas")} e está ordenada por investimento.`,
      observacao: "A campanha agrupa anúncios/produtos. Leia a linha inteira para entender gasto, receita e retorno daquela campanha específica.",
    },
    Status: descricaoStatus(campanhas),
    "Criada em": descricaoCriacao(campanhas),
    "Orçamento": {
      descricao: `Orçamento é o limite configurado para a campanha. ${inteiro.format(comOrcamento.length)} de ${inteiro.format(totalCampanhas)} ${plural(totalCampanhas, "campanha tem", "campanhas têm")} orçamento informado, somando ${moeda.format(orcamentoTotal)}.`,
      observacao: "Orçamento não é gasto realizado. Ele indica o teto ou limite configurado; o valor efetivamente consumido aparece em Investido.",
    },
    Investido: {
      descricao: `Investido é quanto foi gasto em mídia no período selecionado. Nesta lista, as campanhas somam ${moeda.format(investimentoTotal)} de investimento.`,
      observacao: "Esse valor entra nos cálculos de ROAS, ACOS, TACOS e CPC. Não inclui custo do produto, frete, taxas ou impostos.",
    },
    Receita: {
      descricao: `Receita é o faturamento atribuído aos anúncios no período. Nesta lista, as campanhas somam ${moeda.format(receitaTotal)} em receita atribuída.`,
      observacao: "Receita aqui não é lucro. Ela ainda não desconta investimento, custo do produto, frete, taxas ou impostos.",
    },
    "ROAS": {
      descricao: roasPonderado === null
        ? "ROAS fica sem dado quando não há investimento para comparar com a receita atribuída."
        : `ROAS é receita atribuída dividida pelo investimento. No total da lista, cada ${moeda.format(1)} investido voltou como ${moeda.format(roasPonderado)} em receita atribuída (${decimal2.format(roasPonderado)}x).`,
      observacao: "ROAS ajuda a comparar retorno entre campanhas, mas não é margem nem lucro. Olhe junto com Investido e Receita para entender o peso de cada linha.",
    },
  };
}

export function CampanhasCard({ campanhas, marca }: { campanhas: CampanhaVisaoGeral[]; marca: VisaoGeralMarca }) {
  const infosCabecalho = descricaoCabecalhos(campanhas);
  const alertasPorCampanhaId = alertasPorCampanha(marca.alertasIndividuais, marca.alertasAgrupados);
  const reduzir = useReducedMotion();

  return (
    <Card>
      <CardHead
        title={copy.titulo}
        icon={BarChart3}
        accent="var(--acento-2)"
        trailing={<MarcaBadge brandSlug={marca.brandSlug} brandLabel={marca.brandLabel} />}
      />
      {campanhas.length === 0 ? (
        <EmptyState illustration="reports" title={copy.semDado} />
      ) : (
        <>
        <div className="divide-y divide-border px-4 pb-4 pt-2 md:hidden">
          {campanhas.map((campanha) => {
            return (
              <article key={campanha.campanhaId} className="py-4 first:pt-2 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-snug text-foreground">
                    <span className="min-w-0 truncate">{campanha.nome}</span>
                    <AtencaoLinha alertas={alertasPorCampanhaId.get(campanha.campanhaId) ?? []} />
                  </h4>
                  <BadgeStatusCampanha status={campanha.status} />
                </div>
                {/* ROAS saiu da grade de 2 colunas — era o 3º item de uma
                    grade de 4, sobrava sozinho na última linha e o
                    text-right o alinhava à direita só da metade esquerda da
                    grade, flutuando no meio do card sem parecer ligado a
                    nada. Agora é uma faixa própria, de largura inteira,
                    com o mesmo destaque visual (fundo sutil, seta colorida)
                    que o ROAS já recebe no card principal da Visão Geral —
                    é o número-resumo da campanha, merece ler assim. */}
                <dl className="mt-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Criada em</dt><dd className="mt-0.5 font-medium tabular-nums">{formatarDataCriacao(campanha.criadaEm)}</dd></div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4">
                    <div><dt className="text-xs text-muted-foreground">Investimento</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(campanha.investimento)}</dd></div>
                    <div className="text-right"><dt className="text-xs text-muted-foreground">Receita</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(campanha.receita)}</dd></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ROAS</dt>
                    <dd className="font-semibold"><Roas valor={campanha.roas} /></dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
        <div className="table-scroll hidden px-1 pb-5 pt-3 md:block sm:px-2">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-medium uppercase text-muted-foreground">
                {copy.colunas.map((coluna, indice) => {
                  const info = infosCabecalho[coluna];
                  return (
                    <th key={coluna} className={`px-3 py-2 ${indice > 2 ? "text-right" : ""}`}>
                      <RotuloComInfo descricao={info.descricao} observacao={info.observacao}>{coluna}</RotuloComInfo>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {campanhas.map((campanha, indice) => {
                return (
                  <motion.tr
                    key={campanha.campanhaId}
                    initial={reduzir ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={reduzir ? { duration: 0 } : { ...springs.settleFast, delay: indice * 0.03 }}
                    className={indice < campanhas.length - 1 ? "border-b border-border" : ""}
                  >
                    <td className="max-w-[220px] px-3 py-2.5 font-medium text-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate">{campanha.nome}</span>
                        <AtencaoLinha alertas={alertasPorCampanhaId.get(campanha.campanhaId) ?? []} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5"><BadgeStatusCampanha status={campanha.status} /></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted-foreground">{formatarDataCriacao(campanha.criadaEm)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {campanha.orcamento !== null ? moeda.format(campanha.orcamento) : "Sem orçamento"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-foreground">{moeda.format(campanha.investimento)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{moeda.format(campanha.receita)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">
                      <Roas valor={campanha.roas} />
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Card>
  );
}
