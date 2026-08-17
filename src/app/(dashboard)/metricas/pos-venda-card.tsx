"use client";

import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { Card, CardHead } from "./metricas-primitives";
import type { PosVendaResultado } from "@/modules/metricas/application/pos-venda.service";
import { CalculoPopover } from "@/shared/design-system/primitives/CalculoPopover";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { isBrandSlug } from "@/shared/config/brands";
import { NumeroAnimado } from "./metricas-primitives";
import { inteiro, moeda } from "@/shared/design-system/format";

/* A busca mora no mosaico (mosaico.tsx), disparada assim que a página
 * carrega — junto com Saúde da loja e Atendimento. Antes, este card buscava
 * sozinho ao montar, o que só acontecia quando o bloco abria: cada clique
 * esperava uma ida ao servidor, e fechar e reabrir refazia a busca do zero.
 * Como card puramente apresentacional, abrir o bloco só troca o que já
 * chegou. */
export function PosVendaCard({ dados, carregando }: { dados: PosVendaResultado | null; carregando: boolean }) {
  return <Card>
    <CardHead />
    {carregando && !dados ? <div className="grid gap-3 p-5 md:grid-cols-3"><Skeleton className="h-32"/><Skeleton className="h-32"/><Skeleton className="h-32"/></div> :
      !dados || dados.marcas.length === 0 ? (
        <EmptyState illustration="generic" title="Nenhum pedido no período" description="Sem pedido nenhum na janela escolhida, não há cancelamento ou devolução para medir." />
      ) :
      <div className="grid gap-3 p-4 md:grid-cols-3">{dados?.marcas.map((marca) => <article key={marca.brandId} className="rounded-2xl border border-border p-4">
        <h3 className="flex h-5 items-center text-sm font-bold">
          {isBrandSlug(marca.marcaSlug) ? <BrandLogo brand={marca.marcaSlug} height={15} /> : marca.marcaLabel}
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div><dt className="text-muted-foreground">Entregues</dt><dd className="text-base font-bold"><NumeroAnimado valor={marca.entregues} formatar={(v) => inteiro.format(Math.round(v))} /></dd></div>
          <div><dt className="text-muted-foreground">Em andamento</dt><dd className="text-base font-bold"><NumeroAnimado valor={marca.emTransito} formatar={(v) => inteiro.format(Math.round(v))} /></dd></div>
          <div><dt className="text-muted-foreground">Cancelados</dt><dd className="text-base font-bold text-destructive"><NumeroAnimado valor={marca.cancelados} formatar={(v) => inteiro.format(Math.round(v))} /></dd></div>
          <div><dt className="text-muted-foreground">Devolvidos</dt><dd className="text-base font-bold text-destructive"><NumeroAnimado valor={marca.devolvidos} formatar={(v) => inteiro.format(Math.round(v))} /></dd></div>
          <div>
            <dt className="flex items-center gap-1 text-muted-foreground">
              Taxa de problemas
              {marca.taxaProblemas !== null && (
                <CalculoPopover
                  titulo="Taxa de problemas"
                  significado="Indica a parcela dos pedidos que terminou em cancelamento ou devolução. Quanto menor, mais saudável está o pós-venda."
                  formula="pedidos cancelados e devolvidos somados, divididos pelo total de pedidos do período"
                  resultado={`${marca.taxaProblemas}%`}
                  itens={[
                    { label: "Cancelados + devolvidos", valor: inteiro.format(marca.cancelados + marca.devolvidos), fracao: marca.taxaProblemas / 100 },
                    { label: "· Cancelados", valor: inteiro.format(marca.cancelados) },
                    { label: "· Devolvidos", valor: inteiro.format(marca.devolvidos) },
                    { label: "Total de pedidos", valor: inteiro.format(marca.total) },
                  ]}
                  nota="Cancelados e devolvidos somados sobre todos os pedidos do período, não só os que entram no faturamento."
                />
              )}
            </dt>
            <dd className="font-bold">
              {marca.taxaProblemas === null ? "—" : <NumeroAnimado valor={marca.taxaProblemas} formatar={(v) => `${v.toFixed(1)}%`} />}
            </dd>
          </div>
          <div><dt className="text-muted-foreground">Receita afetada</dt><dd className="font-bold"><NumeroAnimado valor={marca.impactoFinanceiro} formatar={(v) => moeda.format(v)} /></dd></div>
        </dl>
        {marca.principaisMotivos.length > 0 && <div className="mt-3 border-t border-border pt-3"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Principais motivos</p>{marca.principaisMotivos.map((m) => <p key={m.motivo} className="mt-1 truncate text-xs" title={m.motivo}>{m.quantidade}× {m.motivo}</p>)}</div>}
      </article>)}</div>}
    <p className="px-5 pb-4 text-xs text-muted-foreground">O prazo detalhado de despacho será exibido quando os eventos de envio passarem a ser armazenados. Nenhum SLA é estimado sem esse dado.</p>
  </Card>;
}
