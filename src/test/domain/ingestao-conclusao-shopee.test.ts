import {beforeEach,describe,it,expect,vi} from 'vitest';
import {getTableName} from 'drizzle-orm';
const m=vi.hoisted(()=>({db:{} as Record<string,unknown>,evento:vi.fn(),despachar:vi.fn(),pendentes:vi.fn()}));
vi.mock('@/shared/lib/db',()=>({db:m.db}));
vi.mock('@/shared/events',()=>({persistirEvento:m.evento,despacharEvento:m.despachar,despacharEventosPendentes:m.pendentes}));
vi.mock('@/modules/vendas/application/registro-pedido-ignorado',()=>({registrarPedidoIgnorado:vi.fn(),marcarPedidoIgnoradoResolvido:vi.fn(),classificarCausa:vi.fn()}));
vi.mock('@/modules/vendas/application/deteccao-conferencia',()=>({conferirPedidoAposIngestao:vi.fn()}));
import {ingerirPedido} from '@/modules/canais/application/ingestao-pedido.service';
const org='11111111-1111-4111-8111-111111111111',brand='22222222-2222-4222-8222-222222222222',account='33333333-3333-4333-8333-333333333333';
let row:Record<string,unknown>;let audits:unknown[];
function query(rows:unknown[]){const q={where:()=>q,for:()=>q,then:(ok:(v:unknown[])=>unknown)=>Promise.resolve(rows).then(ok)};return q;}
beforeEach(()=>{
 vi.clearAllMocks();audits=[];
 row={id:'pedido',status:'devolvido',brandId:brand,canal:'shopee',origemIngestao:'tempo_real',total:'31.90',valorLiquido:null,dadosOrigem:{pagamentoAprovado:true},atualizadoOrigemEm:new Date('2026-09-01')};
 Object.assign(m.db,{
  select:()=>({from:(table:Parameters<typeof getTableName>[0])=>query(getTableName(table)==='channel_account'?[{id:account}]:[{...row}])}),
  transaction:async(fn:(tx:unknown)=>unknown)=>fn(m.db),
  update:()=>({set:(values:Record<string,unknown>)=>({where:async()=>{Object.assign(row,values);}})}),
  insert:()=>({values:async(value:unknown)=>{audits.push(value);}}),
 });
});
describe('ingestão da conclusão Shopee',()=>{
 it('corrige, audita e não publica eventos; repetição histórica é idempotente',async()=>{
  const p={providerOrderId:'A',canal:'shopee',clienteExternalId:'C',clienteNome:'Cliente',status:'completed',total:'31.90',criadoEm:new Date('2026-08-12'),atualizadoOrigemEm:new Date('2026-09-02'),dadosOrigem:{pagamentoAprovado:true},itens:[{skuExterno:'SKU',quantidade:1,precoUnitario:'31.90'}]};
  await ingerirPedido(org,brand,account,p);
  expect(row.status).toBe('concluido');expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({acao:'reconciliacao_shopee_status',antes:{status:'devolvido'},depois:{status:'concluido',efeitosOperacionais:false}});
  expect(m.evento).not.toHaveBeenCalled();expect(m.despachar).not.toHaveBeenCalled();expect(m.pendentes).not.toHaveBeenCalled();
  await ingerirPedido(org,brand,account,p,{historico:true});
  expect(audits).toHaveLength(1);
 });
});
