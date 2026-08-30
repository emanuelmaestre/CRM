import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const mocks = vi.hoisted(() => ({
  banco: {} as Record<string, unknown>, registrar: vi.fn(), resolver: vi.fn(),
  persistir: vi.fn(), despachar: vi.fn(), pendentes: vi.fn(),
}));
vi.mock("@/shared/lib/db", () => ({ db: mocks.banco }));
vi.mock("@/modules/vendas/application/registro-pedido-ignorado", () => ({ registrarPedidoIgnorado: mocks.registrar, marcarPedidoIgnoradoResolvido: mocks.resolver, classificarCausa: () => "payload_invalido" }));
vi.mock("@/shared/events", () => ({ persistirEvento: mocks.persistir, despacharEvento: mocks.despachar, despacharEventosPendentes: mocks.pendentes }));
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import type { PedidoNormalizado } from "@/modules/canais/domain/ports";

const org = "11111111-1111-4111-8111-111111111111";
const marca = "22222222-2222-4222-8222-222222222222";
const conta = "33333333-3333-4333-8333-333333333333";
const valores: Array<{ tabela: string; dados: unknown }> = [];
let contaValida = true;

function consulta<T>(resultado: T) {
  const q = {
    where: () => q, innerJoin: () => q,
    then: (ok: (v: T) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, erro),
  };
  return q;
}

beforeEach(() => {
  vi.clearAllMocks(); valores.length = 0; contaValida = true;
  mocks.persistir.mockResolvedValue({ id: "evento" });
  Object.assign(mocks.banco, {
    select: () => ({ from: (tabela: Parameters<typeof getTableName>[0]) => {
      const nome = getTableName(tabela);
      const rows = nome === "channel_account" ? contaValida ? [{ id: conta }] : []
        : nome === "produto" ? [{ id: "produto1", sku: "SKU1" }]
        : nome === "cliente_identidade" ? [{ clienteId: "cliente1" }] : [];
      return consulta(rows);
    } }),
    transaction: async (fn: (tx: unknown) => unknown) => fn(mocks.banco),
    execute: vi.fn().mockResolvedValue([]),
    insert: (tabela: Parameters<typeof getTableName>[0]) => ({ values: (dados: unknown) => {
      valores.push({ tabela: getTableName(tabela), dados });
      return { ...consulta([]), returning: () => Promise.resolve([{ id: "pedido1" }]) };
    } }),
  });
});

const normalizado: PedidoNormalizado = {
  providerOrderId: "P1", canal: "mercadolivre", clienteExternalId: "C1", clienteNome: "Comprador",
  criadoEm: new Date("2026-07-01T03:00:00Z"), total: "50.00", status: "paid",
  itens: [{ skuExterno: "SKU1", quantidade: 2, precoUnitario: "25.00" }],
};

describe("recuperação sem efeitos de venda nova", () => {
  it("grava pedido e itens históricos sem eventos de venda, campanha ou outbox", async () => {
    await expect(ingerirPedido(org, marca, conta, normalizado, { historico: true })).resolves.toEqual({ pedidoId: "pedido1", novo: true });
    expect(valores.find((v) => v.tabela === "pedido")?.dados).toMatchObject({ origemIngestao: "historico", createdAt: normalizado.criadoEm, total: "50.00" });
    expect(valores.find((v) => v.tabela === "pedido")?.dados).toMatchObject({ importLoteId: "pedido1", importedAt: expect.any(Date) });
    expect(valores.find((v) => v.tabela === "import_lote")?.dados).toMatchObject({ orgId: org, brandId: marca, channelAccountId: conta, tipo: "reconciliacao_api", aceitos: 1 });
    expect(valores.find((v) => v.tabela === "pedido_item")?.dados).toEqual([expect.objectContaining({ quantidade: 2 })]);
    expect(mocks.persistir).not.toHaveBeenCalled();
    expect(mocks.despachar).not.toHaveBeenCalled();
    expect(mocks.pendentes).not.toHaveBeenCalled();
    expect(mocks.resolver).toHaveBeenCalledWith(org, conta, "P1");
  });
  it("mantém os eventos para uma venda nova normal", async () => {
    await ingerirPedido(org, marca, conta, normalizado);
    expect(mocks.persistir).toHaveBeenCalledWith(expect.objectContaining({ tipo: "pedido.recebido" }), mocks.banco);
    expect(mocks.persistir).toHaveBeenCalledWith(expect.objectContaining({ tipo: "pedido.pago" }), mocks.banco);
    expect(mocks.despachar).toHaveBeenCalledTimes(2);
  });
  it("preserva payload inválido na fila antes de devolver o erro", async () => {
    await expect(ingerirPedido(org, marca, conta, { ...normalizado, total: "NaN" })).rejects.toThrow();
    expect(mocks.registrar).toHaveBeenCalledWith(expect.objectContaining({ orgId: org, channelAccountId: conta, providerOrderId: "P1", payload: expect.objectContaining({ total: "NaN" }) }));
    expect(valores).toHaveLength(0);
  });
  it("não registra payload de conta fora do escopo", async () => {
    contaValida = false;
    await expect(ingerirPedido(org, marca, conta, normalizado)).rejects.toThrow(/Conta de canal/);
    expect(valores).toHaveLength(0);
    expect(mocks.registrar).not.toHaveBeenCalled();
  });
});
