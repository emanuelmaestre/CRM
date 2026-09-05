import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({handler:null as unknown as (v:unknown)=>Promise<unknown>,db:{} as Record<string,unknown>,buscar:vi.fn(),ingerir:vi.fn(),verificar:vi.fn(),degradar:vi.fn(),finalizar:vi.fn(),updates:vi.fn(),registrado:false,tipo:'shopee'}));
vi.mock('@/shared/lib/inngest/client',()=>({inngest:{createFunction:(_c:unknown,h:(v:unknown)=>Promise<unknown>)=>{m.handler=h;return h;}}}));
vi.mock('@/shared/lib/db',()=>({db:m.db}));
vi.mock('@/modules/canais/infrastructure/provider-resolver',()=>({resolverChannelProvider:async()=>({buscarPedidos:m.buscar})}));
vi.mock('@/modules/canais/infrastructure/shopee.provider',()=>({SHOPEE_PEDIDOS_LIBERADO:true}));
vi.mock('@/modules/canais/application/ingestao-pedido.service',()=>({ingerirPedido:m.ingerir}));
vi.mock('@/modules/canais/application/verificacao-canal.service',()=>({registrarVerificacaoCanal:m.verificar}));
vi.mock('@/modules/canais/domain/errors',()=>({ehErroComPedidoIgnoradoRegistrado:()=>m.registrado,ehErroSkuSemProduto:()=>true}));
vi.mock('@/shared/events',()=>({despacharEventosPendentes:async()=>({falhas:0}),emitirEventoUnico:m.degradar}));
vi.mock('@/modules/jobs/job-monitor',()=>({iniciarJob:async()=>'job',finalizarJob:m.finalizar}));
import '@/modules/jobs/A24-poll-pedidos';
const steps:string[]=[];
const run=()=>m.handler({attempt:0,step:{run:async(name:string,fn:()=>unknown)=>{steps.push(name);return fn();}}});
beforeEach(()=>{
 vi.clearAllMocks();steps.length=0;m.tipo='shopee';m.registrado=true;
 m.buscar.mockResolvedValue([{providerOrderId:'old',criadoEm:new Date('2026-01-01')}]);
 m.ingerir.mockResolvedValue({pedidoId:'p',novo:false});
 Object.assign(m.db,{
  select:()=>({from:()=>({innerJoin:()=>({where:async()=>[{id:'c',orgId:'org',brandId:'b',brandSlug:'wuwu',tipo:m.tipo,meta:{pedidosUltimaColetaCompleta:'2026-01-01T00:00:00Z'}}]})})}),
  update:()=>({set:(v:unknown)=>{m.updates(v);return {where:async()=>[]};}}),
 });
});
describe('coleta não mascara pendências',()=>{
 it.each(['shopee','tiktokshop'])('%s preserva cursor com falha mesmo registrada',async tipo=>{
  m.tipo=tipo;m.ingerir.mockRejectedValue(new Error('pedido recusado'));
  await expect(run()).rejects.toThrow();
  expect(m.updates).not.toHaveBeenCalled();expect(m.verificar).not.toHaveBeenCalled();expect(m.degradar).toHaveBeenCalled();
 });
 it('falha de paginação não avança cobertura',async()=>{
  m.buscar.mockRejectedValue(new Error('segunda página falhou'));
  await expect(run()).rejects.toThrow();expect(m.updates).not.toHaveBeenCalled();expect(m.ingerir).not.toHaveBeenCalled();
 });
 it('ingere pedido antigo por atualização antes de verificar e avançar',async()=>{
  await run();expect(m.buscar).toHaveBeenCalledWith(expect.any(Date),expect.objectContaining({campoData:'atualizacao'}));
  expect(steps.indexOf('ingerir-c-old')).toBeLessThan(steps.indexOf('marcar-cobertura-c'));
  expect(m.updates).toHaveBeenCalledTimes(1);expect(m.verificar).toHaveBeenCalledTimes(1);
 });
 it('preserva política anterior do Mercado Livre para falha durável de pedido',async()=>{
  m.tipo='mercadolivre';m.ingerir.mockRejectedValue(new Error('SKU'));
  await run();expect(m.updates).toHaveBeenCalledTimes(1);expect(m.verificar).toHaveBeenCalledTimes(1);
 });
});
