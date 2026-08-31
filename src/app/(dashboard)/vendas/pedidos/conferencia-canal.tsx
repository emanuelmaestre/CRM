"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Radio, Scale } from "lucide-react";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { springs } from "@/shared/design-system/motion-variants";
import { moeda } from "@/shared/design-system/format";
import type { FaturamentoOficialCanal } from "@/modules/vendas/application/faturamento-oficial.service";
import { ResumoDesempenhoML } from "./resumo-desempenho-ml";

export type Pendencias = { quantidade: number; valor: number };
export type FaturamentoOficial = FaturamentoOficialCanal;

const NOME_CANAL: Record<string, string> = { mercadolivre: "Mercado Livre", shopee: "Shopee", tiktokshop: "TikTok Shop" };
const horaBrasilia = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export function ConferenciaCanal({
  canais,
  faturamento,
  faturamentoOficial = null,
  canceladosValor,
  pendencias,
  periodo,
  temFiltrosAdicionais = false,
  dadosAtuais = true,
}: {
  canais: string[];
  faturamento: number;
  faturamentoOficial?: FaturamentoOficial | null;
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
  const canalAoVivo = canal === "mercadolivre" || canal === "shopee";
  const temPeriodo = Boolean(periodo.inicio && periodo.fim);
  const data = (iso: string) => iso.split("-").reverse().join("/");
  const totalImportado = (Math.round(faturamento * 100) + Math.round(canceladosValor * 100)) / 100;
  const oficialOk = canalAoVivo && faturamentoOficial?.status === "ok" ? faturamentoOficial : null;
  const mensagemOficial = faturamentoOficial && faturamentoOficial.status !== "ok" ? faturamentoOficial.mensagem : null;
  const diferenca = oficialOk ? (Math.round(faturamento * 100) - Math.round(oficialOk.faturamento * 100)) / 100 : null;

  const valorCabecalho = !dadosAtuais
    ? "Atualizando…"
    : !temPeriodo
      ? "Selecione o período"
      : canalAoVivo
        ? faturamentoOficial === null
          ? "Consultando…"
          : oficialOk
            ? moeda.format(oficialOk.faturamento)
            : "Indisponível"
        : moeda.format(faturamento);

  return (
    <motion.section layout className="mb-4 overflow-hidden rounded-[1.25rem] border border-border bg-card">
      <button type="button" onClick={() => setAberto((atual) => !atual)} aria-expanded={aberto} aria-controls={id} className="press-feedback flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/40">
        <span className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--info) 12%, transparent)", color: "var(--info)" }}>
          {canalAoVivo ? <Radio size={16} /> : <Scale size={16} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
            {canalAoVivo ? `${nome} ao vivo` : "Entenda os totais do CRM"}
            <ChannelLogo canal={canal} size="xs" variant="logo" />
            <span className="sr-only"> — {nome}</span>
          </span>
          <span className="block text-[11.5px] text-muted-foreground">
            {canalAoVivo ? "Consulta autenticada diretamente na API oficial de pedidos." : "Estes valores não são uma conferência com o painel oficial."}
          </span>
          <span className="mt-1 block text-[11.5px] text-muted-foreground">
            {temPeriodo ? `Período: ${data(periodo.inicio)} a ${data(periodo.fim)} · horário de Brasília.` : "Escolha um período para detalhar os totais."}
          </span>
        </span>
        <span className="flex w-full shrink-0 items-center justify-between gap-3 pl-11 sm:ml-auto sm:w-auto sm:justify-start sm:gap-4 sm:pl-0">
          <span className="text-left sm:text-right">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {canalAoVivo ? `Faturamento ao vivo · ${nome}` : "Faturamento atual no CRM"}
            </span>
            <span data-testid={canalAoVivo ? `faturamento-oficial-${canal}` : "faturamento-atual-crm"} aria-live="polite" className="block text-sm font-bold tabular-nums text-foreground">
              {valorCabecalho}
            </span>
          </span>
          <span className="text-[11.5px] font-semibold text-muted-foreground">{canal === "mercadolivre" ? (aberto ? "Ocultar desempenho" : "Ver desempenho e conferência") : (aberto ? "Ocultar conferência" : "Ver conferência")}</span>
          <motion.span aria-hidden="true" className="inline-flex text-muted-foreground" animate={{ rotate: aberto ? 180 : 0 }} transition={reduzir ? { duration: 0 } : springs.settleFast}><ChevronDown size={16} /></motion.span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div id={id} key="conta" initial={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }} animate={reduzir ? { opacity: 1 } : { opacity: 1, height: "auto" }} exit={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }} transition={reduzir ? { duration: 0 } : springs.settleFast} className="overflow-hidden">
            <div className="space-y-3 border-t border-border px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
              {!dadosAtuais ? (
                <p role="status">Aguardando os valores do CRM e do canal para os filtros selecionados.</p>
              ) : !temPeriodo ? (
                <p>Selecione as datas de início e fim para fazer a consulta.</p>
              ) : canalAoVivo ? (
                <>
                  {oficialOk ? (
                    <>
                      {canal === "mercadolivre" && oficialOk.desempenho && <ResumoDesempenhoML desempenho={oficialOk.desempenho} temFiltrosAdicionais={temFiltrosAdicionais} />}
                      {canal === "mercadolivre" && <h3 className="border-t border-border pt-3 text-sm font-bold text-foreground">Conferência de faturamento</h3>}
                      <dl className="space-y-2 text-[13px]">
                        <div className="flex flex-wrap justify-between gap-2"><dt>{nome} ao vivo ({oficialOk.pedidosValidos} pedidos válidos)</dt><dd className="font-semibold tabular-nums text-foreground">{moeda.format(oficialOk.faturamento)}</dd></div>
                        <div className="flex flex-wrap justify-between gap-2"><dt>CRM neste recorte</dt><dd className="font-semibold tabular-nums text-foreground">{moeda.format(faturamento)}</dd></div>
                        {!temFiltrosAdicionais && <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 font-bold text-foreground"><dt>Diferença (CRM − {nome})</dt><dd data-testid="diferenca-faturamento" className="tabular-nums">{moeda.format(diferenca ?? 0)}</dd></div>}
                        <div className="flex flex-wrap justify-between gap-2"><dt>Total bruto da API ({oficialOk.totalPedidos} pedidos)</dt><dd className="font-semibold tabular-nums text-foreground">{moeda.format(oficialOk.totalBruto)}</dd></div>
                      </dl>
                      {!temFiltrosAdicionais && diferenca === 0 && <p className="font-semibold text-foreground">O faturamento comparável do CRM está igual {canal === "shopee" ? "à Shopee" : "ao Mercado Livre"} neste momento.</p>}
                      {!temFiltrosAdicionais && diferenca !== 0 && <p className="font-semibold text-foreground">Há uma diferença de {moeda.format(Math.abs(diferenca ?? 0))}. A divergência permanece sinalizada para auditoria.</p>}
                      {temFiltrosAdicionais && <p className="font-semibold text-foreground">A API oficial consulta o período inteiro, mas o CRM está limitado por busca ou status. Limpe esses filtros para calcular a diferença.</p>}
                      <p>Consultado em {horaBrasilia.format(new Date(oficialOk.consultadoEm))}, em {oficialOk.contasConsultadas} conta(s). O faturamento comparável exclui cancelados e devolvidos nos dois lados; o total bruto da API volta a incluí-los.</p>
                    </>
                  ) : (
                    <div role="status" className="rounded-lg bg-muted/40 p-3">
                      <p className="font-semibold text-foreground">Consulta oficial indisponível</p>
                      <p>{mensagemOficial ?? "A consulta ainda não retornou."}</p>
                    </div>
                  )}
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="font-semibold text-foreground">Pendências conhecidas de importação</p>
                    <p>{pendencias.quantidade > 0 ? `${pendencias.quantidade} pendência(s) com data identificada neste período. Elas não são somadas automaticamente; o valor ao vivo acima continua vindo da origem.` : "Nenhuma pendência com data identificada neste período. A comparação ao vivo é que confirma o valor atual."}</p>
                    <Link href="/vendas/pedidos-ignorados" className="font-semibold text-foreground underline decoration-dotted underline-offset-2">Ver todas as pendências, inclusive sem data</Link>
                  </div>
                  <p>Esta leitura vem {canal === "shopee" ? "das APIs oficiais de pedidos e financeiro da Shopee" : "do endpoint oficial de pedidos do Mercado Livre"} no período selecionado. Ela compara a mesma regra de faturamento do CRM; não se apresenta como reprodução de indicadores separados do painel oficial, cuja fórmula pode ser diferente.</p>
                </>
              ) : (
                <>
                  <dl className="space-y-2 text-[13px]">
                    <div className="flex flex-wrap justify-between gap-2"><dt>Faturamento nesta tela</dt><dd className="font-semibold tabular-nums text-foreground">{moeda.format(faturamento)}</dd></div>
                    <div className="flex flex-wrap justify-between gap-2"><dt>Cancelados e devolvidos</dt><dd className="font-semibold tabular-nums text-foreground">{moeda.format(canceladosValor)}</dd></div>
                    <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 font-bold text-foreground"><dt>Total dos pedidos importados neste recorte</dt><dd className="tabular-nums">{moeda.format(totalImportado)}</dd></div>
                  </dl>
                  <p>O valor oficial do {nome} não é consultado por este card.</p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
