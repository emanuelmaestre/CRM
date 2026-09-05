import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('@/shared/lib/shopee-proxy',()=>({shopeeFetch:vi.fn()}));
import {shopeeFetch} from '@/shared/lib/shopee-proxy';
import {ShopeeProvider} from '@/modules/canais/infrastructure/shopee.provider';
const creds={partnerId:'1',partnerKey:'k',shopId:'2',accessToken:'t'};
afterEach(()=>vi.restoreAllMocks());
describe('evidência financeira Shopee',()=>{
 it.each([{response:{}},{response:{order_list:[]}},{response:{order_list:[],more:true}}])('não aceita página incompleta como sucesso',async resposta=>{
  vi.mocked(shopeeFetch).mockResolvedValue(Response.json(resposta));
  await expect(new ShopeeProvider(creds,creds).buscarPedidos(new Date('2026-09-04T00:00:00Z'),{ate:new Date('2026-09-04T01:00:00Z')})).rejects.toThrow();
 });
 it.each([1700000000,null,undefined,0,-1,99999999999])('preserva pay_time válido sem inferir pagamento pelo total: %s',async(pay_time)=>{
  vi.spyOn(console,'warn').mockImplementation(()=>{});
  vi.mocked(shopeeFetch).mockResolvedValue(Response.json({response:{order_list:[{order_sn:'A',order_status:'CANCELLED',create_time:1699990000,pay_time,cancel_reason:'Unpaid Order',total_amount:50,item_list:[]}]}}));
  const p=await new ShopeeProvider(creds,creds).buscarPedidoPorId('A');
  expect(p.dadosOrigem?.pagamentoAprovado).toBe(pay_time===1700000000?true:undefined);
  expect(p.dadosOrigem?.pagoEmMs).toBe(pay_time===1700000000?1700000000000:undefined);
  expect(p.dadosOrigem?.motivoCancelamento).toBe('Unpaid Order');
  const url=new URL(String(vi.mocked(shopeeFetch).mock.calls.at(-1)![0]));
  expect(url.searchParams.get('response_optional_fields')).toContain('pay_time');
 });
});
