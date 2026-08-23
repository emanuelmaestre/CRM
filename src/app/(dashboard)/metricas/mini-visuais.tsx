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

export function Linha({ dados, cor, largura = 96, altura = 36, espessura = 1.75, classeResponsiva }: {
  dados: number[];
  cor: string;
  largura?: number;
  altura?: number;
  /** Espessura do traço. O card em destaque usa mais grosso — no tamanho
   *  grande dele, o traço fino de 1.75 lia como um fio solto. */
  espessura?: number;
  /** Classes Tailwind que sobrescrevem o tamanho renderizado (ex.: mais
   *  estreito no mobile) sem recalcular os pontos do traço — o SVG usa
   *  `largura`/`altura` só pro viewBox/matemática interna; o navegador
   *  escala o desenho pro tamanho de tela real definido em CSS. */
  classeResponsiva?: string;
}) {
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
    <svg
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      aria-hidden="true"
      className={`overflow-visible ${classeResponsiva ?? ""}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={cor} strokeWidth={espessura} strokeLinecap="round" strokeLinejoin="round" />
      {/* Ponto final acompanha a espessura do traço — num traço grosso, a
          bolinha de raio fixo somia dentro dele. */}
      <circle cx={ux} cy={uy} r={espessura * 1.6} fill="var(--card)" stroke={cor} strokeWidth={espessura} />
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
    /* Largura do TRILHO da barra é fixa e curta (`w-9`), não o container
       inteiro — os pontinhos ficam no tamanho de sempre, só o rastro da
       barra é mais curto. Isso "corta" a ilustração em vez de cortar a
       legenda ao lado ("WUWU lidera"): o container não precisa mais de uma
       largura própria grande (`w-24` já tirava espaço demais do texto no
       tile), o tamanho agora é a soma natural de bolinha+trilho curto. */
    <div className="flex shrink-0 flex-col gap-1">
      {dados.map((item) => {
        const cor = isBrandSlug(item.slug) ? getBrandConfig(item.slug)?.color : undefined;
        return (
          <div key={item.slug} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cor ?? "var(--muted-foreground)" }} />
            <div className="h-1.5 w-9 shrink-0 overflow-hidden rounded-full" style={{ background: "var(--muted)" }}>
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
export function MiniRanking({ itens, largo = false }: {
  itens: { nome: string; valor: number; slug?: string }[];
  /** Só no MOBILE: o card de Estoque Parado ocupa a linha inteira lá (fecha
   *  a grade sozinho), com espaço de sobra entre o número e a lista — o
   *  nome do produto pode aparecer bem mais, em vez de truncar em 2-3
   *  caracteres como nos cards da grade de 2 colunas. No desktop este
   *  card volta pra grade normal de 2/4 colunas, então a largura de lá
   *  não muda — só a do mobile (76px → 150px). */
  largo?: boolean;
}) {
  if (itens.length === 0) return null;
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    /* Largura fixa pelo mesmo motivo de `BarrasMarca` (container sem
       largura própria); `min-w-0` mantém o `truncate` do nome funcionando.
       Mais estreito no celular (grade de 2 colunas espreme o card) e volta
       aos 136px de sempre a partir de lg. 76px, não mais 92px: mesmo
       ajuste do card Marca — a legenda abaixo do número (ex. "itens no
       mínimo", "no topo do período") dividia a linha com este preview e
       cortava; 76px é o mínimo que ainda mostra 2-3 caracteres do nome do
       item antes de truncar, liberando o resto pra legenda. */
    <div className={`flex min-w-0 flex-col gap-1 ${largo ? "w-[150px] lg:w-[136px]" : "w-[76px] lg:w-[136px]"}`}>
      {itens.map((item, indice) => {
        const cor = item.slug && isBrandSlug(item.slug) ? getBrandConfig(item.slug)?.color : undefined;
        return (
          <div key={`${item.nome}-${indice}`} className="flex items-center gap-1 lg:gap-1.5">
            {/* Célula quadrada com centralização real (grid), não texto
                solto numa largura: o "1" é bem mais estreito que "2"/"3"
                nesta fonte e escorregava pro canto, e sem `leading-none`
                ainda subia meio pixel em relação aos vizinhos. */}
            <span
              className="grid h-3 w-3 shrink-0 place-items-center text-[9px] font-bold leading-none tabular-nums"
              style={{ color: "var(--muted-foreground)" }}
            >
              {indice + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-foreground">{item.nome}</span>
            <div className="hidden h-1 w-8 shrink-0 overflow-hidden rounded-full lg:block" style={{ background: "var(--muted)" }}>
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
    return <span className="text-[11px] font-semibold" style={{ color: "var(--muted-foreground)" }}>Estável</span>;
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
export function ChipMarcaTile({ slug, label, height = 13 }: { slug: string; label: string; height?: number }) {
  const cor = isBrandSlug(slug) ? getBrandConfig(slug)?.color : undefined;
  return (
    /* `whitespace-nowrap` + `shrink-0`: num card estreito (grade de 4
       colunas) o nome longo ("ARMARINHOS LIMA") quebrava letra por letra
       na vertical em vez de sair da linha inteiro. */
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
      {/* 13, não 11 — o mesmo valor do chip equivalente no protótipo
          (mosaico-redesign.tsx). Com 11 a logo ficava ~18% menor do que
          deveria dentro do mesmo espaço de chip. */}
      {isBrandSlug(slug) ? (
        <BrandLogo brand={slug} height={height} />
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
