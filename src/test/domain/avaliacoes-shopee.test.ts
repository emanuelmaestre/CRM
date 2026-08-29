import { beforeEach, describe, expect, it, vi } from "vitest";

const shopeeFetchMock = vi.fn();
vi.mock("@/shared/lib/shopee-proxy", () => ({ shopeeFetch: (...args: unknown[]) => shopeeFetchMock(...args) }));

import { ShopeeProvider } from "@/modules/canais/infrastructure/shopee.provider";

/* O formato testado aqui foi lido da API ao vivo em 28/08/2026, contra as duas
   lojas (125 comentários) — não da documentação. `get_comment` devolve onze
   campos por comentário e o CRM usava cinco. `order_sn` e `buyer_username`
   vieram preenchidos em 100% deles; foto ou vídeo, em 13% (WUWU) a 32%
   (Armarinhos Lima).

   O que NÃO existe nessa resposta, e por isso não dá pra derivar daqui:
   `comment_reply`. "Avaliações sem resposta do vendedor" precisaria de outro
   endpoint — vale o registro para ninguém tentar de novo. */

const CREDS = { partnerId: "1", partnerKey: "k", shopId: "9", accessToken: "t" };

function respostaOk(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status: 200 });
}

/** get_comment, depois get_item_list (catálogo ativo), depois
 *  get_item_base_info (títulos) — a ordem que `listarAvaliacoes` usa. */
function responderColeta(comentarios: unknown[], itemIds: number[]) {
  shopeeFetchMock
    .mockResolvedValueOnce(respostaOk({ response: { item_comment_list: comentarios, more: false } }))
    .mockResolvedValueOnce(respostaOk({ response: { item: itemIds.map((id) => ({ item_id: id })), has_next_page: false } }))
    .mockResolvedValueOnce(respostaOk({ response: { item_list: itemIds.map((id) => ({ item_id: id, item_name: `Item ${id}` })) } }));
}

const COMENTARIO_BASE = {
  comment_id: 70371493136121,
  item_id: 22295082847,
  order_sn: "260826C1F9S5EE",
  buyer_username: "viniprovetti",
  rating_star: 5,
  create_time: 1787939056,
  hidden: false,
};

describe("avaliações da Shopee", () => {
  beforeEach(() => { shopeeFetchMock.mockReset(); });

  it("guarda autor, pedido de origem e mídia — antes tudo isso era descartado", async () => {
    responderColeta([{
      ...COMENTARIO_BASE,
      comment: "Chegou rápido",
      media: { image_url_list: ["https://cdn/f1.jpg"], video_url_list: ["https://cdn/v1.mp4"] },
    }], [22295082847]);

    const [anuncio] = await new ShopeeProvider(CREDS).listarAvaliacoes();
    const [opiniao] = anuncio.opinioes;

    expect(opiniao.conteudo).toBe("Chegou rápido");
    expect(opiniao.autor).toBe("viniprovetti");
    expect(opiniao.pedidoCanal).toBe("260826C1F9S5EE");
    expect(opiniao.fotos).toEqual(["https://cdn/f1.jpg"]);
    expect(opiniao.videos).toEqual(["https://cdn/v1.mp4"]);
    expect(opiniao.oculta).toBe(false);
  });

  /* Antes, o filtro era `c.comment`: avaliação com foto e sem texto não
     chegava à tela, e o anúncio parecia nunca ter sido comentado. */
  it("avaliação só com foto entra na lista", async () => {
    responderColeta([{
      ...COMENTARIO_BASE,
      media: { image_url_list: ["https://cdn/f1.jpg"] },
    }], [22295082847]);

    const [anuncio] = await new ShopeeProvider(CREDS).listarAvaliacoes();

    expect(anuncio.opinioes).toHaveLength(1);
    expect(anuncio.opinioes[0].conteudo).toBeNull();
    expect(anuncio.opinioes[0].fotos).toEqual(["https://cdn/f1.jpg"]);
  });

  /* `order_sn` vem em 100% dos comentários: filtrar por ele seria não filtrar
     nada e despejar na tela uma linha por estrela solta. Nota pura já está
     representada na média e na distribuição. */
  it("nota sem texto e sem mídia continua fora da lista, mas conta na média", async () => {
    responderColeta([
      { ...COMENTARIO_BASE, comment_id: 1, rating_star: 5 },
      { ...COMENTARIO_BASE, comment_id: 2, rating_star: 1, comment: "Veio quebrado" },
    ], [22295082847]);

    const [anuncio] = await new ShopeeProvider(CREDS).listarAvaliacoes();

    expect(anuncio.opinioes).toHaveLength(1);
    expect(anuncio.reviewsTotal).toBe(2);
    expect(anuncio.ratingAverage).toBe(3);
    expect(anuncio.ratingLevels).toMatchObject({ "1": 1, "5": 1 });
  });

  it("comentário só com espaços não vira texto", async () => {
    responderColeta([{
      ...COMENTARIO_BASE,
      comment: "   ",
      media: { image_url_list: ["https://cdn/f1.jpg"] },
    }], [22295082847]);

    const [anuncio] = await new ShopeeProvider(CREDS).listarAvaliacoes();
    expect(anuncio.opinioes[0].conteudo).toBeNull();
  });

  it("marca avaliação ocultada, que segue contando na média", async () => {
    responderColeta([{ ...COMENTARIO_BASE, comment: "Ruim", rating_star: 1, hidden: true }], [22295082847]);

    const [anuncio] = await new ShopeeProvider(CREDS).listarAvaliacoes();
    expect(anuncio.opinioes[0].oculta).toBe(true);
    expect(anuncio.ratingAverage).toBe(1);
  });
});
