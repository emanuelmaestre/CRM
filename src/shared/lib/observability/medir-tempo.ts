import "server-only";

/* Cronômetro de servidor para achar onde o tempo de uma tela realmente vai.

   A investigação de lentidão bateu num limite: banco, rede, autenticação e
   tamanho de bundle foram todos medidos e estão rápidos, mas as telas ainda
   demoram para quem está logado — e esse caminho não dá para reproduzir de
   fora, porque exige sessão. Isto registra a duração de cada etapa cara no
   log da Vercel, para a próxima navegação real responder a pergunta em vez
   de mais suposição.

   Escreve uma linha por chamada, sempre com o mesmo prefixo, para dar
   `vercel logs | grep [tempo]`. O retorno é o valor original: envolver uma
   chamada com isto não muda o comportamento dela. */
export async function medirTempo<T>(rotulo: string, executar: () => Promise<T>): Promise<T> {
  const inicio = performance.now();
  try {
    return await executar();
  } finally {
    const ms = Math.round(performance.now() - inicio);
    console.log(`[tempo] ${rotulo}: ${ms}ms`);
  }
}
