/** O recorte da lista de Estoque, num módulo que os dois lados podem importar.
 *
 *  Isto morava dentro de `estoque-lista.tsx`, que é `"use client"`. A página é
 *  Server Component e chamava `filtroDaUrl(filtro)` de lá: no build passa —
 *  `tsc` e `next build` não reclamam —, mas em produção toda visita a
 *  /estoque respondia com o erro
 *
 *    Attempted to call filtroDaUrl() from the server but filtroDaUrl is on
 *    the client.
 *
 *  Export de módulo cliente não é a função: é uma referência que o servidor só
 *  sabe renderizar como componente ou repassar como prop. Função de verdade,
 *  chamável dos dois lados, precisa morar fora do `"use client"` — que é o que
 *  este arquivo é. Ele não importa nada de React nem do banco de propósito. */
export type Filtro =
  | "todos"
  | "abaixo_minimo"
  | "sem_estoque"
  | "parados"
  | "pausados"
  | "sem_minimo";

const FILTROS_VALIDOS: ReadonlySet<string> = new Set<Filtro>([
  "todos", "abaixo_minimo", "sem_estoque", "parados", "pausados", "sem_minimo",
]);

/** O recorte pedido na URL, ou "todos". A URL é digitável — e o `?filtro=` sai
 *  em link do painel de Métricas, atravessa o login e volta —, então valor
 *  desconhecido não pode virar um filtro que a tela não sabe aplicar. */
export function filtroDaUrl(valor: string | undefined): Filtro {
  return FILTROS_VALIDOS.has(valor ?? "") ? valor as Filtro : "todos";
}
