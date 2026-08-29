"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { stagger } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { actionObterVisaoGeralAnuncios } from "../actions";
import { useCanalAnuncios } from "../canal-anuncios";
import { SeletorCanalAnuncios, SeletorMarca } from "../anuncios-cliente";
import { AvisoJanela, Card } from "../anuncios-primitives";
import { COR_PRIORIDADE, LinhaAlerta, LinhaGrupo } from "../atencao-card";
import type { PrioridadeAlerta } from "@/modules/anuncios/application/alertas";
import type { VisaoGeralMarca, VisaoGeralResultado } from "@/modules/anuncios/application/visao-geral.service";
import { tint } from "@/shared/design-system/color";

const copy = anunciosConfig.alertasDetalhe;

type Filtro = "todos" | Exclude<PrioridadeAlerta, "informativo">;

const FILTROS = ["todos", "critico", "importante", "oportunidade"] as const satisfies readonly Filtro[];

function Esqueleto() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export function AlertasClienteDetalhe() {
  // Esta era a única das seis telas do módulo que ignorava o canal: buscava
  // sem `canal` e caía sempre no Mercado Livre, com o seletor ausente. Quem
  // escolhia Shopee em Publicidade e clicava em Alertas voltava para o ML sem
  // nenhum sinal de que tinha voltado.
  const { canal } = useCanalAnuncios();
  // O canal carregado vive junto dos dados, e "carregando" é a comparação
  // entre ele e o canal ativo — mesmo padrão de Produtos e Histórico. Um
  // `setCarregando(true)` no corpo do efeito faria uma renderização a mais só
  // para anunciar que vai renderizar de novo.
  const [consulta, setConsulta] = useState<{ canal: string; dados: VisaoGeralResultado | null }>({ canal: "", dados: null });
  const carregando = consulta.canal !== canal;
  const dados = consulta.dados;
  const [marcaAtiva, setMarcaAtiva] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");

  useEffect(() => {
    let ativo = true;
    actionObterVisaoGeralAnuncios({ canal })
      .then((resultado) => {
        if (!ativo) return;
        setConsulta({ canal, dados: resultado });
        // A marca ativa não sobrevive à troca de canal quando ela não anuncia
        // no canal novo (a KARZI não tem Shopee) — mesmo tratamento das
        // outras telas do módulo.
        setMarcaAtiva((atual) => (
          atual && resultado.marcas.some((marca) => marca.brandId === atual)
            ? atual
            : resultado.marcas[0]?.brandId ?? null
        ));
      })
      .catch(() => {
        if (!ativo) return;
        setConsulta({ canal, dados: null });
        toast.error(anunciosConfig.erros.carregar);
      });
    return () => { ativo = false; };
  }, [canal]);

  const marca: VisaoGeralMarca | undefined = dados?.marcas.find((item) => item.brandId === marcaAtiva) ?? dados?.marcas[0];

  const individuaisFiltrados = useMemo(
    () => (marca?.alertasIndividuais ?? []).filter((a) => filtro === "todos" || a.prioridade === filtro),
    [marca, filtro],
  );
  const gruposFiltrados = useMemo(
    () => (marca?.alertasAgrupados ?? []).filter((g) => filtro === "todos" || g.prioridade === filtro),
    [marca, filtro],
  );

  if (carregando) return <Esqueleto />;

  if (!dados || dados.semDados || !marca) {
    return (
      <div className="card-surface">
        <EmptyState illustration="generic" title={anunciosConfig.vazio.titulo} description={anunciosConfig.vazio.descricao} />
      </div>
    );
  }

  const total = individuaisFiltrados.length + gruposFiltrados.length;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      {/* Mesma fileira de filtros das outras telas do módulo. */}
      <div className="flex flex-wrap items-center gap-3">
        <SeletorCanalAnuncios />
        <SeletorMarca
          marcas={dados.marcas}
          ativa={marca.brandId}
          onChange={setMarcaAtiva}
          indisponiveis={dados.marcasIndisponiveis}
        />
        <span className="h-px flex-1 bg-border" />
      </div>

      <AvisoJanela janela={dados.janela} fim={marca.janela.fim} />

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((item) => {
          const ativo = item === filtro;
          const cor = item === "todos" ? "var(--foreground)" : COR_PRIORIDADE[item];
          return (
            <button
              key={item}
              type="button"
              onClick={() => setFiltro(item)}
              className="press-feedback rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: ativo ? tint(cor, 9) : "var(--muted)",
                color: ativo ? cor : "var(--muted-foreground)",
              }}
            >
              {copy.filtros[item]}
            </button>
          );
        })}
      </div>

      <Card>
        {total === 0 ? (
          <EmptyState illustration="generic" title={copy.vazio} description={copy.vazioDescricao} />
        ) : (
          <ul className="flex flex-col gap-2 p-4 sm:p-5">
            {individuaisFiltrados.map((alerta, indice) => (
              <LinhaAlerta key={alerta.chave} alerta={alerta} indice={indice} />
            ))}
            {gruposFiltrados.map((grupo, indice) => (
              <LinhaGrupo key={grupo.tituloBase} grupo={grupo} indice={indice + individuaisFiltrados.length} />
            ))}
          </ul>
        )}
      </Card>

      {total === 0 && marca.alertasIndividuais.length + marca.alertasAgrupados.length === 0 && (
        <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
          <CheckCircle2 size={12} /> Nenhum alerta em nenhuma prioridade nesta marca.
        </p>
      )}
    </motion.div>
  );
}
