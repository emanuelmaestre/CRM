"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Scale } from "lucide-react";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { springs } from "@/shared/design-system/motion-variants";
import { moeda } from "@/shared/design-system/format";
import type { LimiteDoDia, PedidoNoLimite } from "@/shared/components/limite-do-dia";

/* ── Por que esta tela precisa fazer esta conta ───────────────────────────
   O operador abre o painel do Mercado Livre, vê R$ 56.165, olha o CRM, vê
   R$ 54.580 e conclui que o CRM está errado. Não está: os dois medem coisas
   diferentes, e a diferença é sempre a soma das mesmas três parcelas. Até
   30/08/2026 essa conta era refeita à mão a cada vez que a pergunta surgia —
   e a resposta morria no chat, sem nunca virar parte do produto.

   Aqui ela vira. As três parcelas:

   1. CANCELADOS. O painel do canal soma venda cancelada no "vendas brutas";
      o CRM tira de propósito, porque cancelado não é receita. É a maior das
      três, e não é defeito de ninguém.
   2. VIRADA DO DIA. O Mercado Livre fecha o dia em GMT-4 e o CRM em Brasília
      — uma hora de diferença. Pedido nenhum some; alguns trocam de dia.
   3. PEDIDOS QUE NÃO ENTRARAM. Venda que o canal registrou e a importação
      recusou. Esta é a única parcela que representa problema de verdade, e a
      única que some quando alguém age (em /vendas/pedidos-ignorados).

   Com as três somadas, o número tem que bater com o painel do canal. Quando
   não bater, sobrou coisa que ninguém sabia — e aí sim vale investigar. */

export type Pendencias = { quantidade: number; valor: number };

/** Soma da virada do dia INCLUINDO cancelado — de propósito diferente de
 *  `somarLimite`, que serve ao card e exclui, porque lá a comparação é com o
 *  Faturamento. Aqui o alvo é o bruto do canal, que já tem os cancelados
 *  somados uma linha acima: deixá-los fora só desta parcela faria um pedido
 *  cancelado na hora da virada ser corrigido pela metade. */
function somarViradas(linhas: PedidoNoLimite[]): number {
  return linhas.reduce((total, item) => total + item.total, 0);
}

const NOME_CANAL: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  tiktokshop: "TikTok Shop",
};

function Parcela({ sinal, rotulo, valor, explicacao, acao }: {
  sinal: "+" | "−" | "=";
  rotulo: string;
  valor: number;
  explicacao: string;
  acao?: React.ReactNode;
}) {
  const total = sinal === "=";
  return (
    <div className={`flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 py-1.5 ${total ? "border-t border-border pt-2.5" : ""}`}>
      <span
        aria-hidden="true"
        className="w-3 shrink-0 text-center text-sm font-bold tabular-nums"
        style={{ color: total ? "var(--foreground)" : "var(--muted-foreground)" }}
      >
        {sinal}
      </span>
      <span className={`shrink-0 text-[13px] ${total ? "font-bold text-foreground" : "font-semibold text-foreground/85"}`}>
        {rotulo}
      </span>
      <span
        className={`order-last ml-auto shrink-0 tabular-nums sm:order-none ${total ? "text-base font-bold" : "text-[13px] font-semibold"}`}
        style={{ color: total ? "var(--foreground)" : "var(--muted-foreground)" }}
      >
        {moeda.format(valor)}
      </span>
      <span className="w-full text-[11.5px] leading-relaxed text-muted-foreground sm:w-auto sm:flex-1 sm:basis-full">
        {explicacao}
        {acao}
      </span>
    </div>
  );
}

/** A conta que leva do Faturamento do CRM ao número do painel do canal.
 *
 *  Só aparece com UM canal escolhido: "o painel do canal" não existe quando
 *  há dois na tela, e somar Mercado Livre com Shopee ainda mistura réguas
 *  diferentes (o ML conta só os produtos; a Shopee, o que o comprador pagou).
 *  Preferir o silêncio à conta errada é o ponto inteiro deste bloco. */
export function ConferenciaCanal({ canais, faturamento, canceladosValor, limiteDoDia, pendencias, temPeriodo }: {
  /** Canais no filtro da tela. Vazio = todos, que também não dá comparação. */
  canais: string[];
  faturamento: number;
  canceladosValor: number;
  limiteDoDia: LimiteDoDia;
  pendencias: Pendencias;
  temPeriodo: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const reduzir = useReducedMotion();
  const id = useId();

  if (canais.length !== 1) return null;
  const canal = canais[0];
  const nome = NOME_CANAL[canal] ?? canal;

  /* O ML fecha o dia uma hora antes do CRM: os pedidos da primeira hora do
     período ele conta no dia anterior (saem da conta), e os da primeira hora
     do dia seguinte ele conta aqui dentro (entram). Nos outros canais a
     parcela não existe e a linha some. */
  const soAqui = somarViradas(limiteDoDia.soAqui);
  const soNoCanal = somarViradas(limiteDoDia.soNoMercadoLivre);
  const ajusteFuso = canal === "mercadolivre" ? soNoCanal - soAqui : 0;
  const temFuso = canal === "mercadolivre" && (limiteDoDia.soAqui.length + limiteDoDia.soNoMercadoLivre.length) > 0;

  const esperado = faturamento + canceladosValor + ajusteFuso + pendencias.valor;

  return (
    <motion.section
      layout
      className="mb-4 overflow-hidden rounded-[1.25rem] border border-border bg-card"
    >
      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
        aria-controls={id}
        className="press-feedback flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--info) 12%, transparent)", color: "var(--info)" }}>
          <Scale size={16} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
            Conferir com o painel do {nome}
            <ChannelLogo canal={canal} size="xs" variant="logo" />
          </span>
          <span className="block text-[11.5px] text-muted-foreground">
            {temPeriodo
              ? "Por que este número e o do painel do canal não são iguais — e qual deles deveria bater."
              : "Escolha um período para comparar com o painel do canal."}
          </span>
        </span>
        {temPeriodo && (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-right">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Esperado no painel
              </span>
              <span className="block text-sm font-bold tabular-nums text-foreground">{moeda.format(esperado)}</span>
            </span>
            <motion.span
              aria-hidden="true"
              className="inline-flex text-muted-foreground"
              animate={{ rotate: aberto ? 180 : 0 }}
              transition={reduzir ? { duration: 0 } : springs.settleFast}
            >
              <ChevronDown size={16} />
            </motion.span>
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {aberto && temPeriodo && (
          <motion.div
            id={id}
            key="conta"
            initial={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduzir ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={reduzir ? { duration: 0 } : springs.settleFast}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 py-3">
              <Parcela
                sinal="="
                rotulo="Faturamento nesta tela"
                valor={faturamento}
                explicacao="Só o que virou receita: pedido cancelado e devolvido fica de fora, de propósito."
              />
              <Parcela
                sinal="+"
                rotulo="Cancelados e devolvidos"
                valor={canceladosValor}
                explicacao={`O painel do ${nome} soma venda cancelada no total bruto; aqui ela sai. Não é erro de nenhum dos dois — é a mesma venda contada com régua diferente.`}
              />
              {temFuso && (
                <Parcela
                  sinal={ajusteFuso < 0 ? "−" : "+"}
                  rotulo="Virada do dia"
                  valor={Math.abs(ajusteFuso)}
                  explicacao={`O ${nome} fecha o dia em GMT-4 e esta tela em Brasília: ${limiteDoDia.soAqui.length + limiteDoDia.soNoMercadoLivre.length === 1 ? "um pedido troca" : "alguns pedidos trocam"} de dia por causa dessa hora. Nenhum some.`}
                />
              )}
              <Parcela
                sinal="+"
                rotulo="Pedidos que não entraram"
                valor={pendencias.valor}
                explicacao={
                  pendencias.quantidade === 0
                    ? "Nenhuma venda do período ficou de fora da importação."
                    : `${pendencias.quantidade} ${pendencias.quantidade === 1 ? "venda que o canal registrou e a importação recusou" : "vendas que o canal registrou e a importação recusou"}. É a única parcela que some quando alguém age. `
                }
                acao={pendencias.quantidade > 0 ? (
                  <Link href="/vendas/pedidos-ignorados" className="font-bold text-foreground underline decoration-dotted underline-offset-2">
                    Resolver agora
                  </Link>
                ) : undefined}
              />
              <Parcela
                sinal="="
                rotulo={`Deve bater com o painel do ${nome}`}
                valor={esperado}
                explicacao={canal === "mercadolivre"
                  ? 'É o "Vendas brutas" do painel, no mesmo período. Sobrando alguma dezena de reais, quase sempre é venda dos últimos minutos: o webhook costuma trazer na hora, mas quando ele falha quem busca é a varredura, de 3 em 3 horas — recarregue os dois lados antes de investigar. Sobrando muito mais que isso, aí sim existe pedido que ninguém está enxergando.'
                  : `É o total do painel do ${nome} no mesmo período. Repare que os tiles do aplicativo contam por STATUS, sem recorte de data — para comparar com esta conta, use o relatório por data. Venda dos últimos minutos pode ainda não ter sido coletada.`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
