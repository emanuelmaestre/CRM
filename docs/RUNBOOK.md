# RUNBOOK - Operacao CRM LEO

Este RUNBOOK cobre rotina, incidentes, backup/restore, deploy e homologacao. Ele deve ser atualizado
sempre que uma dependencia externa mudar.

## Regra de Ouro

Enquanto o go-live nao for aprovado, manter:

```env
EXTERNAL_SENDS_ENABLED=false
```

Nao enviar mensagens externas, nao conectar contas reais e nao alterar segredos sem aprovacao
humana explicita.

## Rotina Diaria

1. Acessar `/admin/saude`.
2. Conferir conectores degradados/desconectados.
3. Conferir jobs com falha definitiva.
4. Conferir mensagens nao entregues ou conversas paradas.
5. Conferir alertas de estoque minimo e divergencia.

## Rotina Semanal

1. Revisar bloqueios de reguas por gate.
2. Conferir custos de IA e alertas A21.
3. Conferir produtos com risco de encalhe.
4. Revisar sugestoes de campanha aprovadas/rejeitadas.
5. Conferir contas de canal sem SKU mapeado.

## Rotina Mensal

1. Revisar acessos de usuarios e perfis.
2. Executar teste de restauracao em staging.
3. Revisar politicas LGPD de retencao.
4. Atualizar evidencias em `docs/fase-*-dod.json`.

## Deploy

1. Rodar `npm run typecheck`.
2. Rodar `npm run lint`.
3. Rodar `npx vitest run --maxWorkers=1`.
4. Rodar `npm run build`.
5. Rodar E2E autenticado conforme ambiente.
6. Aplicar migrations somente apos backup do ambiente alvo.
7. Produção exige aceite humano e rollback conhecido.

## Backup e Restore

O Supabase gerencia backups automaticos. O job A20 registra conectividade/integridade operacional,
mas nao substitui evidencia real de restore.

Checklist mensal de restore:

1. confirmar backup disponivel no provedor;
2. restaurar em staging isolado;
3. rodar `npm run test:rls`;
4. rodar `npm run test:phase-b:integration`;
5. registrar data, responsavel, RPO/RTO observado e resultado.

Meta:

- RPO: 24h.
- RTO: 4h.

## Incidentes

Classificacao:

- Critico: vazamento de dados, envio cruzado de marca, perda de dado, sistema fora.
- Alto: canal principal caido, regra disparando errado, estoque divergente.
- Medio: job atrasado, relatorio incorreto, erro visual sem perda operacional.

Resposta:

1. conter: pausar envios externos ou conta afetada;
2. preservar evidencia: logs, `job_run`, `audit_log`, payload sem segredo;
3. corrigir ou fazer rollback;
4. comunicar a equipe responsável;
5. registrar post-mortem em `docs/DECISOES/`.

## Pausar Envios

1. Definir `EXTERNAL_SENDS_ENABLED=false`.
2. Confirmar no painel `/admin/saude`.
3. Conferir filas e jobs de regua.
4. Reprocessar somente apos aceite.

## Homologacao de Conector

Para cada canal/marca:

1. cadastrar `channel_account`;
2. configurar segredos no ambiente alvo;
3. executar `saude()` sem expor token;
4. mapear SKU x anuncio/listing;
5. receber pedido real;
6. confirmar ingestao em ate 5 minutos;
7. confirmar baixa de estoque;
8. confirmar sync remoto ou divergencia visivel;
9. confirmar inbox quando o provider suportar.

## Saida/Portabilidade

1. Exportar schema/migrations.
2. Exportar dados por org em formato aberto.
3. Exportar documentos privados por bucket.
4. Entregar lista de variaveis de ambiente sem valores secretos.
5. Revogar acessos apos confirmacao.
