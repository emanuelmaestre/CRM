"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { CalendarioPopover } from "@/shared/design-system/primitives/CalendarioPopover";
import { stagger } from "@/shared/design-system/motion-variants";
import metricasConfig from "@/config/metricas.json";
import { actionObterAtendimento, actionObterSaudeLoja } from "./actions";
import { AcoesCard } from "./acoes-card";
import { AtendimentoCard } from "./atendimento-card";
import { ComparacaoCard } from "./comparacao-card";
import { ReputacaoCard } from "./reputacao-card";
import { ScoreCard } from "./score-card";
import { SectionLabel } from "./metricas-primitives";
import { exportarMetricasPDF } from "./exportar-pdf";
import type { SaudeLojaResultado } from "@/modules/metricas/application/saude-loja.service";
import type { AtendimentoResumo } from "@/modules/metricas/application/atendimento.service";

const copy = metricasConfig.secoes;

interface Periodo {
  /** yyyy-mm-dd. Vazio dos dois lados = últimos 30 dias, resolvido no servidor. */
  inicio: string;
  fim: string;
}

function paraDataInput(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}
const hoje = paraDataInput(new Date());

export function MetricasCliente() {
  const [periodo, setPeriodo] = useState<Periodo>({ inicio: "", fim: "" });
  /* Guardar a chave do período junto com o resultado, em vez de um booleano de
     "carregando" separado, é o mesmo padrão do Painel: o estado de carga passa
     a ser derivado (chave pedida ≠ chave recebida). Além de evitar setState
     dentro do efeito, mantém o resultado anterior na tela enquanto o novo vem
     — o card esmaece em vez de sumir e voltar. */
  const [saude, setSaude] = useState<{ chave: string; dados: SaudeLojaResultado | null }>({ chave: "", dados: null });
  const [atendimento, setAtendimento] = useState<{ chave: string; dados: AtendimentoResumo | null }>({ chave: "", dados: null });

  // Só filtra quando as duas pontas estão preenchidas — meia data é um período
  // pela metade, e mandá-lo ao servidor produziria uma janela sem sentido.
  const completo = Boolean(periodo.inicio && periodo.fim);
  const inicio = completo ? periodo.inicio : undefined;
  const fim = completo ? periodo.fim : undefined;

  const trocarDatas = useCallback((novoInicio: string, novoFim: string) => {
    setPeriodo({ inicio: novoInicio, fim: novoFim });
  }, []);

  const chave = `${inicio ?? ""}..${fim ?? ""}`;

  /* Duas buscas separadas de propósito: o funil de atendimento é só banco
     local e volta em milissegundos, enquanto a saúde da loja espera o Mercado
     Livre. Juntas num Promise.all, o funil ficaria em skeleton à toa. */
  useEffect(() => {
    let ativo = true;
    actionObterSaudeLoja({ inicio, fim })
      .then((resultado) => { if (ativo) setSaude({ chave, dados: resultado }); })
      .catch(() => {
        if (!ativo) return;
        setSaude({ chave, dados: null });
        toast.error(metricasConfig.erros.carregar, { id: "metricas-saude" });
      });
    return () => { ativo = false; };
  }, [chave, inicio, fim]);

  useEffect(() => {
    let ativo = true;
    actionObterAtendimento({ inicio, fim })
      .then((resultado) => { if (ativo) setAtendimento({ chave, dados: resultado }); })
      .catch(() => { if (ativo) setAtendimento({ chave, dados: null }); });
    return () => { ativo = false; };
  }, [chave, inicio, fim]);

  const carregandoSaude = saude.chave !== chave;
  const carregandoAtendimento = atendimento.chave !== chave;

  const [exportando, setExportando] = useState(false);

  async function exportar() {
    if (!saude.dados) return;
    setExportando(true);
    try {
      await exportarMetricasPDF(saude.dados, atendimento.dados);
      toast.success(metricasConfig.exportacao.sucesso);
    } catch {
      toast.error(metricasConfig.exportacao.erro);
    } finally {
      setExportando(false);
    }
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      {/* Período: uma escolha só, no topo, valendo para a página inteira. O
          recorte por marca vive dentro de cada card, onde ele muda a leitura. */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-label-md uppercase text-muted-foreground">Período</span>
        <CalendarioPopover
          rotulo="De:"
          valor={periodo.inicio}
          max={periodo.fim || hoje}
          onChange={(valor) => trocarDatas(valor, periodo.fim)}
          disabled={carregandoSaude}
        />
        <CalendarioPopover
          rotulo="Até:"
          valor={periodo.fim}
          min={periodo.inicio}
          max={hoje}
          onChange={(valor) => trocarDatas(periodo.inicio, valor)}
          disabled={carregandoSaude}
          atraso={0.04}
        />
        <span className="text-[11px] text-muted-foreground">
          {completo ? saude.dados?.periodoLabel ?? "" : "Últimos 30 dias"}
        </span>
        <span className="h-px flex-1 bg-border" />

        {/* Exportar fica na linha do período porque é ele quem define o
            recorte do documento — o botão pertence à escolha, não à página. */}
        <motion.button
          type="button"
          onClick={exportar}
          disabled={exportando || !saude.dados}
          whileHover={saude.dados ? { scale: 1.03 } : undefined}
          whileTap={saude.dados ? { scale: 0.97 } : undefined}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[0.75rem] border border-border px-3 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          <FileText size={13} />
          {exportando ? metricasConfig.exportacao.gerando : metricasConfig.exportacao.acao}
        </motion.button>
      </div>

      {/* Ato 1 — um número antes de qualquer painel */}
      <section className="flex flex-col gap-3">
        <SectionLabel>{copy.saude}</SectionLabel>
        <ScoreCard dados={saude.dados} carregando={carregandoSaude} />
      </section>

      {/* Ato 2 — de onde vem a parte que não depende de nós */}
      <section className="flex flex-col gap-3">
        <SectionLabel hint="direto do Mercado Livre">{copy.reputacao}</SectionLabel>
        <ReputacaoCard dados={saude.dados} carregando={carregandoSaude} />
      </section>

      {/* Ato 3 — a leitura que o Mercado Livre não dá: as marcas juntas */}
      <section className="flex flex-col gap-3">
        <SectionLabel>{copy.comparacao}</SectionLabel>
        <ComparacaoCard dados={saude.dados} carregando={carregandoSaude} />
      </section>

      {/* Ato 4 — o que depende só de nós */}
      <section className="flex flex-col gap-3">
        <SectionLabel>{copy.atendimento}</SectionLabel>
        <AtendimentoCard dados={atendimento.dados} carregando={carregandoAtendimento} />
      </section>

      {/* Ato 5 — número sem "e daí?" é enfeite: o que a leitura acima sugere fazer */}
      <section className="flex flex-col gap-3">
        <SectionLabel>{copy.acoes}</SectionLabel>
        <AcoesCard />
      </section>
    </motion.div>
  );
}
