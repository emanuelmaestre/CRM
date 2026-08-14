-- A 0026 criou estoque_canal_saldo sem as chaves compostas (id, org_id) que
-- toda outra tabela do estoque tem desde a 0010 (mesmo padrao de
-- produto_canal/fk_produto_canal_produto_org e fk_produto_canal_conta_org).
-- Sem isso, org_id passa no RLS mas produto_id/channel_account_id podiam
-- apontar pra outro tenant — RLS so valida a linha em si, nao o que ela
-- referencia.
ALTER TABLE public.estoque_canal_saldo
  ADD CONSTRAINT fk_estoque_canal_saldo_produto_org FOREIGN KEY (produto_id, org_id)
  REFERENCES public.produto (id, org_id);

ALTER TABLE public.estoque_canal_saldo
  ADD CONSTRAINT fk_estoque_canal_saldo_conta_org FOREIGN KEY (channel_account_id, org_id)
  REFERENCES public.channel_account (id, org_id);
