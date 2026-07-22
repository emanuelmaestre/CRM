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

export function normalizarCpfCnpj(documento: string): string {
  return documento.replace(/\D/g, "");
}

function calcularDigito(documento: string, pesos: number[]): number {
  const soma = pesos.reduce((total, peso, indice) => total + Number(documento[indice]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCpfCnpj(documento: string): boolean {
  const digits = normalizarCpfCnpj(documento);
  if (/^(\d)\1+$/.test(digits)) return false;

  if (digits.length === 11) {
    const primeiro = calcularDigito(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const segundo = calcularDigito(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digits.endsWith(`${primeiro}${segundo}`);
  }

  if (digits.length === 14) {
    const primeiro = calcularDigito(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const segundo = calcularDigito(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digits.endsWith(`${primeiro}${segundo}`);
  }

  return false;
}

export function calcularScoreDeduplicacao(a: ChaveIdentidade, b: ChaveIdentidade): number {
  let score = 0;
  if (
    a.cpfCnpj && b.cpfCnpj
    && normalizarCpfCnpj(a.cpfCnpj) === normalizarCpfCnpj(b.cpfCnpj)
  ) score += 100;
  if (a.email && b.email && normalizarEmail(a.email) === normalizarEmail(b.email)) score += 80;
  if (a.telefone && b.telefone && a.telefone === b.telefone) score += 80;
  return score;
}

export function classificarDeduplicacao(score: number): ResultadoDeduplicacao["tipo"] {
  if (score >= 80) return "exato";
  if (score >= 40) return "possivel";
  return "novo";
}
