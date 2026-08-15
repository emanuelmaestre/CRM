"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, springs } from "@/shared/design-system/motion-variants";
import { cn } from "@/shared/design-system/cn";

/* ── Card base ─────────────────────────────────────────────────
   Mesma superfície do Painel (.card-surface), para Métricas não
   parecer um app diferente colado dentro do mesmo sistema. */
export function Card({ children, className, style }: {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <motion.section
      variants={fadeUp}
      className={cn("card-surface relative flex flex-col overflow-hidden", className)}
      style={style}
    >
      {children}
    </motion.section>
  );
}

export function CardHead({ title, subtitle, icon: Icon, accent, trailing }: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  accent: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: `${accent}18`, color: accent }}
        >
          <Icon size={17} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold tracking-[-0.01em] text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {trailing && <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">{trailing}</div>}
    </div>
  );
}

export function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <h2 className="text-label-md uppercase text-muted-foreground">{children}</h2>
      {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/* ── Contagem animada ──────────────────────────────────────────
   Copiado em espírito do Painel: o número sobe até o valor em vez de
   aparecer pronto, com desaceleração no fim e sem overshoot — em
   score, passar de 100 por um instante seria mentira visual. */
export function useContagem(valor: number, duracao = 900): number {
  const [exibido, setExibido] = useState(valor);
  const anterior = useRef(valor);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduzMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const de = anterior.current;
    if (reduzMovimento || de === valor) {
      anterior.current = valor;
      setExibido(valor);
      return;
    }
    const inicio = performance.now();
    let frame = requestAnimationFrame(function passo(agora: number) {
      const progresso = Math.min((agora - inicio) / duracao, 1);
      const suavizado = 1 - Math.pow(1 - progresso, 4);
      const atual = de + (valor - de) * suavizado;
      anterior.current = atual;
      setExibido(atual);
      if (progresso < 1) frame = requestAnimationFrame(passo);
    });
    return () => cancelAnimationFrame(frame);
  }, [valor, duracao]);

  return exibido;
}

/* ── Anel de score ─────────────────────────────────────────────
   Um arco de 270° (não 360°) com a abertura embaixo: a lacuna dá ao
   olho um começo e um fim, então "quanto falta" se lê sem legenda.
   O traço cresce por strokeDashoffset — propriedade que o compositor
   anima sem forçar layout — e o brilho por trás usa a cor da faixa,
   então mudar de "Atenção" para "Saudável" muda a temperatura do card
   inteiro, não só um texto. */
const ARCO_GRAUS = 270;
const RAIO = 62;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
const COMPRIMENTO_ARCO = CIRCUNFERENCIA * (ARCO_GRAUS / 360);

export function AnelScore({ valor, cor, tamanho = 168, faixaLabel }: {
  /** 0–100. Null desenha só a trilha, sem preenchimento. */
  valor: number | null;
  cor: string;
  tamanho?: number;
  faixaLabel?: string | null;
}) {
  const reduzir = useReducedMotion();
  const exibido = useContagem(valor ?? 0);
  const preenchido = valor === null ? 0 : Math.min(Math.max(valor, 0), 100) / 100;

  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      {/* Halo tonal: some no reduced-motion junto com o resto do movimento. */}
      {!reduzir && valor !== null && (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 0.5, scale: 1 }}
          transition={{ ...springs.settle, delay: 0.1 }}
          className="absolute inset-3 rounded-full blur-2xl"
          style={{ background: `radial-gradient(circle, ${cor}55 0%, transparent 70%)` }}
        />
      )}

      <svg
        viewBox="0 0 160 160"
        className="relative h-full w-full -rotate-[225deg]"
        role="img"
        aria-label={valor === null ? "Score indisponível" : `Score ${Math.round(valor)} de 100${faixaLabel ? `, ${faixaLabel}` : ""}`}
      >
        <circle
          cx="80"
          cy="80"
          r={RAIO}
          fill="none"
          stroke="var(--chart-bar)"
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={`${COMPRIMENTO_ARCO} ${CIRCUNFERENCIA}`}
        />
        <motion.circle
          cx="80"
          cy="80"
          r={RAIO}
          fill="none"
          stroke={cor}
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={`${COMPRIMENTO_ARCO} ${CIRCUNFERENCIA}`}
          initial={reduzir ? false : { strokeDashoffset: COMPRIMENTO_ARCO }}
          animate={{ strokeDashoffset: COMPRIMENTO_ARCO * (1 - preenchido) }}
          transition={reduzir ? { duration: 0 } : { type: "spring", bounce: 0, duration: 1.1 }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {valor === null ? (
          <span className="text-3xl font-bold text-muted-foreground">—</span>
        ) : (
          <>
            <span
              className="text-stat-lg leading-none"
              style={{ color: cor }}
            >
              {Math.round(exibido)}
            </span>
            {faixaLabel && (
              <span className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: cor }}>
                {faixaLabel}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Barra com meta ────────────────────────────────────────────
   Barra de progresso simples, com um risco na posição do limite
   quando existe um. É a diferença entre "sua taxa é 2,4%" e "sua taxa
   passou do teto" — a segunda leitura não exige que ninguém decore
   qual é o teto de cada indicador. */
export function BarraComLimite({ valor, maximo, limite, cor, atraso = 0, altura = 8 }: {
  valor: number;
  maximo: number;
  /** Posição do risco, na mesma escala de `valor`. Omitido, não desenha risco. */
  limite?: number;
  cor: string;
  atraso?: number;
  altura?: number;
}) {
  const reduzir = useReducedMotion();
  // Piso em 0: todo indicador aqui é não-negativo, exceto Margem (comissão
  // pode superar o preço em casos raros). Sem o Math.max, valor negativo
  // vira scaleX negativo — e CSS não "esconde" isso, espelha a barra
  // inteira para o outro lado, o oposto de "barra vazia".
  const largura = maximo > 0 ? Math.max(0, Math.min((valor / maximo) * 100, 100)) : 0;
  const posicaoLimite = limite !== undefined && maximo > 0 ? Math.min((limite / maximo) * 100, 100) : null;

  return (
    <div className="relative w-full overflow-hidden rounded-full" style={{ height: altura, background: "var(--chart-bar)" }}>
      {/* scaleX em vez de width: fica no compositor (transform), não força
          layout a cada frame do spring. transformOrigin fixa a origem na
          esquerda para crescer "de dentro pra fora" como o preenchimento
          original; a ponta de avanço fica reta (sem cap arredondado) — o
          arredondado da trilha já cobre visualmente quando chega a 100%. */}
      <motion.div
        initial={reduzir ? false : { scaleX: 0 }}
        animate={{ scaleX: largura / 100 }}
        transition={reduzir ? { duration: 0 } : { ...springs.settle, delay: atraso }}
        className="h-full w-full rounded-l-full"
        style={{ background: cor, transformOrigin: "left" }}
      />
      {posicaoLimite !== null && (
        <span
          aria-hidden="true"
          className="absolute top-0 h-full w-[2px] rounded-full bg-foreground/45"
          style={{ left: `calc(${posicaoLimite}% - 1px)` }}
        />
      )}
    </div>
  );
}

/* ── Aviso de leitura parcial ──────────────────────────────────
   Aparece quando falta dado. Existe porque a alternativa — mostrar o
   número como se estivesse completo — é a forma mais fácil de a tela
   mentir sem ninguém perceber. */
export function AvisoParcial({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-[0.75rem] bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}
