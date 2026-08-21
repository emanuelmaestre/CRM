/** Normalizações de textos externos antes de exibi-los na interface.
 * Identificadores técnicos e dados cadastrados pelo usuário não passam por
 * estas funções; elas existem para enumerações e mensagens do canal. */

function chaveNormalizada(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

const NIVEIS_QUALIDADE_PT_BR: Record<string, string> = {
  professional: "Profissional",
  profesional: "Profissional",
  profissional: "Profissional",
  advanced: "Avançado",
  avanzado: "Avançado",
  avancado: "Avançado",
  excellent: "Excelente",
  excelente: "Excelente",
  good: "Bom",
  bueno: "Bom",
  bom: "Bom",
  standard: "Padrão",
  estandar: "Padrão",
  padrao: "Padrão",
  basic: "Básico",
  basico: "Básico",
  basica: "Básico",
  regular: "Regular",
  low: "Baixo",
  bajo: "Baixo",
  baja: "Baixo",
  baixo: "Baixo",
  poor: "Baixo",
  malo: "Baixo",
  mala: "Baixo",
};

export function traduzirNivelQualidade(nivel: string | null | undefined): string {
  if (!nivel) return "Indisponível";
  return NIVEIS_QUALIDADE_PT_BR[chaveNormalizada(nivel)] ?? "Nível informado pelo Mercado Livre";
}

const MARCADORES_ESTRANGEIROS = /\b(?:the|your|you|with|without|from|shipping|listing|offer|professional|quality|available|availability|el|los|las|del|profesional|calidad|ofrece|publicacion|disponibilidad)\b/i;

/** Mantém instruções já recebidas em português e evita que uma mensagem nova
 * da API apareça em espanhol ou inglês até ganhar uma tradução específica. */
export function traduzirPendenciaPublicacao(texto: string): string {
  const normalizado = chaveNormalizada(texto);
  if (MARCADORES_ESTRANGEIROS.test(normalizado)) {
    return "O Mercado Livre identificou uma melhoria pendente neste anúncio. Abra a publicação no canal para consultar os detalhes.";
  }
  return texto;
}
