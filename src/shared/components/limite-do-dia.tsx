"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { TintedStatCard } from "@/shared/design-system/primitives/TintedStatCard";
import { Dialog } from "@/shared/design-system/primitives/Dialog";
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

export const copyLimite = copy.limiteDoDia;
export const AZUL_LIMITE = "var(--info)";

/** Cancelado e devolvido aparecem na lista (o pedido existe e está mesmo na
 *  hora de virada), mas ficam fora da soma: o Faturamento também os exclui, e
 *  é com ele que a pessoa está comparando. Uma função só, usada pelas duas
 *  pontas e pelo card — três contas separadas ficariam livres pra discordar. */
export function somarLimite(linhas: PedidoNoLimite[]) {
  return linhas
    .filter((item) => item.status !== "cancelado" && item.status !== "devolvido")
    .reduce((total, item) => total + item.total, 0);
}

/* ── A porta: um indicador entre os outros ────────────────────────────────
   Isto já foi selo no cabeçalho da lista e faixa abaixo dos indicadores. As
   duas formas resolviam o mesmo problema pela metade: o selo ficava numa
   linha de coisas pequenas, longe dos números que explica, e a faixa —
   embora colada neles — anunciava pela FORMA que era outra categoria de
   coisa, um aviso pendurado na grade.

   Só que ela não é outra categoria. "Faturamento", "Pedidos" e "Cancelados"
   respondem quanto; este responde por que o primeiro deles não bate com o
   painel do Mercado Livre. É a mesma pergunta, uma casa adiante — e o lugar
   de uma resposta assim é ao lado da pergunta, no mesmo formato, para ser
   lida no mesmo movimento de olho.

   O valor grande é o dinheiro, não a contagem: quem compara os dois painéis
   está olhando para um total em reais que não fecha, e o número que fecha
   essa conta é o que muda de lado. A contagem desce para a legenda, onde
   qualifica sem competir.

   Some inteiro quando não há pedido na virada — e aí a grade volta a ter os
   quatro de sempre. */
export function CardLimiteDoDia({ dados, onClick }: { dados: LimiteDoDia; onClick: () => void }) {
  const quantidade = dados.soNoMercadoLivre.length + dados.soAqui.length;
  if (quantidade === 0) return null;
  const diferenca = Math.abs(somarLimite(dados.soNoMercadoLivre) - somarLimite(dados.soAqui));

  return (
    <TintedStatCard
      // Duas versões do rótulo: em cinco colunas cada card fica com pouco mais
      // de um terço da largura que tinha em quatro, e o nome inteiro quebraria
      // em três linhas. A palavra que não pode faltar em nenhuma é "fuso".
      label={<><span className="xl:hidden">{copyLimite.badgeCurto}</span><span className="hidden xl:inline">{copyLimite.badge}</span></>}
      valor={dinheiro.format(diferenca)}
      sub={(quantidade === 1 ? copyLimite.cardSubUm : copyLimite.cardSubMuitos).replace("{n}", String(quantidade))}
      icon={Clock}
      cor={AZUL_LIMITE}
      onClick={onClick}
      dica={copyLimite.badgeDica}
      pulsar
      compactoNoMobile
    />
  );
}

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

/** Uma das duas pontas do período.
 *
 *  O cabeçalho (título, dica e resumo) fica parado e só a lista rola: com
 *  quinze pedidos na virada, era o título que sumia primeiro — e sem ele a
 *  lista deixa de dizer QUAL das duas pontas se está lendo, que é a única
 *  coisa que distingue uma da outra. */
function GrupoLimiteDoDia({ titulo, dica, linhas, soma }: {
  titulo: string;
  dica: string;
  linhas: PedidoNoLimite[];
  soma: number;
}) {
  if (linhas.length === 0) return null;
  const resumo = (linhas.length === 1 ? copyLimite.grupoResumoUm : copyLimite.grupoResumoMuitos)
    .replace("{n}", String(linhas.length))
    .replace("{valor}", dinheiro.format(soma));

  return (
    <section
      className="flex min-h-0 flex-1 flex-col rounded-[0.95rem] border bg-card p-3 shadow-sm"
      style={{ borderColor: "color-mix(in srgb, var(--info) 30%, var(--border))" }}
    >
      {/* Titulo e resumo dividem a linha quando cabem: eram tres linhas de
          cabecalho por painel, e cada uma saia da lista — a parte que a pessoa
          veio ver e a unica aqui sem tamanho previsivel. */}
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-2.5">
        <p className="text-[11.5px] font-bold uppercase tracking-[.08em]" style={{ color: AZUL_LIMITE }}>{titulo}</p>
        <p className="text-[12.5px] font-bold tabular-nums text-foreground">{resumo}</p>
      </div>
      <p className="mt-0.5 shrink-0 text-[11.5px] leading-snug text-muted-foreground">{dica}</p>
      <ul className="mt-1.5 min-h-0 flex-1 divide-y divide-border/70 overflow-y-auto">
        {linhas.map((item) => <LinhaPedidoNoLimite key={item.id} item={item} />)}
      </ul>
    </section>
  );
}

/* ── O mecanismo, desenhado ───────────────────────────────────────────────
   Três parágrafos explicavam que os dois calendários cortam o dia em pontos
   diferentes. É uma ideia espacial contada em prosa: quem lê tem de montar o
   desenho na cabeça antes de entender.

   Aqui ele está montado. Dois trilhos empilhados, o mesmo trecho de tempo nos
   dois (23:00 às 02:00), e o corte entre um dia e o outro caindo em lugares
   diferentes em cada um. A distância entre os dois cortes É a divergência —
   não uma metáfora dela.

   O recorte é a virada, não o dia inteiro: numa régua de 24 horas a hora em
   questão teria 4% da largura e o desenho não mostraria nada. */
function TrilhoDoDia({ rotulo, corte }: { rotulo: string; corte: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[.06em] text-muted-foreground">{rotulo}</p>
      {/* `relative` aqui, e não no bloco inteiro: a marcação da hora em disputa
          precisa cobrir as BARRAS e só elas. Uma faixa única atravessando o
          bloco todo passava por cima do rótulo do segundo trilho e o apagava —
          o desenho ficava mais confuso do que a prosa que ele veio substituir. */}
      <div className="relative mt-1 flex h-6 overflow-hidden rounded-[0.45rem] border border-border">
        <div
          className="flex shrink-0 items-center justify-end overflow-hidden pr-2"
          style={{ width: corte, background: "var(--muted)" }}
        >
          <span className="truncate text-[10px] font-semibold text-muted-foreground">{copyLimite.diagrama.ontem}</span>
        </div>
        <div
          className="flex min-w-0 flex-1 items-center pl-2"
          style={{ background: "color-mix(in srgb, var(--info) 14%, transparent)" }}
        >
          <span className="truncate text-[10px] font-bold" style={{ color: AZUL_LIMITE }}>{copyLimite.diagrama.hoje}</span>
        </div>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0"
          style={{
            left: "33.333%",
            width: "33.333%",
            background: "color-mix(in srgb, var(--info) 15%, transparent)",
          }}
        />
      </div>
    </div>
  );
}

function DiagramaViradaDoDia() {
  const d = copyLimite.diagrama;
  return (
    <figure className="shrink-0 rounded-[0.95rem] border border-border p-3">
      <figcaption className="text-[11.5px] font-bold uppercase tracking-[.08em]" style={{ color: AZUL_LIMITE }}>
        {d.titulo}
      </figcaption>

      <div className="relative mt-2.5">
        {/* As duas bordas da hora em disputa, atravessando o desenho inteiro:
            onde o nosso dia vira (33%) e onde o do ML vira (66%). Linhas, e não
            um retângulo preenchido — o preenchimento mora dentro de cada barra
            (ver TrilhoDoDia), e aqui só se costura uma coisa à outra, passando
            pelo rótulo sem apagá-lo. É a distância entre estas duas linhas que
            é a divergência. */}
        {["33.333%", "66.666%"].map((x) => (
          <span
            key={x}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-0"
            style={{ left: x, borderLeft: "1px dashed color-mix(in srgb, var(--info) 55%, transparent)" }}
          />
        ))}
        <div className="relative flex flex-col gap-2">
          <TrilhoDoDia rotulo={d.aqui} corte="33.333%" />
          <TrilhoDoDia rotulo={d.ml} corte="66.666%" />
        </div>
      </div>

      {/* Régua: só os dois horários que importam, cada um sob o corte do
          trilho correspondente. */}
      <div className="relative mt-1.5 h-4">
        <span className="absolute -translate-x-1/2 text-[10px] font-bold tabular-nums text-muted-foreground" style={{ left: "33.333%" }}>
          00:00
        </span>
        <span className="absolute -translate-x-1/2 text-[10px] font-bold tabular-nums text-muted-foreground" style={{ left: "66.666%" }}>
          01:00
        </span>
        <span
          className="absolute left-1/2 -translate-x-1/2 rounded-full px-1.5 text-[9.5px] font-extrabold uppercase tracking-wide text-white"
          style={{ background: AZUL_LIMITE, top: "-1px" }}
        >
          {d.faixa}
        </span>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">{d.legenda}</p>
    </figure>
  );
}

/* ── A tela cheia ─────────────────────────────────────────────────────────
   Antes isto era uma pilha: explicação, três passos, as duas listas, a conta,
   o rodapé. Cada bloco de largura inteira, um debaixo do outro — e a soma dos
   blocos passava da altura da tela em qualquer período com pedidos nas duas
   pontas. Rolava.

   Rolagem aqui custa caro porque a tela tem DOIS assuntos que se leem em par:
   por que a diferença existe, e quais pedidos a compõem. Empilhados, ler o
   segundo empurra o primeiro para fora — e é justamente o primeiro que a
   pessoa precisa ter à vista para entender o que está olhando no segundo.

   Então eles deixam de ser dois momentos e viram duas colunas. À esquerda, o
   porquê, que tem tamanho fixo e conhecido: um parágrafo, o desenho da
   virada, os três passos, a ressalva. À direita, o quais: a conta fechando no
   topo e as listas embaixo, ocupando toda a altura que sobrar.

   O que rola é só o que não tem tamanho previsível — a lista de pedidos,
   dentro do painel dela. A explicação e a conta ficam paradas na tela, que é
   o que se queria desde o começo. */
export function JanelaLimiteDoDia({ dados, aberto, setAberto }: {
  dados: LimiteDoDia;
  aberto: boolean;
  setAberto: (aberto: boolean) => void;
}) {
  const { soNoMercadoLivre, soAqui } = dados;
  const quantidade = soNoMercadoLivre.length + soAqui.length;
  if (quantidade === 0) return null;

  const somaAdiante = somarLimite(soNoMercadoLivre);
  const somaAtras = somarLimite(soAqui);
  const diferenca = somaAdiante - somaAtras;

  const subtitle = (quantidade === 1 ? copyLimite.subtitleUm : copyLimite.subtitleMuitos)
    .replace("{n}", String(quantidade));

  return (
    <Dialog
      fullscreen
      fill
      open={aberto}
      onOpenChange={setAberto}
      title={copyLimite.title}
      description={<span className="font-semibold" style={{ color: AZUL_LIMITE }}>{subtitle}</span>}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:gap-5">
        {/* ── Por que ────────────────────────────────────────────────────
            Largura fixa e não fração: o texto explicativo tem uma faixa de
            largura em que se lê bem, e amarrá-lo a uma porcentagem faria a
            mesma explicação ficar estreita demais no tablet e larga demais no
            monitor. As listas, que só têm nome e valor por linha, aceitam
            qualquer largura — então é a elas que sobra o resto. */}
        <div className="flex min-h-0 flex-col gap-2.5 md:w-[18rem] md:shrink-0 md:overflow-y-auto lg:w-[20rem] xl:w-[22rem]">
          <p className="shrink-0 text-[12.5px] leading-relaxed text-muted-foreground">{copyLimite.explanation}</p>

          <DiagramaViradaDoDia />

          {/* `mt-auto` cola a ressalva no pé da coluna quando sobra espaço:
              ela qualifica tudo que está acima, e boiando logo abaixo do
              desenho pareceria uma legenda dele. */}
          <p className="shrink-0 border-t border-border pt-2.5 text-[11px] leading-relaxed text-muted-foreground md:mt-auto">
            {copyLimite.rodape}
          </p>
        </div>

        {/* ── Quais ──────────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {/* A conta vem ANTES das listas, e não depois como vinha. É a linha
              que a pessoa veio buscar; deixá-la no fim obrigava a atravessar
              a prova para chegar à conclusão. Agora a conclusão abre, e as
              listas embaixo são a prova de quem quiser conferir. */}
          <div
            // Empilhado por padrão e lado a lado só quando há largura: o valor
            // grande não encolhe, então numa tela estreita ele tomava a linha
            // inteira e sobrava um vão de um caractere para a dica, que descia
            // letra por letra. `flex-wrap` não resolvia — o vão existia, e para
            // o flex isso basta para tentar caber ali.
            className="flex shrink-0 flex-col gap-1 rounded-[0.95rem] px-3.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3 sm:gap-y-1"
            style={{ background: "color-mix(in srgb, var(--info) 8%, transparent)" }}
          >
            {diferenca === 0 ? (
              <p className="text-[13.5px] font-semibold text-foreground">{copyLimite.reconcileZero}</p>
            ) : (
              <>
                <p className="text-[17px] font-extrabold tabular-nums sm:text-[19px]" style={{ color: AZUL_LIMITE }}>
                  {copyLimite.reconcile.replace("{valor}", dinheiro.format(Math.abs(diferenca)))}
                </p>
                <p className="min-w-0 text-[12px] leading-relaxed text-muted-foreground sm:flex-1">{copyLimite.reconcileDica}</p>
              </>
            )}
          </div>

          {/* Lado a lado só a partir do monitor largo: no tablet, duas listas
              em colunas de ~200px truncariam o nome de todo cliente, e é pelo
              nome que se acha o pedido do outro lado. Empilhadas, cada uma
              rola dentro da metade que lhe cabe. Com uma ponta só (o período
              pega uma borda, não as duas), ela toma a altura inteira. */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row">
            <GrupoLimiteDoDia
              titulo={copyLimite.aheadTitle}
              dica={copyLimite.aheadHint}
              linhas={soNoMercadoLivre}
              soma={somaAdiante}
            />
            <GrupoLimiteDoDia
              titulo={copyLimite.behindTitle}
              dica={copyLimite.behindHint}
              linhas={soAqui}
              soma={somaAtras}
            />
          </div>
        </div>
      </div>

      {/* ── Como funciona, no rodapé e em largura inteira ──────────────────
          Estes três passos moravam na coluna da esquerda, empilhados. Numa
          coluna de 19rem eles somavam quase 300px de texto — e no tablet em
          paisagem, onde a altura útil é a menor de todas, eram exatamente eles
          que estouravam e traziam de volta a rolagem.

          Aqui embaixo, em três colunas, cada passo ocupa um terço da largura e
          um quinto da altura que ocupava. E o lugar faz sentido: eles são o
          detalhamento, o que se lê depois de já ter visto o desenho e a conta —
          não o que se lê primeiro. */}
      <ol className="mt-3 grid shrink-0 gap-2 sm:grid-cols-3">
        {copyLimite.comoFunciona.map((passo, indice) => (
          <li key={passo.titulo} className="flex gap-2.5 rounded-[0.8rem] border border-border px-3 py-2">
            <span
              aria-hidden="true"
              className="mt-[3px] inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
              style={{ background: AZUL_LIMITE }}
            >
              {indice + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-bold text-foreground">{passo.titulo}</span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">{passo.texto}</span>
            </span>
          </li>
        ))}
      </ol>
      </div>
    </Dialog>
  );
}
