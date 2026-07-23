import { inngest } from "@/shared/lib/inngest/client";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import type { PedidoNormalizado } from "@/modules/canais/domain/ports";

export const A1_ingestaoPedidos = inngest.createFunction(
  {
    id: "A1-ingestao-pedidos",
    name: "A1 — Ingestão e normalização de pedido por canal",
    idempotency: "event.data.orgId + '-' + event.data.channelAccountId + '-' + event.data.pedido.providerOrderId",
    triggers: [{ event: "canal/pedido.recebido" }],
  },
  async ({ event, step }) => {
    const { orgId, brandId, channelAccountId, pedido } = event.data as {
      orgId: string;
      brandId: string;
      channelAccountId: string;
      pedido: PedidoNormalizado;
    };

    const resultado = await step.run("ingerir-pedido", () =>
      ingerirPedido(orgId, brandId, channelAccountId, pedido)
    );

    return resultado;
  }
);
