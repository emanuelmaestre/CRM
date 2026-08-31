"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import { moeda } from "@/shared/design-system/format";
import { variacaoDesempenho, type CanalDesempenho, type DesempenhoCanal, type IndicadoresDesempenhoCanal } from "@/modules/vendas/domain/desempenho-canal";

const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const dataML = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "Etc/GMT+4" });
const dataShopee = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
const cards: Array<{ chave: keyof IndicadoresDesempenhoCanal; nome: string; formato: "moeda" | "inteiro" | "percentual"; explicacao: string }> = [
  { chave: "vendasBrutas", nome: "Vendas brutas", formato: "moeda", explicacao: "Soma de total_amount dos pedidos criados no período, antes de descontar tarifas e cancelamentos. Inclui pedidos cancelados, devolvidos e ainda não pagos. Não equivale a dinheiro recebido nem ao faturamento comparável do CRM." },
  { chave: "unidadesVendidas", nome: "Unidades vendidas", formato: "inteiro", explicacao: "Soma das quantidades dos itens dos mesmos pedidos usados em vendas brutas, incluindo cancelados e devolvidos. Não conta anúncios cadastrados. Sem todos os itens da API, o indicador fica indisponível." },
  { chave: "precoMedioUnidade", nome: "Preço médio por unidade", formato: "moeda", explicacao: "Vendas brutas divididas pelas unidades do mesmo recorte. Nas várias empresas, soma os valores e unidades antes de dividir. Sem unidades, não há média calculável." },
  { chave: "visitas", nome: "Visitas", formato: "inteiro", explicacao: "Total de visitas retornado pela API oficial para todos os anúncios das contas selecionadas, mesmo os que não venderam. A atualização depende do processamento do Mercado Livre. Não é uma contagem de visitantes únicos." },
  { chave: "quantidadeVendas", nome: "Quantidade de vendas", formato: "inteiro", explicacao: "Quantidade de IDs de pedidos distintos criados no período, incluindo cancelados e devolvidos. Pedidos diferentes dentro de um mesmo carrinho (pack) são contados separadamente." },
  { chave: "conversao", nome: "Conversão", formato: "percentual", explicacao: "Quantidade de vendas dividida pelas visitas, multiplicada por 100. Usa o mesmo recorte dos outros cards. A variação é mostrada em pontos percentuais. Sem visitas ou com API indisponível, não há taxa calculável." },
  { chave: "precoMedioVenda", nome: "Preço médio por venda", formato: "moeda", explicacao: "Vendas brutas divididas pela quantidade de vendas. Não é o preço médio por unidade nem o valor líquido recebido. Sem pedidos, não há média calculável." },
  { chave: "vendasCanceladas", nome: "Quantidade de vendas canceladas", formato: "inteiro", explicacao: "Pedidos criados neste período cujo status atual é cancelled. Não conta devoluções, pedidos inválidos ou a data em que um pedido antigo foi cancelado. Por isso pode diferir de relatórios com outra regra de cancelamento." },
];

const explicacoesShopee: Partial<Record<keyof IndicadoresDesempenhoCanal, string>> = {
  vendasBrutas: "Soma dos valores dos pedidos criados no período, incluindo cancelados, devolvidos e não pagos. Usa buyer_total_amount do financeiro quando disponível e total_amount do pedido como alternativa, a mesma base da conferência. Pode incluir frete e ajustes do comprador; não equivale ao valor dos produtos, ao repasse líquido nem ao indicador interno da Central do Vendedor.",
  unidadesVendidas: "Soma de model_quantity_purchased de todos os itens dos mesmos pedidos usados em vendas brutas, incluindo cancelados e devolvidos. Variações e múltiplas unidades são somadas. Se faltarem itens ou quantidades, este indicador fica indisponível.",
  precoMedioUnidade: "Valor bruto dos pedidos dividido pelas unidades. O valor pode incluir frete e ajustes do comprador, por isso esta média não é o preço de catálogo dos produtos. Sem unidades completas não há média calculável.",
  quantidadeVendas: "Quantidade de order_sn distintos criados no período. Um pedido com vários produtos conta como uma venda. Inclui cancelados, devolvidos e não pagos; a quantidade de unidades é mostrada separadamente.",
  visitas: "A integração atual da Shopee não fornece visitas da loja para o período selecionado. Cliques de Ads, avaliações e visualizações acumuladas dos produtos não representam esse indicador. Por isso nenhum número é estimado.",
  conversao: "A conversão depende das visitas da loja no mesmo período. Como essa fonte não está disponível na integração atual, não calculamos nem estimamos a taxa.",
  vendasCanceladas: "Quantidade de pedidos criados no período com status confirmado CANCELLED. Solicitações de cancelamento em andamento (IN_CANCEL) e devoluções (TO_RETURN) não entram neste card. A conferência financeira pode excluir esses estados pela regra do CRM.",
};

function formatar(valor: number, formato: typeof cards[number]["formato"]) {
  return formato === "moeda" ? moeda.format(valor) : formato === "percentual" ? `${decimal.format(valor)}%` : inteiro.format(valor);
}

export function ResumoDesempenhoCanal({ canal, desempenho, temFiltrosAdicionais }: { canal: CanalDesempenho; desempenho: DesempenhoCanal; temFiltrosAdicionais: boolean }) {
  const shopee = canal === "shopee";
  const nome = shopee ? "Shopee" : "Mercado Livre";
  const identificador = shopee ? "shopee" : "ml";
  const data = shopee ? dataShopee : dataML;
  return (
    <section aria-label={`Resumo de desempenho ${shopee ? "da" : "do"} ${nome}`} className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-foreground">Resumo de desempenho</h3>
          <p className="text-[11px]">{shopee ? "Dados reais das APIs de pedidos e financeiro · atualização automática a cada 5 minutos com a página visível." : "Dados reais das APIs de pedidos e visitas · atualização automática a cada minuto com a página visível."}</p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">{nome}</span>
      </div>
      <p className="text-[11px]">{data.format(new Date(desempenho.periodo.inicio))} a {data.format(new Date(desempenho.periodo.fim))} · comparado com {data.format(new Date(desempenho.periodoAnterior.inicio))} a {data.format(new Date(desempenho.periodoAnterior.fim))}.</p>
      <p className="text-[11px]">{shopee ? "Horário de Brasília (UTC−3), o mesmo período da conferência abaixo. A consulta considera a data de criação dos pedidos." : "Calendário da API de visitas: UTC−4 (01h a 00h59 em Brasília). Os pedidos destes cards seguem o mesmo recorte. A conferência abaixo continua no dia de Brasília."}</p>
      {temFiltrosAdicionais && <p className="rounded-lg bg-muted/60 px-3 py-2 font-medium text-foreground">Estes oito indicadores consideram o período e as empresas selecionadas. A busca e o filtro de status da lista não se aplicam aqui.</p>}
      <dl className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 lg:grid-cols-4" data-testid={`resumo-desempenho-${identificador}`}>
        {cards.map(({ chave, nome, formato, explicacao }) => {
          const valor = desempenho.atual[chave];
          const anterior = desempenho.anterior?.[chave] ?? null;
          const variacao = variacaoDesempenho(valor, anterior, chave === "conversao");
          const semFonte = shopee && (chave === "visitas" || chave === "conversao");
          const variacaoVisivel = variacao === null ? null : Math.round(variacao * 10) / 10;
          const melhora = variacaoVisivel !== null && (chave === "vendasCanceladas" ? variacaoVisivel < 0 : variacaoVisivel > 0);
          const Icone = variacaoVisivel === null || variacaoVisivel === 0 ? Minus : variacaoVisivel > 0 ? ArrowUp : ArrowDown;
          const cor = variacaoVisivel === null || variacaoVisivel === 0 ? "text-muted-foreground" : melhora ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
          return (
            <div key={chave} className={`min-w-0 rounded-xl border border-border bg-background px-3 py-3 ${chave === "vendasBrutas" ? (shopee ? "border-t-[3px] border-t-orange-500" : "border-t-[3px] border-t-violet-500") : "border-t-[3px] border-t-transparent"}`}>
              <dt className="flex min-h-8 items-center justify-between gap-1 text-[11.5px] font-medium text-muted-foreground">
                <span>{nome}</span>
                <AnimatedInfoPopover className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground shadow-lg" trigger={<AnimatedInfoTrigger aria-label={`Como é calculado: ${nome}`} className="inline-flex shrink-0 items-center justify-center rounded-full p-1 text-primary" />}>
                  <p className="mb-1 font-bold text-foreground">{nome}</p><p>{shopee ? explicacoesShopee[chave] ?? explicacao : explicacao}</p>
                  <p className="mt-2">Período anterior: {anterior === null ? "indisponível" : formatar(anterior, formato)}.</p>
                </AnimatedInfoPopover>
              </dt>
              <dd data-testid={`desempenho-${identificador}-${chave}`} className="mt-1 text-lg font-bold tabular-nums text-foreground">
                {valor === null ? <span className="text-sm font-medium text-muted-foreground">{(chave === "conversao" && desempenho.atual.visitas === 0) || (chave === "precoMedioUnidade" && desempenho.atual.unidadesVendidas === 0) || (chave === "precoMedioVenda" && desempenho.atual.quantidadeVendas === 0) ? "Sem base de cálculo" : "Indisponível"}</span> : formatar(valor, formato)}
              </dd>
              <dd className={`mt-1 flex items-center gap-1 text-[10.5px] font-medium tabular-nums ${cor}`}>
                <Icone size={12} aria-hidden="true" />
                {semFonte ? "Sem fonte por período" : variacaoVisivel === null ? (anterior === 0 && valor !== null && valor > 0 ? "Sem base anterior" : "Sem comparação") : `${variacaoVisivel > 0 ? "+" : ""}${decimal.format(variacaoVisivel)}${chave === "conversao" ? " p.p." : "%"}`}
              </dd>
            </div>
          );
        })}
      </dl>
      {desempenho.avisos.map((aviso) => <p key={aviso} className="rounded-lg bg-muted/60 px-3 py-2 text-[11px]">{aviso}</p>)}
      <p className="text-[11px] leading-relaxed">Indicadores calculados no CRM a partir das APIs oficiais. Vendas brutas incluem cancelados, devolvidos e pedidos não pagos; o faturamento da conferência abaixo exclui cancelados e devolvidos. {shopee ? "Na Shopee, o valor bruto pode incluir frete e ajustes do comprador. Não é uma reprodução certificada dos indicadores da Central do Vendedor." : <>As regras e o processamento do painel de Métricas do Mercado Livre podem produzir diferenças. <a href="https://developers.mercadolivre.com.br/recurso-visits" target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">Fonte das visitas</a>.</>}</p>
    </section>
  );
}
