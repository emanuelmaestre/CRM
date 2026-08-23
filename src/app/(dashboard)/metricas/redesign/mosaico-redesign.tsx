"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle, ArrowLeft, BarChart3, Gauge, Hourglass, Info, Megaphone,
  Package, RefreshCw, ShoppingBag, SlidersHorizontal, TrendingDown, TrendingUp, X,
} from "lucide-react";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { CalendarioPopoverRange } from "@/shared/design-system/primitives/CalendarioPopoverRange";
import { BotaoHoje } from "@/shared/design-system/primitives/BotaoHoje";
import { isBrandSlug } from "@/shared/config/brands";

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ═══════════════════════════════════════════════════════════════════════
   REDESENHO — Mosaico de Métricas · Design System "Sinal Duplo"

   A regra que organiza tudo: MARCA diz "de quem é o dado" (chip, série do
   gráfico) e nunca vira tema da tela; SEMÂNTICA diz "como está" (sucesso,
   atenção, erro, info). As duas convivem no mesmo card sem se confundir —
   é por isso que o erro (#C21820) é propositalmente diferente do vermelho
   da KARZI (#E3131B).

   Hierarquia da tela: o card em destaque é a ÚNICA superfície com
   temperatura (fundo escuro + fio do gradiente-assinatura). Todo o resto é
   neutro. É o contraste que faz o urgente gritar sem precisar de cor em
   tudo.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Tokens ──────────────────────────────────────────────────────────────
   Ficam em CSS variables (não em objeto JS) porque é assim que o resto do
   design system deste app já funciona (globals.css). Sem tema escuro por
   decisão do produto — só o claro, fixo. Ao portar pro app real, este
   bloco migra para globals.css. */
const TOKENS = `
.sd {
  /* neutros */
  --sd-bg: #F7F7F8;
  --sd-card: #FFFFFF;
  --sd-elevada: #FFFFFF;
  --sd-borda: #E6E7EA;
  --sd-ink: #15171C;
  --sd-sub: #5A5F6A;
  --sd-hero-bg: #15171C;
  --sd-hero-ink: #FFFFFF;
  --sd-hero-sub: #9AA0AC;
  --sd-trilho: #EDEEF0;

  /* marca — só como sinal de "de quem é o dado" */
  --sd-karzi: #E3131B;
  --sd-karzi-acc: #FFC400;
  --sd-wuwu: #9B30D9;
  --sd-lima: #6F6F6E;
  --sd-assinatura: linear-gradient(135deg, #E3131B, #9B30D9);

  /* semântica — só como estado do dado */
  --sd-ok: #1F8A4C;
  --sd-warn: #B57A00;
  --sd-err: #C21820;
  --sd-info: #2563EB;

  /* elevação */
  --sd-e1: 0 4px 20px rgba(14,15,19,.06);
  --sd-e2: 0 10px 30px rgba(14,15,19,.10);
  --sd-e3: 0 24px 60px rgba(14,15,19,.22);
}
.sd { background: var(--sd-bg); color: var(--sd-ink); font-family: var(--fonte-inter), system-ui, sans-serif; }
.sd-titulo { font-family: var(--fonte-sora), system-ui, sans-serif; letter-spacing: -0.01em; }
.sd-num { font-family: var(--fonte-sora), system-ui, sans-serif; font-variant-numeric: tabular-nums; }
.sd-shimmer { position: relative; overflow: hidden; background: var(--sd-trilho); }
.sd-shimmer::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent);
  animation: sd-desliza 1.4s infinite;
}
@keyframes sd-desliza { 100% { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .sd-shimmer::after { animation: none; } }
`;

/* Ordem canônica do app real (Armarinhos Lima → KARZI → WUWU) e as cores
   de marca que já existem em brands.json — não são valores novos. */
const MARCAS: { slug: string; label: string; curto: string; cor: string }[] = [
  { slug: "lima", label: "ARMARINHOS LIMA", curto: "LIMA", cor: "var(--sd-lima)" },
  { slug: "karzi", label: "KARZI", curto: "KARZI", cor: "var(--sd-karzi)" },
  { slug: "wuwu", label: "WUWU", curto: "WUWU", cor: "var(--sd-wuwu)" },
];

/** Slug curto do protótipo → slug real de brands.json, o que BrandLogo
 *  entende (tem o `.svg` cadastrado). */
const BRAND_SLUG_REAL: Record<string, string> = {
  wuwu: "wuwu",
  lima: "armarinhos_lima",
  karzi: "karzi",
};

/** Superfícies possíveis do card em destaque. Nenhuma é cor de marca (o
 *  produto não pode parecer "da KARZI" ou "da WUWU") nem cor semântica
 *  (verde fixo diria "está tudo bem" todo dia). A "assinatura" é a única
 *  com identidade: usa o gradiente do PRODUTO, que é justamente o que a
 *  regra de uso restrito reserva pra este lugar. */
const SUPERFICIES_HERO: { id: string; label: string; fundo: string }[] = [
  { id: "grafite", label: "Grafite", fundo: "#3B3F46" },
  { id: "tinta", label: "Azul-tinta", fundo: "#101828" },
  { id: "assinatura", label: "Assinatura", fundo: "linear-gradient(135deg, #2A1622 0%, #17121D 42%, #14131F 100%)" },
  { id: "preto", label: "Preto", fundo: "#15171C" },
];

const CANAIS = [
  { tipo: "mercadolivre", label: "Mercado Livre" },
  { tipo: "shopee", label: "Shopee" },
  { tipo: "tiktokshop", label: "TikTok Shop" },
] as const;

type Estado = "normal" | "carregando" | "vazio";

/* ── Mini-visuais ────────────────────────────────────────────────────────
   Cada preview é escolhido pela NATUREZA do dado, não por variedade
   decorativa: linha = tendência no tempo · barras = comparação entre
   marcas · anel = proporção ou progresso até um limiar · ranking = ordem. */

function Linha({ dados, cor, largura = 132, altura = 44 }: { dados: number[]; cor: string; largura?: number; altura?: number }) {
  const max = Math.max(...dados);
  const min = Math.min(...dados);
  const ponto = (v: number, i: number) => {
    const x = (i / (dados.length - 1)) * largura;
    const y = altura - ((v - min) / (max - min || 1)) * (altura - 8) - 4;
    return [x, y] as const;
  };
  const pontos = dados.map(ponto);
  const d = pontos.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${largura},${altura} L0,${altura} Z`;
  const [ux, uy] = pontos[pontos.length - 1];
  const id = `sd-area-${cor.replace(/[^a-z]/gi, "")}`;
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ux} cy={uy} r="3.5" fill="var(--sd-card)" stroke={cor} strokeWidth="2" />
    </svg>
  );
}

/** Barras no tempo com o pico destacado e rótulo flutuante — o resto fica
 *  esmaecido pra o olho ir direto ao ponto que importa. */
function BarrasTempo({ dados, cor, destaque, rotulo }: { dados: number[]; cor: string; destaque?: number; rotulo?: string }) {
  const max = Math.max(...dados);
  const alvo = destaque ?? dados.indexOf(max);
  return (
    <div className="flex h-11 items-end gap-[3px]">
      {dados.map((v, i) => (
        <div key={i} className="relative flex h-full flex-1 items-end">
          {i === alvo && rotulo && (
            <span
              className="sd-num absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-bold"
              style={{ background: cor, color: "#fff" }}
            >
              {rotulo}
            </span>
          )}
          <div
            className="w-full rounded-[3px] transition-[height]"
            style={{ height: `${Math.max(12, (v / max) * 100)}%`, background: cor, opacity: i === alvo ? 1 : 0.22 }}
          />
        </div>
      ))}
    </div>
  );
}

/** Comparação entre marcas — o único lugar onde as 3 cores de marca
 *  aparecem juntas, porque aqui a cor é literalmente o eixo do gráfico. */
function BarrasMarca({ dados }: { dados: { slug: string; valor: number }[] }) {
  const max = Math.max(...dados.map((d) => d.valor));
  return (
    <div className="flex w-full flex-col gap-1.5">
      {dados.map((item) => {
        const marca = MARCAS.find((m) => m.slug === item.slug);
        return (
          <div key={item.slug} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: marca?.cor }} />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--sd-trilho)" }}>
              <div className="h-full rounded-full" style={{ width: `${(item.valor / max) * 100}%`, background: marca?.cor }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Anel({ pct, cor, centro, legenda }: { pct: number; cor: string; centro: string; legenda?: string }) {
  const r = 21;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--sd-trilho)" strokeWidth="5.5" />
        <circle
          cx="28" cy="28" r={r} fill="none" stroke={cor} strokeWidth="5.5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} transform="rotate(-90 28 28)"
        />
      </svg>
      <div className="absolute grid place-items-center leading-none">
        <span className="sd-num text-[14px] font-bold">{centro}</span>
        {legenda && <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--sd-sub)" }}>{legenda}</span>}
      </div>
    </div>
  );
}

function MiniRanking({ itens }: { itens: { nome: string; valor: number; slug: string }[] }) {
  const max = Math.max(...itens.map((i) => i.valor));
  return (
    <div className="flex w-full flex-col gap-1">
      {itens.map((item, indice) => {
        const marca = MARCAS.find((m) => m.slug === item.slug);
        return (
          <div key={item.nome} className="flex items-center gap-1.5">
            <span className="sd-num w-3 shrink-0 text-[10px] font-bold" style={{ color: "var(--sd-sub)" }}>{indice + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{item.nome}</span>
            <div className="h-1 w-10 shrink-0 overflow-hidden rounded-full" style={{ background: "var(--sd-trilho)" }}>
              <div className="h-full rounded-full" style={{ width: `${(item.valor / max) * 100}%`, background: marca?.cor }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Átomos ──────────────────────────────────────────────────────────── */

function ChipMarca({ slug, escuro }: { slug: string; escuro?: boolean }) {
  const marca = MARCAS.find((m) => m.slug === slug);
  if (!marca) return null;
  const slugReal = BRAND_SLUG_REAL[marca.slug];
  // No card claro a logo entra no lugar do texto (mesma lógica da barra de
  // filtro no topo). No hero escuro fica o dot+texto — a logo colorida
  // pequena sobre fundo `#15171C` perdia nitidez ali.
  if (!escuro && isBrandSlug(slugReal)) {
    return (
      <span className="inline-flex items-center rounded-full px-1 py-1">
        <BrandLogo brand={slugReal} height={13} />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[10.5px] font-semibold"
      /* chip = fundo 10% + texto 100% do tom da marca */
      style={{
        color: escuro ? "#fff" : marca.cor,
        background: escuro ? "rgba(255,255,255,.08)" : `color-mix(in srgb, ${marca.cor} 10%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: marca.cor }} />
      {marca.curto}
    </span>
  );
}

/** Variação. `subirEhRuim` existe porque em Reclamações e Giro baixo a seta
 *  pra cima é má notícia — pintar de verde ali seria mentir pro olho. */
function Delta({ valor, subirEhRuim, escuro }: { valor: number; subirEhRuim?: boolean; escuro?: boolean }) {
  if (valor === 0) {
    return <span className="text-[11.5px] font-semibold" style={{ color: escuro ? "var(--sd-hero-sub)" : "var(--sd-sub)" }}>estável</span>;
  }
  const subiu = valor > 0;
  const bom = subirEhRuim ? !subiu : subiu;
  const cor = bom ? "var(--sd-ok)" : "var(--sd-err)";
  const Icone = subiu ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: cor }}>
      <Icone size={13} strokeWidth={2} />
      {subiu ? "+" : ""}{valor}%
    </span>
  );
}

/** Ícone-badge squircle de 40px — nunca círculo perfeito, é o que dá a
 *  assinatura de forma do produto. */
function Badge({ tom, children, tamanho = 40 }: { tom: string; children: React.ReactNode; tamanho?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center"
      style={{
        width: tamanho, height: tamanho, borderRadius: tamanho * 0.32,
        background: `color-mix(in srgb, ${tom} 12%, transparent)`, color: tom,
      }}
    >
      {children}
    </span>
  );
}

function Eyebrow({ children, escuro }: { children: React.ReactNode; escuro?: boolean }) {
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-[.14em]"
      style={{ color: escuro ? "var(--sd-hero-sub)" : "var(--sd-sub)" }}
    >
      {children}
    </span>
  );
}

function BotaoStatus() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold"
      style={{ borderColor: "var(--sd-borda)", color: "var(--sd-sub)" }}
    >
      <Info size={11} /> Entenda os status
    </span>
  );
}

/* ── Dados fictícios, coerentes com um CRM multicanal ────────────────── */

type CardDef = {
  id: string;
  secao: string;
  titulo: string;
  icone: React.ElementType;
  tom: string;
  metrica: string;
  sufixo?: string;
  legenda: string;
  delta: number;
  subirEhRuim?: boolean;
  status?: boolean;
  alerta?: "atencao" | "critico";
  preview: React.ReactNode;
  chips?: string[];
};

const CARDS: CardDef[] = [
  {
    id: "marca", secao: "Financeiro", titulo: "Marca", icone: BarChart3, tom: "var(--sd-info)",
    metrica: "3", legenda: "marcas comparadas", delta: 6,
    preview: <BarrasMarca dados={[{ slug: "wuwu", valor: 58 }, { slug: "lima", valor: 41 }, { slug: "karzi", valor: 29 }]} />,
    chips: ["wuwu", "lima", "karzi"],
  },
  {
    id: "score", secao: "Placar geral", titulo: "Pontuação da loja", icone: Gauge, tom: "var(--sd-ok)",
    metrica: "87", sufixo: "/100", legenda: "reputação saudável", delta: 2,
    preview: <Anel pct={87} cor="var(--sd-ok)" centro="87" legenda="score" />,
  },
  {
    id: "reclamacoes", secao: "Atendimento ao cliente", titulo: "Reclamações", icone: AlertTriangle, tom: "var(--sd-err)",
    metrica: "3", legenda: "a resolver", delta: -25, subirEhRuim: true, status: true, alerta: "critico",
    preview: <BarrasTempo dados={[5, 4, 6, 3, 4, 2, 3]} cor="var(--sd-err)" destaque={6} rotulo="hoje" />,
  },
  {
    id: "reposicao", secao: "Estoque & catálogo", titulo: "Repor em breve", icone: Package, tom: "var(--sd-warn)",
    metrica: "12", legenda: "SKUs perto do mínimo", delta: 14, subirEhRuim: true, status: true, alerta: "atencao",
    preview: <Anel pct={64} cor="var(--sd-warn)" centro="12" legenda="skus" />,
  },
  {
    id: "vendemMais", secao: "Estoque & catálogo", titulo: "Vendem mais", icone: ShoppingBag, tom: "var(--sd-ok)",
    metrica: "418", legenda: "unidades no topo", delta: 11, status: true,
    preview: <MiniRanking itens={[{ nome: "Canutilho 7mm", valor: 418, slug: "lima" }, { nome: "Miçanga cristal", valor: 302, slug: "wuwu" }, { nome: "Linha metalizada", valor: 244, slug: "karzi" }]} />,
  },
  {
    id: "giroBaixo", secao: "Estoque & catálogo", titulo: "Giro baixo", icone: TrendingDown, tom: "var(--sd-warn)",
    metrica: "7", legenda: "itens travando capital", delta: -4, subirEhRuim: true, status: true,
    preview: <Linha dados={[9, 8, 8, 6, 5, 5, 4]} cor="var(--sd-warn)" />,
  },
  {
    id: "parados", secao: "Estoque & catálogo", titulo: "Estoque parado", icone: Hourglass, tom: "var(--sd-sub)",
    metrica: "R$ 6,3k", legenda: "sem saída há 90 dias", delta: 3, subirEhRuim: true, status: true,
    preview: <BarrasTempo dados={[6, 6, 7, 7, 8, 8, 9]} cor="var(--sd-sub)" rotulo="+3%" />,
  },
  {
    id: "publicacoes", secao: "Marketing", titulo: "Publicações", icone: Megaphone, tom: "var(--sd-wuwu)",
    metrica: "63%", legenda: "da receita veio de anúncio", delta: 18, status: true,
    preview: <Anel pct={63} cor="var(--sd-wuwu)" centro="63%" legenda="pago" />,
  },
];

const HERO = {
  id: "faturamento",
  secao: "Financeiro",
  titulo: "Faturamento",
  metrica: "R$ 128.940",
  delta: 9,
  legenda: "1.284 pedidos · ticket médio R$ 100,42",
  serie: [70, 82, 76, 95, 88, 110, 104, 129],
};

const SECOES = ["Financeiro", "Placar geral", "Atendimento ao cliente", "Estoque & catálogo", "Marketing"];

/* ═══════════════════════════════════════════════════════════════════════ */

export function MosaicoRedesign() {
  const reduzir = useReducedMotion();
  const [estado, setEstado] = useState<Estado>("normal");
  const [aberto, setAberto] = useState<string | null>(null);
  const [marcasSel, setMarcasSel] = useState<string[]>(["wuwu", "lima", "karzi"]);
  const [canaisSel, setCanaisSel] = useState<string[]>(["mercadolivre"]);
  const [periodo, setPeriodo] = useState({ inicio: hojeISO(), fim: hojeISO() });
  const [superficie, setSuperficie] = useState(SUPERFICIES_HERO[0]);

  // "sem filtro = sem dado": nenhuma marca e nenhum canal marcado significa
  // que o mosaico não tem escopo pra medir — os cards mostram o vazio, não
  // um número inventado sobre "todas as marcas".
  const semEscopo = marcasSel.length === 0 && canaisSel.length === 0;
  const estadoEfetivo: Estado = estado !== "normal" ? estado : semEscopo ? "vazio" : "normal";

  /* "N de 9 painéis prontos" — progresso REAL, não um timer decorativo: o
     mosaico é a soma de 9 buscas independentes (o hero + os 8 cards), cada
     uma resolvendo no próprio ritmo, e é isso que este número mede. Neste
     protótipo, sem backend de verdade, simulamos as 9 "respondendo" uma a
     uma; ao portar pro app real, `prontos` vem de contar quantos dos 9
     `useDadosDoCard` já saíram do estado `carregando`.
     Atraso de 250ms antes de mostrar qualquer coisa — evita o pisca-pisca
     quando tudo responde rápido — e a contagem nunca anda pra trás nem
     fica presa em "9 de 9" sem o conteúdo real ter chegado. */
  const TOTAL_PAINEIS = CARDS.length + 1;
  const [painesProntos, setPainesProntos] = useState(0);
  const [mostrarProgresso, setMostrarProgresso] = useState(false);

  useEffect(() => {
    if (estadoEfetivo !== "carregando") return;
    let cancelado = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => { if (!cancelado) setMostrarProgresso(true); }, 250));
    function passo(atual: number) {
      if (cancelado) return;
      setPainesProntos(atual);
      if (atual < TOTAL_PAINEIS) {
        timers.push(setTimeout(() => passo(atual + 1), 260 + Math.random() * 220));
      }
    }
    timers.push(setTimeout(() => passo(1), 450));
    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
      setPainesProntos(0);
      setMostrarProgresso(false);
    };
  }, [estadoEfetivo, TOTAL_PAINEIS]);

  // Mesmo número que já aparece em texto no hero e na barra superior
  // ("consultando os canais · N de 9"), só que como percentual pro rodapé
  // do skeleton — por isso null (não 0) antes do atraso anti-flicker: 0%
  // desenharia uma barra vazia por 250ms, como se já soubéssemos a conta.
  const pctCarregando = mostrarProgresso ? Math.round((painesProntos / TOTAL_PAINEIS) * 100) : null;

  const alternar = (lista: string[], valor: string, definir: (v: string[]) => void) =>
    definir(lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor]);

  const porSecao = useMemo(
    () => SECOES.map((secao) => ({ secao, cards: CARDS.filter((card) => card.secao === secao) })).filter((g) => g.cards.length > 0),
    [],
  );

  // MOTION: entrada fade-up 8px com stagger de 40ms entre os cards.
  const entrada = (indice: number) =>
    reduzir
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] as const, delay: indice * 0.04 },
        };

  return (
    /* Sangra o padding do DashboardLayout pra o fundo do Design System
       cobrir a área inteira. Em estilo explícito, e não em utilitário
       negativo do Tailwind, porque negar um `clamp()` gera CSS inválido. */
    <div
      className="sd min-h-[calc(100dvh-3.5rem)]"
      style={{
        marginInline: "calc(clamp(1rem, 2.2vw, 2rem) * -1)",
        marginBlock: "calc(clamp(1rem, 2vw, 1.5rem) * -1)",
        paddingInline: "clamp(1rem, 2.2vw, 2rem)",
        paddingBlock: "clamp(1rem, 2vw, 1.5rem)",
      }}
    >
      <style>{TOKENS}</style>

      {/* ── Barra de escopo: marca + canal + período ───────────────────
          Define o escopo dos PREVIEWS do mosaico. O filtro por card
          continua existindo dentro da tela de detalhe, que é onde ele
          serve pra comparar dois recortes diferentes. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2">
        <SlidersHorizontal size={15} style={{ color: "var(--sd-sub)" }} />

        {MARCAS.map((marca) => {
          const ativo = marcasSel.includes(marca.slug);
          // "lima" é o slug curto do protótipo; o slug real da marca (o
          // que BrandLogo entende, com o logo cadastrado) é
          // "armarinhos_lima" — ver BRAND_SLUG_REAL no topo do arquivo.
          const slugReal = BRAND_SLUG_REAL[marca.slug];
          return (
            <button
              key={marca.slug}
              type="button"
              onClick={() => alternar(marcasSel, marca.slug, setMarcasSel)}
              aria-pressed={ativo}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 transition-colors"
              style={{
                borderColor: ativo ? marca.cor : "transparent",
                background: "transparent",
              }}
            >
              {isBrandSlug(slugReal) ? (
                <BrandLogo brand={slugReal} height={18} />
              ) : (
                <span className="text-[12px] font-semibold" style={{ color: ativo ? marca.cor : "var(--sd-sub)" }}>{marca.curto}</span>
              )}
            </button>
          );
        })}

        <span aria-hidden="true" className="mx-1 h-5 w-px" style={{ background: "var(--sd-borda)" }} />

        {CANAIS.map((canal) => {
          const ativo = canaisSel.includes(canal.tipo);
          // Cor de seleção = cor de identidade do próprio canal (amarelo do
          // Mercado Livre, laranja da Shopee, preto do TikTok) — mesma
          // função `channelAccent` que o resto do app usa, em vez de uma
          // cor genérica igual pra qualquer canal marcado.
          const cor = channelAccent(canal.tipo);
          return (
            <button
              key={canal.tipo}
              type="button"
              onClick={() => alternar(canaisSel, canal.tipo, setCanaisSel)}
              aria-pressed={ativo}
              title={canal.label}
              className="inline-flex h-9 items-center rounded-full border px-3 transition-colors"
              style={{
                borderColor: ativo ? cor : "transparent",
                background: "transparent",
              }}
            >
              <ChannelLogo canal={canal.tipo} size="sm" variant="logo" />
            </button>
          );
        })}

        <span aria-hidden="true" className="mx-1 h-5 w-px" style={{ background: "var(--sd-borda)" }} />

        {/* Período — mesmo primitivo (`CalendarioPopoverRange` + `BotaoHoje`)
            já usado em Métricas/Vendas/Estoque no app real, não uma
            reimplementação. Define a janela de tempo dos previews; o
            escopo por marca/canal continua vindo da barra de pílulas ao
            lado. Funcional de verdade, não é só decoração de protótipo. */}
        <CalendarioPopoverRange
          rotulo="Período"
          valor={periodo}
          max={hojeISO()}
          onChange={({ inicio, fim }) => setPeriodo({ inicio, fim })}
        />
        <BotaoHoje
          ativo={periodo.inicio === hojeISO() && periodo.fim === hojeISO()}
          onClick={() => setPeriodo({ inicio: hojeISO(), fim: hojeISO() })}
        />

        <div className="ml-auto flex items-center gap-2">
          {/* Controle só do protótipo, pra você ver os estados sem eu
              precisar quebrar o mosaico de propósito. Não vai pro app. */}
          <div className="flex items-center rounded-full border p-0.5" style={{ borderColor: "var(--sd-borda)", background: "var(--sd-card)" }}>
            {(["normal", "carregando", "vazio"] as Estado[]).map((opcao) => (
              <button
                key={opcao}
                type="button"
                onClick={() => setEstado(opcao)}
                className="h-7 rounded-full px-2.5 text-[11px] font-semibold capitalize transition-colors"
                style={estado === opcao
                  ? { background: "var(--sd-ink)", color: "var(--sd-bg)" }
                  : { color: "var(--sd-sub)" }}
              >
                {opcao}
              </button>
            ))}
          </div>

          {/* Também só do protótipo: alterna a superfície do card em
              destaque pra escolher a cor no olho, ao vivo. */}
          <div className="flex items-center rounded-full border p-0.5" style={{ borderColor: "var(--sd-borda)", background: "var(--sd-card)" }}>
            {SUPERFICIES_HERO.map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                onClick={() => setSuperficie(opcao)}
                title={opcao.label}
                className="h-7 rounded-full px-2.5 text-[11px] font-semibold transition-colors"
                style={superficie.id === opcao.id
                  ? { background: "var(--sd-ink)", color: "var(--sd-bg)" }
                  : { color: "var(--sd-sub)" }}
              >
                {opcao.label}
              </button>
            ))}
          </div>

          {/* Segundo lugar do indicador de progresso (o primeiro é o hero,
              logo abaixo): este cantinho alterna entre "atualizado às" e
              "consultando os canais", sem forma nenhuma, só o número real
              de painéis que já responderam — ver o efeito que calcula
              `painesProntos` mais acima. */}
          <span className="hidden items-center gap-1.5 text-[11px] xl:inline-flex" style={{ color: "var(--sd-sub)" }}>
            <RefreshCw size={12} className={estadoEfetivo === "carregando" ? "animate-spin" : undefined} />
            {estadoEfetivo === "carregando"
              ? (mostrarProgresso ? `Consultando os canais · ${painesProntos} de ${TOTAL_PAINEIS}` : "Consultando os canais…")
              : "Atualizado às 17:24"}
          </span>
        </div>
      </div>

      {/* ── Card em destaque ──────────────────────────────────────────
          Única superfície com temperatura na tela inteira. Recebe o fio
          do gradiente-assinatura (uso restrito) porque é o ponto onde o
          produto assina, não a marca. */}
      <motion.button
        {...entrada(0)}
        type="button"
        onClick={() => setAberto(HERO.id)}
        layoutId={reduzir ? undefined : `sd-${HERO.id}`}
        className="mb-3 w-full overflow-hidden rounded-[1.25rem] text-left"
        style={{ background: superficie.fundo, boxShadow: "var(--sd-e2)" }}
      >
        <div className="h-[3px] w-full" style={{ background: "var(--sd-assinatura)" }} />
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:gap-6 lg:px-8 lg:py-7">
          <Badge tom="#4ADE80" tamanho={52}><TrendingUp size={24} strokeWidth={1.75} /></Badge>

          <div className="min-w-0 flex-1">
            <Eyebrow escuro>{HERO.secao} · em destaque agora</Eyebrow>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="sd-titulo text-[22px] font-bold" style={{ color: "var(--sd-hero-ink)" }}>{HERO.titulo}</h1>
              {estadoEfetivo === "carregando" ? (
                <span className="sd-shimmer inline-block h-8 w-44 rounded-lg" />
              ) : estadoEfetivo === "vazio" ? (
                <span className="text-[15px]" style={{ color: "var(--sd-hero-sub)" }}>escolha uma marca ou canal</span>
              ) : (
                <>
                  {/* MOTION: number-flow entra aqui — a métrica conta na
                      primeira carga e ao trocar o filtro. */}
                  <span className="sd-num text-[30px] font-bold leading-none" style={{ color: "var(--sd-hero-ink)" }}>{HERO.metrica}</span>
                  <Delta valor={HERO.delta} escuro />
                </>
              )}
            </div>
            <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--sd-hero-sub)" }}>
              {estadoEfetivo === "normal"
                ? HERO.legenda
                : estadoEfetivo === "carregando"
                  ? (mostrarProgresso ? `Consultando os canais · ${painesProntos} de ${TOTAL_PAINEIS} painéis prontos` : "Consultando os canais…")
                  : "Sem escopo definido, o painel não busca dado nenhum."}
            </p>
            {estadoEfetivo === "normal" && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {marcasSel.map((slug) => <ChipMarca key={slug} slug={slug} escuro />)}
              </div>
            )}
          </div>

          {estadoEfetivo === "normal" && (
            <div className="hidden shrink-0 sm:block">
              <Linha dados={HERO.serie} cor="#4ADE80" largura={180} altura={60} />
            </div>
          )}
        </div>
      </motion.button>

      {/* ── Grade (tablet/desktop) ───────────────────────────────────── */}
      <ul className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((card, indice) => (
          <motion.li key={card.id} {...entrada(indice + 1)}>
            <Card card={card} estado={estadoEfetivo} onAbrir={() => setAberto(card.id)} reduzir={Boolean(reduzir)} pct={pctCarregando} />
          </motion.li>
        ))}
      </ul>

      {/* ── Mobile: empilhado por seção, com rótulo próprio ──────────── */}
      <div className="flex flex-col gap-4 md:hidden">
        {porSecao.map((grupo) => (
          <section key={grupo.secao} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <h2 className="text-[10px] font-semibold uppercase tracking-[.14em]" style={{ color: "var(--sd-sub)" }}>{grupo.secao}</h2>
              <span className="h-px flex-1" style={{ background: "var(--sd-borda)" }} />
            </div>
            <ul className="flex flex-col gap-2">
              {grupo.cards.map((card) => (
                <li key={card.id}>
                  <Card card={card} estado={estadoEfetivo} onAbrir={() => setAberto(card.id)} reduzir={Boolean(reduzir)} pct={pctCarregando} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <AnimatePresence>
        {aberto && <Detalhe id={aberto} onFechar={() => setAberto(null)} reduzir={Boolean(reduzir)} marcasSel={marcasSel} />}
      </AnimatePresence>
    </div>
  );
}

/* ── Card ────────────────────────────────────────────────────────────── */

function Card({ card, estado, onAbrir, reduzir, pct }: { card: CardDef; estado: Estado; onAbrir: () => void; reduzir: boolean; pct: number | null }) {
  const [hover, setHover] = useState(false);

  if (estado === "carregando") return <CardSkeleton pct={pct} />;
  if (estado === "vazio") return <CardVazio card={card} />;

  return (
    <motion.button
      type="button"
      onClick={onAbrir}
      layoutId={reduzir ? undefined : `sd-${card.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex h-full w-full flex-col rounded-[1.25rem] border p-4 text-left transition-[transform,border-color,box-shadow] duration-[160ms] lg:p-5"
      style={{
        background: "var(--sd-card)",
        // MOTION: hover levanta 2px e a borda assume o tom do contexto.
        borderColor: hover ? card.tom : "var(--sd-borda)",
        boxShadow: hover ? "var(--sd-e2)" : "var(--sd-e1)",
        transform: hover && !reduzir ? "translateY(-2px)" : "none",
      }}
    >
      <div className="flex items-start gap-3">
        <Badge tom={card.tom}><card.icone size={19} strokeWidth={1.75} /></Badge>
        <div className="min-w-0 flex-1">
          <Eyebrow>{card.secao}</Eyebrow>
          <h3 className="sd-titulo mt-0.5 text-[14.5px] font-bold leading-tight">{card.titulo}</h3>
        </div>
        {/* Ponto semântico: o estado do dado, separado da cor da marca. */}
        {card.alerta && (
          <span
            aria-label={card.alerta === "critico" ? "Crítico" : "Atenção"}
            className="mt-1 h-2 w-2 shrink-0 rounded-full"
            style={{ background: card.alerta === "critico" ? "var(--sd-err)" : "var(--sd-warn)" }}
          />
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            {/* MOTION: number-flow também aqui. */}
            <span className="sd-num text-[22px] font-bold leading-none">{card.metrica}</span>
            {card.sufixo && <span className="text-[12px]" style={{ color: "var(--sd-sub)" }}>{card.sufixo}</span>}
          </div>
          <div className="mt-1.5"><Delta valor={card.delta} subirEhRuim={card.subirEhRuim} /></div>
          <p className="mt-1 truncate text-[11.5px]" style={{ color: "var(--sd-sub)" }}>{card.legenda}</p>
        </div>
        <div className="shrink-0">
          {card.preview}
          {/* A linha decorativa sozinha não diz se está subindo ou caindo
           *  sem olhar com atenção — uma palavra em negrito embaixo tira
           *  a ambiguidade sem precisar de legenda longa. */}
          {card.id === "giroBaixo" && (
            <p className="mt-1 text-right text-[10px] font-bold" style={{ color: "var(--sd-warn)" }}>Caindo</p>
          )}
        </div>
      </div>

      {(card.chips || card.status) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3" style={{ borderColor: "var(--sd-borda)" }}>
          {card.chips?.map((slug) => <ChipMarca key={slug} slug={slug} />)}
          {card.status && <BotaoStatus />}
        </div>
      )}
    </motion.button>
  );
}

/** Vazio da regra "sem filtro = sem dado": não é erro nem ausência de
 *  dado — é ausência de PERGUNTA. Por isso ilustra, explica em uma frase
 *  e oferece a ação que resolve. */
function CardVazio({ card }: { card: CardDef }) {
  return (
    <div
      className="flex h-full min-h-[168px] flex-col items-center justify-center gap-2 rounded-[1.25rem] border border-dashed p-5 text-center"
      style={{ borderColor: "var(--sd-borda)", background: "var(--sd-card)" }}
    >
      <Badge tom="var(--sd-info)"><SlidersHorizontal size={18} strokeWidth={1.75} /></Badge>
      <h3 className="sd-titulo text-[14px] font-bold">{card.titulo}</h3>
      <p className="max-w-[22ch] text-[12px] leading-relaxed" style={{ color: "var(--sd-sub)" }}>
        Escolha uma marca ou canal acima para ver este painel.
      </p>
      <span
        className="mt-1 inline-flex h-8 items-center rounded-[0.75rem] px-3 text-[12px] font-semibold"
        style={{ background: "var(--sd-ink)", color: "var(--sd-bg)" }}
      >
        Escolher escopo
      </span>
    </div>
  );
}

function CardSkeleton({ pct }: { pct: number | null }) {
  return (
    <div
      className="flex h-full min-h-[168px] flex-col rounded-[1.25rem] border p-4 lg:p-5"
      style={{ borderColor: "var(--sd-borda)", background: "var(--sd-card)" }}
      role="status"
      aria-label="Carregando painel"
    >
      <div className="flex items-start gap-3">
        <span className="sd-shimmer h-10 w-10 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2 pt-1">
          <span className="sd-shimmer block h-2 w-20 rounded" />
          <span className="sd-shimmer block h-3 w-28 rounded" />
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="space-y-2">
          <span className="sd-shimmer block h-6 w-24 rounded" />
          <span className="sd-shimmer block h-2.5 w-16 rounded" />
        </div>
        <span className="sd-shimmer block h-11 w-[110px] rounded-lg" />
      </div>
      {/* Rodapé do skeleton vira o progresso: a mesma leitura do hero, só
          que discreta. Enquanto o atraso anti-flicker não passou (`pct`
          nulo), continua a barrinha cinza — sem número piscando à toa. */}
      <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: "var(--sd-borda)" }}>
        {pct === null ? (
          <span className="sd-shimmer block h-4 w-32 rounded-full" />
        ) : (
          <>
            <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--sd-trilho)" }}>
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${pct}%`, background: "var(--sd-info)" }}
              />
            </div>
            <span className="sd-num text-[11px] font-bold tabular-nums" style={{ color: "var(--sd-sub)" }}>{pct}%</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Tela de detalhe ─────────────────────────────────────────────────────
   O card não é substituído por uma gaveta: ele CRESCE até virar a tela,
   pelo layoutId compartilhado. É o mesmo objeto, só que inteiro — o que
   mantém o vínculo entre o que foi clicado e o que abriu. */

const CANAL_QUEBRA = [
  { canal: "Mercado Livre", valor: "R$ 96.310", pct: 74, cor: "var(--sd-ok)" },
  { canal: "Shopee", valor: "R$ 24.180", pct: 19, cor: "var(--sd-info)" },
  { canal: "TikTok Shop", valor: "R$ 8.450", pct: 7, cor: "var(--sd-wuwu)" },
];

const PEDIDOS = [
  { id: "2000012843", cliente: "Marina A.", marca: "wuwu", valor: "R$ 289,90", estado: "Em aberto", tom: "var(--sd-info)" },
  { id: "2000012839", cliente: "Rafael T.", marca: "lima", valor: "R$ 154,00", estado: "Em aberto", tom: "var(--sd-info)" },
  { id: "2000012835", cliente: "Cláudia M.", marca: "karzi", valor: "R$ 612,40", estado: "Em aberto", tom: "var(--sd-info)" },
  { id: "2000012830", cliente: "Bruno S.", marca: "wuwu", valor: "R$ 78,90", estado: "Cancelado", tom: "var(--sd-err)" },
];

function Detalhe({ id, onFechar, reduzir, marcasSel }: { id: string; onFechar: () => void; reduzir: boolean; marcasSel: string[] }) {
  const eHero = id === HERO.id;
  const card = CARDS.find((item) => item.id === id);
  const titulo = eHero ? HERO.titulo : card?.titulo ?? "";
  const secao = eHero ? HERO.secao : card?.secao ?? "";
  const tom = eHero ? "var(--sd-ok)" : card?.tom ?? "var(--sd-ink)";
  const Icone = eHero ? TrendingUp : card?.icone ?? BarChart3;

  return (
    <motion.div
      layoutId={reduzir ? undefined : `sd-${id}`}
      className="sd fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: "var(--sd-bg)" }}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      {/* Cabeçalho do detalhe — identidade + a ação de voltar. */}
      <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3.5" style={{ borderColor: "var(--sd-borda)", background: "var(--sd-card)" }}>
        <button
          type="button"
          onClick={onFechar}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[0.75rem] border"
          style={{ borderColor: "var(--sd-borda)", color: "var(--sd-sub)" }}
          aria-label="Voltar ao mosaico"
        >
          <ArrowLeft size={17} />
        </button>
        <Badge tom={tom}><Icone size={19} strokeWidth={1.75} /></Badge>
        <div className="min-w-0 flex-1">
          <Eyebrow>{secao}</Eyebrow>
          <h2 className="sd-titulo text-[17px] font-bold leading-tight">{titulo}</h2>
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[0.75rem] border"
          style={{ borderColor: "var(--sd-borda)", color: "var(--sd-sub)" }}
          aria-label="Fechar"
        >
          <X size={17} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-5">
          {/* Filtro POR CARD — vive aqui dentro, não no mosaico: é o que
              permite dois cards discordarem de escopo entre si. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--sd-sub)" }}>Escopo deste painel</span>
            {MARCAS.map((marca) => (
              <span
                key={marca.slug}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold"
                style={{
                  borderColor: marcasSel.includes(marca.slug) ? marca.cor : "var(--sd-borda)",
                  color: marcasSel.includes(marca.slug) ? marca.cor : "var(--sd-sub)",
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: marca.cor }} />
                {marca.curto}
              </span>
            ))}
            <span className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold" style={{ borderColor: "var(--sd-borda)", color: "var(--sd-sub)" }}>
              Últimos 30 dias
            </span>
          </div>

          {/* Número grande + variação */}
          <div className="rounded-[1.25rem] border p-6" style={{ borderColor: "var(--sd-borda)", background: "var(--sd-card)", boxShadow: "var(--sd-e1)" }}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>Total no período</Eyebrow>
                <div className="mt-1 flex items-baseline gap-3">
                  {/* MOTION: number-flow na entrada do detalhe. */}
                  <span className="sd-num text-[40px] font-bold leading-none">{eHero ? HERO.metrica : card?.metrica}</span>
                  <Delta valor={eHero ? HERO.delta : card?.delta ?? 0} subirEhRuim={card?.subirEhRuim} />
                </div>
                <p className="mt-2 text-[12.5px]" style={{ color: "var(--sd-sub)" }}>
                  {eHero ? HERO.legenda : card?.legenda} · comparado aos 30 dias anteriores
                </p>
              </div>
              <div className="flex gap-1.5">
                {marcasSel.map((slug) => <ChipMarca key={slug} slug={slug} />)}
              </div>
            </div>

            {/* Série por marca — aqui a cor de marca é o eixo do gráfico,
                exatamente o papel que o Sinal Duplo reserva pra ela. */}
            <div className="mt-6 flex h-48 items-end gap-2">
              {[62, 74, 68, 88, 79, 101, 94, 118, 106, 129].map((valor, indice) => (
                <div key={indice} className="flex h-full flex-1 flex-col justify-end gap-[3px]">
                  <div className="w-full rounded-t-[4px]" style={{ height: `${valor * 0.42}%`, background: "var(--sd-wuwu)", opacity: 0.85 }} />
                  <div className="w-full" style={{ height: `${valor * 0.3}%`, background: "var(--sd-lima)", opacity: 0.75 }} />
                  <div className="w-full rounded-b-[4px]" style={{ height: `${valor * 0.2}%`, background: "var(--sd-karzi)", opacity: 0.85 }} />
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px]" style={{ color: "var(--sd-sub)" }}>
              Faturamento empilhado por marca · últimos 10 períodos.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            {/* Quebra por canal */}
            <div className="rounded-[1.25rem] border p-5" style={{ borderColor: "var(--sd-borda)", background: "var(--sd-card)", boxShadow: "var(--sd-e1)" }}>
              <h3 className="sd-titulo text-[14px] font-bold">Por canal</h3>
              <div className="mt-4 flex flex-col gap-3.5">
                {CANAL_QUEBRA.map((item) => (
                  <div key={item.canal}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12.5px] font-medium">{item.canal}</span>
                      <span className="sd-num text-[12.5px] font-bold">{item.valor}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--sd-trilho)" }}>
                      <div className="h-full rounded-full" style={{ width: `${item.pct}%`, background: item.cor }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pedidos recentes — bolinha semântica no estado, chip de
                marca na identidade. As duas linguagens na mesma linha,
                sem se atrapalhar. */}
            <div className="overflow-hidden rounded-[1.25rem] border" style={{ borderColor: "var(--sd-borda)", background: "var(--sd-card)", boxShadow: "var(--sd-e1)" }}>
              <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--sd-borda)" }}>
                <h3 className="sd-titulo text-[14px] font-bold">Pedidos que somaram</h3>
                <BotaoStatus />
              </div>
              <table className="w-full">
                <tbody>
                  {PEDIDOS.map((pedido) => (
                    <tr key={pedido.id} className="border-b last:border-0" style={{ borderColor: "var(--sd-borda)" }}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: pedido.tom }} />
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-semibold">{pedido.cliente}</p>
                            <p className="sd-num text-[10.5px]" style={{ color: "var(--sd-sub)" }}>#{pedido.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3"><ChipMarca slug={pedido.marca} /></td>
                      <td className="px-2 py-3 text-[11.5px]" style={{ color: pedido.tom }}>{pedido.estado}</td>
                      <td className="sd-num px-5 py-3 text-right text-[12.5px] font-bold">{pedido.valor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
