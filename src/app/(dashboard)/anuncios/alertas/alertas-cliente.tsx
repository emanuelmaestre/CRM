"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { stagger } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { actionObterVisaoGeralAnuncios } from "../actions";
import { SeletorMarca } from "../anuncios-cliente";
import { Card } from "../anuncios-primitives";
import { COR_PRIORIDADE, LinhaAlerta, LinhaGrupo } from "../atencao-card";
import type { PrioridadeAlerta } from "@/modules/anuncios/application/alertas";
import type { VisaoGeralMarca, VisaoGeralResultado } from "@/modules/anuncios/application/visao-geral.service";

const copy = anunciosConfig.alertasDetalhe;
const diaMesAno = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

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
  const [dados, setDados] = useState<VisaoGeralResultado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [marcaAtiva, setMarcaAtiva] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");

  useEffect(() => {
    let ativo = true;
    actionObterVisaoGeralAnuncios()
      .then((resultado) => {
        if (!ativo) return;
        setDados(resultado);
        setMarcaAtiva((atual) => atual ?? resultado.marcas[0]?.brandId ?? null);
      })
      .catch(() => { if (ativo) toast.error(anunciosConfig.erros.carregar); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

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
      <div className="flex flex-wrap items-center gap-3">
        <SeletorMarca marcas={dados.marcas} ativa={marca.brandId} onChange={setMarcaAtiva} />
        <span className="h-px flex-1 bg-border" />
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <RefreshCw size={11} />
          {marca.dataSnapshot ? diaMesAno.format(new Date(`${marca.dataSnapshot}T00:00:00`)) : "—"}
        </span>
      </div>

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
                background: ativo ? `${cor}18` : "var(--muted)",
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
