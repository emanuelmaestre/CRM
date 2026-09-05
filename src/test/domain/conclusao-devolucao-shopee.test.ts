import {describe,it,expect} from 'vitest';
import {ehConclusaoAposDevolucaoShopee,deveAplicarStatusMarketplace} from '@/modules/canais/domain/order-status';
const base={canal:'shopee',atual:'devolvido' as const,statusExterno:'COMPLETED',pagamentoAprovado:true,versaoAtual:new Date('2026-09-01'),versaoRecebida:new Date('2026-09-02')};
describe('conclusão Shopee após solicitação de devolução',()=>{
 it('aceita fotografia paga mais recente e replay da mesma versão',()=>{
  expect(ehConclusaoAposDevolucaoShopee(base)).toBe(true);
  expect(ehConclusaoAposDevolucaoShopee({...base,versaoAtual:base.versaoRecebida})).toBe(true);
 });
 it.each(['mercadolivre','tiktokshop'])('não altera %s',canal=>{
  expect(ehConclusaoAposDevolucaoShopee({...base,canal})).toBe(false);
  expect(deveAplicarStatusMarketplace('devolvido','concluido')).toBe(false);
 });
 it.each([undefined,new Date('invalid'),new Date('2026-08-01')])('rejeita versão ausente, inválida ou antiga: %s',versaoRecebida=>{
  expect(ehConclusaoAposDevolucaoShopee({...base,versaoRecebida})).toBe(false);
 });
 it('não reabre cancelados nem repete a conclusão',()=>{
  expect(ehConclusaoAposDevolucaoShopee({...base,atual:'cancelado'})).toBe(false);
  expect(ehConclusaoAposDevolucaoShopee({...base,atual:'concluido'})).toBe(false);
 });
 it('exige pagamento e status externo COMPLETED',()=>{
  expect(ehConclusaoAposDevolucaoShopee({...base,pagamentoAprovado:false})).toBe(false);
  expect(ehConclusaoAposDevolucaoShopee({...base,statusExterno:'SHIPPED'})).toBe(false);
 });
});
