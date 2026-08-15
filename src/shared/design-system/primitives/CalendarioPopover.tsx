"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths, endOfMonth, format, getDay, isAfter, isBefore, isSameDay,
  isSameMonth, isToday, parseISO, startOfMonth, subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "../cn";
import { springs } from "../motion-variants";

/* ── Calendário próprio ───────────────────────────────────────────
   Substitui o `<input type="date">` nativo — que renderiza o widget cru
   do sistema operacional, sem nenhuma identidade do produto — por um
   popover desenhado aqui: mês desliza com direção (esquerda/direita
   conforme navega), o dia selecionado ganha o gradiente da marca em vez
   de um quadrado cinza, e hoje fica marcado mesmo sem estar selecionado.

   O painel entra por um portal em document.body, com posição calculada
   em `fixed` a partir do botão — não `position: absolute` dentro do
   próprio botão. Todo card do produto usa `overflow-hidden` na borda
   (é o que dá o cantinho arredondado limpo), e um popover posicionado
   por dentro desse ancestral seria cortado no meio, exatamente como
   aconteceu na primeira versão. Fora da árvore do card, o calendário
   flutua por cima de qualquer coisa. */

const LARGURA_PAINEL = 288;
const ALTURA_PAINEL_ESTIMADA = 380;
const MARGEM_VIEWPORT = 8;

function paraISO(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function deISO(iso: string): Date | null {
  if (!iso) return null;
  const data = parseISO(iso);
  return Number.isNaN(data.getTime()) ? null : data;
}

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Grade de 6 semanas, sempre — dias do mês vizinho entram apagados para o
 *  primeiro dia do mês nunca "flutuar" numa posição diferente a cada troca. */
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

interface Posicao {
  top: number;
  left: number;
  /** O painel abre para cima quando não sobra espaço embaixo — a origem da
   *  animação de entrada acompanha, senão o calendário "nasceria" do lado
   *  errado do botão. */
  paraCima: boolean;
}

/** Ancora embaixo do botão por padrão; sobe se não sobrar altura na tela, e
 *  nunca deixa a lateral vazar para fora da viewport. */
/** `document.body` só existe no cliente — no SSR o portal quebraria a
 *  renderização. `useSyncExternalStore` é a forma que o próprio React
 *  recomenda para essa checagem (ver "You Might Not Need an Effect"): a
 *  alternativa óbvia, um `useEffect(() => setMontado(true), [])`, dispara
 *  exatamente o aviso que ela existe para evitar — setState só para marcar
 *  "montei", quando não há nenhum estado real sendo sincronizado. */
function useEstaNoCliente(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function calcularPosicao(gatilho: HTMLElement): Posicao {
  const rect = gatilho.getBoundingClientRect();
  const espacoAbaixo = window.innerHeight - rect.bottom;
  const paraCima = espacoAbaixo < ALTURA_PAINEL_ESTIMADA + MARGEM_VIEWPORT && rect.top > espacoAbaixo;

  const left = Math.min(
    Math.max(rect.left, MARGEM_VIEWPORT),
    window.innerWidth - LARGURA_PAINEL - MARGEM_VIEWPORT,
  );
  const top = paraCima ? rect.top - 8 : rect.bottom + 8;

  return { top, left, paraCima };
}

interface CalendarioPopoverProps {
  rotulo: string;
  valor: string;
  min?: string;
  max?: string;
  onChange: (valor: string) => void;
  disabled?: boolean;
  atraso?: number;
}

export function CalendarioPopover({ rotulo, valor, min, max, onChange, disabled, atraso = 0 }: CalendarioPopoverProps) {
  const [aberto, setAberto] = useState(false);
  const [direcao, setDirecao] = useState(0);
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const reduzir = useReducedMotion();
  const tituloId = useId();
  const montado = useEstaNoCliente();

  const selecionada = useMemo(() => deISO(valor), [valor]);
  const limiteMin = useMemo(() => (min ? deISO(min) : null), [min]);
  const limiteMax = useMemo(() => (max ? deISO(max) : null), [max]);

  const [mesVisivel, setMesVisivel] = useState(() => selecionada ?? new Date());

  // Recalcula a posição a cada abertura e enquanto a página rola ou a janela
  // muda de tamanho — sem isso o painel ficaria "grudado" no lugar antigo se
  // o usuário rolar a tela com o calendário aberto. Scroll dispara dezenas de
  // eventos por segundo; sem agrupar por frame, cada um viraria um setState
  // (e um reflow de layout) próprio — o rAF garante no máximo uma atualização
  // por frame, e o `pendente` evita empilhar mais de um agendamento por vez.
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
    return () => {
      window.removeEventListener("scroll", atualizar, true);
      window.removeEventListener("resize", atualizar);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(evento: MouseEvent) {
      const alvo = evento.target as Node;
      if (gatilhoRef.current?.contains(alvo)) return;
      if (painelRef.current?.contains(alvo)) return;
      setAberto(false);
    }
    function aoTeclarEsc(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclarEsc);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclarEsc);
    };
  }, [aberto]);

  function navegar(sentido: 1 | -1) {
    setDirecao(sentido);
    setMesVisivel((atual) => (sentido > 0 ? addMonths(atual, 1) : subMonths(atual, 1)));
  }

  function foraDoLimite(dia: Date): boolean {
    if (limiteMin && isBefore(dia, limiteMin) && !isSameDay(dia, limiteMin)) return true;
    if (limiteMax && isAfter(dia, limiteMax) && !isSameDay(dia, limiteMax)) return true;
    return false;
  }

  function escolher(dia: Date) {
    if (foraDoLimite(dia)) return;
    onChange(paraISO(dia));
    setAberto(false);
  }

  const diaMesAno = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const rotuloCompleto = selecionada ? `${rotulo} ${diaMesAno.format(selecionada)}` : rotulo;
  const grade = useMemo(() => montarGrade(mesVisivel), [mesVisivel]);

  const painel = aberto && posicao && (
    <motion.div
      ref={painelRef}
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
        width: LARGURA_PAINEL,
        transform: posicao.paraCima ? "translateY(-100%)" : undefined,
        transformOrigin: posicao.paraCima ? "bottom left" : "top left",
      }}
      className="material-thick z-[100] overflow-hidden rounded-[1.1rem] border border-border shadow-[0_16px_40px_rgba(14,15,19,.20)]"
    >
      {/* Cabeçalho: mês/ano central, setas nas pontas — sem dropdown de
          ano escondido atrás de outro clique. */}
      <div className="flex items-center justify-between px-3 pt-3">
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() => navegar(-1)}
          className="press-feedback flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft size={16} />
        </button>
        <span id={tituloId} className="text-[13px] font-bold capitalize tracking-[-0.01em] text-foreground">
          {format(mesVisivel, "MMMM 'de' yyyy", { locale: ptBR })}
        </span>
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() => navegar(1)}
          className="press-feedback flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 px-3 pt-3">
        {DIAS_SEMANA.map((dia, indice) => (
          <span key={`${dia}-${indice}`} className="flex h-6 items-center justify-center text-[10px] font-bold uppercase text-muted-foreground/70">
            {dia}
          </span>
        ))}
      </div>

      {/* O mês desliza na direção da navegação — feedback espacial de
          que se está indo "para frente" ou "para trás" no calendário,
          não só um conteúdo trocando de lugar. */}
      <div className="relative overflow-hidden px-3 pb-2" style={{ height: 216 }}>
        <AnimatePresence mode="popLayout" custom={direcao} initial={false}>
          <motion.div
            key={format(mesVisivel, "yyyy-MM")}
            custom={direcao}
            initial={reduzir ? false : { x: direcao >= 0 ? 24 : -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduzir ? undefined : { x: direcao >= 0 ? -24 : 24, opacity: 0 }}
            transition={springs.settleFast}
            className="absolute inset-x-3 grid grid-cols-7 gap-y-1"
          >
            {grade.map((dia) => {
              const foraDoMes = !isSameMonth(dia, mesVisivel);
              const selecionado = selecionada ? isSameDay(dia, selecionada) : false;
              const hoje = isToday(dia);
              const bloqueado = foraDoLimite(dia);

              return (
                <button
                  key={dia.toISOString()}
                  type="button"
                  data-date={paraISO(dia)}
                  disabled={bloqueado}
                  onClick={() => escolher(dia)}
                  aria-current={hoje ? "date" : undefined}
                  aria-pressed={selecionado}
                  className={cn(
                    "press-feedback relative flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums transition-colors",
                    bloqueado && "cursor-not-allowed text-muted-foreground/25",
                    !bloqueado && foraDoMes && "text-muted-foreground/35 hover:bg-muted",
                    !bloqueado && !foraDoMes && !selecionado && "text-foreground hover:bg-muted",
                  )}
                  style={selecionado ? { background: "var(--gradient-signature)", color: "#fff" } : undefined}
                >
                  {hoje && !selecionado && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full border-2"
                      style={{ borderColor: "var(--selecionado)" }}
                    />
                  )}
                  {dia.getDate()}
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
        <button
          type="button"
          onClick={() => { onChange(""); setAberto(false); }}
          className="press-feedback rounded-[0.5rem] px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Limpar
        </button>
        <button
          type="button"
          onClick={() => { const hoje = new Date(); if (!foraDoLimite(hoje)) escolher(hoje); }}
          disabled={foraDoLimite(new Date())}
          className="press-feedback rounded-[0.5rem] px-2 py-1 text-[11px] font-bold transition-colors hover:bg-muted disabled:opacity-40"
          style={{ color: "var(--selecionado)" }}
        >
          Hoje
        </button>
      </div>
    </motion.div>
  );

  return (
    <>
      <motion.button
        ref={gatilhoRef}
        type="button"
        initial={{ opacity: 0, y: -4, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...springs.settleFast, delay: atraso }}
        whileHover={disabled ? undefined : { scale: 1.06 }}
        whileTap={disabled ? undefined : { scale: 0.95 }}
        title={rotuloCompleto}
        aria-label={rotuloCompleto}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        disabled={disabled}
        onClick={() => {
          // O mês visível reflete a data selecionada só no instante em que o
          // popover abre — não a cada render. Sincronizar via efeito faria o
          // usuário perder a navegação manual (ex.: olhando o mês seguinte
          // sem escolher nada) toda vez que outro estado disparasse o efeito.
          setAberto((atual) => {
            if (!atual) {
              setMesVisivel(selecionada ?? new Date());
              if (gatilhoRef.current) setPosicao(calcularPosicao(gatilhoRef.current));
            }
            return !atual;
          });
        }}
        className={cn(
          "group relative inline-flex h-9 w-9 items-center justify-center rounded-[0.75rem] border transition-all duration-200 disabled:opacity-50",
          selecionada
            ? "border-[color-mix(in_srgb,var(--selecionado)_45%,var(--border))] bg-[color-mix(in_srgb,#9B30D9_8%,var(--card))]"
            : "border-border bg-muted hover:border-[rgba(155,48,217,.4)] hover:bg-card",
          aberto && "border-selecionado bg-card shadow-[0_0_0_3px_rgba(155,48,217,.12)]",
        )}
      >
        <CalendarDays
          size={15}
          strokeWidth={2}
          aria-hidden="true"
          className={cn(
            "shrink-0 transition-all duration-200 group-hover:scale-110",
            selecionada ? "text-selecionado" : "text-muted-foreground group-hover:text-selecionado",
          )}
        />
      </motion.button>

      {montado && createPortal(<AnimatePresence>{painel}</AnimatePresence>, document.body)}
    </>
  );
}
