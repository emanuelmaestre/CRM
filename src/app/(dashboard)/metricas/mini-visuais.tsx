/* ── Mini-visuais do mosaico ───────────────────────────────────────
   Preview pequeno mostrado no tile fechado (`Bloco`), escolhido pela
   NATUREZA do dado — não por variedade decorativa: linha = tendência no
   tempo · barras = comparação entre marcas · ranking = ordem/top-N.
   Portado do protótipo `/metricas/redesign` ("Sinal Duplo"), mas usando
   as cores reais (getBrandConfig/channelAccent), não uma paleta própria.

   Os gráficos GRANDES de cada tela de detalhe (ex. GraficoSerie do
   FaturamentoCard) não usam nada daqui — são maiores, com hover/foco, e
   continuam como estão. */

import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";

export function Linha({ dados, cor, largura = 96, altura = 36 }: { dados: number[]; cor: string; largura?: number; altura?: number }) {
  if (dados.length < 2) return null;
  const max = Math.max(...dados);
  const min = Math.min(...dados);
  // Margem vertical de 7px (não 3): o traço e a bolinha do ponto final
  // (raio 2.75 + contorno) chegavam quase colados na borda da caixa.
  // Margem HORIZONTAL de 3px: sem ela, o último ponto cai exatamente em
  // x = largura — metade da bolinha fica fora da viewBox e é cortada pelo
  // `overflow-hidden` do card em volta. Isso é o que lia como "cortado",
  // não a folga vertical.
  const margemV = 7;
  const margemH = 3;
  const ponto = (v: number, i: number) => {
    const x = margemH + (i / (dados.length - 1)) * (largura - margemH * 2);
    const y = altura - ((v - min) / (max - min || 1)) * (altura - margemV * 2) - margemV;
    return [x, y] as const;
  };
  const pontos = dados.map(ponto);
  const d = pontos.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${largura - margemH},${altura} L${margemH},${altura} Z`;
  const [ux, uy] = pontos[pontos.length - 1];
  const id = `mv-area-${cor.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={cor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ux} cy={uy} r="2.75" fill="var(--card)" stroke={cor} strokeWidth="1.75" />
    </svg>
  );
}

/** Split simples de duas partes (ex.: pendentes vs. resolvidas) — pro
 *  caso em que não existe série no tempo real pra desenhar, só uma
 *  proporção entre dois totais. */
export function BarraSplit({ partes }: { partes: { valor: number; cor: string }[] }) {
  const total = partes.reduce((soma, p) => soma + p.valor, 0);
  if (total === 0) return null;
  return (
    <div className="flex h-1.5 w-20 overflow-hidden rounded-full" style={{ background: "var(--muted)" }}>
      {partes.map((parte, indice) => (
        <div key={indice} style={{ width: `${(parte.valor / total) * 100}%`, background: parte.cor }} />
      ))}
    </div>
  );
}

/** Comparação entre marcas — cor de marca é o eixo do gráfico. */
export function BarrasMarca({ dados }: { dados: { slug: string; label: string; valor: number }[] }) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return (
    /* Largura fixa, não `w-full`: o preview mora num container `shrink-0`
       dentro do tile, que não tem largura própria — com `w-full` as barras
       colapsavam pra zero e sobravam só as bolinhas. */
    <div className="flex w-24 flex-col gap-1">
      {dados.map((item) => {
        const cor = isBrandSlug(item.slug) ? getBrandConfig(item.slug)?.color : undefined;
        return (
          <div key={item.slug} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cor ?? "var(--muted-foreground)" }} />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--muted)" }}>
              <div className="h-full rounded-full" style={{ width: `${(item.valor / max) * 100}%`, background: cor ?? "var(--muted-foreground)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Top-N com barra colorida por marca — ordem já vem pronta de quem
 *  chama (o serviço já ordena a lista original). */
export function MiniRanking({ itens }: { itens: { nome: string; valor: number; slug?: string }[] }) {
  if (itens.length === 0) return null;
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    /* Largura fixa pelo mesmo motivo de `BarrasMarca` (container sem
       largura própria); `min-w-0` mantém o `truncate` do nome funcionando. */
    <div className="flex w-[136px] min-w-0 flex-col gap-1">
      {itens.map((item, indice) => {
        const cor = item.slug && isBrandSlug(item.slug) ? getBrandConfig(item.slug)?.color : undefined;
        return (
          <div key={`${item.nome}-${indice}`} className="flex items-center gap-1.5">
            <span className="w-2.5 shrink-0 text-[9px] font-bold tabular-nums" style={{ color: "var(--muted-foreground)" }}>{indice + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-foreground">{item.nome}</span>
            <div className="h-1 w-8 shrink-0 overflow-hidden rounded-full" style={{ background: "var(--muted)" }}>
              <div className="h-full rounded-full" style={{ width: `${(item.valor / max) * 100}%`, background: cor ?? "var(--muted-foreground)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Seta + percentual — mesmo papel do `variacao`/`subirEhRuim` que
 *  `ResumoBloco` já carrega, só que finalmente desenhado no tile. */
export function Delta({ valor, subirEhRuim }: { valor: number | null | undefined; subirEhRuim?: boolean }) {
  if (valor === null || valor === undefined) return null;
  if (valor === 0) {
    return <span className="text-[11px] font-semibold" style={{ color: "var(--muted-foreground)" }}>estável</span>;
  }
  const subiu = valor > 0;
  const bom = subirEhRuim ? !subiu : subiu;
  const cor = bom ? "var(--success)" : "var(--destructive)";
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums" style={{ color: cor }}>
      {subiu ? "▲" : "▼"} {subiu ? "+" : ""}{valor}%
    </span>
  );
}

/** Chip pequeno de marca pro rodapé do tile — mostra a LOGO da marca
 *  quando ela tem uma cadastrada (o mesmo `BrandLogo` do resto do app),
 *  e cai pro nome em texto colorido só pras marcas sem logo. */
export function ChipMarcaTile({ slug, label, height = 13, fundoClaro }: { slug: string; label: string; height?: number; fundoClaro?: boolean }) {
  const cor = isBrandSlug(slug) ? getBrandConfig(slug)?.color : undefined;
  return (
    /* `whitespace-nowrap` + `shrink-0`: num card estreito (grade de 4
       colunas) o nome longo ("ARMARINHOS LIMA") quebrava letra por letra
       na vertical em vez de sair da linha inteiro. */
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
      {/* 13, não 11 — o mesmo valor do chip equivalente no protótipo
          (mosaico-redesign.tsx). Com 11 a logo ficava ~18% menor do que
          deveria dentro do mesmo espaço de chip.
          `fundoClaro`: no card escuro (destaque), a logo da KARZI usa
          tinta preta — sem um fundo claro por trás ela quase some contra
          o cinza-chumbo do card. Um selo branco atrás resolve sem precisar
          de um asset de logo escuro dedicado. */}
      {isBrandSlug(slug) ? (
        fundoClaro ? (
          <span className="inline-flex items-center rounded-full bg-white px-2 py-1">
            <BrandLogo brand={slug} height={height} />
          </span>
        ) : (
          <BrandLogo brand={slug} height={height} />
        )
      ) : (
        <span
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[9.5px] font-semibold"
          style={{ color: cor ?? "var(--muted-foreground)", background: cor ? `color-mix(in srgb, ${cor} 10%, transparent)` : "var(--muted)" }}
        >
          <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: cor ?? "var(--muted-foreground)" }} />
          {label}
        </span>
      )}
    </span>
  );
}
