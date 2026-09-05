# Entrega isolada Shopee/TikTok

Base: produção b0f1a4e288388429e686b0e059f82c6fc1d4e8fa. Aprovação do usuário: publicar somente Shopee/TikTok.

Inclui coleta por atualização na A31, releitura sem descarte por status idêntico, recusa de sucesso parcial, recuperação de contas degradadas na A24, evidência financeira nas APIs, exceção versionada Shopee devolvido→concluído sem eventos operacionais e filtros financeiros restritos aos dois canais.

Mercado Livre mantém o payload da ingestão, as opções de busca da A31 e os predicados financeiros da base publicada. Não inclui modificações locais de estoque, clientes, interface, calendário ou Mercado Livre.

Cancelamentos sem prova de pagamento não são classificados como não pagos. Negativas explícitas são preservadas; pagamento anterior aprovado prevalece. TikTok identifica os motivos exatos de timeout observados em português e espanhol.

Validação: suíte inicial 717 testes aprovada; testes adicionais de incerteza, timeout e preservação ML. Typecheck e lint dos módulos alterados aprovados. Consulta somente leitura no PostgreSQL validou 96 combinações de canal, status e evidência, preservando Mercado Livre.

Limites: equivalência à API não comprova equivalência ao Seller Center. Cancelamentos ambíguos ainda necessitam relatório financeiro oficial. Não há promessa de ausência de atraso externo. Nenhum segredo faz parte desta entrega.

O build local pela Vercel recebeu placeholders para variáveis sensíveis não exportáveis; a validação final deve ocorrer no build remoto, antes de promover o domínio.
