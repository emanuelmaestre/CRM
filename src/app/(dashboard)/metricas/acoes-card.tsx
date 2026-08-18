"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Lightbulb, ShieldCheck, ThumbsDown, ThumbsUp, TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { springs } from "@/shared/design-system/motion-variants";
import metricasConfig from "@/config/metricas.json";
import {
  actionAprovarSugestao,
  actionListarInsights,
  actionListarSugestoes,
  actionRejeitarSugestao,
} from "./actions";
import { Card, CardHead } from "./metricas-primitives";
import { tint } from "@/shared/design-system/color";

const copy = metricasConfig.acoesCard;

export type Insight = Awaited<ReturnType<typeof actionListarInsights>>[number];
export type Sugestao = Awaited<ReturnType<typeof actionListarSugestoes>>[number];

const STATUS: Record<string, { label: string; color: string }> = copy.statusSugestao;

/* O texto do insight não vem classificado pela IA, mas a direção dele está
   escrita nas próprias palavras. Ler o tom aqui evita uma chamada extra ao
   modelo só para descobrir se a notícia é boa ou ruim. */
const ALERTA = /baixa|queda|caiu|risco|cancelad|abandon|comprometem|atras/i;
const POSITIVO = /alta|crescimento|recorde|melhor|subiu|aument/i;

function tomDoInsight(texto: string): { icon: LucideIcon; cor: string } {
  if (ALERTA.test(texto)) return { icon: TrendingDown, cor: "var(--destructive)" };
  if (POSITIVO.test(texto)) return { icon: TrendingUp, cor: "var(--success)" };
  return { icon: Lightbulb, cor: "var(--selecionado)" };
}

/* A busca inicial mora no mosaico (mosaico.tsx), disparada assim que a
 * página carrega — antes deste componente sequer montar, já que o bloco só
 * é montado quando o card abre. Aqui só sincronizamos o que o mosaico já
 * buscou; `recarregar` (chamado depois de aprovar/rejeitar) continua sendo
 * uma busca de verdade feita por este componente, porque é o único lugar
 * que sabe que uma decisão acabou de mudar a lista. */
export function AcoesCard({ insightsIniciais, sugestoesIniciais, carregandoInicial }: {
  insightsIniciais: Insight[];
  sugestoesIniciais: Sugestao[];
  carregandoInicial: boolean;
}) {
  const [dados, setDados] = useState<{ carregado: boolean; insights: Insight[]; sugestoes: Sugestao[] }>(() => (
    carregandoInicial
      ? { carregado: false, insights: [], sugestoes: [] }
      : { carregado: true, insights: insightsIniciais, sugestoes: sugestoesIniciais }
  ));
  const [decidindo, setDecidindo] = useState<string | null>(null);

  // Ajuste durante a renderização (não em efeito): o mosaico pode terminar
  // de carregar depois que este card já montou (abriu rápido demais). Só
  // preenche na transição carregando→pronto, e só se nada local ainda tiver
  // mudado — depois de aprovar/rejeitar, `dados.carregado` já é true e esta
  // sincronização para de acontecer, então uma decisão nunca é apagada.
  const [ultimoCarregandoInicial, setUltimoCarregandoInicial] = useState(carregandoInicial);
  if (carregandoInicial !== ultimoCarregandoInicial) {
    setUltimoCarregandoInicial(carregandoInicial);
    if (!carregandoInicial && !dados.carregado) {
      setDados({ carregado: true, insights: insightsIniciais, sugestoes: sugestoesIniciais });
    }
  }

  async function recarregar() {
    const [insights, sugestoes] = await Promise.all([actionListarInsights(), actionListarSugestoes()]);
    setDados({ carregado: true, insights, sugestoes });
  }

  async function decidir(id: string, aprovar: boolean) {
    setDecidindo(id);
    try {
      if (aprovar) await actionAprovarSugestao(id);
      else await actionRejeitarSugestao(id, copy.motivoRejeicao);
      toast.success(aprovar ? copy.aprovada : copy.rejeitada);
      await recarregar();
    } catch {
      toast.error(aprovar ? copy.erroAprovar : copy.erroRejeitar);
    } finally {
      setDecidindo(null);
    }
  }

  const { carregado, insights, sugestoes } = dados;
  const vazio = insights.length === 0 && sugestoes.length === 0;

  return (
    <Card>
      <CardHead />

      {!carregado ? (
        <div className="space-y-3 px-5 pb-5 pt-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : vazio ? (
        <EmptyState illustration="generic" title={copy.insightsVazio} description={copy.insightsVazioDescricao} />
      ) : (
        <div className="flex flex-col gap-5 px-4 pb-5 pt-4 sm:px-5">
          {insights.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {insights.map((item, indice) => {
                const { icon: Icon, cor } = tomDoInsight(`${item.titulo} ${item.conteudo}`);
                const confianca = item.confianca ? Math.round(parseFloat(String(item.confianca)) * 100) : null;
                return (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...springs.settleFast, delay: indice * 0.05 }}
                    className="rounded-[0.9rem] border border-border p-3.5"
                    style={{ borderLeft: `3px solid ${cor}` }}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: tint(cor, 9), color: cor }}
                      >
                        <Icon size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-foreground">{item.titulo}</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-foreground">{item.conteudo}</p>
                        {confianca !== null && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">{copy.confianca}</span>
                            <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                              <motion.span
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: confianca / 100 }}
                                transition={{ ...springs.settle, delay: 0.1 + indice * 0.05 }}
                                className="block h-full w-full rounded-l-full"
                                style={{ background: cor, transformOrigin: "left" }}
                              />
                            </span>
                            <span className="text-[10px] tabular-nums text-muted-foreground">{confianca}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}

          <div>
            <div className="mb-2.5 flex items-center gap-2">
              <h4 className="text-label-md uppercase text-muted-foreground">{copy.sugestoesTitulo}</h4>
              <span className="h-px flex-1 bg-border" />
            </div>

            {sugestoes.length === 0 ? (
              <p className="rounded-[0.9rem] bg-muted/50 px-3.5 py-3 text-[12px] text-muted-foreground">
                {copy.sugestoesVazio}
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                <AnimatePresence initial={false}>
                  {sugestoes.map((sugestao) => {
                    const badge = STATUS[sugestao.status] ?? { label: sugestao.status, color: "var(--muted-foreground)" };
                    const ocupado = decidindo === sugestao.id;
                    return (
                      <motion.li
                        key={sugestao.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={springs.settleFast}
                        className="rounded-[0.9rem] border border-border p-3.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <span
                              className="mb-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                              style={{ background: tint(badge.color, 12), color: badge.color }}
                            >
                              {badge.label}
                            </span>
                            <p className="text-[13px] font-semibold text-foreground">{sugestao.titulo}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{sugestao.segmentoDescricao}</p>
                            <p className="mt-1 text-[12px] text-foreground">{sugestao.oferta}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {sugestao.momentoSugerido && <>{copy.momento}: {sugestao.momentoSugerido}</>}
                              {sugestao.momentoSugerido && sugestao.descontoMinimo && " · "}
                              {sugestao.descontoMinimo && <>{copy.desconto}: {Number(sugestao.descontoMinimo).toFixed(0)}%</>}
                            </p>
                          </div>

                          {sugestao.status === "sugerida" && (
                            <div className="flex shrink-0 gap-2">
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                disabled={ocupado}
                                onClick={() => decidir(sugestao.id, true)}
                                className="inline-flex items-center gap-1.5 rounded-[0.5rem] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                style={{ background: "var(--gradient-signature)" }}
                              >
                                <ThumbsUp size={12} /> {copy.aprovar}
                              </motion.button>
                              <button
                                type="button"
                                disabled={ocupado}
                                onClick={() => decidir(sugestao.id, false)}
                                className="press-feedback inline-flex items-center gap-1.5 rounded-[0.5rem] border border-border px-3 py-1.5 text-[11px] font-semibold transition-colors hover:bg-muted disabled:opacity-50"
                              >
                                <ThumbsDown size={12} /> {copy.rejeitar}
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}

            {/* O portão de aprovação é a razão de esta lista existir; dizê-lo em
                voz alta evita que alguém procure um "disparar tudo" que não há. */}
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck size={12} className="shrink-0 text-success" />
              {copy.portao}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
