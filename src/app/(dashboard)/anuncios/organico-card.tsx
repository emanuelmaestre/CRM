"use client";

import { motion } from "framer-motion";
import { Split } from "lucide-react";
import type { VisaoGeralResumo } from "@/modules/anuncios/application/visao-geral.service";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { springs } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { BarraSimples, Card, CardHead } from "./anuncios-primitives";

const copy = anunciosConfig.organico;
const ACENTO = "var(--acento-1)";
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const LABEL_CLASSIFICACAO: Record<string, string> = {
  baixa: "Dependência baixa",
  moderada: "Dependência moderada",
  alta: "Dependência alta",
  critica: "Dependência crítica",
};

export function OrganicoCard({ resumo }: { resumo: VisaoGeralResumo }) {
  const totalVendas = resumo.vendasPublicitarias + resumo.vendasOrganicas;
  const semDado = totalVendas === 0;

  const percentualPago = totalVendas > 0 ? Math.round((resumo.vendasPublicitarias / totalVendas) * 1000) / 10 : 0;
  const percentualOrganico = totalVendas > 0 ? Math.round((resumo.vendasOrganicas / totalVendas) * 1000) / 10 : 0;

  return (
    <Card>
      <CardHead title={copy.titulo} subtitle={copy.descricao} icon={Split} accent={ACENTO} />
      {semDado ? (
        <EmptyState illustration="generic" title={copy.semVenda} />
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={springs.settleFast} className="px-4 pb-5 pt-2 sm:px-5">
          <div className="flex h-5 w-full overflow-hidden rounded-full" style={{ background: "var(--chart-bar)" }}>
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: percentualPago / 100 }}
              transition={springs.settle}
              className="h-full"
              style={{ background: ACENTO, transformOrigin: "left", width: "100%" }}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACENTO }} />
              {percentualPago}% via publicidade
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
              {percentualOrganico}% orgânico
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Receita via publicidade</dt><dd className="mt-1 font-semibold tabular-nums">{moeda.format(resumo.receitaTotal)}</dd></div>
            <div className="text-right"><dt className="text-xs text-muted-foreground">Receita orgânica</dt><dd className="mt-1 font-semibold tabular-nums">{moeda.format(resumo.receitaOrganica)}</dd></div>
          </dl>

          {resumo.dependenciaMidia.classificacao && (
            <div className="mt-4 rounded-[0.9rem] bg-muted/50 px-3.5 py-3">
              <p className="text-[12px] font-semibold text-foreground">
                {LABEL_CLASSIFICACAO[resumo.dependenciaMidia.classificacao]} — {resumo.dependenciaMidia.percentual}%
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Não é automaticamente bom ou ruim: uma marca nova sem histórico orgânico pode depender bastante de mídia e estar saudável mesmo assim.
              </p>
              <div className="mt-2">
                <BarraSimples valor={resumo.dependenciaMidia.percentual ?? 0} maximo={100} cor={ACENTO} />
              </div>
            </div>
          )}
        </motion.div>
      )}
    </Card>
  );
}
