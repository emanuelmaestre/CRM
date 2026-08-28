"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Hourglass } from "lucide-react";
import anunciosConfig from "@/config/anuncios.json";
import { fadeUp, springs } from "@/shared/design-system/motion-variants";
import { cn } from "@/shared/design-system/cn";
import { tint } from "@/shared/design-system/color";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { AnimatedInfoPopover, AnimatedInfoTrigger } from "@/shared/design-system/primitives/AnimatedInfoPopover";
import { isBrandSlug } from "@/shared/config/brands";

const copyJanela = anunciosConfig.janela;

/* Mesmos primitivos visuais de Métricas (Card/CardHead/SectionLabel/
   useContagem) — repetidos aqui em vez de importados de outra rota, pelo
   mesmo motivo que já vale para dashboard/card-primitives.tsx e
   metricas/metricas-primitives.tsx no projeto: páginas irmãs, não uma
   dependendo da outra. O objetivo do brief ("parecer que sempre fez parte
   do produto") é sobre a linguagem visual ser idêntica, não sobre
   compartilhar o arquivo. */

/** Repete a marca ativa no cabeçalho de cards que ficam abaixo da primeira
 *  dobra — o seletor de marca no topo da página já sai de vista ao rolar,
 *  e sem isso não dá pra saber a que marca aquele card pertence sem rolar
 *  de volta. */
/* ── Status de campanha, nas palavras de quem lê ──────────────────────────
   A coluna mostrava "ongoing" e "closed" em inglês. Não era descuido de
   tradução: o mapa cobria só os estados do Mercado Livre (active/paused), e
   os da Shopee — ongoing/paused/ended/closed — caíam no ramo de fallback, que
   imprime o valor cru que veio da API.

   Os dois canais nomeiam a mesma coisa de formas diferentes, e essa diferença
   não interessa a ninguém que esteja lendo a lista: "ongoing" e "active" são a
   campanha rodando, "ended" e "closed" são a campanha terminada. Aqui elas
   viram uma palavra só, em português, e a origem do dado deixa de vazar para a
   tela.

   O mapa vivia duplicado em campanhas-card e campanhas-cliente. Duas cópias de
   uma tabela de tradução são duas chances de a próxima situação ser traduzida
   em um lugar e ficar em inglês no outro — que é exatamente o que aconteceu.

   O fallback continua imprimindo o valor cru de propósito: se um canal passar
   a mandar um estado novo, é melhor ver "suspended" na tela e poder ir atrás
   do que ver um rótulo genérico que esconde a novidade. */
export const STATUS_CAMPANHA: Record<string, { label: string; cor: string }> = {
  active: { label: "Ativa", cor: "var(--success)" },
  ongoing: { label: "Ativa", cor: "var(--success)" },
  paused: { label: "Pausada", cor: "var(--warning)" },
  ended: { label: "Encerrada", cor: "var(--muted-foreground)" },
  closed: { label: "Encerrada", cor: "var(--muted-foreground)" },
};

export function BadgeStatusCampanha({ status }: { status: string }) {
  const info = STATUS_CAMPANHA[status] ?? { label: status, cor: "var(--muted-foreground)" };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tint(info.cor, 9), color: info.cor }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.cor }} />
      {info.label}
    </span>
  );
}

export function MarcaBadge({ brandSlug, brandLabel }: { brandSlug: string; brandLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
      {isBrandSlug(brandSlug) ? <BrandLogo brand={brandSlug} height={12} /> : brandLabel}
    </span>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section variants={fadeUp} className={cn("card-surface relative flex flex-col overflow-hidden", className)}>
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
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: tint(accent, 9), color: accent }}>
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

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <h2 className="text-label-md uppercase text-muted-foreground">{children}</h2>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** "ACOS (custo do anúncio na venda)" → o pedaço entre parênteses (a
 *  explicação em português simples) vira negrito, pra pular aos olhos mais
 *  que a sigla crua — é a parte que quem não é da área realmente precisa
 *  ler. `aria-label`/`title` continuam com o texto plano de `children`,
 *  isso só muda o que aparece na tela. */
export function rotuloComExplicacaoEmNegrito(texto: string): React.ReactNode {
  const match = texto.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!match) return texto;
  const [, principal, explicacao] = match;
  return (
    <>
      {principal} (<strong className="font-bold text-foreground/85">{explicacao}</strong>)
    </>
  );
}

export function RotuloComInfo({ children, descricao, observacao }: {
  children: string;
  descricao: string;
  observacao?: string;
}) {
  const titulo = observacao ? `${children}: ${descricao} Observação: ${observacao}` : `${children}: ${descricao}`;

  return (
    // items-start, não items-center: rótulos como "ACOS (custo do anúncio na
    // venda)" agora podem quebrar em 2 linhas (era truncate antes — cortava o
    // texto explicativo que a gente acabou de adicionar). Com o ícone
    // centralizado na vertical, ele ficava flutuando no meio das duas linhas;
    // alinhado ao topo, fica ao lado da primeira linha, leitura mais natural.
    <span className="inline-flex max-w-full items-start gap-1">
      <span className="min-w-0">{rotuloComExplicacaoEmNegrito(children)}</span>
      <AnimatedInfoPopover
        trigger={(
          <AnimatedInfoTrigger
            aria-label={`Explicar indicador ${children}`}
            title={titulo}
            iconSize={11}
            iconStrokeWidth={2.35}
            className="press-feedback inline-flex h-4 min-h-0 w-4 min-w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/75 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="z-[100] w-[min(21rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-3 text-left normal-case shadow-[0_12px_32px_rgba(14,15,19,.18)] lg:w-[min(38rem,calc(100vw-1.5rem))]"
      >
            <p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">Como ler este número</p>
            <p className="mt-0.5 text-[13px] font-bold text-foreground">{children}</p>
            <div className={observacao ? "mt-1.5 flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-5" : "mt-1.5"}>
              <p className="text-[12px] leading-relaxed text-muted-foreground">{descricao}</p>
              {observacao && (
                <div className="rounded-lg border border-border bg-muted/45 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">Observação</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{observacao}</p>
                </div>
              )}
            </div>
      </AnimatedInfoPopover>
    </span>
  );
}

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

export function BarraSimples({ valor, maximo, cor, atraso = 0, altura = 7 }: {
  valor: number; maximo: number; cor: string; atraso?: number; altura?: number;
}) {
  const largura = maximo > 0 ? Math.max(0, Math.min((valor / maximo) * 100, 100)) : 0;
  const reduzir = useReducedMotion();
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height: altura, background: "var(--chart-bar)" }}>
      <motion.div
        initial={reduzir ? false : { scaleX: 0 }}
        animate={{ scaleX: largura / 100 }}
        transition={reduzir ? { duration: 0 } : { ...springs.settle, delay: atraso }}
        className="h-full w-full rounded-l-full"
        style={{ background: cor, transformOrigin: "left" }}
      />
    </div>
  );
}

/* ── Aviso de janela ───────────────────────────────────────────────
   O módulo mostra dois recortes diferentes conforme o canal (um dia no
   Mercado Livre, sete na Shopee) e as duas coisas chegavam na tela com a
   mesma cara. Sem dizer qual é, o total de uma semana é lido como o do dia.

   Só aparece quando há o que explicar: canal que credita venda depois do
   clique (`diasAtribuicao > 0`) e janela terminando dentro desse prazo. No
   Mercado Livre, e em qualquer período antigo escolhido no calendário, não
   renderiza nada — aviso que aparece sempre vira moldura e ninguém lê. */
export function AvisoJanela({ janela, fim }: {
  janela: { dias: number; diasAtribuicao: number } | null;
  /** Último dia da janela mostrada (ISO). */
  fim: string | null;
}) {
  if (!janela || janela.diasAtribuicao <= 0 || !fim) return null;

  // Janela que já fechou (alguém escolheu "julho" no calendário) não tem
  // dia em revisão — o número de lá é final.
  const hoje = new Date();
  const diasAtras = Math.round((Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) - new Date(`${fim}T00:00:00Z`).getTime()) / 86_400_000);
  if (!Number.isFinite(diasAtras) || diasAtras >= janela.diasAtribuicao) return null;

  const texto = copyJanela.descricao.replaceAll("{dias}", String(janela.diasAtribuicao));

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card/60 px-3.5 py-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ background: tint("var(--warning)", 12), color: "var(--warning)" }}
      >
        <Hourglass size={13} strokeWidth={2.2} />
      </span>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">{copyJanela.titulo}.</span>{" "}
        {texto}
      </p>
    </div>
  );
}

/** Rótulo curto da janela, pro cabeçalho de telas que não têm calendário
 *  (Produtos, Campanhas): sem ele, "37 anúncios" não diz de quando. */
export function rotuloDaJanela(dias: number): string {
  return dias <= 1 ? copyJanela.rotuloDia : copyJanela.rotuloDias.replace("{dias}", String(dias));
}
