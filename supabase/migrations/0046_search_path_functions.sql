-- enforce_produto_canal_brand e prevent_audit_log_mutation ficaram sem
-- search_path fixo desde a criacao (achado do linter de seguranca do
-- Supabase). Sem isso, um role com permissao de criar objetos poderia
-- shadowear uma tabela/funcao usada dentro delas via search_path
-- manipulado. Ambas sao SECURITY INVOKER (trigger functions), entao o
-- risco pratico e baixo, mas a correcao e trivial.

ALTER FUNCTION public.enforce_produto_canal_brand() SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_audit_log_mutation() SET search_path = public, pg_temp;
