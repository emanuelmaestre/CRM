-- A 0025 removeu produto.custo, mas deixou para trás a RLS que existia só
-- para proteger essa coluna: a função listar_produtos_financeiros() (que
-- nenhum código da aplicação chama) e o GRANT SELECT por coluna que a
-- substituía. Sem custo, não há mais nada a esconder do vendedor.
DROP FUNCTION IF EXISTS public.listar_produtos_financeiros();

REVOKE SELECT (
  id, org_id, brand_id, sku, nome, preco, estoque_minimo, ativo,
  deleted_at, criado_em, atualizado_em
) ON TABLE public.produto FROM authenticated;
GRANT SELECT ON TABLE public.produto TO authenticated;
