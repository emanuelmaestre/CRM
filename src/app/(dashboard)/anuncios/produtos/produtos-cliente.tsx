"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, Sparkles, Trophy } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { stagger } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { actionObterProdutosDaMarca, actionObterVisaoGeralAnuncios } from "../actions";
import { SeletorMarca } from "../anuncios-cliente";
import { Card, CardHead } from "../anuncios-primitives";
import type { AnuncioProduto, ProdutosResultado } from "@/modules/anuncios/application/produtos.service";
import type { VisaoGeralMarca } from "@/modules/anuncios/application/visao-geral.service";

const copy = anunciosConfig.produtosDetalhe;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const diaMesAno = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

type Filtro = "todos" | "recomendados" | "desperdicio";
const FILTROS = ["todos", "recomendados", "desperdicio"] as const satisfies readonly Filtro[];

function Esqueleto() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export function ProdutosClienteDetalhe() {
  const [marcas, setMarcas] = useState<VisaoGeralMarca[] | null>(null);
  const [marcaAtiva, setMarcaAtiva] = useState<string | null>(null);
  const [dados, setDados] = useState<ProdutosResultado | null>(null);
  const [dadosBrandId, setDadosBrandId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const carregandoProdutos = marcaAtiva !== null && dadosBrandId !== marcaAtiva;

  useEffect(() => {
    let ativo = true;
    actionObterVisaoGeralAnuncios()
      .then((resultado) => {
        if (!ativo) return;
        setMarcas(resultado.marcas);
        setMarcaAtiva((atual) => atual ?? resultado.marcas[0]?.brandId ?? null);
      })
      .catch(() => { if (ativo) toast.error(anunciosConfig.erros.carregar); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (!marcaAtiva) return;
    let ativo = true;
    actionObterProdutosDaMarca({ brandId: marcaAtiva })
      .then((resultado) => { if (ativo) { setDados(resultado); setDadosBrandId(marcaAtiva); } })
      .catch(() => { if (ativo) { toast.error(anunciosConfig.erros.carregar); setDadosBrandId(marcaAtiva); } });
    return () => { ativo = false; };
  }, [marcaAtiva]);

  const idsDesperdicio = useMemo(
    () => new Set((dados?.desperdicio.itens ?? []).map((item) => item.id)),
    [dados],
  );

  const anunciosFiltrados = useMemo(() => {
    const lista = dados?.anuncios ?? [];
    if (filtro === "recomendados") return lista.filter((a) => a.recomendado);
    if (filtro === "desperdicio") return lista.filter((a) => idsDesperdicio.has(a.itemId));
    return lista;
  }, [dados, filtro, idsDesperdicio]);

  if (carregando) return <Esqueleto />;

  if (!marcas || marcas.length === 0) {
    return (
      <div className="card-surface">
        <EmptyState illustration="generic" title={anunciosConfig.vazio.titulo} description={anunciosConfig.vazio.descricao} />
      </div>
    );
  }

  const marca = marcas.find((item) => item.brandId === marcaAtiva) ?? marcas[0];

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <SeletorMarca marcas={marcas} ativa={marca.brandId} onChange={setMarcaAtiva} />
        <span className="h-px flex-1 bg-border" />
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <RefreshCw size={11} />
          {dados?.dataSnapshot ? diaMesAno.format(new Date(`${dados.dataSnapshot}T00:00:00`)) : "—"}
        </span>
      </div>

      {dados && dados.desperdicio.itens.length > 0 && (
        <Card>
          <CardHead
            title={copy.desperdicio.titulo}
            subtitle={`${copy.desperdicio.descricao} · ${moeda.format(dados.desperdicio.totalEmAtencao)} em atenção`}
            icon={AlertTriangle}
            accent="#C21820"
          />
        </Card>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((item) => {
          const ativo = item === filtro;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setFiltro(item)}
              className="press-feedback rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: ativo ? "var(--foreground)" : "var(--muted)",
                color: ativo ? "var(--background)" : "var(--muted-foreground)",
              }}
            >
              {copy.filtros[item]}
            </button>
          );
        })}
      </div>

      <Card>
        {carregandoProdutos ? (
          <div className="p-5"><Skeleton className="h-64 w-full" /></div>
        ) : anunciosFiltrados.length === 0 ? (
          <EmptyState illustration="reports" title={copy.vazio} />
        ) : (
          <div className="overflow-x-auto px-1 pb-5 pt-3 sm:px-2">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-medium uppercase text-muted-foreground">
                  {copy.colunas.map((coluna: string, indice: number) => (
                    <th key={coluna} className={`px-3 py-2 ${indice > 1 ? "text-right" : ""}`}>{coluna}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {anunciosFiltrados.map((anuncio: AnuncioProduto, indice: number) => (
                  <tr key={anuncio.itemId} className={indice < anunciosFiltrados.length - 1 ? "border-b border-border" : ""}>
                    <td className="max-w-[260px] px-3 py-2.5 font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{anuncio.titulo ?? anuncio.itemId}</span>
                        {anuncio.recomendado && (
                          <span title={copy.recomendado}><Sparkles size={12} className="shrink-0 text-[#1F8A4C]" /></span>
                        )}
                        {anuncio.buyBoxWinner && (
                          <span title={copy.buyBox}><Trophy size={12} className="shrink-0 text-[#B57A00]" /></span>
                        )}
                        {idsDesperdicio.has(anuncio.itemId) && (
                          <span title={copy.desperdicio.titulo}><AlertTriangle size={12} className="shrink-0 text-[#C21820]" /></span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground">{anuncio.campanhaNome}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{moeda.format(anuncio.investimento)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{moeda.format(anuncio.receita)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums" style={{ color: anuncio.roas === null ? undefined : anuncio.roas >= 1 ? "#1F8A4C" : "#C21820" }}>
                      {anuncio.roas === null ? "—" : `${anuncio.roas.toFixed(2)}x`}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{anuncio.cliques.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{anuncio.vendas.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
