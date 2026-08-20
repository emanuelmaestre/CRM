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
import { Card, CardHead, rotuloComExplicacaoEmNegrito } from "../anuncios-primitives";
import { Roas } from "../roas";
import type { AnuncioProduto, ProdutosResultado } from "@/modules/anuncios/application/produtos.service";
import type { VisaoGeralMarca } from "@/modules/anuncios/application/visao-geral.service";

const copy = anunciosConfig.produtosDetalhe;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

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
      {/* Marca + filtros de recomendação numa fileira só — eram 2 linhas
          separadas antes, sem motivo pra isso já que os dois são filtro da
          mesma lista. flex-wrap garante que ainda quebra direito em telas
          estreitas, só não força a quebra quando cabe tudo junto. */}
      <div className="flex flex-wrap items-center gap-3">
        <SeletorMarca marcas={marcas} ativa={marca.brandId} onChange={setMarcaAtiva} />
        {/* Separador entre os dois grupos — sem ele, marca e filtro de
            recomendação (que não têm nada a ver um com o outro) ficavam
            grudados na mesma fileira, parecendo um grupo só. */}
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
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
                  // var(--selecionado) é o acento de "isto está escolhido" usado
                  // no resto do app (Estoque, Vendas, halo de seleção) — preto
                  // puro (--foreground) não seguia esse padrão do design system.
                  background: ativo ? "var(--selecionado)" : "var(--muted)",
                  color: ativo ? "#fff" : "var(--muted-foreground)",
                }}
              >
                {copy.filtros[item]}
              </button>
            );
          })}
        </div>
        <span className="h-px min-w-4 flex-1 bg-border" />
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <RefreshCw size={11} />
          {dados?.sincronizadoEm ? dataHora.format(new Date(dados.sincronizadoEm)) : "Nunca sincronizado"}
        </span>
      </div>

      {dados && dados.desperdicio.itens.length > 0 && (
        <Card>
          <CardHead
            title={copy.desperdicio.titulo}
            subtitle={`${copy.desperdicio.descricao} · ${moeda.format(dados.desperdicio.totalEmAtencao)} em atenção`}
            icon={AlertTriangle}
            accent="var(--destructive)"
          />
        </Card>
      )}

      <Card>
        {carregandoProdutos ? (
          <div className="p-5"><Skeleton className="h-64 w-full" /></div>
        ) : anunciosFiltrados.length === 0 ? (
          <EmptyState illustration="reports" title={copy.vazio} />
        ) : (
          <>
          <div className="divide-y divide-border px-4 py-2 md:hidden">
            {anunciosFiltrados.map((anuncio: AnuncioProduto) => (
              <article key={anuncio.itemId} className="py-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold leading-snug text-foreground">{anuncio.titulo ?? anuncio.itemId}</h4>
                    <p className="mt-1 text-xs text-muted-foreground">{anuncio.campanhaNome}</p>
                  </div>
                  {/* `title` sozinho não explica nada no toque (só no hover
                      de mouse) — no mobile cada selo também dispara um toast
                      com o mesmo texto ao ser tocado. */}
                  <div className="flex shrink-0 gap-1.5">
                    {anuncio.recomendado && (
                      <button type="button" title={copy.recomendado} onClick={() => toast.info(copy.recomendado)} className="press-feedback -m-1.5 p-1.5">
                        <Sparkles size={15} className="text-success" />
                      </button>
                    )}
                    {anuncio.buyBoxWinner && (
                      <button type="button" title={copy.buyBox} onClick={() => toast.info(copy.buyBox)} className="press-feedback -m-1.5 p-1.5">
                        <Trophy size={15} className="text-warning" />
                      </button>
                    )}
                    {idsDesperdicio.has(anuncio.itemId) && (
                      <button type="button" title={copy.desperdicio.titulo} onClick={() => toast.info(copy.desperdicio.titulo)} className="press-feedback -m-1.5 p-1.5">
                        <AlertTriangle size={15} className="text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Investimento</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(anuncio.investimento)}</dd></div>
                  <div className="text-right"><dt className="text-xs text-muted-foreground">Receita</dt><dd className="mt-0.5 font-semibold tabular-nums">{moeda.format(anuncio.receita)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">ROAS</dt><dd className="mt-0.5 font-semibold"><Roas valor={anuncio.roas} /></dd></div>
                  <div className="text-right"><dt className="text-xs text-muted-foreground">Cliques</dt><dd className="mt-0.5 tabular-nums">{anuncio.cliques.toLocaleString("pt-BR")}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Vendas</dt><dd className="mt-0.5 tabular-nums">{anuncio.vendas.toLocaleString("pt-BR")}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <div className="table-scroll hidden px-1 pb-5 pt-3 md:block sm:px-2">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-medium uppercase text-muted-foreground">
                  {copy.colunas.map((coluna: string, indice: number) => (
                    <th key={coluna} className={`px-3 py-2 ${indice > 1 ? "text-right" : ""}`}>{rotuloComExplicacaoEmNegrito(coluna)}</th>
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
                          <span title={copy.recomendado}><Sparkles size={12} className="shrink-0 text-success" /></span>
                        )}
                        {anuncio.buyBoxWinner && (
                          <span title={copy.buyBox}><Trophy size={12} className="shrink-0 text-warning" /></span>
                        )}
                        {idsDesperdicio.has(anuncio.itemId) && (
                          <span title={copy.desperdicio.titulo}><AlertTriangle size={12} className="shrink-0 text-destructive" /></span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground">{anuncio.campanhaNome}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{moeda.format(anuncio.investimento)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{moeda.format(anuncio.receita)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">
                      <Roas valor={anuncio.roas} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{anuncio.cliques.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{anuncio.vendas.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </motion.div>
  );
}
