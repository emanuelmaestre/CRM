# Entrega isolada Shopee/TikTok

Base: produção b0f1a4e288388429e686b0e059f82c6fc1d4e8fa. Aprovação do usuário: publicar somente Shopee/TikTok.

Inclui coleta por atualização na A31, releitura sem descarte por status idêntico, recusa de sucesso parcial, recuperação de contas degradadas na A24, evidência financeira nas APIs, exceção versionada Shopee devolvido→concluído sem eventos operacionais e filtros financeiros restritos aos dois canais.

Mercado Livre mantém o payload da ingestão, as opções de busca da A31 e os predicados financeiros da base publicada. Não inclui modificações locais de estoque, clientes, interface, calendário ou Mercado Livre.

Cancelamentos sem prova de pagamento não são classificados como não pagos. Negativas explícitas são preservadas; pagamento anterior aprovado prevalece. TikTok identifica os motivos exatos de timeout observados em português e espanhol.

Validação: suíte inicial 717 testes aprovada; testes adicionais de incerteza, timeout e preservação ML. Typecheck e lint dos módulos alterados aprovados. Consulta somente leitura no PostgreSQL validou 96 combinações de canal, status e evidência, preservando Mercado Livre.

Limites: equivalência à API não comprova equivalência ao Seller Center. Cancelamentos ambíguos ainda necessitam relatório financeiro oficial. Não há promessa de ausência de atraso externo. Nenhum segredo faz parte desta entrega.

O build local pela Vercel recebeu placeholders para variáveis sensíveis não exportáveis; a validação final deve ocorrer no build remoto, antes de promover o domínio.

## Resultado da publicação e recuperação

A compilação remota foi aprovada e o commit 122671d6 foi publicado em produção. Suíte final: 723 testes em 94 arquivos aprovados.

Em 04/09/2026, após incidente de execução do Inngest, a recuperação das cinco contas Shopee/TikTok terminou às 22:14 de Brasília. Apenas uma tentativa Shopee ainda não iniciada foi cancelada e, após confirmação do cancelamento, reexecutada pelo mecanismo oficial. As demais retomaram sem intervenção. Nenhuma execução Mercado Livre foi cancelada ou disparada pela recuperação.

As sincronizações recuperaram sete pedidos novos da WUWU (dois Shopee, cinco TikTok). A conferência somente leitura encontrou diferença zero de faturamento confirmado e quantidade faturável em 15 recortes: hoje, sete e trinta dias das cinco contas. Não houve pedidos retornados pela API ausentes no CRM nem diferenças de status ou total desses pedidos.

Recortes explícitos: 04/09, 29/08–04/09 e 06/08–04/09; cortes de coleta entre 22:13 e 22:14, Brasília. A comparação é com as APIs e não constitui validação integral dos painéis Seller Center. Cancelamentos sem evidência financeira continuam pendentes.

O estado de Vendas passou a pronto/100 após as confirmações reais. Quatorze testes de aviso de dados atrasados e proteção contra sucesso parcial foram executados novamente e aprovados. Não foi necessário criar outro sistema ou alterar código nesta recuperação. Este complemento é exclusivamente documental; não contém credenciais, dados de clientes ou identificadores de pedidos.
