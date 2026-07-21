export interface ChaveIdentidade {
  telefone?: string | null;
  email?: string | null;
  cpfCnpj?: string | null;
}

export interface ResultadoDeduplicacao {
  tipo: "exato" | "possivel" | "novo";
  clienteIdExistente?: string;
  score?: number;
}

export function normalizarTelefone(tel: string): string {
  const digits = tel.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length === 11) return `+55${digits}`;
  if (digits.length === 10) return `+55${digits}`;
  return `+${digits}`;
}

export function normalizarEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function calcularScoreDeduplicacao(a: ChaveIdentidade, b: ChaveIdentidade): number {
  let score = 0;
  if (a.cpfCnpj && b.cpfCnpj && a.cpfCnpj === b.cpfCnpj) score += 100;
  if (a.email && b.email && normalizarEmail(a.email) === normalizarEmail(b.email)) score += 80;
  if (a.telefone && b.telefone && a.telefone === b.telefone) score += 80;
  return score;
}

export function classificarDeduplicacao(score: number): ResultadoDeduplicacao["tipo"] {
  if (score >= 80) return "exato";
  if (score >= 40) return "possivel";
  return "novo";
}
