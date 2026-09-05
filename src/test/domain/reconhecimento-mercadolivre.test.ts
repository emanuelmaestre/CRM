import { describe, expect, it } from 'vitest';
import { aprovacaoMercadoLivre, cancelamentoTecnicoML } from '@/modules/vendas/domain/reconhecimento-mercadolivre';
import { normalizarPedidoMercadoLivre } from '@/modules/canais/infrastructure/mercadolivre.provider';

describe('reconhecimento validado com relatorios ML de 04/09', () => {
  it('reconhece o pedido de 01/09 na aprovacao de 04/09 e preserva criacao', () => {
    const p = normalizarPedidoMercadoLivre({id:2000018233553308,status:'paid',total_amount:24.9,
      buyer:{id:1,nickname:'teste'},order_items:[{item:{id:'MLB1'},quantity:1,unit_price:24.9}],
      date_created:'2026-09-01T18:17:45.000-04:00',
      payments:[{status:'cancelled',date_approved:null},{status:'approved',date_approved:'2026-09-04T11:49:31.000-04:00'}]});
    expect(p.criadoEm.toISOString()).toBe('2026-09-01T22:17:45.000Z');
    expect(p.dadosOrigem?.aprovadoEmMs).toBe(Date.parse('2026-09-04T12:49:31-03:00'));
  });
  it('preserva aprovacao anterior ao estorno e ignora datas invalidas', () => {
    expect(aprovacaoMercadoLivre({payments:[{date_approved:'invalido'},{date_approved:'2026-09-04T12:00:00Z'}]})).toBe(Date.parse('2026-09-04T12:00:00Z'));
    expect(aprovacaoMercadoLivre({payments:[{date_approved:null}]})).toBeNull();
  });
  it('exclui somente o registro tecnico, nao a venda substituta nem cancelamento comum', () => {
    expect(cancelamentoTecnicoML({cancelamento:{code:'pack_splitted'}})).toBe(true);
    expect(cancelamentoTecnicoML({tags:['splitted_order']})).toBe(false);
    expect(cancelamentoTecnicoML({cancelamento:{code:'buyer_cancel_express'}})).toBe(false);
  });
});
