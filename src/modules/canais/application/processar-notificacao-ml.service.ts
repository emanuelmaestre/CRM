import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { buscarPedidoComRegistro } from "@/modules/canais/application/recepcao-pedido.service";
import { registrarVerificacaoCanal } from "@/modules/canais/application/verificacao-canal.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { criarMLProvider, obterTokenMercadoLivre } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { iniciarSyncTrace } from "@/shared/lib/observability/sync-trace";

export interface NotificacaoPedidoMercadoLivre {
  notificationId: string;
  orderId: string;
  sellerId: string;
  resource: string;
  sent?: string;
  received?: string;
  attempts?: number;
}

/** Processamento pesado do webhook, executado pelo Inngest com retentativas. */
export async function processarNotificacaoPedidoMercadoLivre(
  notificacao: NotificacaoPedidoMercadoLivre,
): Promise<{ pedidoId: string; novo: boolean }> {
  const trace = iniciarSyncTrace("ml-webhook-worker", {
    notificationId: notificacao.notificationId,
    orderId: notificacao.orderId,
    resource: notificacao.resource,
    sellerId: notificacao.sellerId,
  });

  try {
    const conta = await trace.etapa("resolver_conta_e_token", async () => {
      const resolvida = await resolverContaWebhookMarketplace("mercadolivre", notificacao.sellerId);
      const token = await obterTokenMercadoLivre(resolvida.brandSlug);
      return { ...resolvida, accessToken: token.accessToken, refreshToken: token.refreshToken };
    });

    const provider = await criarMLProvider(conta.brandSlug, {
      accessToken: conta.accessToken,
      refreshToken: conta.refreshToken,
    });
    const pedidoNormalizado = await trace.etapa("ml_api", () =>
      buscarPedidoComRegistro(conta, notificacao.orderId, () =>
        provider.buscarPedidoPorId(notificacao.orderId),
      ),
    );
    const resultado = await trace.etapa("database", () =>
      ingerirPedido(conta.orgId, conta.brandId, conta.channelAccountId, pedidoNormalizado),
    );

    await registrarVerificacaoCanal(conta.orgId, conta.channelAccountId, "pedidos");
    trace.finalizar("ok");
    console.info("[webhook/mercadolivre] processado", {
      notificationId: notificacao.notificationId,
      orderId: notificacao.orderId,
      pedidoId: resultado.pedidoId,
      novo: resultado.novo,
    });
    return resultado;
  } catch (error) {
    trace.finalizar("erro", error instanceof Error ? error.message : String(error));
    console.error("[webhook/mercadolivre] falha no processamento", {
      notificationId: notificacao.notificationId,
      orderId: notificacao.orderId,
      error,
    });
    throw error;
  }
}
