/**
 * Gera as variantes icone-only das logos de canal em public/logos/.
 *
 * Por que este script existe: os arquivos originais sao wordmarks (icone + nome
 * escrito). As abas de canal precisam so do icone. Recortar por largura no CSS
 * e fragil, entao aqui o recorte fica gravado no proprio viewBox do SVG.
 *
 * As caixas abaixo foram medidas rasterizando cada SVG em canvas e lendo o alfa
 * dos pixels coluna por coluna (nao sao estimativas visuais). O `gapAntesDoTexto`
 * registra a folga horizontal em branco que separa o icone do wordmark.
 *
 * Uso: node scripts/gerar-logos-icone.mjs [--check]
 *   --check  nao escreve nada; falha se algum arquivo gerado estiver defasado.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "public", "logos");

/** Caixa de tinta do icone, em unidades do viewBox original. */
const ICONES = [
  {
    arquivo: "mercadolivre.svg",
    caixa: { x: 19.1, y: 188.0, largura: 315.9, altura: 218.5 },
    gapAntesDoTexto: [335.7, 383.0],
    // Historico: o arquivo original declarava width=2500 height=103 (proporcao
    // 24.27) contra um viewBox de 3.66. O navegador usa os atributos, entao o
    // desenho encolhia para caber na altura e sobrava margem vazia dos dois
    // lados -- era isso que fazia a logo do ML aparecer minuscula. A origem foi
    // corrigida para 2500x683; este script escreve width/height a partir da
    // caixa recortada, portanto nao depende dos atributos da origem.
  },
  {
    arquivo: "shopee.svg",
    // A altura para em 301.3, e nao em 318.6: os 17 pontos finais eram a descida
    // das letras do wordmark, que fica fora do recorte.
    caixa: { x: 0, y: 0, largura: 266.5, altura: 301.3 },
    gapAntesDoTexto: [266.7, 321.1],
  },
  {
    arquivo: "tiktok.svg",
    caixa: { x: 0, y: 0, largura: 69.6, altura: 79.8 },
    gapAntesDoTexto: [69.6, 88.1],
  },
  {
    // Nao tem wordmark: o recorte apenas remove o padding vazio do viewBox,
    // que tambem deixava a proporcao declarada incoerente.
    arquivo: "whatsapp.svg",
    caixa: { x: 0, y: 73.0, largura: 1171.6, altura: 985.2 },
    gapAntesDoTexto: null,
  },
];

const r = (n) => Number(n.toFixed(2));

function gerar({ arquivo, caixa }) {
  const origem = join(DIR, arquivo);
  if (!existsSync(origem)) throw new Error(`Logo de origem ausente: ${arquivo}`);

  const original = readFileSync(origem, "utf8");
  const viewBox = `${r(caixa.x)} ${r(caixa.y)} ${r(caixa.largura)} ${r(caixa.altura)}`;

  let saida = original
    .replace(/\sviewBox="[^"]*"/, "")
    .replace(/\swidth="[^"]*"/, "")
    .replace(/\sheight="[^"]*"/, "")
    .replace(
      /<svg/,
      `<svg viewBox="${viewBox}" width="${r(caixa.largura)}" height="${r(caixa.altura)}"`,
    );

  if (!saida.includes("<!--")) {
    saida = saida.replace(
      /(<svg[^>]*>)/,
      `$1<!-- Gerado por scripts/gerar-logos-icone.mjs a partir de ${arquivo}. Nao editar a mao. -->`,
    );
  }
  return saida;
}

const apenasVerificar = process.argv.includes("--check");
let defasados = 0;

for (const spec of ICONES) {
  const destino = join(DIR, spec.arquivo.replace(/\.svg$/, "-icon.svg"));
  const conteudo = gerar(spec);
  const atual = existsSync(destino) ? readFileSync(destino, "utf8") : null;
  const aspect = (spec.caixa.largura / spec.caixa.altura).toFixed(4);

  if (apenasVerificar) {
    if (atual !== conteudo) {
      console.error(`defasado: ${destino}`);
      defasados += 1;
    }
    continue;
  }

  writeFileSync(destino, conteudo, "utf8");
  console.log(`${spec.arquivo.padEnd(20)} -> ${destino.split(/[\\/]/).pop().padEnd(26)} aspect ${aspect}`);
}

if (apenasVerificar) {
  if (defasados > 0) {
    console.error(`\n${defasados} arquivo(s) de icone defasado(s). Rode: node scripts/gerar-logos-icone.mjs`);
    process.exit(1);
  }
  console.log("Todos os icones de canal estao atualizados.");
}
