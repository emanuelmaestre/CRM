import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { buscarPedidoComRegistro } from "@/modules/canais/application/recepcao-pedido.service";
import { resolverContaTikTokPorLoja } from "@/modules/canais/application/tiktok-autorizacao.service";
import { isBrandSlug } from "@/shared/config/brands";
import { criarTikTokShopProvider } from "@/modules/canais/infrastructure/tiktokshop.provider";
import { conciliarReembolsosTikTok } from "@/modules/canais/application/reembolsos-tiktok.service";

export async function processarNotificacaoPedidoTikTok(shopId: string, orderId: string, type: number) {
  // O webhook identifica a loja, enquanto externalAccountId pode guardar
  // o open_id do vendedor. O resolvedor TikTok aceita os IDs da loja.
  const encontrada = await resolverContaTikTokPorLoja(shopId);
  if (!encontrada || !isBrandSlug(encontrada.brandSlug)) throw new Error("Conta TikTok não reconhecida.");
  const conta = { ...encontrada, brandSlug: encontrada.brandSlug };

  const provider = await criarTikTokShopProvider(conta.brandSlug);

  const pedido = await buscarPedidoComRegistro(conta, orderId, async () => {
    const encontrado = (await provider.buscarPedidosPorIds([orderId]))[0];
    if (!encontrado) throw new Error(`TikTok Shop não retornou o pedido ${orderId}.`);
    return encontrado;
  });

  const { pedidoId, novo } = await ingerirPedido(
    conta.orgId,
    conta.brandId,
    conta.channelAccountId,
    pedido,
  );

  if (type === 12) {
    await conciliarReembolsosTikTok({
      orgId: conta.orgId, channelAccountId: conta.channelAccountId, brandSlug: conta.brandSlug,
      desde: new Date(0), ate: new Date(), orderIds: [orderId],
    });
  }
  return { pedidoId, novo };
}
