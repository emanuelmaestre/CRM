/** Catálogo de módulos que podem ser mostrados/escondidos por usuário.
 *  Os ids batem 1:1 com os ids de src/config/navigation.json — é o mesmo
 *  vocabulário usado pra montar o menu e pra decidir o que cada pessoa vê. */
export const MODULOS_CATALOGO = [
  { id: "metricas", label: "Métricas", icon: "LayoutDashboard" },
  { id: "clientes", label: "Clientes", icon: "Users" },
  { id: "inbox", label: "Mensagens", icon: "MessageSquare" },
  { id: "vendas", label: "Vendas", icon: "ShoppingCart" },
  { id: "estoque", label: "Estoque", icon: "Package" },
  { id: "anuncios", label: "Marketing", icon: "Megaphone" },
  { id: "configuracoes", label: "Configurações", icon: "Settings" },
] as const;

export type ModuloId = (typeof MODULOS_CATALOGO)[number]["id"];

export const MODULOS_TODOS: ModuloId[] = MODULOS_CATALOGO.map((m) => m.id);

export function isModuloId(value: unknown): value is ModuloId {
  return typeof value === "string" && (MODULOS_TODOS as string[]).includes(value);
}

/** Normaliza o que vier do banco (jsonb solto) para uma lista de ids válidos.
 *  Um módulo removido do catálogo no futuro não vira erro — só desaparece. */
export function normalizarModulos(value: unknown): ModuloId[] {
  if (!Array.isArray(value)) return [...MODULOS_TODOS];
  return value.filter(isModuloId);
}

export function moduloDaRota(pathname: string): ModuloId | null {
  const direto = MODULOS_CATALOGO.find(
    (m) => pathname === `/${m.id}` || pathname.startsWith(`/${m.id}/`),
  );
  return direto?.id ?? null;
}
