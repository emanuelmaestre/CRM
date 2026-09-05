import {afterEach,describe,expect,it,vi} from 'vitest';
import {TikTokShopProvider} from '@/modules/canais/infrastructure/tiktokshop.provider';

describe('evidência financeira TikTok',()=>{
  afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
  it.each([1700000000,undefined,0,-1,NaN,Infinity,99999999999])('preserva apenas paid_time válido: %s',async(paid_time)=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({code:0,data:{orders:[{
      id:'1',status:'CANCELLED',create_time:1699990000,paid_time,
      payment:{total_amount:'29.51'},cancel_reason:'Motivo informado',line_items:[],
    }]}}),{status:200})));
    const provider=new TikTokShopProvider({appKey:'key',appSecret:'secret',accessToken:'token',shopCipher:'shop'});
    const [pedido]=await provider.buscarPedidosPorIds(['1']);
    expect(pedido.dadosOrigem?.pagamentoAprovado).toBe(paid_time===1700000000?true:undefined);
    expect(pedido.dadosOrigem?.pagoEmMs).toBe(paid_time===1700000000?1700000000000:undefined);
    expect(pedido.dadosOrigem?.motivoCancelamento).toBe('Motivo informado');
  });
});
