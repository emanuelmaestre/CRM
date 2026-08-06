import { z } from "zod";

const MoneySchema = z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/, "Valor monetário inválido")
  .transform((value) => value.replace(",", "."));

export const ProdutoSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  brandId: z.string().uuid(),
  sku: z.string().trim().min(1).max(80).transform((value) => value.toUpperCase()),
  nome: z.string().trim().min(2).max(160),
  custo: MoneySchema.nullable(),
  preco: MoneySchema.refine((value) => Number(value) > 0, "Preço deve ser maior que zero"),
  estoqueMinimo: z.number().int().min(0),
  ativo: z.boolean(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateProdutoSchema = ProdutoSchema.omit({
  id: true, orgId: true, deletedAt: true, createdAt: true, updatedAt: true,
}).partial({ custo: true, estoqueMinimo: true });

// SKU e brandId ficam de fora: trocar o identificador externo ou a marca de
// um produto já mapeado em canais quebraria os vínculos de produto_canal.
export const UpdateProdutoSchema = ProdutoSchema.pick({
  nome: true, custo: true, preco: true, estoqueMinimo: true,
}).partial({ custo: true, estoqueMinimo: true });

export type Produto = z.infer<typeof ProdutoSchema>;
export type CreateProdutoDTO = z.infer<typeof CreateProdutoSchema>;
export type UpdateProdutoDTO = z.infer<typeof UpdateProdutoSchema>;

export type MovimentoTipo = "entrada" | "saida" | "ajuste" | "reserva" | "estorno";

export function validarMovimento(saldoAtual: number, tipo: MovimentoTipo, quantidade: number): void {
  if (quantidade <= 0) throw new Error("Quantidade deve ser maior que zero.");
  if ((tipo === "saida" || tipo === "reserva") && saldoAtual < quantidade) {
    throw new Error(`Saldo insuficiente. Saldo atual: ${saldoAtual}, solicitado: ${quantidade}`);
  }
}

export function calcularNovoSaldo(saldoAtual: number, tipo: MovimentoTipo, quantidade: number): number {
  switch (tipo) {
    case "entrada":
    case "estorno": return saldoAtual + quantidade;
    case "saida":
    case "reserva": return saldoAtual - quantidade;
    case "ajuste": return quantidade;
  }
}
