import { createClient } from "@supabase/supabase-js";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import {
  appUser, auditLog, backupExport, channelAccount, cliente,
  pedido, pedidoItem, produto, reguaExecucao,
} from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { TABELAS_BACKUP, type ChaveTabelaBackup } from "./tabelas";

export { TABELAS_BACKUP, type ChaveTabelaBackup };

// Cliente admin (service role), não o cliente de sessão baseado em cookies
// (`@/shared/lib/supabase/server`, que depende de `next/headers`). Mesma
// razão de usuarios.service.ts: essa função só roda atrás de
// assertPerfil(admin), e um import estático de next/headers aqui quebra o
// bundle do cliente sempre que uma action "use server" que chama isto é
// importada por um componente "use client" — Turbopack tenta montar o grafo
// do lado do navegador e esbarra em next/headers, mesmo a chamada real
// nunca rodando lá.
function criarSupabaseStorageAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase Admin não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const ExportarTabelaSchema = z.object({
  backupId: z.string().uuid(),
  chave: z.enum(TABELAS_BACKUP.map((t) => t.chave) as [ChaveTabelaBackup, ...ChaveTabelaBackup[]]),
});

async function buscarBackup(ctx: CrudContext, backupId: string) {
  const registro = await ctx.db
    .select()
    .from(backupExport)
    .where(and(eq(backupExport.id, backupId), eq(backupExport.orgId, ctx.orgId)))
    .then((rows) => rows[0]);
  if (!registro) throw new Error("Export de backup não encontrado.");
  return registro;
}

export async function iniciarBackup(ctx: CrudContext) {
  assertPerfil(ctx, ["admin"]);

  const [registro] = await ctx.db
    .insert(backupExport)
    .values({ orgId: ctx.orgId, solicitadoPorId: ctx.userId, status: "processando", dadosParciais: {} })
    .returning();

  return { backupId: registro.id, tabelas: TABELAS_BACKUP };
}

// Cada função busca EXATAMENTE as colunas da tabela, sem join decorativo —
// isto é backup de dado bruto, não relatório. pedido_item é a exceção: não
// tem orgId próprio, então o join com pedido existe só para filtrar por org,
// as colunas devolvidas continuam sendo as de pedido_item.
async function consultarTabela(ctx: CrudContext, chave: ChaveTabelaBackup): Promise<Record<string, unknown>[]> {
  switch (chave) {
    case "clientes":
      return ctx.db.select().from(cliente).where(eq(cliente.orgId, ctx.orgId));
    case "produtos":
      return ctx.db.select().from(produto).where(eq(produto.orgId, ctx.orgId));
    case "pedidos":
      return ctx.db.select().from(pedido).where(eq(pedido.orgId, ctx.orgId));
    case "pedido_itens":
      return ctx.db
        .select({
          id: pedidoItem.id,
          pedidoId: pedidoItem.pedidoId,
          produtoId: pedidoItem.produtoId,
          quantidade: pedidoItem.quantidade,
          precoUnitario: pedidoItem.precoUnitario,
          taxaMarketplace: pedidoItem.taxaMarketplace,
        })
        .from(pedidoItem)
        .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
        .where(eq(pedido.orgId, ctx.orgId));
    case "canais":
      return ctx.db.select().from(channelAccount).where(eq(channelAccount.orgId, ctx.orgId));
    case "usuarios":
      // Sem hash de senha: fica só no Supabase Auth, nunca em app_user.
      return ctx.db
        .select({ id: appUser.id, email: appUser.email, nome: appUser.nome, perfil: appUser.perfil, ativo: appUser.ativo, createdAt: appUser.createdAt })
        .from(appUser)
        .where(eq(appUser.orgId, ctx.orgId));
    case "reguas_execucoes":
      return ctx.db.select().from(reguaExecucao).where(eq(reguaExecucao.orgId, ctx.orgId));
    case "auditoria":
      return ctx.db.select().from(auditLog).where(eq(auditLog.orgId, ctx.orgId));
  }
}

export async function exportarTabelaBackup(ctx: CrudContext, rawInput: unknown) {
  assertPerfil(ctx, ["admin"]);
  const input = ExportarTabelaSchema.parse(rawInput);
  const registro = await buscarBackup(ctx, input.backupId);
  if (registro.status !== "processando") throw new Error("Este backup já foi concluído ou falhou.");

  const linhas = await consultarTabela(ctx, input.chave);
  const dadosParciais = { ...(registro.dadosParciais as Record<string, unknown[]> ?? {}), [input.chave]: linhas };

  await ctx.db.update(backupExport).set({ dadosParciais }).where(eq(backupExport.id, input.backupId));

  return { chave: input.chave, linhas: linhas.length };
}

/** CSV robusto: aspas duplas escapadas, sempre entre aspas (não só quando
 *  "precisa") — evita a armadilha clássica de vírgula/quebra de linha dentro
 *  de um campo virar coluna nova ao abrir no Excel. Colunas vêm do primeiro
 *  registro, em ordem alfabética: determinístico entre execuções, não
 *  depende da ordem que o Postgres devolveu. */
function paraCsv(linhas: Record<string, unknown>[]): string {
  if (linhas.length === 0) return "";
  const colunas = Object.keys(linhas[0]).sort();
  const celula = (valor: unknown): string => {
    if (valor === null || valor === undefined) return "";
    const texto = valor instanceof Date ? valor.toISOString()
      : typeof valor === "object" ? JSON.stringify(valor)
      : String(valor);
    return `"${texto.replaceAll('"', '""')}"`;
  };
  const linhasCsv = linhas.map((linha) => colunas.map((coluna) => celula(linha[coluna])).join(","));
  return [colunas.map(celula).join(","), ...linhasCsv].join("\r\n");
}

export async function finalizarBackup(ctx: CrudContext, rawBackupId: unknown) {
  assertPerfil(ctx, ["admin"]);
  const backupId = z.string().uuid().parse(rawBackupId);
  const registro = await buscarBackup(ctx, backupId);
  if (registro.status !== "processando") throw new Error("Este backup já foi concluído ou falhou.");

  try {
    const dados = registro.dadosParciais as Record<ChaveTabelaBackup, Record<string, unknown>[]> ?? {};
    const resumo = TABELAS_BACKUP.map((t) => ({ chave: t.chave, label: t.label, linhas: (dados[t.chave] ?? []).length }));

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("resumo.json", JSON.stringify({
      orgId: ctx.orgId,
      geradoEm: new Date().toISOString(),
      tabelas: resumo,
    }, null, 2));

    for (const tabela of TABELAS_BACKUP) {
      const linhas = dados[tabela.chave] ?? [];
      zip.file(`json/${tabela.chave}.json`, JSON.stringify(linhas, null, 2));
      zip.file(`csv/${tabela.chave}.csv`, paraCsv(linhas));
    }

    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });

    const supabase = criarSupabaseStorageAdmin();
    // data-hora legível e ordenável (América/São Paulo), sem milissegundos
    // nem "Z" de UTC — o nome do arquivo é a primeira coisa que a pessoa vê
    // na lista de downloads, não precisa de ruído de timestamp técnico.
    const agora = new Date();
    const data = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
    const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(agora).replace(":", "");
    const nomeArquivo = `backup-${data}-${hora}.zip`;
    const storagePath = `${ctx.orgId}/backups/${nomeArquivo}`;

    const { error: uploadError } = await supabase.storage
      .from("documentos")
      .upload(storagePath, bytes, { contentType: "application/zip", upsert: true });
    if (uploadError) throw new Error(`Falha ao armazenar o backup: ${uploadError.message}`);

    const [atualizado] = await ctx.db
      .update(backupExport)
      .set({
        status: "concluido",
        tabelas: resumo,
        dadosParciais: null,
        storagePath,
        tamanhoBytes: bytes.byteLength,
        concluidoEm: new Date(),
      })
      .where(eq(backupExport.id, backupId))
      .returning();

    await ctx.db.insert(auditLog).values({
      orgId: ctx.orgId,
      autorId: ctx.userId,
      autorTipo: "usuario",
      entidade: "backup_export",
      entidadeId: backupId,
      acao: "backup_exportado",
      depois: { tabelas: resumo, tamanhoBytes: bytes.byteLength },
    });

    await emitirEvento({
      tipo: "backup.executado",
      orgId: ctx.orgId,
      entidade: "backup_export",
      entidadeId: backupId,
      payload: { tabelas: resumo, tamanhoBytes: bytes.byteLength },
    });

    return { ...atualizado, urlAssinada: await assinarUrlBackup(storagePath) };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida ao gerar o backup.";
    await ctx.db.update(backupExport).set({ status: "falhou", erro: mensagem, dadosParciais: null }).where(eq(backupExport.id, backupId));
    throw new Error(mensagem);
  }
}

async function assinarUrlBackup(storagePath: string): Promise<string> {
  const supabase = criarSupabaseStorageAdmin();
  const { data, error } = await supabase.storage.from("documentos").createSignedUrl(storagePath, 60 * 60 * 24);
  if (error || !data?.signedUrl) throw new Error("Não foi possível gerar o link de download do backup.");
  return data.signedUrl;
}

export async function listarBackups(ctx: CrudContext) {
  assertPerfil(ctx, ["admin"]);
  return ctx.db
    .select({
      id: backupExport.id,
      status: backupExport.status,
      tabelas: backupExport.tabelas,
      tamanhoBytes: backupExport.tamanhoBytes,
      erro: backupExport.erro,
      createdAt: backupExport.createdAt,
      concluidoEm: backupExport.concluidoEm,
      solicitadoPorNome: appUser.nome,
    })
    .from(backupExport)
    .leftJoin(appUser, eq(appUser.id, backupExport.solicitadoPorId))
    .where(eq(backupExport.orgId, ctx.orgId))
    .orderBy(desc(backupExport.createdAt))
    .limit(15);
}

export async function baixarBackup(ctx: CrudContext, rawBackupId: unknown) {
  assertPerfil(ctx, ["admin"]);
  const backupId = z.string().uuid().parse(rawBackupId);
  const registro = await buscarBackup(ctx, backupId);
  if (!registro.storagePath) throw new Error("Este backup não tem arquivo disponível para download.");
  return { urlAssinada: await assinarUrlBackup(registro.storagePath) };
}
