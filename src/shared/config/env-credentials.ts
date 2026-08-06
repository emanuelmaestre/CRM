const PLACEHOLDER_PATTERN = /^(your-|replace-|changeme|placeholder)/i;

/**
 * Uma credencial só conta como configurada quando não é um dos placeholders que
 * o .env.example distribui. Sem esse filtro, `your-ml-seller-id-karzi` passa por
 * valor real e o app compara contra ele — foi o que fazia o card do Mercado
 * Livre acusar "token é de outra conta" numa conta perfeitamente válida.
 */
export function isCredencialConfigurada(name: string): boolean {
  const value = process.env[name]?.trim();
  return Boolean(value && !PLACEHOLDER_PATTERN.test(value));
}

/** Valor da credencial, ou null quando ausente ou ainda no placeholder. */
export function credencialConfigurada(name: string): string | null {
  return isCredencialConfigurada(name) ? process.env[name]!.trim() : null;
}
