"use client";

import Link from "next/link";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Clock } from "lucide-react";
import { AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import { Dialog } from "@/shared/design-system/primitives/Dialog";
import { NumeroAnimado } from "@/shared/design-system/primitives/NumeroAnimado";
import { springs } from "@/shared/design-system/motion-variants";
import pagesConfig from "@/config/pages.json";

/** Um pedido que caiu na hora de virada entre o calendário do Mercado Livre
  *  e o daqui. Estrutura espelha o que o repositório de Vendas devolve. */
export interface PedidoNoLimite {
  id: string;
  providerOrderId: string | null;
  clienteNome: string;
  status: string;
  total: number;
  createdAt: Date;
}

export interface LimiteDoDia {
  soNoMercadoLivre: PedidoNoLimite[];
  soAqui: PedidoNoLimite[];
}

const copy = pagesConfig.pedidos;
const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/* ── Desencontro de dia com o Mercado Livre ───────────────────────────────
   Fica na linha do título, ao lado do aviso de "não importados", e agora com
   cor própria: azul de informação, nunca o âmbar/vermelho do recusado. A
   distinção continua valendo — recusado é trabalho a resolver, isto é uma
   explicação que se esgota quando a pessoa a lê — só que ela passou a ser feita pelo
   MATIZ, e não por apagar este selo até o ponto de ninguém notar que ele
   existe. Era o que acontecia: quem estranhava o total divergir do painel do
   ML não achava a resposta, que estava na tela o tempo todo, cinza.

   O rótulo também deixou de contar ("4 em outro dia no ML"): o número mudava
   a cada filtro e o botão parecia um alerta diferente a cada visita. Nome
   fixo, contador separado numa pílula — a coisa é sempre a mesma, o que muda
   é quantos pedidos ela pegou. */
export const copyLimite = copy.limiteDoDia;
export const AZUL_LIMITE = "var(--info)";

/** Pedido individual da lista. Mostra o número do ML junto do nome porque é
 *  por ele que se confere pedido a pedido do outro lado — sem isso, a lista
 *  prova que a diferença existe, mas não deixa auditar. */
function LinhaPedidoNoLimite({ item }: { item: PedidoNoLimite }) {
  const foraDaSoma = item.status === "cancelado" || item.status === "devolvido";
  return (
    <li>
      <Link
        href={`/vendas/pedidos/${item.id}`}
        className="flex items-center gap-2.5 rounded-[0.6rem] px-2 py-1.5 transition-colors hover:bg-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-foreground">{item.clienteNome}</span>
          <span className="block truncate text-[11px] tabular-nums text-muted-foreground">
            {item.providerOrderId ? `#${item.providerOrderId}` : copyLimite.pedidoSem} · {dataHora.format(item.createdAt)}
          </span>
        </span>
        {foraDaSoma && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground">
            fora da soma
          </span>
        )}
        <span
          className={`shrink-0 text-[12.5px] font-bold tabular-nums ${foraDaSoma ? "text-muted-foreground line-through" : "text-foreground"}`}
        >
          {dinheiro.format(item.total)}
        </span>
      </Link>
    </li>
  );
}

/** Uma das duas pontas do período. `soma` vem de fora porque é a mesma conta
 *  que alimenta a reconciliação lá embaixo — calcular duas vezes deixaria o
 *  card e o total livres para discordar. */
function GrupoLimiteDoDia({ titulo, dica, linhas, soma, className }: {
  titulo: string;
  dica: string;
  linhas: PedidoNoLimite[];
  soma: number;
  className?: string;
}) {
  if (linhas.length === 0) return null;
  const resumo = (linhas.length === 1 ? copyLimite.grupoResumoUm : copyLimite.grupoResumoMuitos)
    .replace("{n}", String(linhas.length))
    .replace("{valor}", dinheiro.format(soma));

  return (
    <section className={`rounded-[0.95rem] border border-border bg-muted/30 p-3.5 ${className ?? ""}`}>
      <p className="text-[11.5px] font-bold uppercase tracking-[.08em]" style={{ color: AZUL_LIMITE }}>{titulo}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{dica}</p>
      <p className="mt-2.5 text-[12.5px] font-bold tabular-nums text-foreground">{resumo}</p>
      <ul className="mt-1.5 flex flex-col divide-y divide-border/70">
        {linhas.map((item) => <LinhaPedidoNoLimite key={item.id} item={item} />)}
      </ul>
    </section>
  );
}

/** O movimento é um TIQUE DE RELÓGIO, e o assunto do botão é fuso horário: a
 *  cada ~5s o fundo azul enche e esvazia devagar e o contador dá um pulinho
 *  no fim do gesto, como o ponteiro batendo o segundo. Isto substituiu um anel
 *  que acendia e apagava na borda — piscava, e um contorno intermitente numa
 *  barra de filtros se lê como erro, não como convite.
 *
 *  Duas escolhas de propósito: o movimento é de PREENCHIMENTO (a mancha cresce
 *  por dentro, não morde o contorno) e a pausa entre repetições é longa. Um
 *  destaque estático vira paisagem depois do segundo dia; um que se mexe sem
 *  parar disputa a leitura dos pedidos. */
export const SeloLimiteDoDia = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof AnimatedInfoTrigger> & { quantidade: number }
>(function SeloLimiteDoDia({ quantidade, ...props }, ref) {
  const reduzir = useReducedMotion();
  return (
    // `forwardRef` + `{...props}` não são cerimônia: o Popover do Radix abre
    // via `asChild`, clonando este nó para pendurar nele o ref e o onClick.
    // Um componente que não repassa os dois vira um botão bonito que não
    // abre nada — foi exatamente o que aconteceu na primeira versão.
    <AnimatedInfoTrigger
      ref={ref}
      {...props}
      title={copyLimite.badgeDica}
      iconSize={12}
      whileHover={reduzir ? undefined : { y: -1 }}
      transition={springs.settleFast}
      // No celular esta informação vive na faixa abaixo dos indicadores
      // (ver FaixaLimiteDoDia); aqui ela só aparece do tablet para cima.
      className="press-feedback hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors sm:inline-flex"
      style={{
        borderColor: "color-mix(in srgb, var(--info) 35%, transparent)",
        background: "color-mix(in srgb, var(--info) 8%, transparent)",
        color: AZUL_LIMITE,
      }}
    >
      {!reduzir && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ background: "color-mix(in srgb, var(--info) 16%, transparent)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.4, times: [0, 0.35, 0.7, 1], repeat: Infinity, repeatDelay: 4.4, ease: "easeInOut" }}
        />
      )}
      {/* O nome diz a CAUSA (o fuso), não o sintoma: "Pedidos na virada do
          dia" descrevia o que se vê, e quem chega aqui está atrás do porquê de
          o total não bater com o painel do ML. Duas versões porque a barra de
          filtros no celular é estreita e o rótulo inteiro empurrava o contador
          para fora — a palavra que não pode faltar em nenhuma das duas é
          "fuso". */}
      <span className="relative hidden sm:inline">{copyLimite.badge}</span>
      <span className="relative sm:hidden">{copyLimite.badgeCurto}</span>
      {/* Número com unidade: "4" sozinho num selo podia ser hora, dia ou
          posição; "4 pedidos" só pode ser uma coisa. No celular a unidade sai
          e fica o número, que ali o rótulo ao lado já qualifica. */}
      <motion.span
        className="relative inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-extrabold tabular-nums text-white"
        style={{ background: AZUL_LIMITE }}
        // O pulinho cai no fim da respiração do fundo (2,4s), não no começo:
        // é o tique fechando o gesto, em vez de dois movimentos concorrendo.
        animate={reduzir ? undefined : { scale: [1, 1, 1.12, 1] }}
        transition={{ duration: 2.4, times: [0, 0.62, 0.78, 1], repeat: Infinity, repeatDelay: 4.4, ease: "easeOut" }}
      >
        <span className="hidden sm:inline">
          {(quantidade === 1 ? copyLimite.badgeContadorUm : copyLimite.badgeContadorMuitos).replace("{n}", String(quantidade))}
        </span>
        <span className="sm:hidden">{quantidade}</span>
      </motion.span>
    </AnimatedInfoTrigger>
  );
});

/* ── As duas portas de entrada ────────────────────────────────────────────
   A explicação é a mesma; muda por onde se chega até ela.

   No celular o selo ficava numa quarta linha de coisas pequenas no cabeçalho
   da lista, longe dos números que ele explica. Vira uma faixa logo abaixo da
   grade de indicadores — no mesmo lugar onde a pessoa já está lendo números, e
   com o próprio número à vista.

   FAIXA, e não um quinto card: um card de largura inteira somaria ~100px de
   altura antes do primeiro pedido aparecer, e a informação nem é do mesmo tipo
   dos outros quatro — aqueles medem a operação, esta explica uma divergência.
   A forma diferente carrega essa diferença, e uma linha só (46px, o mínimo
   confortável de alvo de toque) custa metade de um card.

   Do tablet para cima o cabeçalho vira uma linha horizontal com espaço de
   sobra e o selo cabe lá sem competir com nada. Por isso um aparece e o outro
   some, nunca os dois: `sm:hidden` na faixa, `hidden sm:inline-flex` no selo.

   Sem nenhum pedido na virada, os dois somem e a grade fica como sempre foi. */
export function FaixaLimiteDoDia({ dados, onClick }: { dados: LimiteDoDia; onClick: () => void }) {
  const reduzir = useReducedMotion();
  const quantidade = dados.soNoMercadoLivre.length + dados.soAqui.length;
  if (quantidade === 0) return null;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={copyLimite.faixaDica}
      whileTap={reduzir ? undefined : { scale: 0.98 }}
      transition={springs.momentum}
      className="relative flex min-h-11 w-full items-center gap-2.5 overflow-hidden rounded-[1.15rem] border-2 px-3.5 py-2.5 text-left shadow-[0_2px_14px_rgba(14,15,19,.06)] sm:hidden"
      style={{
        borderColor: "color-mix(in srgb, var(--info) 30%, transparent)",
        background: "var(--card)",
      }}
    >
      {/* Mesmo tique de relógio do selo do desktop — ver GatilhoLimiteDoDia. */}
      {!reduzir && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "color-mix(in srgb, var(--info) 10%, transparent)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.4, times: [0, 0.35, 0.7, 1], repeat: Infinity, repeatDelay: 4.4, ease: "easeInOut" }}
        />
      )}
      <Clock size={15} strokeWidth={1.75} className="relative shrink-0" style={{ color: AZUL_LIMITE }} />
      <span className="relative min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: AZUL_LIMITE }}>
        {copyLimite.badge}
      </span>
      <span
        className="relative inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold tabular-nums text-white"
        style={{ background: AZUL_LIMITE }}
      >
        <NumeroAnimado valor={quantidade} formatar={(v) => Math.round(v).toLocaleString("pt-BR")} apenasPrimeiraVez={false} duracao={0.5} />
      </span>
      <ChevronRight size={16} className="relative shrink-0" style={{ color: AZUL_LIMITE }} />
    </motion.button>
  );
}

/** Estado vem de fora: as duas portas (faixa no celular, selo no desktop) moram
 *  em pontos distantes da árvore e abrem a MESMA janela. Com estado interno,
 *  cada uma carregaria a sua — duas cópias da explicação montadas no DOM. */
/** Só a janela. Existe separada do selo porque outras telas chegam nela por
 *  caminhos próprios — o card de Faturamento, em Métricas, abre a mesma
 *  explicação a partir de uma faixa dele. */
export function JanelaLimiteDoDia({ dados, aberto, setAberto, comSelo }: {
  dados: LimiteDoDia;
  aberto: boolean;
  setAberto: (aberto: boolean) => void;
  /** Quando true, o selo do cabeçalho de Vendas é renderizado junto. */
  comSelo?: boolean;
}) {
  const { soNoMercadoLivre, soAqui } = dados;
  const quantidade = soNoMercadoLivre.length + soAqui.length;
  if (quantidade === 0) return null;

  /* Cancelado e devolvido aparecem na lista (o pedido existe e está mesmo na
     hora de virada), mas ficam fora da soma: o Faturamento desta tela também
     os exclui, e é com ele que a pessoa está comparando. */
  const somar = (linhas: PedidoNoLimite[]) => linhas
    .filter((item) => item.status !== "cancelado" && item.status !== "devolvido")
    .reduce((total, item) => total + item.total, 0);
  const somaAdiante = somar(soNoMercadoLivre);
  const somaAtras = somar(soAqui);
  const diferenca = somaAdiante - somaAtras;
  // Duas colunas só quando existem mesmo duas pontas — com um grupo só, a
  // segunda coluna viraria um vazio do tamanho do conteúdo ao lado.
  const duasPontas = soNoMercadoLivre.length > 0 && soAqui.length > 0;

  const subtitle = (quantidade === 1 ? copyLimite.subtitleUm : copyLimite.subtitleMuitos)
    .replace("{n}", String(quantidade));

  return (
    <>
      {comSelo && <SeloLimiteDoDia quantidade={quantidade} onClick={() => setAberto(true)} />}
      {/* Tela cheia, e não o popover ancorado que isto era: preso ao botão,
          o popover só podia usar o espaço entre ele e a borda da tela — cerca
          de 300px com o botão no meio da página —, e a explicação inteira
          virava rolagem. Depois foi caixa centralizada, que ainda esbarrava na
          altura da janela quando o período traz as duas pontas cheias.

          Em tela cheia nada disputa espaço: o título fica fixo no topo, os
          três passos ficam lado a lado, as duas pontas do período e a conta
          que elas explicam cabem na mesma linha, e o texto continua numa
          coluna de largura legível em vez de esticar pelo monitor. */}
      <Dialog
        fullscreen
        open={aberto}
        onOpenChange={setAberto}
        title={copyLimite.title}
        description={<span className="font-semibold" style={{ color: AZUL_LIMITE }}>{subtitle}</span>}
      >
      <p className="max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground sm:text-[13.5px]">{copyLimite.explanation}</p>

      {/* Os três passos do porquê, numerados: a explicação acima resume, isto
          destrincha. Em coluna no celular, lado a lado do tablet para cima. */}
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {copyLimite.comoFunciona.map((passo, indice) => (
          <li key={passo.titulo} className="rounded-[0.95rem] border border-border p-4">
            <span
              aria-hidden="true"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-extrabold text-white"
              style={{ background: AZUL_LIMITE }}
            >
              {indice + 1}
            </span>
            <p className="mt-2.5 text-[13px] font-bold text-foreground">{passo.titulo}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{passo.texto}</p>
          </li>
        ))}
      </ol>

      {/* Mesma grade de três colunas dos passos, reaproveitada: as pontas do
          período e a conta que elas explicam viram três células de uma linha
          só. Empilhados, esses blocos somavam mais altura do que a janela
          tinha e traziam de volta a rolagem que a largura tinha acabado de
          eliminar. Com uma ponta só, ela ocupa duas colunas e a conta fica
          na terceira — a linha continua cheia, sem buraco. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <GrupoLimiteDoDia
          titulo={copyLimite.aheadTitle}
          dica={copyLimite.aheadHint}
          linhas={soNoMercadoLivre}
          soma={somaAdiante}
          className={duasPontas ? "" : "sm:col-span-2"}
        />
        <GrupoLimiteDoDia
          titulo={copyLimite.behindTitle}
          dica={copyLimite.behindHint}
          linhas={soAqui}
          soma={somaAtras}
          className={duasPontas ? "" : "sm:col-span-2"}
        />

        {/* Fecha a conta: é a linha que a pessoa veio buscar quando os dois
            totais não bateram. */}
        <div
          className="rounded-[0.95rem] px-4 py-3"
          style={{ background: "color-mix(in srgb, var(--info) 7%, transparent)" }}
        >
          {diferenca === 0 ? (
            <p className="text-[13px] font-semibold text-foreground">{copyLimite.reconcileZero}</p>
          ) : (
            <>
              <p className="text-[15px] font-extrabold tabular-nums" style={{ color: AZUL_LIMITE }}>
                {copyLimite.reconcile.replace("{valor}", dinheiro.format(Math.abs(diferenca)))}
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{copyLimite.reconcileDica}</p>
            </>
          )}
        </div>
      </div>

      <p className="mt-5 border-t border-border pt-4 text-[12px] leading-relaxed text-muted-foreground">{copyLimite.rodape}</p>
      </Dialog>
    </>
  );
}

/** Selo do cabeçalho de Vendas + a janela que ele abre. */
export function AvisoLimiteDoDia(props: { dados: LimiteDoDia; aberto: boolean; setAberto: (aberto: boolean) => void }) {
  return <JanelaLimiteDoDia {...props} comSelo />;
}
