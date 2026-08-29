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

/* ── O escopo que viaja junto com o recorte ──────────────────────────────
 *
 *  O "Ver todos no Estoque" saía só com `?filtro=`, e o recorte sozinho não
 *  abre lista nenhuma: esta tela exige empresa escolhida antes de mostrar
 *  produto (decisão de projeto — sem filtro, sem dado). O resultado é que o
 *  link caía num convite vazio, com o recorte aplicado e invisível.
 *
 *  Quem clica já tinha empresa e canal escolhidos no card de Métricas — o
 *  card nem desenha lista sem isso. Então o link leva os dois junto e a
 *  pessoa reencontra exatamente a lista que estava olhando.
 *
 *  Marca viaja por SLUG, não por id: o link é legível, sobrevive a ser
 *  colado num chat e não espalha identificador interno. A tradução para id
 *  acontece no servidor, contra as marcas que a pessoa realmente enxerga. */
export const CANAIS_ESTOQUE = ["mercadolivre", "shopee", "tiktokshop"] as const;
export type CanalEstoque = (typeof CANAIS_ESTOQUE)[number];

/** Teto de itens lidos da URL. Sem ele, `?marcas=` com mil valores vira mil
 *  comparações e um IN gigante no banco por conta de quem montou o endereço. */
const MAXIMO_ITENS = 24;

function itensDaLista(valor: string | undefined): string[] {
  if (!valor) return [];
  const vistos = new Set<string>();
  for (const parte of valor.split(",")) {
    const limpo = parte.trim().toLowerCase();
    if (limpo && !vistos.has(limpo)) vistos.add(limpo);
    if (vistos.size >= MAXIMO_ITENS) break;
  }
  return [...vistos];
}

/** Os slugs de marca pedidos na URL, sem validar existência — quem valida é
 *  quem tem a lista de marcas visíveis (ver page.tsx). */
export function marcasDaUrl(valor: string | undefined): string[] {
  return itensDaLista(valor);
}

/** Os canais pedidos na URL, já reduzidos aos que existem. */
export function canaisDaUrl(valor: string | undefined): CanalEstoque[] {
  const validos: ReadonlySet<string> = new Set(CANAIS_ESTOQUE);
  return itensDaLista(valor).filter((item): item is CanalEstoque => validos.has(item));
}

/** O endereço que o "Ver todos" do painel de Métricas aponta.
 *
 *  Mora aqui junto de quem lê para que as duas pontas não possam divergir no
 *  nome dos parâmetros — foi assim que o recorte se perdeu da primeira vez. */
export function linkParaEstoque({ filtro, marcas = [], canais = [] }: {
  filtro: Filtro;
  marcas?: string[];
  canais?: string[];
}): string {
  const parametros = new URLSearchParams();
  if (filtro !== "todos") parametros.set("filtro", filtro);
  if (marcas.length > 0) parametros.set("marcas", marcas.slice(0, MAXIMO_ITENS).join(","));
  if (canais.length > 0) parametros.set("canais", canais.slice(0, MAXIMO_ITENS).join(","));
  const busca = parametros.toString();
  return busca ? `/estoque?${busca}` : "/estoque";
}
