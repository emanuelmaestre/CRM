"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Ban, RotateCcw, Undo2, WifiOff } from "lucide-react";
import { Dialog } from "@/shared/design-system/primitives/Dialog";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { springs, transicao } from "@/shared/design-system/motion-variants";
import { Carregando } from "@/shared/components/carregando";
import type { IndicadorPedidos } from "@/modules/vendas/domain/consulta-pedidos";
import { actionListarPedidosDoIndicador } from "../actions";

type Resultado = Awaited<ReturnType<typeof actionListarPedidosDoIndicador>>;
type Pedido = Resultado["data"][number];
export type FiltrosIndicador = NonNullable<Parameters<typeof actionListarPedidosDoIndicador>[1]>;

const FUSO = "America/Sao_Paulo";
const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const soHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
const soDia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO });
const diaPorExtenso = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "long", timeZone: FUSO });

/** "Hoje", "Ontem" ou "sex., 05 de setembro".
 *
 *  Uma lista de 69 pedidos com a data completa repetida em cada linha faz o
 *  olho reler a mesma informação 69 vezes para achar onde um dia acaba e o
 *  outro começa. Subindo a data para um cabeçalho, a linha fica só com a hora
 *  — e o recorte de tempo, que é como se pensa em cancelamento ("o que caiu
 *  hoje?"), passa a ser visível sem contar linha. */
function rotularDia(iso: Date, hoje: string, ontem: string): string {
  const dia = soDia.format(iso);
  if (dia === hoje) return "Hoje";
  if (dia === ontem) return "Ontem";
  return diaPorExtenso.format(iso).replace(/^(\w)/, (letra) => letra.toUpperCase());
}

function agruparPorDia(pedidos: Pedido[]) {
  const agora = new Date();
  const hoje = soDia.format(agora);
  const ontem = soDia.format(new Date(agora.getTime() - 86_400_000));
  const grupos: Array<{ chave: string; rotulo: string; itens: Pedido[]; soma: number }> = [];

  for (const pedido of pedidos) {
    const data = new Date(pedido.createdAt);
    const chave = soDia.format(data);
    const ultimo = grupos.at(-1);
    if (ultimo?.chave !== chave) {
      grupos.push({ chave, rotulo: rotularDia(data, hoje, ontem), itens: [pedido], soma: 0 });
    } else {
      ultimo.itens.push(pedido);
    }
  }
  return grupos;
}

/** O selo do estado do pedido. Três estados, três cores, sempre a mesma:
 *  vermelho quando o pedido inteiro se perdeu, âmbar quando voltou parte do
 *  dinheiro. A cor faz o trabalho que a palavra sozinha faria mais devagar. */
function estadoDoPedido(pedido: Pedido, parcial: boolean) {
  if (parcial) return { Icone: Undo2, texto: "Reembolso parcial", tom: "warning" as const };
  return pedido.status === "cancelado"
    ? { Icone: Ban, texto: "Cancelado", tom: "destructive" as const }
    : { Icone: RotateCcw, texto: "Devolvido", tom: "destructive" as const };
}

const rotuloDoEstado = (pedido: Pedido, parcial: boolean) => estadoDoPedido(pedido, parcial).texto;

function Selo({ pedido, parcial }: { pedido: Pedido; parcial: boolean }) {
  const { Icone, texto, tom } = estadoDoPedido(pedido, parcial);

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        color: `var(--${tom})`,
        background: `color-mix(in srgb, var(--${tom}) 12%, transparent)`,
      }}
    >
      <Icone size={11} aria-hidden />
      {texto}
    </span>
  );
}

/** Uma linha da lista.
 *
 *  A barra fina embaixo do valor é a fatia deste pedido no total da janela.
 *  Numa lista de 69 cancelamentos, saber que três deles respondem por metade
 *  do prejuízo é a única leitura que muda decisão — e ela não existia: todas
 *  as linhas tinham o mesmo peso visual, R$ 24,90 e R$ 590,00 lado a lado com
 *  a mesma tipografia. */
function Linha({ pedido, parcial, fatia, atraso, reduzir }: {
  pedido: Pedido;
  parcial: boolean;
  fatia: number;
  atraso: number;
  reduzir: boolean;
}) {
  const impacto = parcial ? pedido.valorReembolsado : pedido.total;
  const tom = parcial ? "warning" : "destructive";

  return (
    <motion.li
      initial={reduzir ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transicao(reduzir, { ...springs.settleFast, delay: atraso })}
    >
      <Link
        href={`/vendas/pedidos/${pedido.id}`}
        /* Nome próprio no lugar da colagem de tudo que há dentro da linha:
           lido em voz alta, o padrão anterior virava "#ML-0Reembolso parcial
           Ana · 10:00 Valor original R$ 100,00 Cancelado/devolvido R$ 100,00".
           Aqui o leitor de tela ouve a frase que a linha significa. */
        aria-label={`Pedido ${pedido.providerOrderId ? `#${pedido.providerOrderId}` : "sem número no canal"} de ${pedido.clienteNome} · ${rotuloDoEstado(pedido, parcial)} · ${dinheiro.format(impacto)}`}
        className="group relative flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-selecionado sm:flex-row sm:items-center sm:gap-5"
      >
        {/* Marca de cor na borda esquerda: a lista inteira fala de dinheiro
            que voltou, e a fita diz de que tipo sem gastar uma linha. */}
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-[3px] rounded-full opacity-0 transition-opacity group-hover:opacity-100"
          style={{ background: `var(--${tom})` }}
        />

        {/* Sem quadrinho atrás: o logo do canal já tem forma e cor próprias, e
            a placa cinza só somava mais um retângulo à linha. */}
        <span className="grid size-9 shrink-0 place-items-center transition-transform group-hover:scale-110" aria-hidden>
          <ChannelLogo canal={pedido.canal} size="xs" variant="logo" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="break-all font-semibold tabular-nums">
              {pedido.providerOrderId ? `#${pedido.providerOrderId}` : "Pedido sem número no canal"}
            </span>
            <Selo pedido={pedido} parcial={parcial} />
            <ArrowUpRight
              size={15}
              aria-hidden
              className="shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
            />
          </p>
          <p className="mt-0.5 break-words text-sm text-muted-foreground">
            {pedido.clienteNome} · {soHora.format(new Date(pedido.createdAt))}
          </p>
        </div>

        {/* Rótulo nunca quebra: "CANCELADO/DEVOLVIDO" partido no meio da
            palavra ("…DEVOLVI / DO") lê como defeito e ainda desalinha o valor
            desta linha em relação à de cima. A coluna é dimensionada pelo
            rótulo mais longo, e o `nowrap` garante o resto. */}
        <div className="flex shrink-0 items-end gap-6 sm:w-[19rem] sm:justify-end">
          <div className="sm:text-right">
            <p className="whitespace-nowrap text-[11px] uppercase tracking-wide text-muted-foreground">Valor original</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">{dinheiro.format(pedido.total)}</p>
          </div>
          <div className="min-w-[9.5rem] sm:text-right">
            <p className="whitespace-nowrap text-[11px] uppercase tracking-wide text-muted-foreground">
              {parcial ? "Reembolsado" : "Cancelado/devolvido"}
            </p>
            <p className="mt-0.5 font-bold tabular-nums" style={{ color: `var(--${tom})` }}>
              {dinheiro.format(impacto)}
            </p>
            {/* Trilho sempre presente: sem ele a barra apareceria só nas
                linhas grandes e a comparação perderia a régua. */}
            <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
              <motion.span
                className="block h-full rounded-full"
                style={{ background: `var(--${tom})`, transformOrigin: "left" }}
                initial={reduzir ? false : { scaleX: 0 }}
                animate={{ scaleX: Math.max(fatia, 0.02) }}
                transition={transicao(reduzir, { ...springs.settle, delay: atraso + 0.05 })}
              />
            </span>
          </div>
        </div>
      </Link>
    </motion.li>
  );
}

/** Espera inicial: o desenho da lista, não um vazio.
 *
 *  Um spinner no meio de um retângulo branco esconde para onde a informação
 *  vai cair; a silhueta já ensina a leitura antes do dado chegar, e a troca
 *  para o conteúdo real deixa de ser um susto. */
function Fantasma() {
  return (
    <ul aria-hidden className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
      {Array.from({ length: 6 }, (_, indice) => (
        <li key={indice} className="flex items-center gap-4 px-4 py-3.5" style={{ opacity: 1 - indice * 0.14 }}>
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-52 max-w-full" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="hidden w-40 space-y-2 sm:block">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PedidosIndicadorDialog({ indicador, titulo, filtros, quantidade, valor, onClose }: {
  indicador: IndicadorPedidos;
  titulo: string;
  filtros: FiltrosIndicador;
  quantidade: number;
  valor: number;
  onClose: () => void;
}) {
  const [dados, setDados] = useState<Resultado>({ data: [], hasMore: false });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [pagina, setPagina] = useState({ offset: 0, tentativa: 0 });
  const emCurso = useRef(true);
  const reduzir = useReducedMotion() ?? false;
  const parcial = indicador === "reembolsos-parciais";
  const tom = parcial ? "warning" : "destructive";

  useEffect(() => {
    let ativo = true;
    actionListarPedidosDoIndicador(indicador, { ...filtros, offset: pagina.offset })
      .then((resultado) => {
        if (!ativo) return;
        setDados((anterior) => ({
          hasMore: resultado.hasMore,
          data: pagina.offset === 0 ? resultado.data : [...anterior.data, ...resultado.data],
        }));
      })
      .catch(() => { if (ativo) setErro(true); })
      .finally(() => {
        if (ativo) { setCarregando(false); emCurso.current = false; }
      });
    return () => { ativo = false; };
  }, [indicador, filtros, pagina]);

  function carregar(offset: number) {
    if (emCurso.current) return;
    emCurso.current = true;
    setCarregando(true);
    setErro(false);
    setPagina((atual) => ({ offset, tentativa: atual.tentativa + 1 }));
  }

  const grupos = useMemo(() => agruparPorDia(dados.data), [dados.data]);
  /* Régua das barras: o maior impacto carregado vale a barra cheia. Usar o
     total da janela como régua deixaria TODAS as barras invisíveis — um
     pedido de R$ 24,90 em R$ 2.418,86 é 1% de largura. */
  const maiorImpacto = useMemo(
    () => dados.data.reduce((maior, item) => Math.max(maior, parcial ? item.valorReembolsado : item.total), 0),
    [dados.data, parcial],
  );
  const media = quantidade > 0 ? valor / quantidade : 0;
  const primeiraCarga = carregando && dados.data.length === 0;

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onClose(); }} title={titulo} fullscreen>
      {/* Volta explícita, além do X do canto.
       *
       *  A janela é de tela cheia: cobre a página inteira e não sobra nada
       *  atrás para clicar fora. O único jeito de sair era achar o X no canto
       *  oposto ao que se estava lendo — e no celular, depois de rolar a
       *  lista, ele nem está mais na tela. Um "Voltar" no começo do conteúdo
       *  fica onde o olho já está quando se decide sair. */}
      <motion.button
        type="button"
        onClick={onClose}
        className="press-feedback group mb-4 -ml-1 inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        whileTap={reduzir ? undefined : { scale: 0.96 }}
      >
        <ArrowLeft size={15} aria-hidden className="transition-transform group-hover:-translate-x-0.5" />
        Voltar para os pedidos
      </motion.button>

      {/* ── O resumo ──────────────────────────────────────────────────
          Antes era uma faixa cinza com duas frases. O número que importa —
          quanto se perdeu — vinha do mesmo tamanho do resto e sem contexto
          nenhum: 69 pedidos e R$ 2.418,86 lado a lado não dizem se isso é um
          problema de muitos pedidos pequenos ou de poucos grandes. A média
          por pedido responde isso numa olhada. */}
      <motion.section
        initial={reduzir ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transicao(reduzir, springs.settle)}
        className="relative mb-5 overflow-hidden rounded-[1.25rem] border p-4 sm:p-5"
        style={{
          borderColor: `color-mix(in srgb, var(--${tom}) 22%, transparent)`,
          background: `color-mix(in srgb, var(--${tom}) 6%, var(--card))`,
        }}
      >
        {/* Brilho de canto: dá profundidade ao bloco sem introduzir mais uma
            borda. Puramente decorativo, e por isso `aria-hidden`. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 size-56 rounded-full blur-3xl"
          style={{ background: `color-mix(in srgb, var(--${tom}) 18%, transparent)` }}
        />

        <div className="relative flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-3">
            <motion.span
              className="grid size-11 shrink-0 place-items-center rounded-2xl"
              style={{ background: `color-mix(in srgb, var(--${tom}) 14%, transparent)`, color: `var(--${tom})` }}
              initial={reduzir ? false : { scale: 0.7, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={transicao(reduzir, { ...springs.momentum, delay: 0.05 })}
              aria-hidden
            >
              {parcial ? <Undo2 size={20} /> : <Ban size={20} />}
            </motion.span>
            <div>
              <p className="text-2xl font-black leading-none tabular-nums">{quantidade.toLocaleString("pt-BR")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{quantidade === 1 ? "pedido" : "pedidos"}</p>
            </div>
          </div>

          <span aria-hidden className="hidden h-10 w-px bg-border sm:block" />

          <div>
            <p className="text-xs text-muted-foreground">{parcial ? "Total reembolsado" : "Total cancelado/devolvido"}</p>
            <strong className="mt-0.5 block text-2xl font-black leading-none tabular-nums" style={{ color: `var(--${tom})` }}>
              {dinheiro.format(valor)}
            </strong>
          </div>

          <span aria-hidden className="hidden h-10 w-px bg-border sm:block" />

          <div>
            <p className="text-xs text-muted-foreground">Média por pedido</p>
            <p className="mt-0.5 text-2xl font-black leading-none tabular-nums text-foreground">{dinheiro.format(media)}</p>
          </div>
        </div>
      </motion.section>

      {primeiraCarga ? <Fantasma /> : (
        <div className="space-y-5">
          {grupos.map((grupo) => {
            const somaDoDia = grupo.itens.reduce((soma, item) => soma + (parcial ? item.valorReembolsado : item.total), 0);
            return (
              <section key={grupo.chave}>
                {/* Cabeçalho grudento: numa lista longa, rolar até o meio e
                    não saber mais de que dia são as linhas era o jeito mais
                    fácil de ler um número errado. */}
                <div className="sticky top-0 z-10 -mx-1 flex items-baseline justify-between gap-3 bg-card/90 px-1 py-2 backdrop-blur-sm">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {grupo.rotulo}
                    <span className="ml-2 font-semibold normal-case tracking-normal opacity-70">
                      {grupo.itens.length} {grupo.itens.length === 1 ? "pedido" : "pedidos"}
                    </span>
                  </h3>
                  <span className="text-xs font-bold tabular-nums" style={{ color: `var(--${tom})` }}>
                    {dinheiro.format(somaDoDia)}
                  </span>
                </div>

                <ul
                  className="divide-y divide-border overflow-hidden rounded-2xl border border-border"
                  aria-label={`Pedidos de ${grupo.rotulo}`}
                  aria-busy={carregando}
                >
                  {grupo.itens.map((item, indice) => (
                    <Linha
                      key={item.id}
                      pedido={item}
                      parcial={parcial}
                      fatia={maiorImpacto > 0 ? (parcial ? item.valorReembolsado : item.total) / maiorImpacto : 0}
                      /* Teto no atraso: com 50 linhas, um stagger sem limite
                         faria a última entrar quase dois segundos depois da
                         primeira — a lista pareceria travada. */
                      atraso={Math.min(indice, 10) * 0.03}
                      reduzir={reduzir}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {carregando && !primeiraCarga && <Carregando texto="Carregando pedidos…" className="p-6" />}

      {erro && (
        <motion.div
          role="alert"
          initial={reduzir ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transicao(reduzir, springs.settleFast)}
          className="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-border p-6 text-center text-sm"
        >
          <span className="grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground" aria-hidden>
            <WifiOff size={20} />
          </span>
          <p className="font-semibold">Não foi possível carregar os pedidos.</p>
          <p className="text-muted-foreground">A conexão falhou no meio da busca. Os pedidos já carregados seguem na tela.</p>
          <motion.button
            type="button"
            className="press-feedback mt-1 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 font-semibold hover:bg-muted"
            whileHover={reduzir ? undefined : { scale: 1.03 }}
            whileTap={reduzir ? undefined : { scale: 0.96 }}
            onClick={() => carregar(pagina.offset)}
          >
            <RotateCcw size={14} aria-hidden />
            Tentar novamente
          </motion.button>
        </motion.div>
      )}

      {!carregando && !erro && dados.data.length === 0 && (
        <EmptyState
          illustration="filaLimpa"
          title="Nada aqui neste recorte"
          description="Nenhum pedido neste indicador para os filtros selecionados."
        />
      )}

      {!carregando && !erro && dados.hasMore && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <motion.button
            type="button"
            className="press-feedback rounded-xl border border-border px-5 py-3 text-sm font-semibold hover:bg-muted"
            whileHover={reduzir ? undefined : { scale: 1.02 }}
            whileTap={reduzir ? undefined : { scale: 0.97 }}
            onClick={() => carregar(dados.data.length)}
          >
            Carregar mais pedidos
          </motion.button>
          {quantidade > dados.data.length && (
            <p className="text-xs text-muted-foreground">
              Faltam {(quantidade - dados.data.length).toLocaleString("pt-BR")} para completar o recorte
            </p>
          )}
        </div>
      )}

      {dados.data.length > 0 && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {dados.data.length.toLocaleString("pt-BR")} de {quantidade.toLocaleString("pt-BR")} pedidos exibidos
        </p>
      )}
    </Dialog>
  );
}
