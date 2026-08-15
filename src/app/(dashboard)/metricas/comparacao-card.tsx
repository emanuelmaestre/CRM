"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Crown, Scale } from "lucide-react";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { springs } from "@/shared/design-system/motion-variants";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import metricasConfig from "@/config/metricas.json";
import type { SaudeLojaResultado, SaudeMarca } from "@/modules/metricas/application/saude-loja.service";
import { BarraComLimite, Card, CardHead } from "./metricas-primitives";
import { tint } from "@/shared/design-system/color";

const copy = metricasConfig.comparacaoCard;
const ACENTO = "var(--info)";

type Criterio = "score" | "faturamento" | "pedidos" | "ticketMedio" | "notaMedia" | "margem";

/** Valor bruto do critério — é o que ordena e o que dimensiona a barra. */
function valorDe(marca: SaudeMarca, criterio: Criterio): number | null {
  switch (criterio) {
    case "score": return marca.score;
    case "faturamento": return marca.faturamento;
    case "pedidos": return marca.pedidos;
    case "ticketMedio": return marca.ticketMedio;
    case "notaMedia": return marca.notaMedia;
    case "margem": return marca.margemPercentual;
  }
}

/** Mesmo valor, escrito como a pessoa espera ver aquele indicador. */
function rotuloDe(marca: SaudeMarca, criterio: Criterio): string {
  switch (criterio) {
    case "score": return marca.score === null ? "—" : String(marca.score);
    case "faturamento": return marca.faturamentoLabel;
    case "pedidos": return String(marca.pedidos);
    case "ticketMedio": return marca.ticketMedioLabel;
    case "notaMedia": return marca.notaMedia === null ? "—" : `${marca.notaMedia.toFixed(1)} ★`;
    case "margem": return marca.margemPercentual === null ? "—" : `${marca.margemPercentual}%`;
  }
}

function corDaMarca(slug: string): string {
  return (isBrandSlug(slug) ? getBrandConfig(slug)?.color : undefined) ?? ACENTO;
}

/* ── Tira de números ───────────────────────────────────────────
   Os outros indicadores continuam visíveis mesmo quando não são o
   critério de ordenação. É o que separa "comparar" de "olhar um
   ranking": trocar de critério não deveria esconder o resto. */
function TiraNumeros({ marca }: { marca: SaudeMarca }) {
  const campos = [
    { label: "Faturamento", valor: marca.faturamentoLabel },
    { label: "Pedidos", valor: String(marca.pedidos) },
    { label: "Ticket", valor: marca.ticketMedioLabel },
    { label: "Nota", valor: marca.notaMedia === null ? "—" : `${marca.notaMedia.toFixed(1)} ★` },
    {
      label: "Reclamações",
      valor: marca.emMediacao > 0
        ? `${marca.reclamacoesAbertas} (${marca.emMediacao} em mediação)`
        : String(marca.reclamacoesAbertas),
      alerta: marca.emMediacao > 0,
    },
    {
      label: "Resposta",
      valor: marca.atendimento?.medianaLabel ?? "—",
    },
    {
      // Cobertura baixa some do rótulo em vez de assustar com um "(12%)"
      // que a maioria não vai parar para interpretar — mas o title fica
      // disponível para quem passar o mouse e quiser saber o porquê.
      label: "Margem",
      valor: marca.margemPercentual === null ? "—" : `${marca.margemPercentual}%`,
      titulo: marca.margemPercentual === null
        ? "Nenhum pedido com comissão do Mercado Livre conhecida no período"
        : `Calculada sobre ${marca.margemCoberturaPercentual}% da receita — só pedidos com comissão informada`,
    },
    {
      label: "Cancelamento",
      valor: marca.taxaCancelamento === null ? "—" : `${marca.taxaCancelamento}%`,
      // Sobre TODOS os pedidos do período, não só os que entram no faturamento
      // — é a única métrica da tela que conta o que o resto exclui de propósito.
      alerta: (marca.taxaCancelamento ?? 0) > 5,
      titulo: "Fração dos pedidos do período cancelada ou devolvida",
    },
    {
      label: "Top 5 produtos",
      valor: marca.concentracaoTop5 === null ? "—" : `${marca.concentracaoTop5}%`,
      titulo: "Quanto da receita da marca veio dos 5 produtos mais vendidos — alto é risco se um deles faltar",
    },
    {
      label: "Recorrência",
      valor: marca.taxaRecorrencia === null ? "—" : `${marca.taxaRecorrencia}%`,
      titulo: "Quanto da receita veio de cliente que já tinha comprado dessa marca antes do período",
    },
  ];

  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
      {campos.map((campo) => (
        <div key={campo.label} className="min-w-0">
          <dt className="truncate text-[10px] uppercase tracking-wide text-muted-foreground/80">{campo.label}</dt>
          <dd
            title={campo.titulo}
            className={`truncate text-[12px] font-semibold tabular-nums ${campo.alerta ? "text-destructive" : "text-foreground"}`}
          >
            {campo.valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ComparacaoCard({ dados, carregando }: {
  dados: SaudeLojaResultado | null;
  carregando: boolean;
}) {
  const [criterio, setCriterio] = useState<Criterio>("score");
  const reduzir = useReducedMotion();

  const ordenadas = useMemo(() => {
    const marcas = [...(dados?.marcas ?? [])];
    // Marca sem o indicador escolhido cai para o fim em vez de virar zero e
    // fingir que é a pior — "não medido" e "medido em zero" não são a mesma coisa.
    return marcas.sort((a, b) => {
      const va = valorDe(a, criterio);
      const vb = valorDe(b, criterio);
      if (va === null && vb === null) return a.marcaLabel.localeCompare(b.marcaLabel);
      if (va === null) return 1;
      if (vb === null) return -1;
      return vb - va;
    });
  }, [dados, criterio]);

  const maximo = useMemo(
    () => ordenadas.reduce((maior, marca) => Math.max(maior, valorDe(marca, criterio) ?? 0), 0),
    [ordenadas, criterio],
  );

  return (
    <Card>
      <CardHead
        title={copy.titulo}
        subtitle={copy.subtitulo}
        icon={Scale}
        accent={ACENTO}
        trailing={
          <div className="flex flex-wrap gap-0.5 rounded-[0.75rem] bg-muted p-1" role="tablist" aria-label={copy.ordenarPor}>
            {copy.criterios.map((opcao) => {
              const ativo = opcao.chave === criterio;
              return (
                <button
                  key={opcao.chave}
                  type="button"
                  role="tab"
                  aria-selected={ativo}
                  onClick={() => setCriterio(opcao.chave as Criterio)}
                  className="press-feedback relative rounded-[0.5rem] px-2.5 py-1 text-[11px] font-semibold transition-colors"
                  style={{ color: ativo ? "var(--foreground)" : "var(--muted-foreground)" }}
                >
                  {ativo && (
                    <motion.span
                      layoutId="metricas-criterio"
                      transition={springs.settleFast}
                      className="absolute inset-0 rounded-[0.5rem] bg-card shadow-[0_1px_4px_rgba(14,15,19,.10)]"
                    />
                  )}
                  <span className="relative z-10">{opcao.label}</span>
                </button>
              );
            })}
          </div>
        }
      />

      {carregando && !dados ? (
        <div className="space-y-3 px-5 pb-5 pt-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : ordenadas.length === 0 ? (
        <EmptyState illustration="reports" title={copy.vazio} />
      ) : (
        <motion.ul
          animate={{ opacity: carregando ? 0.55 : 1 }}
          transition={springs.settleFast}
          className="flex flex-col gap-3 px-4 pb-5 pt-4 sm:px-5"
        >
          {ordenadas.map((marca, indice) => {
            const valor = valorDe(marca, criterio);
            const cor = corDaMarca(marca.marca);
            const lider = indice === 0 && valor !== null && valor > 0;
            return (
              <motion.li
                // `layout` no <li> faz a lista reordenar deslizando quando o
                // critério muda: quem subiu e quem desceu fica evidente, em vez
                // de a lista simplesmente aparecer em outra ordem.
                key={marca.brandId}
                layout={!reduzir}
                transition={springs.settle}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[1rem] border border-border p-4"
                style={lider ? { borderColor: tint(cor, 40), background: `color-mix(in srgb, ${cor} 4%, transparent)` } : undefined}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {isBrandSlug(marca.marca)
                      ? <BrandLogo brand={marca.marca} height={17} />
                      : <span className="truncate text-sm font-bold text-foreground">{marca.marcaLabel}</span>}
                    {lider && (
                      <motion.span
                        layout={!reduzir}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: tint(cor, 10), color: cor }}
                      >
                        <Crown size={10} /> {copy.lider}
                      </motion.span>
                    )}
                  </span>
                  <span className="shrink-0 text-[15px] font-bold tabular-nums text-foreground">
                    {rotuloDe(marca, criterio)}
                  </span>
                </div>

                <div className="mt-2.5">
                  <BarraComLimite
                    valor={valor ?? 0}
                    maximo={maximo}
                    cor={cor}
                    altura={8}
                    atraso={indice * 0.06}
                  />
                </div>

                <TiraNumeros marca={marca} />
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </Card>
  );
}
