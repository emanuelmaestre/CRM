"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { springs, transicao } from "@/shared/design-system/motion-variants";
import { useFocusTrap } from "@/shared/design-system/primitives/useFocusTrap";
import { tint } from "@/shared/design-system/color";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";

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
  { id: "saude", label: "Placar geral" },
  { id: "atendimento", label: "Atendimento ao cliente" },
  { id: "estoque", label: "Estoque & catálogo" },
  { id: "marketing", label: "Marketing" },
] as const;

export type SecaoId = (typeof SECOES)[number]["id"];

/** Conteúdo do "o que é este card" — deliberadamente mais estruturado que um
 *  parágrafo solto: `resumo` é a resposta em uma frase, `pontos` são os
 *  detalhes que mudam a leitura do número (o que entra, o que fica de fora,
 *  a regra que não é óbvia só olhando a tela), `dica` é o alerta ou atalho
 *  que fecha a explicação. Cada card escreve o próprio conteúdo — não é um
 *  texto genérico reaproveitado entre eles. */
export interface ExplicacaoBloco {
  resumo: string;
  pontos: { titulo: string; texto: string }[];
  dica?: string;
}

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
  /** Explicação do card inteiro (não de um número específico — isso já é
   *  papel do CalculoPopover dentro de cada card). Vira um ícone de info ao
   *  lado do título, só quando o card está em foco. Substitui o antigo
   *  `subtitulo` (texto fixo sempre visível) por algo sob demanda: a régua
   *  não precisa ocupar espaço permanente na tela pra existir. */
  explicacao?: ExplicacaoBloco;
  /** O card inteiro. Função porque só é montado quando o bloco abre.
   *  `acaoSlot` é o nó do DOM que o Foco reserva na própria barra de
   *  cabeçalho — um card com uma ação própria (aba, botão "como é
   *  calculado") a `createPortal` ali dentro, em vez de desenhar um segundo
   *  cabeçalho por conta própria. Cards sem ação ignoram o parâmetro. */
  render: (acaoSlot: HTMLElement | null) => React.ReactNode;
}

const PESO_ALERTA: Record<NivelAlerta, number> = { critico: 2, atencao: 1 };

export interface GrupoSecao {
  id: SecaoId;
  label: string;
  blocos: BlocoDef[];
  /** O pior alerta entre os blocos do grupo — o rótulo da seção ganha um
   *  sinal desta cor sem precisar abrir nada lá dentro. */
  alerta: NivelAlerta | null;
}

/** Agrupa os blocos nas 5 seções (ordem fixa de `SECOES`). Dentro de cada
 *  seção a ordem também é fixa — a mesma sempre, na ordem em que os blocos
 *  são definidos em `mosaico.tsx` — para o botão compacto ficar sempre no
 *  mesmo lugar. O pior alerta do grupo ainda tinge o rótulo da seção (ver
 *  `RotuloSecao`); é o único sinal de urgência que sobrou fora do card
 *  aberto. A lista plana devolvida junto é a mesma ordem visual, de cima
 *  pra baixo — é o que a navegação por setas usa para saber qual é "o
 *  próximo card". */
export function agruparPorSecao(blocos: BlocoDef[]): { grupos: GrupoSecao[]; lista: BlocoDef[] } {
  const grupos = SECOES.map((secao): GrupoSecao => {
    const doGrupo = blocos.filter((bloco) => bloco.secao === secao.id);
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

/* ── Bloco ─────────────────────────────────────────────────────── */

/** Botão compacto: ícone + nome, nada mais. O mosaico virou um índice de
 *  navegação para os 14 cards — quem quer o número abre o card (decisão
 *  deliberada: sem prévia de valor, sem sinal de alerta, sem seta). A
 *  ordem dentro de cada seção é a mesma sempre (ver `agruparPorSecao`,
 *  que não reordena mais por urgência). */
/** Tamanhos por variante — só o desktop (lg+) muda; mobile é sempre o
 *  mesmo card compacto de sempre. "grande" é o par de colunas do mosaico
 *  desktop, "destaque" é o card do topo (linha inteira, o mais urgente do
 *  momento ou Faturamento). Escritos por extenso (não montados em runtime)
 *  porque o Tailwind lê o código-fonte pra saber quais classes gerar. */
const VARIANTES = {
  compacto: {
    caixa: "lg:gap-3 lg:px-5 lg:py-4",
    icone: "lg:h-9 lg:w-9",
    iconeTamanho: 18,
    rotulo: "lg:text-[10px]",
    titulo: "lg:text-[15.5px]",
  },
  grande: {
    caixa: "lg:min-h-[7rem] lg:gap-4 lg:px-7 lg:py-6",
    icone: "lg:h-12 lg:w-12",
    iconeTamanho: 22,
    rotulo: "lg:text-[11px]",
    titulo: "lg:text-[18px]",
  },
  destaque: {
    caixa: "lg:min-h-[8rem] lg:gap-5 lg:px-9 lg:py-8",
    icone: "lg:h-16 lg:w-16",
    iconeTamanho: 30,
    rotulo: "lg:text-[12px]",
    titulo: "lg:text-[26px]",
  },
} as const;

export function Bloco({ def, focado, onAbrir, secaoLabel, variante = "compacto", className }: {
  def: BlocoDef;
  focado: boolean;
  onAbrir: () => void;
  /** Rótulo da seção (ex.: "Financeiro"), mostrado pequeno acima do título.
   *  Só o mosaico desktop passa isto — lá os cards vivem em destaque/duplas,
   *  sem mais um cabeçalho de seção cobrindo a linha inteira, então a seção
   *  precisa viajar dentro do próprio card para não se perder. O mobile
   *  continua com o cabeçalho de seção de sempre, então não passa esta
   *  prop — o card lá não repete a informação. */
  secaoLabel?: string;
  variante?: keyof typeof VARIANTES;
  /** Classe extra no <li> — hoje só usada pelo card em destaque, pra
   *  ocupar as duas colunas da grade desktop (col-span-2). */
  className?: string;
}) {
  const reduzir = useReducedMotion();
  const { icone: Icone, accent } = def;
  const tam = VARIANTES[variante];

  return (
    <li className={`relative ${className ?? ""}`}>
      {/* Sem AnimatePresence de propósito: o bloco precisa sair da árvore no
          mesmo quadro em que o painel entra, senão os dois seguram o layoutId
          por um instante e o crescimento vira um piscar. */}
      {!focado && (
        <motion.div
          layoutId={`bloco-${def.id}`}
          transition={transicao(reduzir, springs.settle)}
          className={`card-surface relative flex min-h-11 w-full cursor-pointer items-center gap-1.5 overflow-hidden px-2.5 py-2.5 text-left transition-shadow hover:shadow-[0_6px_20px_rgba(14,15,19,.10)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${tam.caixa}`}
        >
          <span
            className={`flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded-full ${tam.icone}`}
            style={{ background: tint(accent, 9), color: accent }}
          >
            <Icone size={13} strokeWidth={1.9} className="lg:hidden" />
            <Icone size={tam.iconeTamanho} strokeWidth={1.9} className="hidden lg:block" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col text-left">
            {secaoLabel && (
              <span className={`hidden text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground/70 lg:block ${tam.rotulo}`}>
                {secaoLabel}
              </span>
            )}
            {/* O título mais longo ("Recomendações") passa raspando na largura
                de um card de 2 colunas no celular, e quem tem tamanho de texto
                aumentado no iOS renderiza a fonte ~33% maior sem que o layout
                mude junto — aí a palavra estoura por poucos pixels e o
                overflow-wrap joga só o "s" pra segunda linha. Por isso o gap,
                o padding e o ícone são menores que no desktop: compram ~8px
                de folga, o suficiente pra palavra caber inteira nesse caso.
                (text-wrap:balance não resolve sozinho — é uma palavra só, não
                há como equilibrar entre linhas; serve pros títulos de 2-3
                palavras.) */}
            <span className={`text-[13px] font-bold leading-snug tracking-[-0.01em] text-foreground [overflow-wrap:anywhere] [text-wrap:balance] ${tam.titulo}`}>
              {def.titulo}
            </span>
          </span>
          <button
            type="button"
            onClick={onAbrir}
            aria-label={`Abrir ${def.titulo}`}
            className="absolute inset-0 z-10 rounded-[inherit] outline-none"
          />
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
            className="card-surface relative flex h-dvh min-h-dvh w-full flex-col overflow-hidden rounded-none border-0 outline-none"
          >
            {/* Cabeçalho único do card em foco — identidade + navegação numa
                linha, período e ação própria do card na linha de baixo. Antes
                disto, o painel mostrava este cabeçalho E o cabeçalho que cada
                card desenhava por conta própria (ícone e título de novo,
                subtítulo de novo): duas telas empilhadas em vez de uma. */}
            <motion.div layout="position" className="flex shrink-0 flex-col gap-2 border-b border-border px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: tint(def.accent, 9), color: def.accent }}
                >
                  <def.icone size={16} strokeWidth={1.9} />
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <h2 id={tituloId} className="text-[15px] font-bold leading-tight tracking-[-0.01em] text-foreground [overflow-wrap:anywhere]">
                    {def.titulo}
                  </h2>
                  {/* Ícone de info só quando o card escreve uma explicação —
                      substitui o subtítulo fixo de antes: a explicação existe
                      sob demanda, sem ocupar espaço permanente no cabeçalho. */}
                  {def.explicacao && (
                    <AnimatedInfoPopover
                      trigger={(
                        <AnimatedInfoTrigger
                          aria-label={`Entenda o painel ${def.titulo}`}
                          title={`O que é ${def.titulo}`}
                          iconSize={14}
                          className="press-feedback flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        />
                      )}
                      align="start"
                      sideOffset={8}
                      collisionPadding={12}
                      className="z-[100] w-[min(24rem,calc(100vw-1.5rem))] rounded-[1.1rem] border border-border bg-card p-5 shadow-[0_16px_40px_rgba(14,15,19,.24)] lg:w-[min(38rem,calc(100vw-1.5rem))]"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-[.08em] text-muted-foreground">{def.titulo}</p>
                      <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">{def.explicacao.resumo}</p>
                      <dl className="mt-3.5 flex flex-col gap-2.5 border-t border-border pt-3.5 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-4">
                        {def.explicacao.pontos.map((ponto) => (
                          <div key={ponto.titulo}>
                            <dt className="text-[11.5px] font-bold text-foreground">{ponto.titulo}</dt>
                            <dd className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{ponto.texto}</dd>
                          </div>
                        ))}
                      </dl>
                      {def.explicacao.dica && (
                        <p className="mt-3.5 rounded-[0.7rem] bg-muted px-3 py-2 text-[11.5px] leading-relaxed text-foreground/80">
                          {def.explicacao.dica}
                        </p>
                      )}
                    </AnimatedInfoPopover>
                  )}
                </div>
                {/* Sem botões de seta: pular de card continua valendo pelo
                    teclado (← →, ver o efeito de atalhos acima), mas dois
                    botões a mais no cabeçalho competiam com o fechar e com a
                    ação do próprio card sem ganhar nada em clareza. Contador
                    "X de Y" também saiu — não é informação que ajuda a
                    decisão de quem está ali, só ruído no cabeçalho. */}
                <button type="button" onClick={onFechar} aria-label="Fechar" className="press-feedback flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-row flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:justify-start sm:gap-2">
                <div className="flex min-w-0 flex-wrap items-center justify-center gap-2 sm:justify-start">
                  {barraPeriodo}
                </div>
                {/* Alvo do portal: sempre presente no DOM, mesmo vazio — um
                    card com ação própria (aba, "como é calculado") a desenha
                    aqui via createPortal quando monta. Com o pai em flex-wrap
                    (mobile e desktop), conteúdo curto (botão só, ver Score)
                    sobe pra mesma linha do Período sozinho quando cabe; largo
                    (grade de critérios, filtro de marca/canal) quebra pra
                    linha de baixo — sem precisar de dois layouts diferentes
                    por tamanho de tela. */}
                {/* sm:flex-1: cresce pra preencher o espaço que sobra ao lado do
                    período — sem isso um card que centraliza algo dentro do
                    próprio slot (ver ParadosCard) não tinha largura nenhuma pra
                    centralizar em relação a. Cards de um botão só (Score,
                    Reclamações) não mudam de lugar: `justify-end` continua
                    empurrando o conteúdo pro fim, seja a caixa larga ou não. */}
                <div ref={setAcaoSlot} className="flex min-w-0 flex-wrap items-center justify-center gap-2 empty:hidden sm:ml-auto sm:flex-1 sm:justify-end" />
              </div>
            </motion.div>

            {/* Sem atraso fixo: especialmente no mobile, o conteúdo precisa
                responder no mesmo quadro do toque. O crescimento do painel
                continua sendo conduzido pelo layoutId acima. */}
            <motion.div
              initial={reduzir ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transicao(reduzir, springs.settleFast)}
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
