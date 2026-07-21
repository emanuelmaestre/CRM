import { serve } from "inngest/next";
import { inngest } from "@/shared/lib/inngest/client";
import { A2_baixaEstoque } from "@/modules/jobs/A2-baixa-estoque";
import { A3_estornoEstoque } from "@/modules/jobs/A3-estorno-estoque";
import { A5_reconciliacaoSaldo } from "@/modules/jobs/A5-reconciliacao-saldo";
import { A6_alertaMinimo } from "@/modules/jobs/A6-alerta-minimo";
import { A8_reguaAvaliacao } from "@/modules/jobs/A8-regua-avaliacao";
import { A9_reguaAniversario } from "@/modules/jobs/A9-regua-aniversario";
import { A10_reguaReativacao } from "@/modules/jobs/A10-regua-reativacao";
import { A11_cancelarOptout } from "@/modules/jobs/A11-cancelar-optout";
import { A13_scoresCliente } from "@/modules/jobs/A13-scores-cliente";
import { A14_scoresProduto } from "@/modules/jobs/A14-scores-produto";
import { A15_insightsFunil } from "@/modules/jobs/A15-insights-funil";
import { A16_sugestoesCampanha } from "@/modules/jobs/A16-sugestoes-campanha";
import { A18_saudeConectores } from "@/modules/jobs/A18-saude-conectores";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    A2_baixaEstoque,
    A3_estornoEstoque,
    A5_reconciliacaoSaldo,
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
  ],
});
