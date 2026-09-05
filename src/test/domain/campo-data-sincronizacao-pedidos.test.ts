import { describe, expect, it } from "vitest";
import { campoDataDaSincronizacaoPedidos, politicaColetaPedidos, inicioColetaPedidos, podeAvancarCoberturaPedidos } from "@/modules/canais/domain/cobertura-pedidos";

describe("relógio da sincronização de pedidos", () => {
  it.each(['shopee','tiktokshop'])('relê mudanças mesmo sem troca de status em %s',canal=>{
    expect(politicaColetaPedidos(canal,undefined,false)).toEqual({campoData:'atualizacao',relerTodos:true,exigirSemPendencias:true});
    expect(politicaColetaPedidos(canal,'2026-09-01',true)).toEqual({campoData:'criacao',relerTodos:true,exigirSemPendencias:true});
  });
  it.each([undefined,'2026-09-01'])('preserva política ML para início %s',desde=>{
    for(const reconciliacao of [true,false])expect(politicaColetaPedidos('mercadolivre',desde,reconciliacao)).toEqual({campoData:campoDataDaSincronizacaoPedidos(desde,reconciliacao),relerTodos:reconciliacao,exigirSemPendencias:false});
  });
  it('retoma falha longa pelo cursor e recusa cobertura sem registro',()=>{
    const agora=Date.parse('2026-09-04T12:00:00Z');
    expect(inicioColetaPedidos(agora,'2026-08-30T12:00:00Z',7*3600000).toISOString()).toBe('2026-08-30T11:00:00.000Z');
    expect(podeAvancarCoberturaPedidos(1)).toBe(false);
    expect(podeAvancarCoberturaPedidos(0)).toBe(true);
  });
  it("usa atualização na coleta incremental solicitada pela tela", () => {
    expect(campoDataDaSincronizacaoPedidos("2026-09-03T16:00:00.000Z", false))
      .toBe("atualizacao");
  });

  it("usa criação na reconciliação histórica, mesmo com início explícito", () => {
    expect(campoDataDaSincronizacaoPedidos("2026-08-28T05:00:00.000Z", true))
      .toBe("criacao");
  });

  it("usa criação no backfill completo sem início explícito", () => {
    expect(campoDataDaSincronizacaoPedidos(undefined, false)).toBe("criacao");
  });
});
