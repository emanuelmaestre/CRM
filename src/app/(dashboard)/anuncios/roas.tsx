"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";

/* ── ROAS ────────────────────────────────────────────────────────
   Um lugar só para desenhar ROAS, porque antes eram seis cópias que
   dependiam EXCLUSIVAMENTE da cor para dizer se o número é bom ou ruim.

   Por que cor não basta: --success e --destructive precisam atingir 4.5:1
   contra o mesmo fundo, e isso necessariamente os deixa com luminância
   parecida — 1.31:1 entre si. Sob deuteranopia (~8% dos homens) a razão
   cai para ~1.1:1, ou seja, a mesma cor. Em valores de dinheiro o sinal
   de menos salva a leitura; ROAS não tem sinal nenhum: "0.85x" e "1.15x"
   diferem só pelo tom.

   A seta resolve sem ocupar espaço, e funciona também para quem imprime
   em preto e branco ou usa monitor ruim. */

export type SituacaoRoas = "acima" | "abaixo" | "no_limite" | "sem_dado";

/** O corte não é 1.00 e sim o ROAS mínimo da campanha (break-even) —
 *  1.00 só significa "empatou com o gasto de mídia", ignorando custo do
 *  produto e comissão. Quando não há mínimo calculado (falta custo no
 *  catálogo), cai para 1.00 e a leitura fica explícita no title. */
export function situacaoRoas(roas: number | null, roasMinimo: number | null): SituacaoRoas {
  if (roas === null) return "sem_dado";
  const corte = roasMinimo ?? 1;
  const margem = corte * 0.1;
  if (roas > corte + margem) return "acima";
  if (roas < corte - margem) return "abaixo";
  return "no_limite";
}

export const COR_ROAS: Record<SituacaoRoas, string | undefined> = {
  acima: "var(--success)",
  abaixo: "var(--destructive)",
  no_limite: "var(--warning)",
  sem_dado: undefined,
};

const ICONE: Record<SituacaoRoas, typeof ArrowUp | null> = {
  acima: ArrowUp,
  abaixo: ArrowDown,
  no_limite: Minus,
  sem_dado: null,
};

/** A seta sozinha, para quando o número é desenhado por outro componente
 *  (o KPI grande da Visão Geral tem contagem animada própria). */
export function SetaRoas({ situacao, size = 18 }: { situacao: SituacaoRoas; size?: number }) {
  const Icone = ICONE[situacao];
  if (!Icone) return null;
  return <Icone size={size} strokeWidth={2.75} aria-hidden="true" className="shrink-0" />;
}

const DESCRICAO: Record<SituacaoRoas, string> = {
  acima: "acima do mínimo sustentável",
  abaixo: "abaixo do mínimo sustentável",
  no_limite: "no limite do mínimo sustentável",
  sem_dado: "sem investimento no período — ROAS não existe sem gasto",
};

export function Roas({ valor, minimo = null, className }: {
  valor: number | null;
  /** ROAS de break-even da campanha, quando calculável. */
  minimo?: number | null;
  className?: string;
}) {
  const situacao = situacaoRoas(valor, minimo);
  const referencia = minimo !== null ? `mínimo ${minimo.toFixed(2)}x` : "referência 1.00x (custo do produto não configurado)";

  return (
    <span
      className={`inline-flex items-center justify-end gap-1 tabular-nums ${className ?? ""}`}
      style={{ color: COR_ROAS[situacao] }}
      title={valor === null ? DESCRICAO.sem_dado : `${valor.toFixed(2)}x — ${DESCRICAO[situacao]} (${referencia})`}
    >
      <SetaRoas situacao={situacao} size={12} />
      {valor === null ? "—" : `${valor.toFixed(2)}x`}
      <span className="sr-only">{valor === null ? DESCRICAO.sem_dado : `, ${DESCRICAO[situacao]}`}</span>
    </span>
  );
}
