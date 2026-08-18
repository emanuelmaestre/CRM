"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { springs } from "../motion-variants";

/* ── Dropdown próprio no lugar do <select> nativo ─────────────────
   Mesmo motivo do CalendarioPopover: o dropdown do sistema operacional
   (menu cinza, fonte do SO) não tem nenhuma identidade do produto.

   Por portal em document.body, com posição calculada em `fixed` a partir
   do botão — não `absolute` dentro do próprio container. Toda barra de
   filtro deste produto usa `overflow-hidden` na borda para o cantinho
   arredondado, e um popover posicionado por dentro desse ancestral fica
   cortado no meio (foi exatamente o que aconteceu na primeira versão,
   `absolute`, dentro da barra de filtros do Inbox). Fora da árvore da
   barra, o dropdown flutua por cima de qualquer coisa. */

const LARGURA_PAINEL = 224;
const ALTURA_PAINEL_ESTIMADA = 260;
const MARGEM_VIEWPORT = 8;

export interface SelectPopoverItem<T extends string> {
  value: T;
  label: string;
  contagem?: number;
  cor?: string;
}

interface Posicao {
  top: number;
  left: number;
  paraCima: boolean;
  alinhadoDireita: boolean;
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
  const espacoAbaixo = window.innerHeight - rect.bottom;
  const paraCima = espacoAbaixo < ALTURA_PAINEL_ESTIMADA + MARGEM_VIEWPORT && rect.top > espacoAbaixo;
  const alinhadoDireita = rect.left + LARGURA_PAINEL > window.innerWidth - MARGEM_VIEWPORT;
  const esquerdaDesejada = alinhadoDireita ? rect.right - LARGURA_PAINEL : rect.left;
  const left = Math.min(
    Math.max(esquerdaDesejada, MARGEM_VIEWPORT),
    window.innerWidth - LARGURA_PAINEL - MARGEM_VIEWPORT,
  );
  // Chute inicial com a altura estimada — corrigido para a altura real do
  // painel assim que ele monta (ver useLayoutEffect abaixo). Não dá pra
  // confiar só nisso: a lista pode ter 3 itens ou 12.
  const top = paraCima ? rect.top - 8 - ALTURA_PAINEL_ESTIMADA : rect.bottom + 8;
  return { top, left, paraCima, alinhadoDireita };
}

export function SelectPopover<T extends string>({ itens, valor, onChange, className, buttonClassName, buttonStyle, disabled }: {
  itens: SelectPopoverItem<T>[];
  valor: T;
  onChange: (valor: T) => void;
  className?: string;
  buttonClassName?: string;
  /** Estilo do gatilho — usado quando a cor precisa vir de um valor dinâmico (ex.: cor do perfil), não dá pra fazer só com classe. */
  buttonStyle?: CSSProperties;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLUListElement>(null);
  const reduzir = useReducedMotion();
  const montado = useEstaNoCliente();
  const atual = itens.find((item) => item.value === valor) ?? itens[0];

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
    setPosicao(calcularPosicao(gatilhoRef.current));
    window.addEventListener("scroll", atualizar, true);
    window.addEventListener("resize", atualizar);
    return () => {
      window.removeEventListener("scroll", atualizar, true);
      window.removeEventListener("resize", atualizar);
    };
  }, [aberto]);

  // Corrige o "top" pra altura real do painel quando ele abre pra cima.
  // Importante: não dá pra resolver isso com `transform: translateY(-100%)`
  // no style — este é um motion.ul, e o Framer Motion escreve a própria
  // propriedade `transform` a cada frame a partir de x/y/scale que ele
  // controla, sobrescrevendo qualquer transform manual. Sem essa correção,
  // o painel ficava plantado em `rect.top - 8` crescendo pra baixo — em
  // cima do próprio gatilho — em vez de flutuar acima dele.
  useLayoutEffect(() => {
    if (!aberto || !posicao?.paraCima || !gatilhoRef.current || !painelRef.current) return;
    const alturaReal = painelRef.current.offsetHeight;
    const topCorrigido = gatilhoRef.current.getBoundingClientRect().top - 8 - alturaReal;
    if (Math.abs(topCorrigido - posicao.top) > 0.5) {
      setPosicao((atual) => (atual ? { ...atual, top: topCorrigido } : atual));
    }
  }, [aberto, posicao]);

  useLayoutEffect(() => {
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

  const painel = aberto && posicao && (
    <motion.ul
      ref={painelRef}
      role="listbox"
      initial={reduzir ? false : { opacity: 0, y: posicao.paraCima ? 6 : -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduzir ? undefined : { opacity: 0, y: posicao.paraCima ? 6 : -6, scale: 0.97 }}
      transition={springs.settleFast}
      style={{
        position: "fixed",
        top: posicao.top,
        left: posicao.left,
        width: LARGURA_PAINEL,
        transformOrigin: `${posicao.paraCima ? "bottom" : "top"} ${posicao.alinhadoDireita ? "right" : "left"}`,
      }}
      className="z-[100] overflow-hidden rounded-[1.1rem] border border-border bg-card p-1.5 shadow-[0_16px_40px_rgba(14,15,19,.24)]"
    >
      {itens.map((item) => {
        const selecionado = item.value === valor;
        return (
          <li key={item.value}>
            <button
              type="button"
              role="option"
              aria-selected={selecionado}
              onClick={() => { onChange(item.value); setAberto(false); }}
              className="press-feedback flex w-full items-center gap-2 rounded-[0.7rem] px-3 py-2 text-left text-[13px] font-semibold text-foreground transition-colors hover:bg-muted"
              style={selecionado ? { background: "var(--muted)" } : undefined}
            >
              {item.cor && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.cor }} />}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.contagem !== undefined && (
                <span className="shrink-0 tabular-nums text-muted-foreground">{item.contagem}</span>
              )}
              {selecionado && <Check size={13} className="shrink-0" style={{ color: "var(--selecionado)" }} />}
            </button>
          </li>
        );
      })}
    </motion.ul>
  );

  return (
    <div className={className ?? "relative inline-flex"}>
      <button
        ref={gatilhoRef}
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        style={buttonStyle}
        className={buttonClassName ?? "press-feedback inline-flex h-11 min-w-[9rem] items-center justify-between gap-2 rounded-full border border-border bg-card py-1.5 pl-3.5 pr-3 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:border-selecionado disabled:opacity-60"}
      >
        {atual?.label}{atual?.contagem !== undefined ? ` (${atual.contagem})` : ""}
        <ChevronDown size={13} className={`shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {montado && createPortal(<AnimatePresence>{painel}</AnimatePresence>, document.body)}
    </div>
  );
}
