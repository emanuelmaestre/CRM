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

/** O corte é 1.00x: acima disso a campanha trouxe mais receita do que
 *  custou de mídia.
 *
 *  Já foi o "ROAS mínimo" vindo do break-even, que levava em conta custo
 *  do produto e comissão — um corte melhor, mas que dependia de um custo
 *  que nunca existiu no sistema e não será preenchido. Entre um corte
 *  simples e verdadeiro e um sofisticado que nunca calcula, fica o
 *  simples: 1.00x significa "a mídia se pagou", nada além disso. */
export function situacaoRoas(roas: number | null): SituacaoRoas {
  if (roas === null) return "sem_dado";
  const margem = 0.1;
  if (roas > 1 + margem) return "acima";
  if (roas < 1 - margem) return "abaixo";
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
  acima: "a mídia se pagou — trouxe mais receita do que custou",
  abaixo: "a mídia não se pagou — custou mais do que trouxe",
  no_limite: "a mídia empatou — receita perto do que foi investido",
  sem_dado: "sem investimento no período — ROAS não existe sem gasto",
};

export function Roas({ valor, className }: {
  valor: number | null;
  className?: string;
}) {
  const situacao = situacaoRoas(valor);

  return (
    <span
      className={`inline-flex items-center justify-end gap-1 tabular-nums ${className ?? ""}`}
      style={{ color: COR_ROAS[situacao] }}
      title={valor === null ? DESCRICAO.sem_dado : `${valor.toFixed(2)}x — ${DESCRICAO[situacao]}`}
    >
      <SetaRoas situacao={situacao} size={12} />
      {valor === null ? "—" : `${valor.toFixed(2)}x`}
      <span className="sr-only">{valor === null ? DESCRICAO.sem_dado : `, ${DESCRICAO[situacao]}`}</span>
    </span>
  );
}
