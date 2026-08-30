"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Scale } from "lucide-react";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { springs } from "@/shared/design-system/motion-variants";
import { moeda } from "@/shared/design-system/format";

export type Pendencias = { quantidade: number; valor: number };
const NOME_CANAL: Record<string, string> = { mercadolivre: "Mercado Livre", shopee: "Shopee", tiktokshop: "TikTok Shop" };

/** Explica dados locais. Sem leitura equivalente da origem, não calcula nem
 * certifica o indicador oficial. Pendências não compõem o total importado. */
export function ConferenciaCanal({ canais, faturamento, canceladosValor, pendencias, periodo, temFiltrosAdicionais = false, dadosAtuais = true }: {
  canais: string[];
  faturamento: number;
  canceladosValor: number;
  pendencias: Pendencias;
  periodo: { inicio: string; fim: string };
  temFiltrosAdicionais?: boolean;
  dadosAtuais?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const reduzir = useReducedMotion();
  const id = useId();
  if (canais.length !== 1) return null;
  const canal = canais[0];
  const nome = NOME_CANAL[canal] ?? canal;
  const temPeriodo = Boolean(periodo.inicio && periodo.fim);
  const data = (iso: string) => iso.split("-").reverse().join("/");
  const totalImportado = (Math.round(faturamento * 100) + Math.round(canceladosValor * 100)) / 100;

  return (
    <motion.section layout className="mb-4 overflow-hidden rounded-[1.25rem] border border-border bg-card">
      <button type="button" onClick={() => setAberto((atual) => !atual)} aria-expanded={aberto} aria-controls={id} className="press-feedback flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/40">
        <span className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--info) 12%, transparent)", color: "var(--info)" }}><Scale size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
            Entenda os totais do CRM
            <ChannelLogo canal={canal} size="xs" variant="logo" />
            <span className="sr-only"> — {nome}</span>
          </span>
          <span className="block text-[11.5px] text-muted-foreground">Estes valores não são uma conferência com o painel oficial.</span>
          <span className="mt-1 block text-[11.5px] text-muted-foreground">{temPeriodo ? `Período no CRM: ${data(periodo.inicio)} a ${data(periodo.fim)} · horário de Brasília.` : "Escolha um período para detalhar os totais."}</span>
        </span>
        <span className="ml-auto text-[11.5px] font-semibold text-muted-foreground">Ver composição</span>
        <motion.span aria-hidden="true" className="inline-flex text-muted-foreground" animate={{ rotate: aberto ? 180 : 0 }} transition={reduzir ? { duration: 0 } : springs.settleFast}><ChevronDown size={16} /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div id={id} key="conta" initial={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }} animate={reduzir ? { opacity: 1 } : { opacity: 1, height: "auto" }} exit={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }} transition={reduzir ? { duration: 0 } : springs.settleFast} className="overflow-hidden">
            <div className="space-y-3 border-t border-border px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
              {!dadosAtuais ? <p role="status">Aguardando dados atualizados para os filtros selecionados. Se a consulta falhou, tente atualizar a tela.</p> : temPeriodo ? (
                <>
                  <dl className="space-y-2 text-[13px]">
                    <div className="flex flex-wrap justify-between gap-2"><dt>Faturamento nesta tela</dt><dd className="font-semibold tabular-nums text-foreground">{moeda.format(faturamento)}</dd></div>
                    <div className="flex flex-wrap justify-between gap-2"><dt>Cancelados e devolvidos</dt><dd className="font-semibold tabular-nums text-foreground">{moeda.format(canceladosValor)}</dd></div>
                    <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 font-bold text-foreground"><dt>Total dos pedidos importados neste recorte</dt><dd className="tabular-nums">{moeda.format(totalImportado)}</dd></div>
                  </dl>
                  <p>O faturamento acima exclui os pedidos marcados como cancelados ou devolvidos. Somá-los mostra o total registrado no CRM, incluindo esses pedidos; isso não representa o valor recebido nem o indicador oficial do {nome}.</p>
                  {temFiltrosAdicionais && <p className="font-semibold text-foreground">A busca ou o filtro de status limita estes totais. Para conferir o período inteiro, limpe a busca e selecione Todos.</p>}
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="font-semibold text-foreground">Pendências conhecidas de importação</p>
                    <p>{pendencias.quantidade > 0 ? `${pendencias.quantidade} pendência(s) com data identificada neste período, para as empresas e o canal selecionados. Esses registros não são somados aos totais acima; seus valores precisam ser confirmados na origem.` : "Nenhuma pendência com data identificada neste período. Isso não comprova que todos os pedidos foram recebidos."}</p>
                    <Link href="/vendas/pedidos-ignorados" className="font-semibold text-foreground underline decoration-dotted underline-offset-2">Ver todas as pendências, inclusive sem data</Link>
                  </div>
                  <p>O valor do painel oficial não foi consultado por este card. Para comparar, confira a mesma empresa, as datas exatas, os filtros e a definição do indicador nos dois lados. Diferenças precisam ser verificadas; não são atribuídas automaticamente a horário ou atraso.</p>
                </>
              ) : <p>Selecione as datas de início e fim para ver a composição dos dados do CRM.</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
