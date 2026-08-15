"use client";

import { motion } from "framer-motion";
import { Lightbulb } from "lucide-react";
import type { CampanhaVisaoGeral, VisaoGeralResumo } from "@/modules/anuncios/application/visao-geral.service";
import { fadeUp } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { Card, CardHead } from "./anuncios-primitives";

const copy = anunciosConfig.resumo;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/* ── Resumo editorial ──────────────────────────────────────────
   "Toda recomendação precisa nascer dos dados" (brief) — este texto é
   montado a partir de números reais da própria janela, nunca um texto
   fixo. Sem dado suficiente para uma frase, ela simplesmente não entra
   — melhor resumo curto e verdadeiro que resumo completo e inventado. */

interface Frase { texto: string; }

function montarResumo(resumo: VisaoGeralResumo, campanhas: CampanhaVisaoGeral[]): Frase[] {
  const frases: Frase[] = [];

  if (resumo.roasMedio !== null) {
    const tom = resumo.roasMedio >= 3 ? "saudável" : resumo.roasMedio >= 1 ? "no limite" : "abaixo do ideal";
    frases.push({ texto: `O ROAS consolidado está ${tom} — ${resumo.roasMedio.toFixed(2)}x sobre ${moeda.format(resumo.investimentoTotal)} investidos.` });
  } else if (resumo.investimentoTotal === 0) {
    frases.push({ texto: "Nenhum investimento registrado na última sincronização — as campanhas estão pausadas ou sem consumo hoje." });
  }

  const semConversao = campanhas.filter((c) => c.investimento > 0 && c.vendas === 0 && c.cliques >= 5);
  if (semConversao.length > 0) {
    const gastoParado = semConversao.reduce((s, c) => s + c.investimento, 0);
    frases.push({
      texto: `${semConversao.length} campanha${semConversao.length > 1 ? "s têm" : " tem"} cliques sem nenhuma venda até agora, somando ${moeda.format(gastoParado)} — vale acompanhar antes de virar padrão.`,
    });
  }

  const criticos = campanhas.filter((c) => c.diagnosticos.some((d) => d.severidade === "critico"));
  if (criticos.length > 0) {
    frases.push({ texto: `${criticos.length} campanha${criticos.length > 1 ? "s pedem" : " pede"} atenção crítica — ver a seção abaixo.` });
  }

  const escalaveis = campanhas.filter((c) => c.oportunidades.some((o) => o.tipo === "escala"));
  if (escalaveis.length > 0) {
    frases.push({ texto: `${escalaveis.length} campanha${escalaveis.length > 1 ? "s são" : " é"} candidata${escalaveis.length > 1 ? "s" : ""} a aumento de orçamento — rentáveis e limitadas por verba.` });
  }

  if (frases.length === 0) {
    frases.push({ texto: "Ainda não há dado suficiente nesta janela para uma leitura editorial — volte depois da próxima sincronização." });
  }

  return frases;
}

export function ResumoInteligente({ resumo, campanhas }: { resumo: VisaoGeralResumo; campanhas: CampanhaVisaoGeral[] }) {
  const frases = montarResumo(resumo, campanhas);

  return (
    <Card>
      <CardHead title={copy.titulo} icon={Lightbulb} accent="var(--acento-2)" />
      <div className="flex flex-col gap-2 px-4 pb-5 pt-3 sm:px-5">
        {frases.map((frase, indice) => (
          <motion.p
            key={indice}
            variants={fadeUp}
            className="text-[13px] leading-relaxed text-foreground"
          >
            {frase.texto}
          </motion.p>
        ))}
        {resumo.lucroIncompleto && (
          <p className="mt-2 rounded-[0.75rem] bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
            {copy.lucroIncompletoAviso}
          </p>
        )}
      </div>
    </Card>
  );
}
