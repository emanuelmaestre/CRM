import type { PedidoNormalizado } from "../domain/ports";
import { registrarPedidoIgnorado } from "@/modules/vendas/application/registro-pedido-ignorado";

/** Preserva o ID mesmo quando a API falha antes de devolver o detalhe. */
export async function buscarPedidoComRegistro(
  conta: { orgId: string; brandId: string; channelAccountId: string },
  providerOrderId: string,
  buscar: () => Promise<PedidoNormalizado>,
): Promise<PedidoNormalizado> {
  try {
    return await buscar();
  } catch (error) {
    await registrarPedidoIgnorado({
      ...conta, providerOrderId, causa: "desconhecida", skus: [], payload: null,
      motivo: `Falha ao obter o detalhe no canal: ${error instanceof Error ? error.message : String(error)}`,
    });
    throw error;
  }
}
