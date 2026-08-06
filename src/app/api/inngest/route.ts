import { serve } from "inngest/next";
import { inngest } from "@/shared/lib/inngest/client";
import { A1_ingestaoPedidos } from "@/modules/jobs/A1-ingestao-pedidos";
import { A2_baixaEstoque } from "@/modules/jobs/A2-baixa-estoque";
import { A3_estornoEstoque } from "@/modules/jobs/A3-estorno-estoque";
import { A5_reconciliacaoSaldo } from "@/modules/jobs/A5-reconciliacao-saldo";
import { A6_alertaMinimo } from "@/modules/jobs/A6-alerta-minimo";
import { A8_reguaAvaliacao } from "@/modules/jobs/A8-regua-avaliacao";
import { A9_reguaAniversario } from "@/modules/jobs/A9-regua-aniversario";
import { A10_reguaReativacao } from "@/modules/jobs/A10-regua-reativacao";
import { A11_cancelarOptout } from "@/modules/jobs/A11-cancelar-optout";
import { A4_syncSaldo } from "@/modules/jobs/A4-sync-saldo";
import { A7_encalhe } from "@/modules/jobs/A7-encalhe";
import { A12_conversaParada } from "@/modules/jobs/A12-conversa-parada";
import { A13_scoresCliente } from "@/modules/jobs/A13-scores-cliente";
import { A17_documentosAutomaticos } from "@/modules/jobs/A17-documentos-automaticos";
import { A19_notificacoesInternas } from "@/modules/jobs/A19-notificacoes-internas";
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
import { A27_syncAnuncio } from "@/modules/jobs/A27-sync-anuncio";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    A1_ingestaoPedidos,
    A2_baixaEstoque,
    A3_estornoEstoque,
    A4_syncSaldo,
    A5_reconciliacaoSaldo,
    A6_alertaMinimo,
    A7_encalhe,
    A8_reguaAvaliacao,
    A9_reguaAniversario,
    A10_reguaReativacao,
    A11_cancelarOptout,
    A12_conversaParada,
    A13_scoresCliente,
    A14_scoresProduto,
    A15_insightsFunil,
    A16_sugestoesCampanha,
    A17_documentosAutomaticos,
    A18_saudeConectores,
    A19_notificacoesInternas,
    A20_backupVerificacao,
    A21_guardaConsumoIA,
    A22_lgpdRetencao,
    A23_refreshMLTokens,
    A24_pollPedidos,
    A25_prepararImportacaoHistorica,
    A26_importarHistorico,
    A27_syncAnuncio,
  ],
});
