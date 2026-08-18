-- O módulo de menu "inbox" (Mensagens: Conversas/Perguntas/Avaliações) foi
-- reduzido a só Avaliações e o id mudou de "inbox" para "avaliacoes" (ver
-- src/config/navigation.json e src/config/modulos.ts). Usuários que já
-- tinham "inbox" salvo em modulos_visiveis (todo mundo até agora, era o
-- default de criação) ficariam com esse módulo invisível no menu -- o
-- catálogo novo não reconhece mais o id antigo. Troca o valor dentro do
-- array json, sem afetar o resto dos módulos daquele usuário.

UPDATE public.app_user
SET modulos_visiveis = (
  SELECT jsonb_agg(CASE WHEN elem = '"inbox"'::jsonb THEN '"avaliacoes"'::jsonb ELSE elem END)
  FROM jsonb_array_elements(modulos_visiveis) AS elem
)
WHERE modulos_visiveis @> '["inbox"]'::jsonb;
