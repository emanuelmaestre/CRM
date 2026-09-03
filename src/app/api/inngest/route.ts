import { serve } from "inngest/next";
import { inngest } from "@/shared/lib/inngest/client";
import { A1_ingestaoPedidos } from "@/modules/jobs/A1-ingestao-pedidos";
import { A5_coletaSaldoCanais } from "@/modules/jobs/A5-reconciliacao-saldo";
import { A6_alertaMinimo } from "@/modules/jobs/A6-alerta-minimo";
import { A8_reguaAvaliacao } from "@/modules/jobs/A8-regua-avaliacao";
import { A9_reguaAniversario } from "@/modules/jobs/A9-regua-aniversario";
import { A10_reguaReativacao } from "@/modules/jobs/A10-regua-reativacao";
import { A11_cancelarOptout } from "@/modules/jobs/A11-cancelar-optout";
import { A13_scoresCliente } from "@/modules/jobs/A13-scores-cliente";
import { A20_backupVerificacao } from "@/modules/jobs/A20-backup-verificacao";
import { A21_guardaConsumoIA } from "@/modules/jobs/A21-guarda-consumo-ia";
import { A22_lgpdRetencao } from "@/modules/jobs/A22-lgpd-retencao";
import { A23_refreshMLTokens } from "@/modules/jobs/A23-refresh-ml-tokens";
import { A14_scoresProduto } from "@/modules/jobs/A14-scores-produto";
import { A15_insightsFunil } from "@/modules/jobs/A15-insights-funil";
import { A16_sugestoesCampanha } from "@/modules/jobs/A16-sugestoes-campanha";
import { A18_saudeConectores } from "@/modules/jobs/A18-saude-conectores";
import { A24_pollPedidos } from "@/modules/jobs/A24-poll-pedidos";
import { A25_prepararImportacaoHistorica } from "@/modules/jobs/A25-importacao-historica";
import { A26_importarHistorico } from "@/modules/jobs/A26-importar-historico";
import { A28_syncAvaliacoesML } from "@/modules/jobs/A28-sync-avaliacoes-ml";
import { A29_recoletaPorVenda } from "@/modules/jobs/A29-recoleta-por-venda";
import { A30_snapshotMetricas } from "@/modules/jobs/A30-snapshot-metricas";
import { A31_sincronizarConta } from "@/modules/jobs/A31-sincronizar-conta";
import { A32_syncAnunciosAds } from "@/modules/jobs/A32-sync-anuncios-ads";
import { A33_refreshShopeeTokens } from "@/modules/jobs/A33-refresh-shopee-tokens";
import { A34_reconciliarPedidos } from "@/modules/jobs/A34-reconciliar-pedidos";
import { A35_auditarFinanceiro } from "@/modules/jobs/A35-auditar-financeiro";
import { A36_refreshTikTokTokens } from "@/modules/jobs/A36-refresh-tiktok-tokens";
import { A37_repasseTikTok } from "@/modules/jobs/A37-repasse-tiktok";

/* Cada `step.run` é uma invocação HTTP própria desta rota, então o limite vale
   por step, não pelo job inteiro. Sem declarar nada, a Vercel aplica o padrão
   do plano — e um step que passasse disso era morto no meio, fazendo o Inngest
   reexecutar o job do zero. Foi o que aconteceu em 25/08/2026 com a
   sincronização de Pedidos (ver A31): a conta refazia a varredura de 90 dias a
   cada ~6 minutos, sem nunca terminar, queimando a cota do proxy Shopee.
   Declarar o teto deixa o orçamento explícito; a correção de verdade é manter
   cada step pequeno. */
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    A1_ingestaoPedidos,
    A5_coletaSaldoCanais,
    A6_alertaMinimo,
    A8_reguaAvaliacao,
    A9_reguaAniversario,
    A10_reguaReativacao,
    A11_cancelarOptout,
    A13_scoresCliente,
    A14_scoresProduto,
    A15_insightsFunil,
    A16_sugestoesCampanha,
    A18_saudeConectores,
    A20_backupVerificacao,
    A21_guardaConsumoIA,
    A22_lgpdRetencao,
    A23_refreshMLTokens,
    A24_pollPedidos,
    A25_prepararImportacaoHistorica,
    A26_importarHistorico,
    A28_syncAvaliacoesML,
    A29_recoletaPorVenda,
    A30_snapshotMetricas,
    A31_sincronizarConta,
    A32_syncAnunciosAds,
    A33_refreshShopeeTokens,
    A34_reconciliarPedidos,
    A35_auditarFinanceiro,
    A36_refreshTikTokTokens,
    A37_repasseTikTok,
  ],
});
