"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, springs } from "@/shared/design-system/motion-variants";
import { cn } from "@/shared/design-system/cn";
import { tint } from "@/shared/design-system/color";

/** Janela de datas escolhida no topo do mosaico, em yyyy-mm-dd. As duas pontas
 *  vazias significam "últimos 30 dias", resolvido na busca — ver
 *  `periodoEfetivo` em mosaico.tsx. */
export interface Periodo {
  inicio: string;
  fim: string;
}

/* ── Card base ─────────────────────────────────────────────────
   Só layout, sem superfície própria — nem borda, nem fundo, nem sombra.
   Desde a fusão em mosaico, todo card daqui é renderizado exclusivamente
   dentro do painel de foco (bloco.tsx), que já é a superfície da tela: a
   borda do card virava moldura sobre moldura, desenhando uma "página
   dentro da página".

   Isto não é um `card-surface` sobrescrito depois — é a ausência dele. A
   tentativa anterior (achatar com `[&>section]:border-0` no Foco) não
   funcionava: `.card-surface` mora fora de qualquer @layer no globals.css,
   e pela cascata do CSS estilo sem layer vence utilitário do Tailwind (que
   vive em @layer utilities) por mais específico que o seletor seja.

   O `.card-surface` continua valendo para quem é superfície de verdade: o
   tile do mosaico e os cards do módulo Anúncios. */
export function Card({ children, className, style }: {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <motion.section
      variants={fadeUp}
      className={cn("relative flex flex-col", className)}
      style={style}
    >
      {children}
    </motion.section>
  );
}

/* ── Topo do card ──────────────────────────────────────────────
   Ícone, título e subtítulo saíram daqui — desde a fusão em mosaico, todo
   card só é renderizado dentro do painel de foco (bloco.tsx), que já tem o
   próprio cabeçalho com essas três coisas. Repeti-las aqui era o motivo do
   painel parecer "duas telas empilhadas". O que sobra de função real deste
   componente é: (1) reservar o respiro do topo do card, que antes vinha
   junto do título, e (2) mostrar `scope` — o filtro de marca/canal, que
   continua vivendo dentro do card porque é interação, não decoração. */
export function CardHead({ scope, className }: {
  scope?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-5 sm:pt-5", className)}>
      {scope}
    </div>
  );
}

/* ── Contagem animada ──────────────────────────────────────────
   O número sobe até o valor em vez de aparecer pronto: dá a leitura de que
   foi calculado agora. Desacelera no fim (sem overshoot, que em dinheiro ou
   score passaria valor errado por um instante). Respeita
   prefers-reduced-motion — aí o valor entra direto.
   Uma duração só para o módulo inteiro: antes da fusão, os cards do Painel
   e os de Métricas tinham cada um a própria cópia deste hook com durações
   diferentes (850ms vs 1100ms) — números em cards vizinhos contavam em
   velocidades diferentes sem nenhum motivo. */
export function useContagem(valor: number, duracao = 850): number {
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
      // Acompanha frame a frame: se o valor mudar no meio da animação, a
      // próxima contagem parte de onde o número está, sem saltar para trás.
      anterior.current = atual;
      setExibido(atual);
      if (progresso < 1) frame = requestAnimationFrame(passo);
    });

    return () => cancelAnimationFrame(frame);
  }, [valor, duracao]);

  return exibido;
}

/** Wrapper de `useContagem` pra usar dentro de `.map()` sem violar a regra
 *  de hooks — cada linha de uma lista (marca, anúncio, item) precisa da
 *  própria instância do contador, e hook não pode ser chamado dentro de um
 *  laço direto. Um componente por número resolve isso de graça. */
export function NumeroAnimado({ valor, formatar, duracao }: {
  valor: number;
  formatar: (valorAnimado: number) => string;
  duracao?: number;
}) {
  const animado = useContagem(valor, duracao);
  return <>{formatar(animado)}</>;
}

/* ── Anel de score ─────────────────────────────────────────────
   Um arco de 270° (não 360°) com a abertura embaixo: a lacuna dá ao olho
   um começo e um fim, então "quanto falta" se lê sem legenda. O traço
   cresce por strokeDashoffset — propriedade que o compositor anima sem
   forçar layout — e o brilho por trás usa a cor da faixa, então mudar de
   "Atenção" para "Saudável" muda a temperatura do card inteiro, não só um
   texto. */
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
          style={{ background: `radial-gradient(circle, ${tint(cor, 33)} 0%, transparent 70%)` }}
        />
      )}

      <svg
        viewBox="0 0 160 160"
        className="relative h-full w-full"
        role="img"
        aria-label={valor === null ? "Score indisponível" : `Score ${Math.round(valor)} de 100${faixaLabel ? `, ${faixaLabel}` : ""}`}
      >
        <g transform="rotate(-225 80 80)">
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
        </g>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {valor === null ? (
          <span className="text-xl font-bold text-muted-foreground">Sem dado</span>
        ) : (
          <>
            {/* Número e faixa acompanham o diâmetro em vez de tamanho fixo:
                o anel cresceu no painel de foco, e um número de 32px dentro
                de um anel de 224px ficaria perdido no meio do vazio. As
                proporções batem o visual antigo no tamanho padrão (168). */}
            <span
              className="text-stat-lg leading-none"
              style={{ color: cor, fontSize: Math.round(tamanho * 0.2) }}
            >
              {Math.round(exibido)}
            </span>
            {faixaLabel && (
              <span
                className="mt-1.5 font-bold uppercase tracking-[0.08em]"
                style={{ color: cor, fontSize: Math.max(11, Math.round(tamanho * 0.058)) }}
              >
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
   Barra de progresso simples, com um risco na posição do limite quando
   existe um. É a diferença entre "sua taxa é 2,4%" e "sua taxa passou do
   teto" — a segunda leitura não exige que ninguém decore qual é o teto de
   cada indicador. */
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
  // Piso em 0: os indicadores renderizados aqui são não-negativos. Sem o
  // Math.max, um dado ruim que viesse negativo viraria scaleX negativo — e
  // CSS não "esconde" isso, espelha a barra inteira para o outro lado.
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
