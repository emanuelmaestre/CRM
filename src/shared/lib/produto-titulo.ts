// Titulos de produto vem crus do Mercado Livre, sem campos estruturados —
// isso tenta separar produto/tamanho/compatibilidade/cor so para exibicao,
// sem nunca alterar o nome original salvo. Quando a confianca e baixa
// (titulo nao bate com o padrao reconhecido), devolve tudo como "produto"
// e nao separa nada — melhor mostrar inteiro do que separar errado.

const CORES: Record<string, string> = {
  "preto": "#1a1a1a", "branco": "#f5f5f5", "cinza": "#9e9e9e", "grafite": "#4b5563",
  "azul": "#2563eb", "vermelho": "#dc2626", "verde": "#16a34a", "amarelo": "#eab308",
  "rosa": "#ec4899", "roxo": "#7c3aed", "marrom": "#78350f", "bege": "#d8c3a5",
  "dourado": "#b8860b", "prata": "#c0c0c0", "laranja": "#f97316", "lilas": "#c4b5fd",
  "vinho": "#7f1d1d", "nude": "#e3bfa3", "turquesa": "#14b8a6", "creme": "#f0e6d2",
  "azul-marinho": "#1e3a8a", "chumbo": "#374151",
};

const TAMANHO_REGEX = /\bTam\.?\s*([A-Za-z0-9]{1,4})\b/i;
const DIACRITICOS_REGEX = /[̀-ͯ]/g;

// Ajustes de confianca da separacao — tudo num so lugar pra poder
// recalibrar depois sem mexer no algoritmo:
// - minPalavrasProduto: abaixo disso, a separacao provavelmente comeu
//   parte do nome do produto junto com a cor/tamanho — descarta o resultado.
// - modoFallback: "manter-original" mostra o titulo inteiro quando a
//   confianca e baixa (padrao atual); "separar-mesmo-assim" forca a
//   separacao mesmo quando a heuristica tem pouca certeza.
export const CONFIG_TITULO_PRODUTO = {
  minPalavrasProduto: 2,
  modoFallback: "manter-original" as "manter-original" | "separar-mesmo-assim",
};

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(DIACRITICOS_REGEX, "").toLowerCase();
}

function limparPontuacao(palavra: string): string {
  return palavra.replace(/^[.,;:\-()]+|[.,;:\-()]+$/g, "");
}

export type TituloProdutoAnalisado =
  | { separado: false; produto: string }
  | { separado: true; produto: string; tamanho?: string; compatibilidade?: string[]; cor: string; corHex: string };

export function analisarTituloProduto(nomeOriginal: string): TituloProdutoAnalisado {
  const nome = nomeOriginal.trim();
  const palavras = nome.split(/\s+/).filter(Boolean);
  if (palavras.length < 3) return { separado: false, produto: nomeOriginal };

  const ultimaPalavra = limparPontuacao(palavras[palavras.length - 1]);
  const corHex = CORES[normalizar(ultimaPalavra)];
  // Sem uma cor reconhecida no fim do titulo nao ha ancora nenhuma pra
  // separar o resto — aqui o modoFallback nao se aplica, nao tem o que separar.
  if (!corHex) return { separado: false, produto: nomeOriginal };

  let restante = palavras.slice(0, -1).join(" ").trim();
  restante = restante.replace(/[,]+$/, "").trim();

  const tamanhoMatch = restante.match(TAMANHO_REGEX);
  let produto = restante;
  let tamanho: string | undefined;
  let compatibilidade: string[] | undefined;

  if (tamanhoMatch?.index !== undefined) {
    produto = restante.slice(0, tamanhoMatch.index).trim().replace(/[,]+$/, "");
    tamanho = tamanhoMatch[1].toUpperCase();
    const resto = restante.slice(tamanhoMatch.index + tamanhoMatch[0].length).trim();
    if (resto) compatibilidade = resto.split(/\s+/).filter(Boolean);
  }

  const confiancaBaixa = produto.split(/\s+/).filter(Boolean).length < CONFIG_TITULO_PRODUTO.minPalavrasProduto;
  if (confiancaBaixa && CONFIG_TITULO_PRODUTO.modoFallback === "manter-original") {
    return { separado: false, produto: nomeOriginal };
  }

  return {
    separado: true,
    produto: produto || nomeOriginal,
    tamanho,
    compatibilidade,
    cor: ultimaPalavra.charAt(0).toUpperCase() + ultimaPalavra.slice(1).toLowerCase(),
    corHex,
  };
}
