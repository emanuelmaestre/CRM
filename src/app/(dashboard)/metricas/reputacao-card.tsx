"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Award, PlugZap, Star } from "lucide-react";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { springs } from "@/shared/design-system/motion-variants";
import { isBrandSlug } from "@/shared/config/brands";
import metricasConfig from "@/config/metricas.json";
import type { ChaveTaxa, ContaDesconectada, ReputacaoMarca, TaxaReputacao } from "@/modules/metricas/application/reputacao.service";
import type { SaudeLojaResultado } from "@/modules/metricas/application/saude-loja.service";
import { BarraComLimite, Card, CardHead, NumeroAnimado } from "./metricas-primitives";
import { tint } from "@/shared/design-system/color";
import { CalculoPopover } from "@/shared/design-system/primitives/CalculoPopover";

const copy = metricasConfig.reputacaoCard;

/* ── Termômetro ────────────────────────────────────────────────
   As cinco faixas do Mercado Livre desenhadas como cinco degraus que
   sobem da esquerda para a direita. As faixas não conquistadas ficam
   apagadas, a atual acende — o degrau em que a loja está se lê sem
   contar barrinha nem procurar legenda. O ML mostra isso como um
   semicírculo cuja posição exata é difícil de julgar de relance;
   degrau é uma leitura ordinal, que é o que o número de fato é. */
const CORES_FAIXA = ["var(--destructive)", "var(--escala-2)", "var(--warning)", "var(--escala-4)", "var(--success)"];

function Termometro({ faixa }: { faixa: number | null }) {
  const reduzir = useReducedMotion();

  return (
    <div className="flex items-end gap-1.5" role="img" aria-label={faixa ? `Faixa ${faixa} de 5 no termômetro` : "Sem termômetro"}>
      {CORES_FAIXA.map((cor, indice) => {
        const posicao = indice + 1;
        const ativo = faixa === posicao;
        const conquistado = faixa !== null && posicao <= faixa;
        const altura = 14 + indice * 6;
        return (
          <motion.span
            key={cor}
            initial={reduzir ? false : { scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: conquistado ? 1 : 0.22 }}
            transition={reduzir ? { duration: 0 } : { ...springs.settle, delay: indice * 0.06 }}
            className="w-3.5 rounded-[3px]"
            style={{
              height: altura,
              background: cor,
              transformOrigin: "bottom",
              boxShadow: ativo ? `0 0 0 2px var(--card), 0 0 14px ${cor}99` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

/* ── Indicador de taxa ─────────────────────────────────────────
   A escala vai até o dobro do limite, não até 100%: uma taxa de
   reclamação de 2,4% num eixo de 0 a 100 seria um traço invisível,
   e é justamente a taxa que derruba o termômetro. O risco marca o
   teto, e estourá-lo troca a cor e traz o próximo passo junto. */
function IndicadorTaxa({ taxa, indice }: { taxa: TaxaReputacao; indice: number }) {
  const semDado = taxa.valor === null;
  const cor = taxa.estourado ? "var(--destructive)" : semDado ? "var(--muted-foreground)" : "var(--success)";
  const escala = Math.max(taxa.limite * 2, (taxa.valor ?? 0) * 1.15);
  const acao = copy.acoes[taxa.chave as ChaveTaxa];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.settleFast, delay: 0.1 + indice * 0.06 }}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 truncate text-[12px] font-semibold text-foreground">
          <span className="truncate">{taxa.label}</span>
          <CalculoPopover
            compacto
            titulo={taxa.label}
            significado={`Taxa de ${taxa.label.toLowerCase()} medida pelo Mercado Livre nesse período. Ultrapassar o limite de ${taxa.limite}% pode derrubar a faixa do termômetro.`}
            formula="ocorrências da taxa, divididas pelo total de vendas concluídas no período, em porcentagem"
            resultado={semDado ? "Sem dado" : `${(taxa.valor as number).toFixed(1)}%`}
            itens={[
              { label: "Ocorrências no período", valor: taxa.ocorrencias !== null ? String(taxa.ocorrencias) : "Sem dado" },
              { label: "Limite do Mercado Livre", valor: `${taxa.limite}%` },
            ]}
            nota={taxa.estourado ? (acao ?? "Taxa acima do limite do Mercado Livre.") : "Dentro do limite do Mercado Livre nesse período."}
          />
        </span>
        <span className="shrink-0 text-[12px] font-bold tabular-nums" style={{ color: cor }}>
          {semDado ? "Sem dado" : <NumeroAnimado valor={taxa.valor as number} formatar={(v) => `${v.toFixed(1)}%`} />}
          <span className="ml-1 text-[10px] font-medium text-muted-foreground">
            / {taxa.limite}% {copy.limiteLabel}
          </span>
        </span>
      </div>
      <BarraComLimite
        valor={taxa.valor ?? 0}
        maximo={escala}
        limite={taxa.limite}
        cor={cor}
        altura={7}
        atraso={0.14 + indice * 0.06}
      />
      {taxa.ocorrencias !== null && (
        <span className="text-[10px] tabular-nums text-muted-foreground">
          <NumeroAnimado valor={taxa.ocorrencias} formatar={(v) => String(Math.round(v))} /> {copy.ocorrenciasLabel}
        </span>
      )}
      {taxa.estourado && acao && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={springs.settleFast}
          className="flex items-start gap-1.5 overflow-hidden rounded-[0.6rem] bg-destructive/8 px-2.5 py-1.5 text-[11px] leading-snug text-destructive"
        >
          <AlertTriangle size={12} className="mt-[2px] shrink-0" />
          {acao}
        </motion.p>
      )}
    </motion.div>
  );
}

function BlocoMarca({ marca, indice }: { marca: ReputacaoMarca; indice: number }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.settleFast, delay: indice * 0.06 }}
      className="flex flex-col gap-4 rounded-[1rem] border border-border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isBrandSlug(marca.marca)
              ? <BrandLogo brand={marca.marca} height={17} />
              : <span className="truncate text-sm font-bold text-foreground">{marca.marcaLabel}</span>}
            {marca.seloMercadoLider && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-bold text-success">
                <Award size={10} /> {marca.seloMercadoLider}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
            {marca.faixaLabel ?? copy.semTermometro}
            {marca.vendasConcluidas !== null && <> · <NumeroAnimado valor={marca.vendasConcluidas} formatar={(v) => String(Math.round(v))} /> {copy.vendasLabel}</>}
            {marca.periodoMetricas && ` · ${marca.periodoMetricas}`}
          </p>
        </div>
        <Termometro faixa={marca.faixa} />
      </div>

      {marca.avaliacaoPositiva !== null && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] tabular-nums">
          <span className="inline-flex items-center gap-1 font-semibold text-success">
            <Star size={11} fill="currentColor" /> <NumeroAnimado valor={marca.avaliacaoPositiva} formatar={(v) => `${v.toFixed(0)}%`} /> positivas
          </span>
          <span className="text-muted-foreground"><NumeroAnimado valor={marca.avaliacaoNeutra ?? 0} formatar={(v) => `${v.toFixed(0)}%`} /> neutras</span>
          <span className="text-destructive"><NumeroAnimado valor={marca.avaliacaoNegativa ?? 0} formatar={(v) => `${v.toFixed(0)}%`} /> negativas</span>
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        {marca.taxas.map((taxa, posicao) => (
          <IndicadorTaxa key={taxa.chave} taxa={taxa} indice={posicao} />
        ))}
      </div>
    </motion.div>
  );
}

/* ── Conta caída ───────────────────────────────────────────────
   Diferente de "nunca conectou": aqui já funcionou, e algo quebrou
   (token expirado, revogado no próprio ML). Sem isto, a marca some
   da lista sem explicação — só um card a menos, sem dizer por quê. */
function AvisoContaDesconectada({ conta, indice }: { conta: ContaDesconectada; indice: number }) {
  const diaMesAno = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const cor = conta.status === "desconectado" ? "var(--destructive)" : "var(--warning)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.settleFast, delay: indice * 0.06 }}
      className="flex items-start gap-2.5 rounded-[1rem] border border-dashed p-3.5"
      style={{ borderColor: tint(cor, 33) }}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: tint(cor, 9), color: cor }}>
        <PlugZap size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">
          {conta.marcaLabel} · {conta.status === "desconectado" ? copy.contaDesconectada : copy.contaDegradada}
        </p>
        {conta.ultimoErro && (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{conta.ultimoErro}</p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">
          {conta.ultimaVerificacao
            ? `${copy.verificadoEm} ${diaMesAno.format(new Date(conta.ultimaVerificacao))}`
            : copy.nuncaVerificado}
          {" · "}{copy.reconectarEm}
        </p>
      </div>
    </motion.div>
  );
}

export function ReputacaoCard({ dados, carregando }: {
  dados: SaudeLojaResultado | null;
  carregando: boolean;
}) {
  const reputacoes = (dados?.marcas ?? [])
    .map((marca) => marca.reputacao)
    .filter((item): item is ReputacaoMarca => item !== null);

  return (
    <Card>
      <CardHead />

      {carregando && !dados ? (
        <div className="space-y-3 px-5 pb-5 pt-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : reputacoes.length === 0 && (dados?.contasDesconectadas.length ?? 0) === 0 ? (
        // "Nunca conectou" é o único caso que ainda merece o convite genérico
        // — quando existe conta caída, o aviso abaixo já é mais informativo
        // que "conecte em Configurações" para algo que já foi conectado.
        <EmptyState
          illustration="generic"
          title={dados?.reputacaoIndisponivel ? copy.semConta : copy.semTermometro}
          description={dados?.reputacaoIndisponivel ? copy.semContaDescricao : copy.semTermometroDescricao}
        />
      ) : (
        <motion.div
          animate={{ opacity: carregando ? 0.55 : 1 }}
          transition={springs.settleFast}
          className="flex flex-col gap-3 px-4 pb-5 pt-4 sm:px-5"
        >
          {dados?.contasDesconectadas.map((conta, indice) => (
            <AvisoContaDesconectada key={conta.brandId} conta={conta} indice={indice} />
          ))}

          {reputacoes.map((marca, indice) => (
            <BlocoMarca key={marca.brandId} marca={marca} indice={indice} />
          ))}

          {dados && dados.marcasComFalha.length > 0 && (
            <p className="flex items-start gap-1.5 rounded-[0.75rem] bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700">
              <AlertTriangle size={12} className="mt-[2px] shrink-0" />
              {copy.falhaParcial} {dados.marcasComFalha.join(", ")}.
            </p>
          )}
        </motion.div>
      )}
    </Card>
  );
}
