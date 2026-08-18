"use client";

import { motion, useReducedMotion } from "framer-motion";
import { RefreshCw, Split } from "lucide-react";
import type { VisaoGeralMarca, VisaoGeralResumo } from "@/modules/anuncios/application/visao-geral.service";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { springs } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { BarraSimples, Card, CardHead, MarcaBadge } from "./anuncios-primitives";
import { tint } from "@/shared/design-system/color";

const copy = anunciosConfig.organico;
const ACENTO = "var(--acento-1)";
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const decimal1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// Vendas/receita aqui são calculadas em cima do snapshot mais recente — sem
// a hora, "81,9%" parece um número ao vivo quando na verdade é de quando a
// sincronização rodou pela última vez.
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

const LABEL_CLASSIFICACAO: Record<string, string> = {
  baixa: "Dependência baixa",
  moderada: "Dependência moderada",
  alta: "Dependência alta",
  critica: "Dependência crítica",
};

/** O rótulo diz a faixa; o veredito diz o que fazer com essa informação —
 *  sem isso, "dependência crítica" soa como alarme mesmo quando é esperado
 *  (marca nova sem histórico orgânico ainda). */
const VEREDITO_CLASSIFICACAO: Record<string, string> = {
  baixa: "O orgânico já sustenta a maior parte das vendas — a mídia paga está sendo um complemento, não uma muleta.",
  moderada: "Um equilíbrio saudável entre mídia paga e orgânico. Nenhuma das duas carrega a operação sozinha.",
  alta: "A maior parte das vendas depende de mídia paga. Não é automaticamente ruim: uma marca nova sem histórico orgânico pode estar saudável assim mesmo — mas vale acompanhar se essa dependência está caindo com o tempo.",
  critica: "Quase todas as vendas vêm de mídia paga — hoje, sem investimento em anúncio, as vendas cairiam quase a zero. Vale entender se é uma fase (lançamento) ou um padrão que precisa de atenção.",
};

export function OrganicoCard({ resumo, resumoAnterior, marca }: {
  resumo: VisaoGeralResumo;
  resumoAnterior?: VisaoGeralResumo | null;
  /** O filtro de marca fica só no topo da página — cards mais abaixo, fora
   *  da primeira dobra, perdem essa referência quando a pessoa rola. A logo
   *  aqui repete o contexto sem precisar rolar de volta pra conferir. */
  marca: VisaoGeralMarca;
}) {
  const totalVendas = resumo.vendasPublicitarias + resumo.vendasOrganicas;
  const semDado = totalVendas === 0;
  const reduzir = useReducedMotion();

  const percentualPago = totalVendas > 0 ? Math.round((resumo.vendasPublicitarias / totalVendas) * 1000) / 10 : 0;
  const percentualOrganico = totalVendas > 0 ? Math.round((resumo.vendasOrganicas / totalVendas) * 1000) / 10 : 0;

  const percentualAnterior = resumo.dependenciaMidia.percentual !== null && resumoAnterior
    ? resumoAnterior.dependenciaMidia.percentual
    : null;
  const variacaoPontos = percentualAnterior !== null && resumo.dependenciaMidia.percentual !== null
    ? Math.round((resumo.dependenciaMidia.percentual - percentualAnterior) * 10) / 10
    : null;

  return (
    <Card>
      <CardHead
        title={copy.titulo}
        subtitle={copy.descricao}
        icon={Split}
        accent={ACENTO}
        trailing={<MarcaBadge brandSlug={marca.brandSlug} brandLabel={marca.brandLabel} />}
      />
      {semDado ? (
        <EmptyState illustration="generic" title={copy.semVenda} />
      ) : (
        <motion.div initial={reduzir ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={reduzir ? { duration: 0 } : springs.settleFast} className="px-4 pb-5 pt-2 sm:px-5">
          <div className="flex h-5 w-full overflow-hidden rounded-full" style={{ background: "var(--chart-bar)" }}>
            <motion.div
              initial={reduzir ? false : { scaleX: 0 }}
              animate={{ scaleX: percentualPago / 100 }}
              transition={reduzir ? { duration: 0 } : springs.settle}
              className="h-full"
              style={{ background: ACENTO, transformOrigin: "left", width: "100%" }}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACENTO }} />
              {decimal1.format(percentualPago)}% via publicidade
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
              {decimal1.format(percentualOrganico)}% orgânico
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Receita via publicidade</dt><dd className="mt-1 font-semibold tabular-nums">{moeda.format(resumo.receitaTotal)}</dd></div>
            <div className="text-right"><dt className="text-xs text-muted-foreground">Receita orgânica</dt><dd className="mt-1 font-semibold tabular-nums">{moeda.format(resumo.receitaOrganica)}</dd></div>
          </dl>

          {/* O que a porcentagem esconde: quanto dinheiro, em R$, some se a
              mídia paga parar amanhã. "81,9%" é abstrato; "some quase R$
              10 mil" é o número que faz alguém agir. */}
          <div className="mt-3 rounded-xl border border-dashed border-border px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[.04em] text-muted-foreground">Se a mídia paga parasse hoje</p>
            <p className="mt-1 text-[13px] leading-relaxed text-foreground">
              A receita cairia de <span className="font-bold tabular-nums">{moeda.format(resumo.receitaTotal + resumo.receitaOrganica)}</span> para
              {" "}<span className="font-bold tabular-nums">{moeda.format(resumo.receitaOrganica)}</span> — uma perda de{" "}
              <span className="font-bold tabular-nums" style={{ color: "var(--destructive)" }}>{moeda.format(resumo.receitaTotal)}</span> só neste período.
            </p>
          </div>

          {resumo.dependenciaMidia.classificacao && (
            <div className="mt-4 rounded-[0.9rem] bg-muted/50 px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-foreground">
                  {LABEL_CLASSIFICACAO[resumo.dependenciaMidia.classificacao]} — {resumo.dependenciaMidia.percentual}%
                </p>
                {variacaoPontos !== null && variacaoPontos !== 0 && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      background: tint(variacaoPontos > 0 ? "var(--destructive)" : "var(--success)", 9),
                      color: variacaoPontos > 0 ? "var(--destructive)" : "var(--success)",
                    }}
                  >
                    {variacaoPontos > 0 ? "▲" : "▼"} {decimal1.format(Math.abs(variacaoPontos))}pp vs. período anterior
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {VEREDITO_CLASSIFICACAO[resumo.dependenciaMidia.classificacao]}
              </p>
              <div className="mt-2">
                <BarraSimples valor={resumo.dependenciaMidia.percentual ?? 0} maximo={100} cor={ACENTO} />
              </div>
            </div>
          )}
        </motion.div>
      )}
      {!semDado && (
        <p className="flex items-center justify-end gap-1.5 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground sm:px-5">
          <RefreshCw size={11} />
          {marca.sincronizadoEm ? dataHora.format(new Date(marca.sincronizadoEm)) : "—"}
        </p>
      )}
    </Card>
  );
}
