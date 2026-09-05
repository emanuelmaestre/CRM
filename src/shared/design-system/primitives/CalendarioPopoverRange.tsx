"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type TouchEvent as EventoToque } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays, addMonths, differenceInCalendarDays, endOfMonth, format, getDay, isAfter, isBefore, isSameDay,
  isSameMonth, isToday, parseISO, startOfMonth, subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "../cn";
import { springs } from "../motion-variants";

/* ── Calendário de intervalo — 1 clique começa, o próximo termina ───
   Substitui o padrão antigo de dois `CalendarioPopover` lado a lado ("De:" e
   "Até:", dois botões, dois calendários de 1 dia cada) por um único gatilho
   que abre um calendário de viagem: primeiro clique fixa o início e liga um
   preview ao vivo (o intervalo até onde o mouse/dedo está passando fica
   pintado); segundo clique fecha o fim, aplica o filtro na hora — sem botão
   "aplicar" — e o próprio intervalo pulsa uma vez antes do painel fechar
   sozinho, como confirmação de que o resultado já carregou.

   Desktop mostra dois meses lado a lado (o par de datas frequentemente cruza
   um mês, e navegar de um em um pra comparar é o que esse padrão de UI
   existe pra evitar). Abaixo de `sm` cai pra um mês só — dois não cabem. */

const LARGURA_DOIS_MESES = 616;
/** Teto da folha do celular. Acima disso ela viraria uma faixa larga e
 *  esticada num tablet estreito; 420px mantém a proporção de cartão. */
const LARGURA_MAX_FOLHA = 420;
/** O respiro lateral da folha. É ele que faz o calendário FLUTUAR sobre a
 *  página em vez de grudar nas bordas: com a viewport aparecendo dos dois
 *  lados, fica claro que é um painel sobreposto e não uma nova tela. */
const RECUO_FOLHA = 16;
const RECUO_FOLHA_ESTREITO = 10;
const ALTURA_PAINEL_ESTIMADA = 420;
/** A folha é mais alta: as células dos dias crescem pra virar alvo de toque
 *  e os atalhos ocupam uma fileira própria. */
const ALTURA_PAINEL_FOLHA = 470;
const ALTURA_MINIMA_PAINEL = 260;
/** Deslocamento horizontal, em px, a partir do qual um toque deixa de ser
 *  toque e vira deslize de mes. Abaixo disso, o dedo tremido de quem so quis
 *  escolher um dia trocaria o mes por acidente. */
const DESLIZE_MINIMO = 45;
const MARGEM_VIEWPORT = 8;
const PULSO_MS = 320;

function paraISO(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function deISO(iso: string): Date | null {
  if (!iso) return null;
  const data = parseISO(iso);
  return Number.isNaN(data.getTime()) ? null : data;
}

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Sobe so a primeira letra. O `capitalize` do CSS subia cada palavra e o
 *  cabecalho saia "Setembro De 2026" -- a preposicao do formato pt-BR junto. */
function maiusculaInicial(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function montarGrade(mesReferencia: Date): Date[] {
  const inicio = startOfMonth(mesReferencia);
  const fim = endOfMonth(mesReferencia);
  const offsetInicio = getDay(inicio);
  const dias: Date[] = [];
  for (let i = offsetInicio; i > 0; i -= 1) {
    dias.push(new Date(inicio.getFullYear(), inicio.getMonth(), 1 - i));
  }
  for (let dia = 1; dia <= fim.getDate(); dia += 1) {
    dias.push(new Date(inicio.getFullYear(), inicio.getMonth(), dia));
  }
  while (dias.length < 42) {
    const ultimo = dias[dias.length - 1];
    dias.push(new Date(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate() + 1));
  }
  return dias;
}

/** Pulso em volta do gatilho quando um período está aplicado — na cor de
 *  identidade de quem chamou o calendário (ver `accent` em
 *  CalendarioPopoverRangeProps), não num índigo fixo: aquele já identifica
 *  o dia marcado dentro do calendário de outros contextos e as pílulas de
 *  marca/canal, então repeti-lo aqui confundia "período aplicado" com
 *  "filtro marcado". */
function HaloSelecao({ reduzir, accent }: { reduzir: boolean | null; accent: string }) {
  return (
    <AnimatePresence>
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[0.75rem]"
        style={{ boxShadow: `0 0 0 2px ${accent}` }}
        initial={{ opacity: 0, scale: 1 }}
        animate={reduzir ? { opacity: 0.55 } : { opacity: [0.55, 0.1, 0.55], scale: [1, 1.06, 1] }}
        transition={reduzir ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </AnimatePresence>
  );
}

interface Posicao {
  top: number;
  left: number;
  largura: number;
  alinhadoDireita: boolean;
  paraCima: boolean;
  doisMeses: boolean;
  /** Folha do celular: um mes so, cartao flutuante centralizado com respiro
   *  nas duas laterais. Vale abaixo de 672px, onde so cabe um mes. */
  folha: boolean;
  /** Teto de altura pro espaco que sobrou entre o gatilho e a borda da tela.
   *  A grade rola por dentro; cabecalho e rodape ficam presos. */
  alturaMax: number;
}

function useEstaNoCliente(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function calcularPosicao(gatilho: HTMLElement): Posicao {
  const rect = gatilho.getBoundingClientRect();
  const doisMeses = window.innerWidth >= 672;
  /* No celular o recuo e generoso de proposito (ver RECUO_FOLHA); no desktop
     e so a folga minima pra o popover nao encostar na borda. */
  const margem = doisMeses
    ? MARGEM_VIEWPORT
    : window.innerWidth < 360 ? RECUO_FOLHA_ESTREITO : RECUO_FOLHA;
  const alturaEstimada = doisMeses ? ALTURA_PAINEL_ESTIMADA : ALTURA_PAINEL_FOLHA;
  const espacoAbaixo = window.innerHeight - rect.bottom;
  const paraCima = espacoAbaixo < alturaEstimada + margem && rect.top > espacoAbaixo;
  /* A folha se afasta um pouco mais do gatilho: o respiro em volta so le como
     "cartao flutuante" se existir nos quatro lados, nao so nas laterais. */
  const afastamento = doisMeses ? 8 : 12;
  const top = paraCima ? rect.top - afastamento : rect.bottom + afastamento;
  /* Teto real do que sobrou. Antes o painel nao tinha limite nenhum: em tela
     baixa (ou celular deitado) ele simplesmente vazava, e o primeiro pedaco a
     sumir era o rodape com o "Limpar". */
  const alturaMax = Math.max(
    ALTURA_MINIMA_PAINEL,
    paraCima ? rect.top - afastamento - margem : window.innerHeight - (rect.bottom + afastamento) - margem,
  );

  /* Um mes so (abaixo de 672px): o painel deixa de ser um popover pendurado no
     canto do botao e vira uma folha centralizada, com a pagina aparecendo dos
     dois lados. As sete colunas ainda dividem quase a tela inteira -- a celula
     de cada dia continua sendo alvo de toque honesto --, mas o painel para de
     encostar nas bordas, que era o que fazia ele parecer uma tela nova em vez
     de algo sobreposto. O eixo vertical nao muda: continua abrindo acima ou
     abaixo do gatilho. */
  if (!doisMeses) {
    const larguraFolha = Math.min(LARGURA_MAX_FOLHA, window.innerWidth - margem * 2);
    const esquerdaFolha = Math.round((window.innerWidth - larguraFolha) / 2);
    return { top, left: esquerdaFolha, largura: larguraFolha, paraCima, alinhadoDireita: false, doisMeses, folha: true, alturaMax };
  }

  const largura = Math.min(LARGURA_DOIS_MESES, window.innerWidth - margem * 2);
  const alinhadoDireita = rect.left + largura > window.innerWidth - margem;
  const esquerdaDesejada = alinhadoDireita ? rect.right - largura : rect.left;
  const left = Math.min(
    Math.max(esquerdaDesejada, margem),
    window.innerWidth - largura - margem,
  );

  return { top, left, largura, paraCima, alinhadoDireita, doisMeses, folha: false, alturaMax };
}

interface MesProps {
  mes: Date;
  /** Qual seta este mes carrega. No modo de um mes so (`undefined`) ele
   *  carrega AS DUAS -- nao ha um mes vizinho pra segurar a outra ponta. */
  direcaoNav?: "esquerda" | "direita";
  onAnterior: () => void;
  onProximo: () => void;
  /** Falso quando o mes de destino inteiro esta fora de `min`/`max`. Antes
   *  dava pra navegar ate 2030 e achar 42 dias apagados. */
  podeAnterior: boolean;
  podeProximo: boolean;
  /** Celula de 44px em vez de 36px -- so no painel de fora a fora, onde ha
   *  largura sobrando e o dedo e o ponteiro. */
  celulaAlta: boolean;
  /** De que lado a grade do mes novo entra: -1 voltou, 1 avancou, 0 sem
   *  animacao (primeira abertura). */
  direcaoMes: number;
  foraDoLimite: (dia: Date) => boolean;
  papel: (dia: Date) => "inicio" | "fim" | "meio" | "unico" | null;
  onEscolher: (dia: Date) => void;
  onHover: (dia: Date) => void;
  pulsando: boolean;
  reduzir: boolean | null;
  /** Cor de quem chamou o calendário (o mesmo acento do ícone do card, no
   *  Métricas; a cor da marca ativa, em Anúncios) — pinta o intervalo sendo
   *  escolhido com essa identidade em vez de uma cor fixa igual para todos. */
  accent: string;
}

/** Fora do componente principal — recriar isto a cada render perderia o
 *  estado interno do `useMemo` da grade e disparava o aviso do lint de
 *  "componente criado durante o render". */
function Mes({ mes, direcaoNav, onAnterior, onProximo, podeAnterior, podeProximo, celulaAlta, direcaoMes, foraDoLimite, papel, onEscolher, onHover, pulsando, reduzir, accent }: MesProps) {
  const grade = useMemo(() => montarGrade(mes), [mes]);
  /* No desktop cada mes carrega uma seta (o da esquerda volta, o da direita
     avanca). Com um mes so na tela, `direcaoNav` chega `undefined` -- e a
     regra antiga so olhava por "direita", entao o painel do celular nascia
     com a seta de avancar e SEM a de voltar: era literalmente impossivel
     chegar no mes passado. Aqui as duas aparecem nesse caso. */
  const temEsquerda = direcaoNav === "esquerda" || direcaoNav === undefined;
  const temDireita = direcaoNav === "direita" || direcaoNav === undefined;
  const seta = "press-feedback flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between px-1">
        {temEsquerda ? (
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={onAnterior}
            disabled={!podeAnterior}
            className={cn(seta, celulaAlta ? "h-11 w-11" : "h-9 w-9")}
          >
            <ChevronLeft size={celulaAlta ? 18 : 15} />
          </button>
        ) : <span className={celulaAlta ? "w-11" : "w-9"} />}
        <span className={cn("font-bold tracking-[-0.01em] text-foreground", celulaAlta ? "text-[15px]" : "text-[13px]")}>
          {maiusculaInicial(format(mes, "MMMM 'de' yyyy", { locale: ptBR }))}
        </span>
        {temDireita ? (
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={onProximo}
            disabled={!podeProximo}
            className={cn(seta, celulaAlta ? "h-11 w-11" : "h-9 w-9")}
          >
            <ChevronRight size={celulaAlta ? 18 : 15} />
          </button>
        ) : <span className={celulaAlta ? "w-11" : "w-9"} />}
      </div>

      <div className="grid grid-cols-7 gap-y-1 px-1 pt-2">
        {DIAS_SEMANA.map((dia, indice) => (
          <span key={`${dia}-${indice}`} className={cn("flex items-center justify-center font-bold uppercase text-muted-foreground/70", celulaAlta ? "h-7 text-[11px]" : "h-6 text-[10px]")}>
            {dia}
          </span>
        ))}
      </div>

      {/* So a GRADE escorrega. O cabecalho com o titulo e as setas fica
          montado: remontar as setas junto devolveria o foco do teclado pro
          nada a cada mes, e quem navega com Enter perderia o botao debaixo do
          dedo. Um bloco por vez na arvore -- com `AnimatePresence` haveria
          dois meses montados no cruzamento e uma busca por `[data-date]`
          acharia o dia errado. */}
      <motion.div
        key={`${mes.getFullYear()}-${mes.getMonth()}`}
        className="grid grid-cols-7 gap-y-1 px-1 pt-1"
        initial={reduzir || direcaoMes === 0 ? false : { opacity: 0, x: direcaoMes * 26 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: reduzir ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
      >
        {grade.map((dia) => {
          const foraDoMes = !isSameMonth(dia, mes);
          const hoje = isToday(dia);
          const bloqueado = foraDoLimite(dia);
          const papelDia = papel(dia);
          const extremo = papelDia === "inicio" || papelDia === "fim" || papelDia === "unico";

          return (
            <div key={dia.toISOString()} className="relative">
              {papelDia === "meio" && <span aria-hidden="true" className="absolute inset-y-0 -inset-x-px" style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)` }} />}
              {papelDia === "inicio" && <span aria-hidden="true" className="absolute inset-y-0 left-1/2 right-0" style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)` }} />}
              {papelDia === "fim" && <span aria-hidden="true" className="absolute inset-y-0 left-0 right-1/2" style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)` }} />}
              <motion.button
                type="button"
                data-date={paraISO(dia)}
                disabled={bloqueado}
                onClick={() => onEscolher(dia)}
                onMouseEnter={() => onHover(dia)}
                animate={pulsando && (papelDia === "meio" || extremo) ? { scale: [1, 1.14, 1] } : undefined}
                transition={{ duration: PULSO_MS / 1000, delay: reduzir ? 0 : 0 }}
                aria-current={hoje ? "date" : undefined}
                aria-pressed={extremo}
                className={cn(
                  "press-feedback relative z-10 flex w-full min-w-0 items-center justify-center rounded-full font-semibold tabular-nums transition-colors",
                  celulaAlta ? "h-11 text-[14px]" : "h-9 text-[12px]",
                  bloqueado && "cursor-not-allowed text-muted-foreground/25",
                  !bloqueado && foraDoMes && "text-muted-foreground/35 hover:bg-muted",
                  !bloqueado && !foraDoMes && !extremo && "text-foreground hover:bg-muted",
                )}
                style={extremo ? { background: accent, color: "#fff" } : undefined}
              >
                {hoje && !extremo && (
                  <span aria-hidden="true" className="absolute inset-0 rounded-full border-2" style={{ borderColor: accent }} />
                )}
                {dia.getDate()}
              </motion.button>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

export interface RangeDatas {
  inicio: string;
  fim: string;
}

interface CalendarioPopoverRangeProps {
  /** Atalhos do ML incluem os N dias anteriores e o dia atual. */
  incluirHojeAlemDoPeriodo?: boolean;
  rotulo: string;
  valor: RangeDatas;
  min?: string;
  max?: string;
  onChange: (valor: RangeDatas) => void;
  disabled?: boolean;
  atraso?: number;
  /** Cor de identidade de quem chamou o calendário — o mesmo acento do
   *  ícone do card aberto, no Métricas, ou a cor da marca ativa, em
   *  Anúncios. Sem isso, cai num cinza-chumbo neutro (var(--foreground)) —
   *  telas de lista (Avaliações, Vendas, Auditoria...) não têm um "ícone de
   *  card" pra herdar, então não faz sentido inventar uma cor de destaque. */
  accent?: string;
}

export function CalendarioPopoverRange({ rotulo, valor, min, max, onChange, disabled, atraso = 0, accent = "var(--foreground)", incluirHojeAlemDoPeriodo = false }: CalendarioPopoverRangeProps) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const [pulsando, setPulsando] = useState(false);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const reduzir = useReducedMotion();
  const tituloId = useId();
  const montado = useEstaNoCliente();

  const inicioSelecionado = useMemo(() => deISO(valor.inicio), [valor.inicio]);
  const fimSelecionado = useMemo(() => deISO(valor.fim), [valor.fim]);
  const limiteMin = useMemo(() => (min ? deISO(min) : null), [min]);
  const limiteMax = useMemo(() => (max ? deISO(max) : null), [max]);

  /** Enquanto `null`, o próximo clique começa um intervalo novo. Enquanto
   *  tem uma data, o próximo clique fecha o intervalo nela. */
  const [inicioRascunho, setInicioRascunho] = useState<Date | null>(null);
  const [hoverDia, setHoverDia] = useState<Date | null>(null);
  const [mesVisivel, setMesVisivel] = useState(() => inicioSelecionado ?? new Date());
  /** De que lado o mes novo entra: -1 veio da esquerda (voltou), 1 da direita
   *  (avancou). So alimenta a animacao. */
  const [direcaoMes, setDirecaoMes] = useState(0);
  /** Onde o dedo encostou, pra medir o deslize no fim do toque. */
  const toqueInicio = useRef<{ x: number; y: number } | null>(null);
  /** Um deslize termina com um `click` no dia onde o dedo levantou. Sem esta
   *  trava, arrastar pra trocar de mes selecionava uma data no caminho. */
  const deslizou = useRef(false);

  useLayoutEffect(() => {
    if (!aberto || !gatilhoRef.current) return;
    let pendente = false;
    const atualizar = () => {
      if (pendente) return;
      pendente = true;
      requestAnimationFrame(() => {
        pendente = false;
        if (gatilhoRef.current) setPosicao(calcularPosicao(gatilhoRef.current));
      });
    };
    if (gatilhoRef.current) setPosicao(calcularPosicao(gatilhoRef.current));
    window.addEventListener("scroll", atualizar, true);
    window.addEventListener("resize", atualizar);
    // Safari iOS dispara "scroll" de forma irregular durante rolagem com
    // inércia — o painel pode ficar um frame atrás do botão até o dedo
    // soltar. "scrollend" (quando suportado) garante um recálculo final
    // exato assim que a rolagem realmente parar.
    window.addEventListener("scrollend", atualizar, true);
    return () => {
      window.removeEventListener("scroll", atualizar, true);
      window.removeEventListener("resize", atualizar);
      window.removeEventListener("scrollend", atualizar, true);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(evento: PointerEvent) {
      const alvo = evento.target as Node;
      if (gatilhoRef.current?.contains(alvo)) return;
      if (painelRef.current?.contains(alvo)) return;
      setAberto(false);
    }
    function aoTeclarEsc(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }
    document.addEventListener("pointerdown", aoClicarFora);
    document.addEventListener("keydown", aoTeclarEsc);
    return () => {
      document.removeEventListener("pointerdown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclarEsc);
    };
  }, [aberto]);

  function foraDoLimite(dia: Date): boolean {
    if (limiteMin && isBefore(dia, limiteMin) && !isSameDay(dia, limiteMin)) return true;
    if (limiteMax && isAfter(dia, limiteMax) && !isSameDay(dia, limiteMax)) return true;
    return false;
  }

  /** Ordena o par e apara nas bordas de `min`/`max`. Os atalhos de periodo
   *  ("30 dias", "Este mes") frequentemente comecam antes do que a tela
   *  permite; aparar e melhor que aplicar data invalida ou nao fazer nada.
   *  Devolve `null` so quando o intervalo inteiro caiu fora da faixa. */
  function aparar(inicio: Date, fim: Date): [Date, Date] | null {
    let [de, ate] = isAfter(inicio, fim) ? [fim, inicio] : [inicio, fim];
    if (limiteMin && isBefore(de, limiteMin)) de = limiteMin;
    if (limiteMax && isAfter(ate, limiteMax)) ate = limiteMax;
    return isAfter(de, ate) ? null : [de, ate];
  }

  function aplicar(inicio: Date, fim: Date) {
    const faixa = aparar(inicio, fim);
    if (!faixa) return;
    const [de, ate] = faixa;
    onChange({ inicio: paraISO(de), fim: paraISO(ate) });
    setInicioRascunho(null);
    setHoverDia(null);
    setPulsando(true);
    window.setTimeout(() => {
      setPulsando(false);
      setAberto(false);
    }, PULSO_MS);
  }

  function escolher(dia: Date) {
    /* O `click` que o navegador dispara no fim de um deslize cai no dia sob
       o dedo. Consome a trava e nao seleciona nada. */
    if (deslizou.current) {
      deslizou.current = false;
      return;
    }
    if (foraDoLimite(dia)) return;
    if (!inicioRascunho) {
      setInicioRascunho(dia);
      return;
    }
    aplicar(inicioRascunho, dia);
  }

  /* ── Atalhos ────────────────────────────────────────────────────────
     Quatro, e nao cinco, por decisao de 02/09/2026: sao QUATRO que cabem numa
     fileira unica de larguras iguais, sem quebra de linha e sem um chip orfao
     na segunda linha. Todos terminam em "hoje" -- o conjunto passou a ter uma
     regra so ("os ultimos N"), em vez de misturar janelas correntes com um mes
     fechado. Sao dados, e nao funcoes soltas, porque a mesma faixa serve pra
     aplicar E pra saber qual chip esta aceso. */
  const atalhos = useMemo(() => {
    const hoje = new Date();
    return [
      { rotulo: "Hoje", de: hoje, ate: hoje },
      { rotulo: "7 dias", de: addDays(hoje, incluirHojeAlemDoPeriodo ? -7 : -6), ate: hoje },
      { rotulo: "30 dias", de: addDays(hoje, incluirHojeAlemDoPeriodo ? -30 : -29), ate: hoje },
      { rotulo: "Este mês", de: startOfMonth(hoje), ate: hoje },
    ];
  }, [incluirHojeAlemDoPeriodo]);

  function limpar() {
    onChange({ inicio: "", fim: "" });
    setInicioRascunho(null);
    setHoverDia(null);
    setAberto(false);
  }

  /** "Limpar" so aparece quando ha o que limpar — um botao que nao faz nada
   *  gasta a unica fileira de acoes que a folha tem. */
  const podeLimpar = Boolean(valor.inicio || valor.fim || inicioRascunho);

  /** Uma unica porta pra trocar de mes: as setas, o deslize e qualquer coisa
   *  futura passam por aqui, entao a direcao da animacao nunca fica
   *  dessincronizada do movimento que a causou. */
  function irParaMes(passo: -1 | 1) {
    if (passo === -1 && !podeAnterior) return;
    if (passo === 1 && !podeProximo) return;
    setDirecaoMes(passo);
    setMesVisivel((atual) => addMonths(atual, passo));
  }

  /* ── Deslize lateral troca o mes (so na folha: celular e tablet) ────────
     No desktop os dois meses ja aparecem lado a lado e ha uma seta em cada
     ponta -- deslizar ali nao resolve problema nenhum e atrapalharia quem
     arrasta pra selecionar um intervalo. */
  function aoEncostar(evento: EventoToque<HTMLDivElement>) {
    const toque = evento.touches[0];
    toqueInicio.current = toque ? { x: toque.clientX, y: toque.clientY } : null;
    deslizou.current = false;
  }

  function aoLevantar(evento: EventoToque<HTMLDivElement>) {
    const partida = toqueInicio.current;
    toqueInicio.current = null;
    /* Com um inicio ja fixado, arrastar significa "escolher o fim do
       intervalo" -- o gesto de pintar tem precedencia sobre o de navegar. */
    if (!partida || !posicao?.folha || inicioRascunho) return;
    const toque = evento.changedTouches[0];
    if (!toque) return;
    const dx = toque.clientX - partida.x;
    const dy = toque.clientY - partida.y;
    /* Exige que o movimento seja mais horizontal que vertical: a grade rola
       na vertical e uma rolagem meio torta nao pode virar troca de mes. */
    if (Math.abs(dx) < DESLIZE_MINIMO || Math.abs(dx) <= Math.abs(dy)) return;
    deslizou.current = true;
    irParaMes(dx < 0 ? 1 : -1);
  }

  /** Arrastar o dedo depois do primeiro toque pinta o intervalo ao vivo, como
   *  o mouse ja fazia. `onMouseEnter` nunca dispara no touch: o dedo nao tem
   *  hover, e o alvo do toque fica preso no elemento do `touchstart`. Por
   *  isso a posicao e resolvida na mao, pelo `data-date` de cada celula. */
  function aoArrastar(evento: EventoToque<HTMLDivElement>) {
    if (!inicioRascunho) return;
    const toque = evento.touches[0];
    if (!toque) return;
    const alvo = document.elementFromPoint(toque.clientX, toque.clientY) as HTMLElement | null;
    const iso = alvo?.closest<HTMLElement>("[data-date]")?.dataset.date;
    const dia = iso ? deISO(iso) : null;
    if (!dia || foraDoLimite(dia)) return;
    if (!hoverDia || !isSameDay(dia, hoverDia)) setHoverDia(dia);
  }

  const diaMesAno = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  // O botão mostra só "Período" — a data selecionada some depois de
  // escolhida no calendário (que já mostra a data lá dentro, no
  // cabeçalho do painel); title/aria-label continuam com a data por
  // extenso pra quem usa leitor de tela saber o valor atual sem abrir.
  const rotuloAcessivel = inicioSelecionado && fimSelecionado
    ? `${rotulo}: ${diaMesAno.format(inicioSelecionado)} – ${diaMesAno.format(fimSelecionado)}`
    : rotulo;

  const mesEsquerda = mesVisivel;
  const mesDireita = addMonths(mesVisivel, 1);

  /** "unico" é um dia sozinho (início = fim, ex.: filtro "Hoje") — conta como
   *  extremo pra ganhar o círculo cheio da cor de acento, mas ao contrário de
   *  "inicio"/"fim" não desenha a faixa de conexão de fundo (pensada pra
   *  ligar visualmente vários dias de um intervalo real). Sem essa distinção,
   *  a faixa (metade do width, altura inteira da célula) vazava por trás do
   *  círculo do dia único e criava um anel quebrado/duplicado. */
  function dentroDoIntervaloPreview(dia: Date): "inicio" | "fim" | "meio" | "unico" | null {
    const ancora = inicioRascunho;
    const alvo = hoverDia ?? inicioSelecionado;
    // Sem seleção em andamento: mostra o intervalo já aplicado (se houver).
    if (!ancora) {
      if (!inicioSelecionado || !fimSelecionado) return null;
      if (isSameDay(inicioSelecionado, fimSelecionado)) {
        return isSameDay(dia, inicioSelecionado) ? "unico" : null;
      }
      if (isSameDay(dia, inicioSelecionado)) return "inicio";
      if (isSameDay(dia, fimSelecionado)) return "fim";
      if (isAfter(dia, inicioSelecionado) && isBefore(dia, fimSelecionado)) return "meio";
      return null;
    }
    // Seleção em andamento: intervalo entre a âncora e onde o cursor está agora.
    const referencia = alvo ?? ancora;
    const [de, ate] = isAfter(ancora, referencia) ? [referencia, ancora] : [ancora, referencia];
    if (isSameDay(de, ate)) {
      return isSameDay(dia, de) ? "unico" : null;
    }
    if (isSameDay(dia, de)) return "inicio";
    if (isSameDay(dia, ate)) return "fim";
    if (isAfter(dia, de) && isBefore(dia, ate)) return "meio";
    return null;
  }

  /* O ultimo mes visivel e o da direita quando ha dois na tela. Sem isto, a
     seta de avancar travaria um mes antes do que deveria. */
  const ultimoMesVisivel = posicao?.doisMeses ? addMonths(mesVisivel, 1) : mesVisivel;
  const podeAnterior = !limiteMin || !isBefore(endOfMonth(subMonths(mesVisivel, 1)), limiteMin);
  const podeProximo = !limiteMax || !isAfter(startOfMonth(addMonths(ultimoMesVisivel, 1)), limiteMax);
  const diasNoIntervalo = inicioSelecionado && fimSelecionado
    ? differenceInCalendarDays(fimSelecionado, inicioSelecionado) + 1
    : 0;

  const painel = aberto && posicao && (
    <motion.div
      ref={painelRef}
      key="painel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      initial={{ opacity: 0, y: posicao.paraCima ? 6 : -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: posicao.paraCima ? 6 : -6, scale: 0.97 }}
      transition={springs.settleFast}
      style={{
        position: "fixed",
        top: posicao.top,
        left: posicao.left,
        width: posicao.largura,
        transform: posicao.paraCima ? "translateY(-100%)" : undefined,
        transformOrigin: posicao.folha
          ? `${posicao.paraCima ? "bottom" : "top"} center`
          : `${posicao.paraCima ? "bottom" : "top"} ${posicao.alinhadoDireita ? "right" : "left"}`,
        maxHeight: posicao.alturaMax,
      }}
      className={cn(
        "z-[100] flex flex-col overflow-hidden border border-border bg-card",
        /* Solta das bordas, a folha fecha os quatro cantos e ganha uma sombra
           mais funda: e o que a separa da pagina que continua visivel atras. */
        posicao.folha
          ? "rounded-[1.5rem] shadow-[0_24px_60px_rgba(14,15,19,.30)]"
          : "rounded-[1.1rem] shadow-[0_16px_40px_rgba(14,15,19,.24)]",
      )}
    >
      <span id={tituloId} className="sr-only">{rotulo}</span>

      {/* O periodo escolhido e a resposta que o painel existe pra dar, entao
          ele abre o cabecalho em tamanho de leitura -- nao mais um 11px cinza
          espremido ao lado dos atalhos. Na folha, "Limpar" sobe pra ca e o
          rodape inteiro deixa de existir: uma barra so pra um link consumia
          altura que agora mostra pagina em volta do calendario. */}
      <div className={cn(
        "shrink-0 border-b border-border",
        posicao.folha ? "space-y-3 px-4 py-3" : "flex items-center justify-between gap-3 px-3 py-2.5",
      )}>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <p className={cn("min-w-0 font-semibold text-muted-foreground", posicao.folha ? "text-[13px]" : "text-[12px]")}>
            {!inicioRascunho && !inicioSelecionado && "Escolha a data inicial"}
            {inicioRascunho && "Agora escolha a data final"}
            {!inicioRascunho && inicioSelecionado && fimSelecionado && (
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className={cn("font-extrabold tracking-[-0.01em] text-foreground", posicao.folha ? "text-[17px]" : "text-[14px]")}>
                  {diaMesAno.format(inicioSelecionado)} – {diaMesAno.format(fimSelecionado)}
                </span>
                {/* Quantos dias o intervalo cobre: conferir faturamento de 29 ou
                    de 30 dias muda o numero, e contar no calendario e trabalho.
                    Virou pilula pra parar de se confundir com as datas. */}
                <span className={cn(
                  "shrink-0 rounded-full bg-muted font-bold tabular-nums text-muted-foreground",
                  posicao.folha ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-px text-[10px]",
                )}>
                  {diasNoIntervalo} {diasNoIntervalo === 1 ? "dia" : "dias"}
                </span>
              </span>
            )}
          </p>
          {posicao.folha && podeLimpar && (
            <button
              type="button"
              onClick={limpar}
              className="press-feedback shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Limpar
            </button>
          )}
        </div>
        {/* Quatro colunas de largura igual: os atalhos param de ser pilulas de
            tamanhos diferentes que quebram linha e viram uma fileira unica,
            com o mesmo alvo de toque em cada uma. */}
        <div className={cn(
          posicao.folha ? "grid grid-cols-4 gap-1.5" : "flex shrink-0 gap-1",
        )}>
          {atalhos.map((item) => {
            const faixa = aparar(item.de, item.ate);
            const ativo = !!faixa && valor.inicio === paraISO(faixa[0]) && valor.fim === paraISO(faixa[1]);
            return (
              <button
                key={item.rotulo}
                type="button"
                onClick={() => aplicar(item.de, item.ate)}
                disabled={!faixa}
                aria-pressed={ativo}
                style={ativo ? { background: accent, borderColor: accent, color: "#fff" } : undefined}
                className={cn(
                  "press-feedback flex items-center justify-center whitespace-nowrap rounded-full border font-bold transition-colors disabled:pointer-events-none disabled:opacity-30",
                  posicao.folha ? "h-10 w-full text-[12.5px]" : "h-7 shrink-0 px-2.5 text-[10px]",
                  !ativo && "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                  /* Na folha o chip tem fundo proprio: sem ele, quatro rotulos
                     soltos nao leem como uma fileira de botoes. */
                  !ativo && posicao.folha && "bg-muted/60",
                )}
              >
                {item.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {/* `flex-1` + `overflow-y-auto`: quando o teto de altura aperta, quem rola
          e a grade -- cabecalho e rodape ficam presos e sempre alcancaveis. */}
      {/* `touch-pan-y`: libera a rolagem vertical da grade e reserva o eixo
          horizontal pro deslize, senao o navegador leva o gesto pra navegacao
          de voltar pagina antes de ele chegar aqui. */}
      <div
        className="flex flex-1 touch-pan-y gap-3 overflow-y-auto overscroll-contain p-3"
        onMouseLeave={() => setHoverDia(null)}
        onTouchStart={aoEncostar}
        onTouchMove={aoArrastar}
        onTouchEnd={aoLevantar}
      >
        <Mes
          mes={mesEsquerda}
          direcaoNav={posicao.doisMeses ? "esquerda" : undefined}
          onAnterior={() => irParaMes(-1)}
          onProximo={() => irParaMes(1)}
          podeAnterior={podeAnterior}
          podeProximo={podeProximo}
          celulaAlta={posicao.folha}
          direcaoMes={direcaoMes}
          foraDoLimite={foraDoLimite}
          papel={dentroDoIntervaloPreview}
          onEscolher={escolher}
          onHover={(dia) => inicioRascunho && setHoverDia(dia)}
          pulsando={pulsando}
          reduzir={reduzir}
          accent={accent}
        />
        {posicao.doisMeses && (
          <Mes
            mes={mesDireita}
            direcaoNav="direita"
            onAnterior={() => irParaMes(-1)}
            onProximo={() => irParaMes(1)}
            podeAnterior={podeAnterior}
            podeProximo={podeProximo}
            celulaAlta={posicao.folha}
            direcaoMes={direcaoMes}
            foraDoLimite={foraDoLimite}
            papel={dentroDoIntervaloPreview}
            onEscolher={escolher}
            onHover={(dia) => inicioRascunho && setHoverDia(dia)}
            pulsando={pulsando}
            reduzir={reduzir}
            accent={accent}
          />
        )}
      </div>

      {/* Só no desktop: na folha o "Limpar" já vive no cabeçalho, e uma barra
          inteira pra um link só custava altura que agora deixa a página
          aparecer em volta do calendário. */}
      {!posicao.folha && (
        <div className="flex shrink-0 items-center justify-end border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={limpar}
            className="press-feedback inline-flex h-9 items-center rounded-[0.5rem] px-3 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Limpar
          </button>
        </div>
      )}
    </motion.div>
  );

  return (
    <>
      <motion.button
        ref={gatilhoRef}
        type="button"
        initial={{ opacity: 0, y: -4, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: pulsando ? [1, 1.05, 1] : 1 }}
        // `scale` some com 3 keyframes quando o pulso dispara — spring só
        // aceita 2. As outras propriedades continuam com a mola padrão; só
        // `scale`, nesse instante, vira um tween simples.
        transition={{ opacity: { ...springs.settleFast, delay: atraso }, y: { ...springs.settleFast, delay: atraso }, scale: pulsando ? { duration: PULSO_MS / 1000, ease: "easeInOut" } : { ...springs.settleFast, delay: atraso } }}
        whileHover={disabled ? undefined : { scale: 1.02 }}
        whileTap={disabled ? undefined : { scale: 0.97 }}
        title={rotuloAcessivel}
        aria-label={rotuloAcessivel}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        disabled={disabled}
        onClick={() => {
          setAberto((atual) => {
            if (!atual) {
              setMesVisivel(inicioSelecionado ?? new Date());
              setInicioRascunho(null);
              setHoverDia(null);
              if (gatilhoRef.current) setPosicao(calcularPosicao(gatilhoRef.current));
            }
            return !atual;
          });
        }}
        style={inicioSelecionado && fimSelecionado && !aberto
          ? { borderColor: accent, color: accent, background: `color-mix(in srgb, ${accent} 12%, var(--card))` }
          : undefined}
        className={cn(
          "group press-feedback relative inline-flex h-11 items-center gap-2 rounded-[0.75rem] px-3.5 text-xs transition-all duration-200 disabled:opacity-50",
          inicioSelecionado && fimSelecionado
            ? "border-2 font-extrabold shadow-[0_2px_6px_rgba(14,15,19,.14)]"
            : "border border-border bg-muted font-semibold text-muted-foreground hover:bg-card hover:text-foreground",
          aberto && "border border-foreground/60 bg-card shadow-[0_0_0_3px_rgba(14,15,19,.08)]",
        )}
      >
        {inicioSelecionado && fimSelecionado && !aberto && <HaloSelecao reduzir={reduzir} accent={accent} />}
        <CalendarRange
          size={15}
          strokeWidth={2}
          aria-hidden="true"
          className={cn(
            "shrink-0 transition-all duration-200 group-hover:scale-110",
            inicioSelecionado && fimSelecionado
              ? aberto ? "text-foreground" : ""
              : "text-muted-foreground group-hover:text-foreground",
          )}
        />
        <span className="whitespace-nowrap tabular-nums">{rotulo}</span>
      </motion.button>

      {montado && createPortal(
        <AnimatePresence>
          {/* A folha pede um veu: da o alvo de "toque fora pra fechar" sem que
              o dedo acerte um controle da pagina por baixo, e empurra o
              conteudo pra tras. Leve e com um desfoque de 2px de proposito --
              a graca do painel flutuante e continuar VENDO o redor; escurecer
              de vez devolveria a sensacao de tela nova. No desktop nao entra:
              ali o popover e pequeno e velar a tela inteira seria agressivo. */}
          {aberto && posicao?.folha && (
            <motion.div
              key="veu"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setAberto(false)}
              className="fixed inset-0 z-[99] bg-foreground/20 backdrop-blur-[2px]"
            />
          )}
          {painel}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
