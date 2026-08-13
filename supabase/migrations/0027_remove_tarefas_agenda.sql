-- Remove os modulos de Tarefas e Agenda.
--
-- Tarefas nao entrou no uso real da operacao. A Agenda sai junto porque ja
-- estava inalcancavel: nunca teve item de menu proprio e sua unica porta de
-- entrada era o alternador Tarefas/Agenda, retirado da interface.
--
-- As duas tabelas so eram lidas pelo modulo removido, pelo painel de lembretes
-- (que unificava as duas) e pela ficha do cliente. Nada mais no sistema
-- depende delas.

DROP TABLE IF EXISTS public.tarefa;--> statement-breakpoint
DROP TABLE IF EXISTS public.evento_agenda;--> statement-breakpoint
DROP TYPE IF EXISTS public.tarefa_status;
