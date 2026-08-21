"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays, addMonths, endOfMonth, format, getDay, isAfter, isBefore, isSameDay,
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

const LARGURA_UM_MES = 336;
const LARGURA_DOIS_MESES = 616;
const ALTURA_PAINEL_ESTIMADA = 420;
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

/** Pulso em volta do gatilho quando um período está aplicado — teal
 *  (var(--acento-1)), não o índigo de var(--selecionado): aquele já
 *  identifica o dia marcado dentro do próprio calendário e as pílulas de
 *  marca/canal, então repeti-lo aqui confundia "período aplicado" com
 *  "filtro marcado". */
function HaloSelecao({ reduzir }: { reduzir: boolean | null }) {
  return (
    <AnimatePresence>
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[0.75rem]"
        style={{ boxShadow: "0 0 0 2px var(--acento-1)" }}
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
  const margem = window.innerWidth < 360 ? 4 : MARGEM_VIEWPORT;
  const doisMeses = window.innerWidth >= 672;
  const larguraMax = doisMeses ? LARGURA_DOIS_MESES : LARGURA_UM_MES;
  const largura = Math.min(larguraMax, window.innerWidth - margem * 2);
  const espacoAbaixo = window.innerHeight - rect.bottom;
  const paraCima = espacoAbaixo < ALTURA_PAINEL_ESTIMADA + margem && rect.top > espacoAbaixo;
  const alinhadoDireita = rect.left + largura > window.innerWidth - margem;
  const esquerdaDesejada = alinhadoDireita ? rect.right - largura : rect.left;

  const left = Math.min(
    Math.max(esquerdaDesejada, margem),
    window.innerWidth - largura - margem,
  );
  const top = paraCima ? rect.top - 8 : rect.bottom + 8;

  return { top, left, largura, paraCima, alinhadoDireita, doisMeses };
}

interface MesProps {
  mes: Date;
  direcaoNav?: "esquerda" | "direita";
  onAnterior: () => void;
  onProximo: () => void;
  foraDoLimite: (dia: Date) => boolean;
  papel: (dia: Date) => "inicio" | "fim" | "meio" | null;
  onEscolher: (dia: Date) => void;
  onHover: (dia: Date) => void;
  pulsando: boolean;
  reduzir: boolean | null;
}

/** Fora do componente principal — recriar isto a cada render perderia o
 *  estado interno do `useMemo` da grade e disparava o aviso do lint de
 *  "componente criado durante o render". */
function Mes({ mes, direcaoNav, onAnterior, onProximo, foraDoLimite, papel, onEscolher, onHover, pulsando, reduzir }: MesProps) {
  const grade = useMemo(() => montarGrade(mes), [mes]);
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between px-1">
        {direcaoNav === "esquerda" ? (
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={onAnterior}
            className="press-feedback flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft size={15} />
          </button>
        ) : <span className="w-9" />}
        <span className="text-[13px] font-bold capitalize tracking-[-0.01em] text-foreground">
          {format(mes, "MMMM 'de' yyyy", { locale: ptBR })}
        </span>
        {direcaoNav === "direita" || direcaoNav === undefined ? (
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={onProximo}
            className="press-feedback flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight size={15} />
          </button>
        ) : <span className="w-9" />}
      </div>

      <div className="grid grid-cols-7 gap-y-1 px-1 pt-2">
        {DIAS_SEMANA.map((dia, indice) => (
          <span key={`${dia}-${indice}`} className="flex h-6 items-center justify-center text-[10px] font-bold uppercase text-muted-foreground/70">
            {dia}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1 px-1 pt-1">
        {grade.map((dia) => {
          const foraDoMes = !isSameMonth(dia, mes);
          const hoje = isToday(dia);
          const bloqueado = foraDoLimite(dia);
          const papelDia = papel(dia);
          const extremo = papelDia === "inicio" || papelDia === "fim";

          return (
            <div key={dia.toISOString()} className="relative">
              {papelDia === "meio" && <span aria-hidden="true" className="absolute inset-y-0 -inset-x-px" style={{ background: "color-mix(in srgb, var(--selecionado) 14%, transparent)" }} />}
              {papelDia === "inicio" && <span aria-hidden="true" className="absolute inset-y-0 left-1/2 right-0" style={{ background: "color-mix(in srgb, var(--selecionado) 14%, transparent)" }} />}
              {papelDia === "fim" && <span aria-hidden="true" className="absolute inset-y-0 left-0 right-1/2" style={{ background: "color-mix(in srgb, var(--selecionado) 14%, transparent)" }} />}
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
                  "press-feedback relative z-10 flex h-9 w-full min-w-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums transition-colors",
                  bloqueado && "cursor-not-allowed text-muted-foreground/25",
                  !bloqueado && foraDoMes && "text-muted-foreground/35 hover:bg-muted",
                  !bloqueado && !foraDoMes && !extremo && "text-foreground hover:bg-muted",
                )}
                style={extremo ? { background: "var(--gradient-signature)", color: "#fff" } : undefined}
              >
                {hoje && !extremo && (
                  <span aria-hidden="true" className="absolute inset-0 rounded-full border-2" style={{ borderColor: "var(--selecionado)" }} />
                )}
                {dia.getDate()}
              </motion.button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface RangeDatas {
  inicio: string;
  fim: string;
}

interface CalendarioPopoverRangeProps {
  rotulo: string;
  valor: RangeDatas;
  min?: string;
  max?: string;
  onChange: (valor: RangeDatas) => void;
  disabled?: boolean;
  atraso?: number;
}

export function CalendarioPopoverRange({ rotulo, valor, min, max, onChange, disabled, atraso = 0 }: CalendarioPopoverRangeProps) {
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

  function foraDoLimite(dia: Date): boolean {
    if (limiteMin && isBefore(dia, limiteMin) && !isSameDay(dia, limiteMin)) return true;
    if (limiteMax && isAfter(dia, limiteMax) && !isSameDay(dia, limiteMax)) return true;
    return false;
  }

  function aplicar(inicio: Date, fim: Date) {
    const [de, ate] = isAfter(inicio, fim) ? [fim, inicio] : [inicio, fim];
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
    if (foraDoLimite(dia)) return;
    if (!inicioRascunho) {
      setInicioRascunho(dia);
      return;
    }
    aplicar(inicioRascunho, dia);
  }

  function atalho(dias: number) {
    const hoje = new Date();
    const inicio = dias === 0 ? hoje : addDays(hoje, -(dias - 1));
    if (foraDoLimite(hoje)) return;
    aplicar(inicio, hoje);
  }

  function esteMes() {
    const hoje = new Date();
    aplicar(startOfMonth(hoje), hoje);
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

  function dentroDoIntervaloPreview(dia: Date): "inicio" | "fim" | "meio" | null {
    const ancora = inicioRascunho;
    const alvo = hoverDia ?? inicioSelecionado;
    // Sem seleção em andamento: mostra o intervalo já aplicado (se houver).
    if (!ancora) {
      if (!inicioSelecionado || !fimSelecionado) return null;
      if (isSameDay(dia, inicioSelecionado)) return "inicio";
      if (isSameDay(dia, fimSelecionado)) return "fim";
      if (isAfter(dia, inicioSelecionado) && isBefore(dia, fimSelecionado)) return "meio";
      return null;
    }
    // Seleção em andamento: intervalo entre a âncora e onde o cursor está agora.
    const referencia = alvo ?? ancora;
    const [de, ate] = isAfter(ancora, referencia) ? [referencia, ancora] : [ancora, referencia];
    if (isSameDay(dia, de)) return "inicio";
    if (isSameDay(dia, ate)) return "fim";
    if (isAfter(dia, de) && isBefore(dia, ate)) return "meio";
    return null;
  }

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
        width: posicao.largura,
        transform: posicao.paraCima ? "translateY(-100%)" : undefined,
        transformOrigin: `${posicao.paraCima ? "bottom" : "top"} ${posicao.alinhadoDireita ? "right" : "left"}`,
      }}
      className="z-[100] overflow-hidden rounded-[1.1rem] border border-border bg-card shadow-[0_16px_40px_rgba(14,15,19,.24)]"
    >
      <span id={tituloId} className="sr-only">{rotulo}</span>

      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-muted-foreground">
          {!inicioRascunho && !inicioSelecionado && "Escolha a data inicial"}
          {inicioRascunho && "Agora escolha a data final"}
          {!inicioRascunho && inicioSelecionado && fimSelecionado && (
            <>
              <span className="font-bold text-foreground">{diaMesAno.format(inicioSelecionado)}</span>
              {" – "}
              <span className="font-bold text-foreground">{diaMesAno.format(fimSelecionado)}</span>
            </>
          )}
        </p>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={() => atalho(1)} className="press-feedback whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Hoje</button>
          <button type="button" onClick={() => atalho(7)} className="press-feedback whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">7 dias</button>
          <button type="button" onClick={esteMes} className="press-feedback whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Este mês</button>
        </div>
      </div>

      <div className="flex gap-3 p-3" onMouseLeave={() => setHoverDia(null)}>
        <Mes
          mes={mesEsquerda}
          direcaoNav={posicao.doisMeses ? "esquerda" : undefined}
          onAnterior={() => setMesVisivel((atual) => subMonths(atual, 1))}
          onProximo={() => setMesVisivel((atual) => addMonths(atual, 1))}
          foraDoLimite={foraDoLimite}
          papel={dentroDoIntervaloPreview}
          onEscolher={escolher}
          onHover={(dia) => inicioRascunho && setHoverDia(dia)}
          pulsando={pulsando}
          reduzir={reduzir}
        />
        {posicao.doisMeses && (
          <Mes
            mes={mesDireita}
            direcaoNav="direita"
            onAnterior={() => setMesVisivel((atual) => subMonths(atual, 1))}
            onProximo={() => setMesVisivel((atual) => addMonths(atual, 1))}
            foraDoLimite={foraDoLimite}
            papel={dentroDoIntervaloPreview}
            onEscolher={escolher}
            onHover={(dia) => inicioRascunho && setHoverDia(dia)}
            pulsando={pulsando}
            reduzir={reduzir}
          />
        )}
      </div>

      <div className="flex items-center justify-end border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={() => { onChange({ inicio: "", fim: "" }); setInicioRascunho(null); setAberto(false); }}
          className="press-feedback inline-flex h-9 items-center rounded-[0.5rem] px-3 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Limpar
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
          ? { borderColor: "var(--acento-1)", color: "var(--acento-1)", background: "color-mix(in srgb, var(--acento-1) 12%, var(--card))" }
          : undefined}
        className={cn(
          "group press-feedback relative inline-flex h-11 items-center gap-2 rounded-[0.75rem] px-3.5 text-xs transition-all duration-200 disabled:opacity-50",
          inicioSelecionado && fimSelecionado
            ? "border-2 font-extrabold shadow-[0_2px_6px_rgba(14,15,19,.14)]"
            : "border border-border bg-muted font-semibold text-muted-foreground hover:bg-card hover:text-foreground",
          aberto && "border border-foreground/60 bg-card shadow-[0_0_0_3px_rgba(14,15,19,.08)]",
        )}
      >
        {inicioSelecionado && fimSelecionado && !aberto && <HaloSelecao reduzir={reduzir} />}
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

      {montado && createPortal(<AnimatePresence>{painel}</AnimatePresence>, document.body)}
    </>
  );
}
