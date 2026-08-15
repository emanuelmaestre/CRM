"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { Card, CardHead } from "./metricas-primitives";
import { actionObterPosVenda } from "./actions";
import type { PosVendaResultado } from "@/modules/metricas/application/pos-venda.service";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function PosVendaCard({ inicio, fim }: { inicio: string; fim: string }) {
  const chave = `${inicio}:${fim}`;
  const [estado, setEstado] = useState<{ chave: string; dados: PosVendaResultado | null }>({ chave: "", dados: null });
  useEffect(() => {
    let ativo = true;
    actionObterPosVenda({ inicio, fim }).then((dados) => { if (ativo) setEstado({ chave, dados }); });
    return () => { ativo = false; };
  }, [chave, inicio, fim]);
  const carregando = estado.chave !== chave;

  return <Card>
    <CardHead title="Logística e pós-venda" subtitle="Cancelamentos, devoluções e impacto financeiro do período" icon={RotateCcw} accent="var(--warning)" />
    {carregando && !estado.dados ? <div className="grid gap-3 p-5 md:grid-cols-3"><Skeleton className="h-32"/><Skeleton className="h-32"/><Skeleton className="h-32"/></div> :
      <div className="grid gap-3 p-4 md:grid-cols-3">{estado.dados?.marcas.map((marca) => <article key={marca.brandId} className="rounded-2xl border border-border p-4">
        <h3 className="text-sm font-bold">{marca.marcaLabel}</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div><dt className="text-muted-foreground">Entregues</dt><dd className="text-base font-bold">{marca.entregues}</dd></div>
          <div><dt className="text-muted-foreground">Em andamento</dt><dd className="text-base font-bold">{marca.emTransito}</dd></div>
          <div><dt className="text-muted-foreground">Cancelados</dt><dd className="text-base font-bold text-destructive">{marca.cancelados}</dd></div>
          <div><dt className="text-muted-foreground">Devolvidos</dt><dd className="text-base font-bold text-destructive">{marca.devolvidos}</dd></div>
          <div><dt className="text-muted-foreground">Taxa de problemas</dt><dd className="font-bold">{marca.taxaProblemas === null ? "—" : `${marca.taxaProblemas}%`}</dd></div>
          <div><dt className="text-muted-foreground">Receita afetada</dt><dd className="font-bold">{moeda.format(marca.impactoFinanceiro)}</dd></div>
        </dl>
        {marca.principaisMotivos.length > 0 && <div className="mt-3 border-t border-border pt-3"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Principais motivos</p>{marca.principaisMotivos.map((m) => <p key={m.motivo} className="mt-1 truncate text-xs" title={m.motivo}>{m.quantidade}× {m.motivo}</p>)}</div>}
      </article>)}</div>}
    <p className="px-5 pb-4 text-xs text-muted-foreground">O prazo detalhado de despacho será exibido quando os eventos de envio passarem a ser armazenados. Nenhum SLA é estimado sem esse dado.</p>
  </Card>;
}
