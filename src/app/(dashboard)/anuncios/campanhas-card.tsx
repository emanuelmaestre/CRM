"use client";

import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import type { CampanhaVisaoGeral, VisaoGeralMarca } from "@/modules/anuncios/application/visao-geral.service";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { springs } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { Card, CardHead, MarcaBadge, RotuloComInfo } from "./anuncios-primitives";
import { Roas } from "./roas";
import { tint } from "@/shared/design-system/color";

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

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
  active: { label: "Ativa", cor: "var(--success)" },
  paused: { label: "Pausada", cor: "var(--warning)" },
};

function BadgeStatus({ status }: { status: string }) {
  const info = STATUS_LABEL[status] ?? { label: status, cor: "var(--muted-foreground)" };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tint(info.cor, 9), color: info.cor }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.cor }} />
      {info.label}
    </span>
  );
}

function plural(valor: number, singular: string, pluralTexto: string) {
  return valor === 1 ? singular : pluralTexto;
}

function descricaoStatus(campanhas: CampanhaVisaoGeral[]) {
  const contagem = campanhas.reduce<Record<string, number>>((total, campanha) => {
    total[campanha.status] = (total[campanha.status] ?? 0) + 1;
    return total;
  }, {});
  const ativas = contagem.active ?? 0;
  const pausadas = contagem.paused ?? 0;
  const outros = campanhas.length - ativas - pausadas;
  const partes = [
    `${inteiro.format(ativas)} ${plural(ativas, "ativa", "ativas")}`,
    `${inteiro.format(pausadas)} ${plural(pausadas, "pausada", "pausadas")}`,
  ];

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
    ROAS: {
      descricao: roasPonderado === null
        ? "ROAS fica sem dado quando não há investimento para comparar com a receita atribuída."
        : `ROAS é receita atribuída dividida pelo investimento. No total da lista, cada ${moeda.format(1)} investido voltou como ${moeda.format(roasPonderado)} em receita atribuída (${decimal2.format(roasPonderado)}x).`,
      observacao: "ROAS ajuda a comparar retorno entre campanhas, mas não é margem nem lucro. Olhe junto com Investido e Receita para entender o peso de cada linha.",
    },
  };
}

export function CampanhasCard({ campanhas, marca }: { campanhas: CampanhaVisaoGeral[]; marca: VisaoGeralMarca }) {
  const infosCabecalho = descricaoCabecalhos(campanhas);

  return (
    <Card>
      <CardHead
        title={copy.titulo}
        subtitle={copy.subtitulo}
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
                  <h4 className="min-w-0 text-sm font-semibold leading-snug text-foreground">{campanha.nome}</h4>
                  <BadgeStatus status={campanha.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div className="col-span-2"><dt className="text-xs text-muted-foreground">Criada em</dt><dd className="mt-0.5 font-medium tabular-nums">{formatarDataCriacao(campanha.criadaEm)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Investimento</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(campanha.investimento)}</dd></div>
                  <div className="text-right"><dt className="text-xs text-muted-foreground">Receita</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(campanha.receita)}</dd></div>
                  <div className="text-right"><dt className="text-xs text-muted-foreground">ROAS</dt><dd className="mt-0.5 font-semibold"><Roas valor={campanha.roas} /></dd></div>
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
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ ...springs.settleFast, delay: indice * 0.03 }}
                    className={indice < campanhas.length - 1 ? "border-b border-border" : ""}
                  >
                    <td className="max-w-[220px] truncate px-3 py-2.5 font-medium text-foreground">{campanha.nome}</td>
                    <td className="px-3 py-2.5"><BadgeStatus status={campanha.status} /></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted-foreground">{formatarDataCriacao(campanha.criadaEm)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {campanha.orcamento !== null ? moeda.format(campanha.orcamento) : "—"}
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
