import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/shared/lib/db";
import { importLote } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { criarCliente } from "@/modules/clientes/application/clientes.service";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";

const LinhaClienteSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email().optional(),
  telefone: z.string().optional(),
  cpf_cnpj: z.string().optional(),
  data_nascimento: z.iso.date().optional(),
});

export type LinhaCliente = z.infer<typeof LinhaClienteSchema>;

export interface ResultadoImportacao {
  loteId: string;
  totalLinhas: number;
  aceitos: number;
  rejeitados: number;
  erros: { linha: number; motivo: string }[];
  preview: boolean;
}

export async function processarImportacaoClientes(
  ctx: CrudContext,
  linhas: unknown[],
  opts: { preview?: boolean } = {}
): Promise<ResultadoImportacao> {
  assertPerfil(ctx, ["admin", "gestor"]);

  const erros: { linha: number; motivo: string }[] = [];
  const validos: LinhaCliente[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const resultado = LinhaClienteSchema.safeParse(linhas[i]);
    if (resultado.success) {
      validos.push(resultado.data);
    } else {
      erros.push({
        linha: i + 1,
        motivo: resultado.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      });
    }
  }

  if (opts.preview) {
    return {
      loteId: "preview",
      totalLinhas: linhas.length,
      aceitos: validos.length,
      rejeitados: erros.length,
      erros,
      preview: true,
    };
  }

  const [lote] = await db.insert(importLote).values({
    orgId: ctx.orgId,
    tipo: "clientes",
    nomeArquivo: "importacao",
    status: "processando",
    totalLinhas: linhas.length,
  }).returning();

  let aceitos = 0;
  const errosImportacao: { linha: number; motivo: string }[] = [...erros];

  for (let i = 0; i < validos.length; i++) {
    try {
      await criarCliente(ctx, {
        nome: validos[i].nome,
        email: validos[i].email,
        telefone: validos[i].telefone,
        cpfCnpj: validos[i].cpf_cnpj,
        dataNascimento: validos[i].data_nascimento,
      });
      aceitos++;
    } catch (err) {
      errosImportacao.push({ linha: i + 1, motivo: String(err) });
    }
  }

  const rejeitados = linhas.length - aceitos;

  await db.update(importLote)
    .set({
      status: rejeitados > 0 ? "com_erros" : "concluido",
      aceitos,
      rejeitados,
      erros: errosImportacao,
      finalizadoEm: new Date(),
    })
    .where(eq(importLote.id, lote.id));

  await emitirEvento({
    tipo: rejeitados > 0 ? "importacao.com_erros" : "importacao.concluida",
    orgId: ctx.orgId,
    entidade: "import_lote",
    entidadeId: lote.id,
    payload: { aceitos, rejeitados, total: linhas.length },
  });

  return {
    loteId: lote.id,
    totalLinhas: linhas.length,
    aceitos,
    rejeitados,
    erros: errosImportacao,
    preview: false,
  };
}
