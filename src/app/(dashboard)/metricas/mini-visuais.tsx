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

/** Colunas + linha de tendência por cima — não é o sparkline de linha fina
 *  de sempre (esse virava um fio quase reto quando o período só tinha 2
 *  pontos, ver a versão anterior no histórico). Colunas leem como "gráfico
 *  estatístico" no primeiro olhar, mesmo com poucos pontos — cada uma é o
 *  valor real do dia, sem inventar oscilação que o dado não tem. A cor de
 *  cada coluna reage à direção real dela (sobe/desce/estável frente à
 *  anterior), não só à tendência geral — é aí que aparece o "vermelho,
 *  verde e outras cores" pra situações diferentes dentro da mesma série,
 *  em vez de uma cor só pintando tudo. */
export function ColunasTendencia({ dados, cor, largura = 96, altura = 36, classeResponsiva }: {
  dados: number[];
  /** Cor "oficial" da tendência do período inteiro (o `cor` de sempre,
   *  verde/vermelho/neutro) — usada na linha por cima e como cor única
   *  quando só há 2 pontos (não dá pra falar em "coluna que caiu" com um
   *  segmento só). */
  cor: string;
  largura?: number;
  altura?: number;
  classeResponsiva?: string;
}) {
  if (dados.length < 2) return null;
  const max = Math.max(...dados);
  const min = Math.min(...dados);
  const margemV = 7;
  const margemH = 3;
  const areaUtil = largura - margemH * 2;
  const n = dados.length;
  const colunaLargura = Math.min((areaUtil / n) * 0.62, 14);
  const gap = areaUtil / n;
  const xCentro = (i: number) => margemH + gap * i + gap / 2;
  const yValor = (v: number) => altura - ((v - min) / (max - min || 1)) * (altura - margemV * 2) - margemV;

  const subiu = "var(--success)";
  const desceu = "var(--destructive)";
  const estavel = "var(--muted-foreground)";
  // Só 2 pontos: é a mesma comparação que já vira o "+9%" ao lado do
  // número, então usa a cor oficial da tendência em vez de recalcular uma
  // leitura própria pros 2 segmentos.
  const corDaColuna = (i: number) => {
    if (n <= 2) return cor;
    if (i === 0) return estavel;
    const delta = dados[i] - dados[i - 1];
    if (Math.abs(delta) < (max - min || 1) * 0.02) return estavel;
    return delta > 0 ? subiu : desceu;
  };

  const topos = dados.map((v, i) => [xCentro(i), yValor(v)] as const);
  const linhaTendencia = topos.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [ux, uy] = topos[topos.length - 1];

  return (
    <svg
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      aria-hidden="true"
      className={`overflow-visible ${classeResponsiva ?? ""}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {dados.map((v, i) => {
        const x = xCentro(i) - colunaLargura / 2;
        const y = yValor(v);
        const corColuna = corDaColuna(i);
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={colunaLargura}
            height={Math.max(altura - margemV - y, 2)}
            rx={colunaLargura / 2.6}
            fill={corColuna}
            opacity={i === n - 1 ? 0.9 : 0.28}
          />
        );
      })}
      {/* Linha tracejada conectando o topo de cada coluna — o "combo chart"
          que lê como estatística de verdade (colunas = valor do dia, linha
          = tendência), e o traço tracejado (não sólido) evita competir
          visualmente com as próprias colunas por baixo. */}
      <path d={linhaTendencia} fill="none" stroke={cor} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1.5 3.5" opacity={0.9} />
      <circle cx={ux} cy={uy} r={3.4} fill="var(--card)" stroke={cor} strokeWidth={2} />
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
