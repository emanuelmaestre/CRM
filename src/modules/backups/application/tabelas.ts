/** Lista de tabelas exportadas no backup — separado de backups.service.ts
 *  porque este arquivo é importado direto pelo componente de cliente
 *  (BackupSection.tsx) para montar a lista de progresso. backups.service.ts
 *  carrega Supabase/`next/headers` (server-only); importar de lá travaria o
 *  bundle do cliente. */
export const TABELAS_BACKUP = [
  { chave: "clientes", label: "Clientes" },
  { chave: "produtos", label: "Produtos" },
  { chave: "pedidos", label: "Pedidos" },
  { chave: "pedido_itens", label: "Itens de pedido" },
  { chave: "canais", label: "Contas de canal" },
  { chave: "usuarios", label: "Usuários" },
  { chave: "reguas_execucoes", label: "Histórico de réguas" },
  { chave: "auditoria", label: "Auditoria" },
] as const;

export type ChaveTabelaBackup = (typeof TABELAS_BACKUP)[number]["chave"];
