import { z } from "zod";

export const ProdutoSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  brandId: z.string().uuid(),
  sku: z.string().min(1),
  nome: z.string().min(1),
  custo: z.string().nullable(),
  preco: z.string(),
  estoqueMinimo: z.number().int().min(0),
  ativo: z.boolean(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateProdutoSchema = ProdutoSchema.omit({
  id: true, orgId: true, deletedAt: true, createdAt: true, updatedAt: true,
}).partial({ custo: true, estoqueMinimo: true });

export type Produto = z.infer<typeof ProdutoSchema>;
export type CreateProdutoDTO = z.infer<typeof CreateProdutoSchema>;

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
