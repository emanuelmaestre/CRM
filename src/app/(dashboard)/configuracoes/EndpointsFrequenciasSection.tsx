import {
  Clock3,
  MousePointerClick,
  RefreshCw,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { tint } from "@/shared/design-system/color";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";

type TipoFrequencia = "automatico" | "evento" | "manual" | "interface";

type EndpointLinha = {
  modulo: string;
  endpoints: string[];
  frequencia: string;
  tipo: TipoFrequencia;
};

type Canal = {
  id: "mercadolivre" | "shopee";
  nome: string;
  descricao: string;
  linhas: EndpointLinha[];
};

const frequenciaConfig: Record<TipoFrequencia, { label: string; icon: LucideIcon; cor: string }> = {
  automatico: { label: "Automático", icon: RefreshCw, cor: "var(--acento-2)" },
  evento: { label: "Por evento", icon: Zap, cor: "var(--success)" },
  manual: { label: "Manual", icon: MousePointerClick, cor: "var(--warning)" },
  interface: { label: "Ao consultar", icon: Clock3, cor: "var(--info)" },
};

const canais: Canal[] = [
  {
    id: "mercadolivre",
    nome: "Mercado Livre",
    descricao: "Pedidos, catálogo, avaliações, métricas, publicidade e manutenção da conexão.",
    linhas: [
      {
        modulo: "Vendas · webhook",
        endpoints: ["GET /orders/{order_id}", "GET /shipments/{shipping_id}", "GET /shipments/{shipping_id}/costs"],
        frequencia: "Imediatamente após a notificação de uma venda.",
        tipo: "evento",
      },
      {
        modulo: "Vendas · contingência",
        endpoints: ["GET /users/me", "GET /orders/search", "GET /shipments/{shipping_id}", "GET /shipments/{shipping_id}/costs"],
        frequencia: "A cada 3 horas, cobrindo uma janela de 4 horas.",
        tipo: "automatico",
      },
      {
        modulo: "Vendas · sincronização",
        endpoints: ["GET /users/me", "GET /orders/search", "GET /shipments/{shipping_id}", "GET /shipments/{shipping_id}/costs"],
        frequencia: "Ao clicar em Sincronizar; busca até 90 dias.",
        tipo: "manual",
      },
      {
        modulo: "Importação histórica",
        endpoints: ["GET /users/me", "GET /orders/search"],
        frequencia: "Quando uma importação histórica é preparada.",
        tipo: "manual",
      },
      {
        modulo: "Estoque · saldo",
        endpoints: ["GET /items/{listing_id}"],
        frequencia: "A cada 6 horas e após cada pedido pago, apenas para os itens vendidos.",
        tipo: "automatico",
      },
      {
        modulo: "Estoque · situação",
        endpoints: ["GET /items?ids=...&attributes=id,status,sub_status"],
        frequencia: "A cada 6 horas, em lotes de até 20 anúncios.",
        tipo: "automatico",
      },
      {
        modulo: "Catálogo",
        endpoints: ["GET /users/me", "GET /users/{seller_id}/items/search", "GET /items?ids=...&include_attributes=all"],
        frequencia: "Ao clicar em Sincronizar; páginas de 50 e lotes de 20 anúncios.",
        tipo: "manual",
      },
      {
        modulo: "Avaliações",
        endpoints: ["GET /users/me", "GET /users/{seller_id}/items/search", "GET /items?ids=...&include_attributes=all", "GET /reviews/item/{listing_id}"],
        frequencia: "A cada 6 horas e na sincronização manual.",
        tipo: "automatico",
      },
      {
        modulo: "Métricas · reputação",
        endpoints: ["GET /users/me"],
        frequencia: "Ao abrir ou filtrar Métricas, com cache de 90 segundos; também na sincronização manual.",
        tipo: "interface",
      },
      {
        modulo: "Métricas · status",
        endpoints: ["Sem chamada externa · snapshot local em produto_canal"],
        frequencia: "Leitura local ao abrir ou alterar filtros; o status é atualizado pela coleta automática de 6 horas.",
        tipo: "interface",
      },
      {
        modulo: "Publicações patrocinadas",
        endpoints: ["GET /advertising/advertisers?product_id=PADS", "GET /marketplace/advertising/{site}/advertisers/{advertiser}/product_ads/ads/search"],
        frequencia: "Ao abrir ou filtrar Publicações, com cache de 120 segundos; também diariamente.",
        tipo: "interface",
      },
      {
        modulo: "Campanhas patrocinadas",
        endpoints: ["GET /marketplace/advertising/{site}/advertisers/{advertiser}/product_ads/campaigns/search", "GET /marketplace/advertising/{site}/advertisers/{advertiser}/product_ads/ads/search"],
        frequencia: "Uma vez por dia e na sincronização manual.",
        tipo: "automatico",
      },
      {
        modulo: "Histórico de campanha",
        endpoints: ["GET /advertising/{site}/product_ads/campaigns/{campaign_id}"],
        frequencia: "Na primeira carga histórica de cada campanha.",
        tipo: "evento",
      },
      {
        modulo: "Qualidade da publicação",
        endpoints: ["GET /item/{listing_id}/performance", "GET /items?ids=...&attributes=id,date_created"],
        frequencia: "Ao consultar até 20 anúncios exibidos, com cache de 120 segundos.",
        tipo: "interface",
      },
      {
        modulo: "Saúde do conector",
        endpoints: ["GET /users/me"],
        frequencia: "A cada 3 horas, no minuto 7.",
        tipo: "automatico",
      },
      {
        modulo: "Token OAuth",
        endpoints: ["POST /oauth/token"],
        frequencia: "Verificado a cada hora; renova somente se faltar até 90 minutos para expirar.",
        tipo: "automatico",
      },
    ],
  },
  {
    id: "shopee",
    nome: "Shopee",
    descricao: "Pedidos, catálogo, avaliações, estoque, saúde da loja e renovação da conexão.",
    linhas: [
      {
        modulo: "Vendas · webhook",
        endpoints: ["GET /api/v2/order/get_order_detail"],
        frequencia: "Imediatamente após a notificação de uma venda.",
        tipo: "evento",
      },
      {
        modulo: "Vendas · contingência",
        endpoints: ["GET /api/v2/order/get_order_list", "GET /api/v2/order/get_order_detail"],
        frequencia: "A cada 3 horas, cobrindo uma janela de 4 horas; detalhes em lotes de até 50.",
        tipo: "automatico",
      },
      {
        modulo: "Vendas · sincronização",
        endpoints: ["GET /api/v2/order/get_order_list", "GET /api/v2/order/get_order_detail"],
        frequencia: "Ao clicar em Sincronizar; 90 dias divididos em janelas de até 15 dias.",
        tipo: "manual",
      },
      {
        modulo: "Estoque · saldo",
        endpoints: ["GET /api/v2/product/get_model_list"],
        frequencia: "A cada 6 horas e após cada pedido pago, apenas para os itens vendidos.",
        tipo: "automatico",
      },
      {
        modulo: "Catálogo",
        endpoints: ["GET /api/v2/product/get_item_list", "GET /api/v2/product/get_item_base_info", "GET /api/v2/product/get_model_list"],
        frequencia: "Ao clicar em Sincronizar; páginas de 100 e detalhes em lotes de 50.",
        tipo: "manual",
      },
      {
        modulo: "Avaliações",
        endpoints: ["GET /api/v2/product/get_comment", "GET /api/v2/product/get_item_list", "GET /api/v2/product/get_item_base_info"],
        frequencia: "A cada 6 horas e na sincronização manual; até 10 páginas de 100 comentários.",
        tipo: "automatico",
      },
      {
        modulo: "Saúde da loja",
        endpoints: ["GET /api/v2/account_health/get_shop_performance"],
        frequencia: "Ao executar a sincronização manual da conta.",
        tipo: "manual",
      },
      {
        modulo: "Saúde do conector",
        endpoints: ["GET /api/v2/shop/get_shop_info"],
        frequencia: "A cada 3 horas, no minuto 7.",
        tipo: "automatico",
      },
      {
        modulo: "Token OAuth",
        endpoints: ["POST /api/v2/auth/access_token/get"],
        frequencia: "Verificado a cada hora, no minuto 12; renova somente se faltar até 1 hora para expirar.",
        tipo: "automatico",
      },
    ],
  },
];

function EtiquetaFrequencia({ tipo }: { tipo: TipoFrequencia }) {
  const config = frequenciaConfig[tipo];
  const Icon = config.icon;
  return (
    <span
      className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[10px] font-bold"
      style={{ background: tint(config.cor, 10), color: config.cor }}
    >
      <Icon size={11} strokeWidth={2.3} />
      {config.label}
    </span>
  );
}

function Endpoints({ valores }: { valores: string[] }) {
  return (
    <div className="space-y-1.5">
      {valores.map((endpoint) => (
        <code
          key={endpoint}
          className="block w-fit max-w-full break-all rounded-md bg-muted/75 px-2 py-1 font-mono text-[10.5px] font-semibold leading-relaxed text-foreground/80"
        >
          {endpoint}
        </code>
      ))}
    </div>
  );
}

function TabelaCanal({ canal }: { canal: Canal }) {
  return (
    <section aria-labelledby={`endpoints-${canal.id}`} className="overflow-hidden rounded-[1rem] border border-border bg-background/45">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <ChannelLogo canal={canal.id} size="md" variant="badge" className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <h3 id={`endpoints-${canal.id}`} className="text-sm font-bold text-foreground">{canal.nome}</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{canal.descricao}</p>
          </div>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[10.5px] font-bold tabular-nums text-muted-foreground">
          {canal.linhas.length} fluxos ativos
        </span>
      </header>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[780px] table-fixed border-collapse text-left">
          <caption className="sr-only">Endpoints e frequência de chamadas do canal {canal.nome}</caption>
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[43%]" />
            <col className="w-[35%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/35 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              <th scope="col" className="px-4 py-2.5 sm:px-5">Módulo</th>
              <th scope="col" className="px-4 py-2.5">Endpoint chamado</th>
              <th scope="col" className="px-4 py-2.5 sm:px-5">Quando/frequência</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/75">
            {canal.linhas.map((linha) => (
              <tr key={linha.modulo} className="align-top transition-colors hover:bg-muted/20">
                <th scope="row" className="px-4 py-3.5 text-xs font-semibold leading-relaxed text-foreground sm:px-5">
                  {linha.modulo}
                </th>
                <td className="px-4 py-3.5"><Endpoints valores={linha.endpoints} /></td>
                <td className="px-4 py-3.5 sm:px-5">
                  <div className="flex items-start gap-2.5">
                    <EtiquetaFrequencia tipo={linha.tipo} />
                    <p className="text-[11.5px] leading-relaxed text-muted-foreground">{linha.frequencia}</p>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border/75 md:hidden">
        {canal.linhas.map((linha) => (
          <article key={linha.modulo} className="space-y-3 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <h4 className="text-xs font-bold leading-relaxed text-foreground">{linha.modulo}</h4>
              <EtiquetaFrequencia tipo={linha.tipo} />
            </div>
            <div>
              <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Endpoint chamado</p>
              <Endpoints valores={linha.endpoints} />
            </div>
            <div>
              <p className="mb-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Quando/frequência</p>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">{linha.frequencia}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function EndpointsFrequenciasSection() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-[0.9rem] border border-border bg-background/55 px-3 py-3">
        <p className="mr-auto min-w-[14rem] text-[11.5px] leading-relaxed text-muted-foreground">
          Inventário das chamadas externas ativas. Filtros de Avaliações, Vendas, Estoque e status operacional de Métricas usam o banco local.
        </p>
        {(Object.keys(frequenciaConfig) as TipoFrequencia[]).map((tipo) => <EtiquetaFrequencia key={tipo} tipo={tipo} />)}
      </div>
      {canais.map((canal) => <TabelaCanal key={canal.id} canal={canal} />)}
      <p className="px-1 text-[10.5px] leading-relaxed text-muted-foreground">
        Os endpoints de alteração de estoque existem na integração, mas não aparecem aqui porque nenhum fluxo ativo os chama atualmente.
      </p>
    </div>
  );
}
