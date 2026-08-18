import {
  pgTable, uuid, text, integer, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { org } from "./org";
import { appUser } from "./users";

/** Um export de backup sob demanda. `dadosParciais` é área de rascunho —
 *  cada tabela processada (actionExportarTabelaBackup) escreve sua fatia
 *  aqui, e ao finalizar (actionFinalizarBackup) o conteúdo vira o ZIP e a
 *  coluna é limpa. É o que dá progresso real por tabela na tela sem
 *  precisar de streaming: cada tabela é uma chamada de servidor de verdade,
 *  que só retorna quando aquela tabela terminou. */
export const backupExport = pgTable("backup_export", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  solicitadoPorId: uuid("solicitado_por_id").references(() => appUser.id),
  status: text("status").notNull().default("processando"), // processando | concluido | falhou
  tabelas: jsonb("tabelas"), // [{ chave, label, linhas }] — resumo final, exibido no histórico
  dadosParciais: jsonb("dados_parciais"), // rascunho: { [chave]: linha[] } — limpo ao concluir
  storagePath: text("storage_path"), // path no bucket "documentos", para re-assinar depois
  tamanhoBytes: integer("tamanho_bytes"),
  erro: text("erro"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  concluidoEm: timestamp("concluido_em", { withTimezone: true }),
}, (t) => [
  index("idx_backup_export_org").on(t.orgId),
  index("idx_backup_export_criado").on(t.createdAt),
]);
