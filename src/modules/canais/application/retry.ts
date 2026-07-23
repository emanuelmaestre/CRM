export interface RetryOptions {
  tentativas?: number;
  atrasoInicialMs?: number;
  esperar?: (ms: number) => Promise<void>;
}

export async function executarComRetry<T>(
  operacao: (tentativa: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const tentativas = options.tentativas ?? 3;
  const atrasoInicialMs = options.atrasoInicialMs ?? 200;
  const esperar = options.esperar ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      return await operacao(tentativa);
    } catch (error) {
      ultimoErro = error;
      if (tentativa < tentativas) await esperar(atrasoInicialMs * 2 ** (tentativa - 1));
    }
  }

  throw ultimoErro;
}
