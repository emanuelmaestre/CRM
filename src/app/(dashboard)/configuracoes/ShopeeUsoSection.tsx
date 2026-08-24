"use client";

import { Gauge } from "lucide-react";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { tint } from "@/shared/design-system/color";
import type { actionObterUsoApiShopee } from "./actions";

type UsoApiShopee = Awaited<ReturnType<typeof actionObterUsoApiShopee>>;

const numero = new Intl.NumberFormat("pt-BR");

function Metrica({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex-1 rounded-[0.9rem] border border-border bg-background/55 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{numero.format(valor)}</p>
    </div>
  );
}

/** Consumo da cota do proxy de IP fixo (Webshare) usado nas chamadas à Shopee —
 *  existe porque a cota do plano grátis (500 requisições/mês) já estourou
 *  uma vez e derrubou a integração inteira sem aviso nenhum. */
export function ShopeeUsoSection({ data, loading }: { data: UsoApiShopee | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-[74px] flex-1" />
          <Skeleton className="h-[74px] flex-1" />
          <Skeleton className="h-[74px] flex-1" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Não foi possível carregar o uso da API.</p>;
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Metrica label="Hoje" valor={data.hoje} />
        <Metrica label="Últimos 7 dias" valor={data.ultimos7Dias} />
        <Metrica label="Este mês" valor={data.esteMes} />
      </div>

      {data.porCaminho.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground">
            <Gauge size={13} />
            Por endpoint, este mês
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-[0.9rem] border border-border">
            {data.porCaminho.map((linha) => (
              <li key={linha.caminho} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12.5px]">
                <code className="truncate font-mono text-muted-foreground">{linha.caminho}</code>
                <span
                  className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums"
                  style={{ background: tint("var(--foreground)", 8), color: "var(--foreground)" }}
                >
                  {numero.format(linha.total)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
