"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Maximize2, TrendingDown, TrendingUp, X } from "lucide-react";
import { springs, transicao } from "@/shared/design-system/motion-variants";
import { useFocusTrap } from "@/shared/design-system/primitives/useFocusTrap";
import metricasConfig from "@/config/metricas.json";
import { cn } from "@/shared/design-system/cn";
import { tint } from "@/shared/design-system/color";

/* ── Mosaico → Foco ────────────────────────────────────────────────
   O mosaico existe porque 14 cards empilhados viravam oito telas de
   rolagem: ninguém compara o que não vê junto. Cada card aparece
   primeiro como um bloco com um número só, e vira o card inteiro ao
   ser aberto.

   O crescimento é um `layoutId` compartilhado entre o bloco e o painel
   de foco — o mesmo recurso já usado na pílula de marca dos Anúncios.
   Para o Framer entender que são o mesmo elemento, só um dos dois pode
   estar montado por vez: por isso o bloco desmonta quando entra em foco
   e a célula do grid fica segurando o espaço sozinha. Sem isso, os dois
   disputam o mesmo id e o crescimento vira um salto. */

export type NivelAlerta = "atencao" | "critico";

export interface ResumoBloco {
  /** O número que o bloco mostra grande. Null enquanto não há leitura. */
  valor: string | null;
  /** O que o número é — some quando não há valor. */
  legenda?: string;
  /** Variação percentual contra a janela anterior. Null não desenha nada. */
  variacao?: number | null;
  /** Quando maior é pior (reclamação, item parado), a seta pra cima fica
   *  vermelha. Sem isso, "subiu 40%" pareceria uma boa notícia. */
  subirEhRuim?: boolean;
  /** Frase curta abaixo do número — o detalhe que cabe no bloco. */
  rodape?: string;
  /** Um alerta promove o bloco para o topo do mosaico e tinge a borda. */
  alerta?: { nivel: NivelAlerta; texto: string } | null;
}

/** As 5 seções do mosaico, na ordem em que aparecem na tela. `label` é o
 *  rótulo pequeno acima do grupo de blocos. */
export const SECOES = [
  { id: "financeiro", label: "Financeiro" },
  { id: "saude", label: "Saúde da operação" },
  { id: "atendimento", label: "Atendimento ao cliente" },
  { id: "estoque", label: "Estoque & catálogo" },
  { id: "marketing", label: "Marketing" },
] as const;

export type SecaoId = (typeof SECOES)[number]["id"];

export interface BlocoDef {
  id: string;
  titulo: string;
  icone: React.ElementType;
  accent: string;
  /** Qual dos 5 grupos do mosaico este bloco pertence — a separação que
   *  substituiu a grade única de 14 blocos misturados. */
  secao: SecaoId;
  /** 2 = o dobro da largura. Usado no que merece ser lido primeiro. */
  largura?: 1 | 2;
  carregando?: boolean;
  resumo: ResumoBloco;
  /** True enquanto nenhuma marca foi escolhida — o card não busca nada. O
   *  tile não mostra pílula nenhuma nesse estado: escolher marca é coisa de
   *  dentro do card aberto (ver `scope` passado ao próprio `render`), não do
   *  mosaico — é o que mantém o mosaico limpo. */
  semFiltro?: boolean;
  /** Linha curta sob o título, só quando o card está em foco — o mosaico não
   *  usa isto, é o cabeçalho único do Foco que precisa dela. */
  subtitulo?: string;
  /** O card inteiro. Função porque só é montado quando o bloco abre.
   *  `acaoSlot` é o nó do DOM que o Foco reserva na própria barra de
   *  cabeçalho — um card com uma ação própria (aba, botão "como é
   *  calculado") a `createPortal` ali dentro, em vez de desenhar um segundo
   *  cabeçalho por conta própria. Cards sem ação ignoram o parâmetro. */
  render: (acaoSlot: HTMLElement | null) => React.ReactNode;
}

const PESO_ALERTA: Record<NivelAlerta, number> = { critico: 2, atencao: 1 };

/** Ordena um grupo de blocos pondo na frente o que precisa de decisão. Empate
 *  mantém a ordem escrita — a leitura em atos sobrevive quando não há nada
 *  pegando fogo. Age só dentro do grupo que recebe: a urgência de um bloco
 *  de Estoque não faz sentido saltando pra cima de um bloco Financeiro. */
export function ordenarPorUrgencia(blocos: BlocoDef[]): BlocoDef[] {
  return blocos
    .map((bloco, ordem) => ({ bloco, ordem }))
    .sort((a, b) => {
      const pesoA = a.bloco.resumo.alerta ? PESO_ALERTA[a.bloco.resumo.alerta.nivel] : 0;
      const pesoB = b.bloco.resumo.alerta ? PESO_ALERTA[b.bloco.resumo.alerta.nivel] : 0;
      return pesoB - pesoA || a.ordem - b.ordem;
    })
    .map(({ bloco }) => bloco);
}

export interface GrupoSecao {
  id: SecaoId;
  label: string;
  blocos: BlocoDef[];
  /** O pior alerta entre os blocos do grupo — o rótulo da seção ganha um
   *  sinal desta cor sem precisar abrir nada lá dentro. */
  alerta: NivelAlerta | null;
}

/** Agrupa os blocos nas 5 seções (ordem fixa de `SECOES`) e ordena por
 *  urgência dentro de cada uma. A lista plana devolvida junto é a mesma
 *  ordem visual, de cima pra baixo — é o que a navegação por setas usa
 *  para saber qual é "o próximo card". */
export function agruparPorSecao(blocos: BlocoDef[]): { grupos: GrupoSecao[]; lista: BlocoDef[] } {
  const grupos = SECOES.map((secao): GrupoSecao => {
    const doGrupo = ordenarPorUrgencia(blocos.filter((bloco) => bloco.secao === secao.id));
    const piorAlerta = doGrupo.reduce<NivelAlerta | null>((pior, bloco) => {
      const nivel = bloco.resumo.alerta?.nivel ?? null;
      if (!nivel) return pior;
      if (pior === "critico" || nivel === pior) return pior;
      return !pior || PESO_ALERTA[nivel] > PESO_ALERTA[pior] ? nivel : pior;
    }, null);
    return { id: secao.id, label: secao.label, blocos: doGrupo, alerta: piorAlerta };
  }).filter((grupo) => grupo.blocos.length > 0);

  return { grupos, lista: grupos.flatMap((grupo) => grupo.blocos) };
}

/* ── Rótulo de seção ───────────────────────────────────────────── */

/** Caixa alta, discreto, com um ponto na cor do pior alerta do grupo quando
 *  existe um — a leitura em duas camadas: primeiro os rótulos (onde está o
 *  problema), só depois os números de cada bloco (o que é o problema). */
export function RotuloSecao({ label, alerta }: { label: string; alerta: NivelAlerta | null }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <h2 className="text-label-md uppercase text-muted-foreground">{label}</h2>
      {alerta && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: corAlerta(alerta) }}
        />
      )}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function corAlerta(nivel: NivelAlerta) {
  return nivel === "critico" ? "var(--escala-1)" : "var(--escala-3)";
}

/* ── Variação ──────────────────────────────────────────────────── */

function Variacao({ valor, subirEhRuim }: { valor: number; subirEhRuim?: boolean }) {
  const subiu = valor > 0;
  const bom = subirEhRuim ? !subiu : subiu;
  const Icone = subiu ? TrendingUp : TrendingDown;
  const cor = valor === 0 ? "var(--muted-foreground)" : bom ? "var(--escala-5)" : "var(--escala-2)";

  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums" style={{ color: cor }}>
      <Icone size={13} strokeWidth={2.2} />
      {valor > 0 ? "+" : ""}{valor.toFixed(1).replace(".", ",")}%
    </span>
  );
}

/* ── Bloco ─────────────────────────────────────────────────────── */

export function Bloco({ def, focado, onAbrir }: {
  def: BlocoDef;
  focado: boolean;
  onAbrir: () => void;
}) {
  const reduzir = useReducedMotion();
  const { resumo, icone: Icone, accent } = def;
  const alerta = resumo.alerta ?? null;

  return (
    <li className={cn("relative min-h-44", def.largura === 2 && "sm:col-span-2")}>
      {/* Sem AnimatePresence de propósito: o bloco precisa sair da árvore no
          mesmo quadro em que o painel entra, senão os dois seguram o layoutId
          por um instante e o crescimento vira um piscar. */}
      {!focado && (
        <motion.div
            layoutId={`bloco-${def.id}`}
            transition={transicao(reduzir, springs.settle)}
            className="card-surface absolute inset-0 flex w-full flex-col items-stretch gap-2 overflow-hidden p-4 text-left transition-shadow hover:shadow-[0_6px_20px_rgba(14,15,19,.10)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
            style={alerta ? { borderColor: corAlerta(alerta.nivel) } : undefined}
          >
            <motion.span layout="position" className="relative flex items-center gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ background: tint(accent, 9), color: accent }}
              >
                <Icone size={14} strokeWidth={1.9} />
              </span>
              {/* O bloco não pode ser um <button>: as pílulas de marca dentro
                  dele também são, e botão dentro de botão é HTML inválido — o
                  clique na pílula acabaria abrindo o card. Então o controle é
                  este botão do título, esticado por ::after sobre o bloco
                  inteiro. O alvo continua sendo o bloco todo para o mouse, e
                  o teclado ganha um único foco em vez de um por pílula. */}
              <button
                type="button"
                onClick={onAbrir}
                aria-label={`Abrir ${def.titulo}`}
                className="min-w-0 flex-1 truncate text-left text-[13px] font-bold tracking-[-0.01em] text-foreground outline-none after:absolute after:inset-0 after:z-0 after:content-['']"
              >
                {def.titulo}
              </button>
              <Maximize2 size={13} className="shrink-0 text-muted-foreground/50" aria-hidden="true" />
            </motion.span>

            <div className="flex flex-1 flex-col justify-end gap-1.5">
              {def.semFiltro ? (
                /* Sem marca escolhida, o tile não vira formulário — ele só diz
                   o que vai aparecer quando abrir. A escolha em si acontece
                   dentro do card em foco. */
                <p className="text-[12px] leading-snug text-muted-foreground">{metricasConfig.mosaico.semFiltro}</p>
              ) : def.carregando ? (
                <span className="h-8 w-2/3 animate-pulse rounded-md bg-muted" role="status" aria-label="Carregando" />
              ) : resumo.valor === null ? (
                <p className="text-[12px] leading-snug text-muted-foreground">{resumo.legenda ?? "Abrir para ver"}</p>
              ) : (
                <>
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-stat-md leading-none tabular-nums text-foreground">{resumo.valor}</span>
                    {resumo.variacao !== null && resumo.variacao !== undefined && (
                      <Variacao valor={resumo.variacao} subirEhRuim={resumo.subirEhRuim} />
                    )}
                  </span>
                  {resumo.legenda && <span className="text-[11px] text-muted-foreground">{resumo.legenda}</span>}
                </>
              )}

              {alerta && (
                <span
                  className="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]"
                  style={{ background: tint(corAlerta(alerta.nivel), 12), color: corAlerta(alerta.nivel) }}
                >
                  {alerta.texto}
                </span>
              )}
              {/* resumo.valor !== null: sem número, o rodapé repetiria a mesma
                  frase que já apareceu como descrição logo acima — ex.: "Vendem
                  mais" sem nenhum produto no período mostraria "no topo do
                  período" duas vezes seguidas. */}
              {!alerta && resumo.rodape && resumo.valor !== null && (
                <span className="truncate text-[11px] text-muted-foreground/80">{resumo.rodape}</span>
              )}
            </div>
        </motion.div>
      )}
    </li>
  );
}

/* ── Foco ──────────────────────────────────────────────────────── */

export function Foco({ def, onFechar, onAnterior, onProximo, barraPeriodo }: {
  def: BlocoDef | null;
  onFechar: () => void;
  onAnterior: () => void;
  onProximo: () => void;
  /** Mesma barra de período/exportar do mosaico, redesenhada aqui — o
   *  painel cobre a tela inteira, então sem isso trocar a data exigiria
   *  fechar o card primeiro. */
  barraPeriodo?: React.ReactNode;
}) {
  const reduzir = useReducedMotion();
  const tituloId = useId();
  const painel = useRef<HTMLDivElement>(null);
  // Nó do DOM onde o card em foco porta a própria ação (aba, botão "como é
  // calculado") — via state, não ref direta, porque o valor só existe depois
  // do primeiro commit, e `render(acaoSlot)` precisa disparar de novo quando
  // ele aparece.
  const [acaoSlot, setAcaoSlot] = useState<HTMLDivElement | null>(null);

  // Prende o Tab dentro do painel e devolve o foco a quem abriu o bloco ao
  // fechar — sem isso, Tab escapa para trás do modal em tela cheia e fechar
  // deixa o foco perdido no <body>.
  useFocusTrap(painel, Boolean(def));

  /* Teclado: Esc fecha, setas pulam de card. Fica no documento porque o alvo
     do foco é o painel, mas quem digita pode estar em qualquer lugar dele. */
  useEffect(() => {
    if (!def) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") { evento.preventDefault(); onFechar(); }
      // Setas dentro de um campo pertencem ao campo, não à navegação.
      const alvo = evento.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) return;
      if (evento.key === "ArrowLeft") { evento.preventDefault(); onAnterior(); }
      if (evento.key === "ArrowRight") { evento.preventDefault(); onProximo(); }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [def, onFechar, onAnterior, onProximo]);

  // Trava a rolagem de trás: com o painel ocupando a tela, rolar o mosaico
  // por baixo só desalinha o ponto de retorno. O `<html>` entra junto com o
  // `<body>` — travar só o body deixava o navegador desenhar as duas barras
  // de rolagem ao mesmo tempo (a da janela e a do conteúdo do painel).
  useEffect(() => {
    if (!def) return;
    const raiz = document.documentElement;
    const anteriorHtml = raiz.style.overflow;
    const anteriorBody = document.body.style.overflow;
    raiz.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      raiz.style.overflow = anteriorHtml;
      document.body.style.overflow = anteriorBody;
    };
  }, [def]);

  useEffect(() => {
    if (def) painel.current?.focus();
  }, [def]);

  return (
    <AnimatePresence>
      {def && (
        <div className="fixed inset-0 z-50">
          <motion.div
            ref={painel}
            layoutId={`bloco-${def.id}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloId}
            tabIndex={-1}
            transition={transicao(reduzir, springs.settle)}
            className="card-surface relative flex h-full w-full flex-col overflow-hidden rounded-none border-0 outline-none"
          >
            {/* Cabeçalho único do card em foco — identidade + navegação numa
                linha, período e ação própria do card na linha de baixo. Antes
                disto, o painel mostrava este cabeçalho E o cabeçalho que cada
                card desenhava por conta própria (ícone e título de novo,
                subtítulo de novo): duas telas empilhadas em vez de uma. */}
            <motion.div layout="position" className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: tint(def.accent, 9), color: def.accent }}
                >
                  <def.icone size={16} strokeWidth={1.9} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={tituloId} className="truncate text-[15px] font-bold tracking-[-0.01em] text-foreground">
                    {def.titulo}
                  </h2>
                  {/* Crossfade por key: trocar de card com as setas troca o
                      texto num movimento, não num corte — o mesmo tratamento
                      que o conteúdo abaixo já tinha, agora também aqui. */}
                  <AnimatePresence mode="wait" initial={false}>
                    {def.subtitulo && (
                      <motion.p
                        key={def.id}
                        initial={reduzir ? false : { opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={transicao(reduzir, springs.settleFast)}
                        className="truncate text-[11px] text-muted-foreground"
                      >
                        {def.subtitulo}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                {/* Sem botões de seta: pular de card continua valendo pelo
                    teclado (← →, ver o efeito de atalhos acima), mas dois
                    botões a mais no cabeçalho competiam com o fechar e com a
                    ação do próprio card sem ganhar nada em clareza. Contador
                    "X de Y" também saiu — não é informação que ajuda a
                    decisão de quem está ali, só ruído no cabeçalho. */}
                <button type="button" onClick={onFechar} aria-label="Fechar" className="press-feedback shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted">
                  <X size={15} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {barraPeriodo}
                {/* Alvo do portal: sempre presente no DOM, mesmo vazio — um
                    card com ação própria (aba, "como é calculado") a desenha
                    aqui via createPortal quando monta. */}
                <div ref={setAcaoSlot} className="ml-auto flex flex-wrap items-center justify-end gap-2 empty:hidden" />
              </div>
            </motion.div>

            {/* O conteúdo entra depois que o painel termina de crescer. É esse
                atraso que separa "cresceu" de "abriu" — sem ele, o card já
                aparece pronto no meio do movimento e o crescimento some. */}
            <motion.div
              initial={reduzir ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transicao(reduzir, { ...springs.settleFast, delay: 0.15 })}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4"
            >
              {/* O fundo do painel ocupa a tela inteira (é a tela cheia
                  pedida), mas o conteúdo trava numa largura confortável de
                  leitura — mesma medida do resto do app (DashboardLayout) —
                  para não esticar texto e grids num monitor ultrawide.

                  Sem camada de achatamento aqui: o `Card` deixou de ter
                  superfície própria (ver metricas-primitives.tsx), então o
                  conteúdo já encosta direto no painel. A tentativa antiga de
                  apagar a borda por CSS nunca funcionou — `.card-surface`
                  está fora de @layer e vencia os utilitários do Tailwind. */}
              <div className="mx-auto w-full max-w-[1440px]">
                {def.render(acaoSlot)}
              </div>
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
