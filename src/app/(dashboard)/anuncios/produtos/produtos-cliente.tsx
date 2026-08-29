"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Package, Sparkles, Trophy } from "lucide-react";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { Skeleton } from "@/shared/design-system/primitives/Skeleton";
import { SelectPopover } from "@/shared/design-system/primitives/SelectPopover";
import { stagger } from "@/shared/design-system/motion-variants";
import anunciosConfig from "@/config/anuncios.json";
import { actionObterProdutosDaMarca, actionObterVisaoGeralAnuncios } from "../actions";
import { useCanalAnuncios } from "../canal-anuncios";
import { SeletorCanalAnuncios, SeletorMarca } from "../anuncios-cliente";
import { AvisoJanela, Card, CardHead, RotuloComInfo, rotuloDaJanela } from "../anuncios-primitives";
import { Roas } from "../roas";
import type { AnuncioProduto, ProdutosResultado } from "@/modules/anuncios/application/produtos.service";
import type { MarcaIndisponivel, VisaoGeralMarca } from "@/modules/anuncios/application/visao-geral.service";

const copy = anunciosConfig.produtosDetalhe;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

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
  const [marcasIndisponiveis, setMarcasIndisponiveis] = useState<MarcaIndisponivel[]>([]);
  const [marcaAtiva, setMarcaAtiva] = useState<string | null>(null);
  const { canal } = useCanalAnuncios();
  const [dados, setDados] = useState<ProdutosResultado | null>(null);
  // Guarda marca + canal, não só a marca: sem o canal na chave, trocar de
  // canal deixaria a lista do Mercado Livre na tela como se fosse a da Shopee.
  const [dadosBrandId, setDadosBrandId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const chaveProdutos = `${marcaAtiva}:${canal}`;
  const carregandoProdutos = marcaAtiva !== null && dadosBrandId !== chaveProdutos;

  useEffect(() => {
    let ativo = true;
    actionObterVisaoGeralAnuncios({ canal })
      .then((resultado) => {
        if (!ativo) return;
        setMarcas(resultado.marcas);
        setMarcasIndisponiveis(resultado.marcasIndisponiveis);
        // Marca que não anuncia no canal novo não pode continuar ativa.
        setMarcaAtiva((atual) => (
          atual && resultado.marcas.some((marca) => marca.brandId === atual)
            ? atual
            : resultado.marcas[0]?.brandId ?? null
        ));
      })
      .catch(() => { if (ativo) toast.error(anunciosConfig.erros.carregar); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [canal]);

  useEffect(() => {
    if (!marcaAtiva) return;
    let ativo = true;
    actionObterProdutosDaMarca({ brandId: marcaAtiva, canal })
      .then((resultado) => { if (ativo) { setDados(resultado); setDadosBrandId(chaveProdutos); } })
      .catch(() => { if (ativo) { toast.error(anunciosConfig.erros.carregar); setDadosBrandId(chaveProdutos); } });
    return () => { ativo = false; };
  }, [marcaAtiva, canal, chaveProdutos]);

  const idsDesperdicio = useMemo(
    () => new Set((dados?.desperdicio.itens ?? []).map((item) => item.id)),
    [dados],
  );

  /* Colunas e filtros que só existem em alguns canais. Decididos pelo DADO,
     não por um `if (canal === "shopee")`: se amanhã a Shopee passar a expor
     recomendação, ou o ML parar de expor, a tela acompanha sozinha.

     • Campanha: na Shopee cada campanha anuncia um item só e leva o título do
       produto como nome — a coluna repetia, palavra por palavra, a coluna ao
       lado, com 90 caracteres cada.
     • Criado em: a Shopee não devolve data de criação do item.
     • Recomendados: é um sinal do Mercado Livre; na Shopee o filtro existia e
       nunca devolvia nada, o que se lê como lista vazia, não como "não se
       aplica aqui". */
  const colunas = useMemo(() => {
    const lista = dados?.anuncios ?? [];
    return {
      campanha: lista.some((a) => a.campanhaNome !== (a.titulo ?? a.itemId)),
      criadoEm: lista.some((a) => a.criadoEm !== null),
      recomendacao: lista.some((a) => a.recomendado !== null),
    };
  }, [dados]);

  const filtrosDisponiveis = useMemo(
    () => FILTROS.filter((item) => item !== "recomendados" || colunas.recomendacao),
    [colunas.recomendacao],
  );

  // Filtro escolhido no Mercado Livre que não existe na Shopee não pode ficar
  // ativo depois da troca de canal — a lista sairia vazia sem explicação.
  // Derivado, não corrigido num efeito: o efeito renderizaria uma vez com a
  // lista vazia antes de se consertar.
  const filtroEfetivo = filtrosDisponiveis.includes(filtro) ? filtro : "todos";

  const anunciosFiltrados = useMemo(() => {
    const lista = dados?.anuncios ?? [];
    if (filtroEfetivo === "recomendados") return lista.filter((a) => a.recomendado);
    if (filtroEfetivo === "desperdicio") return lista.filter((a) => idsDesperdicio.has(a.linhaId));
    return lista;
  }, [dados, filtroEfetivo, idsDesperdicio]);

  if (carregando) return <Esqueleto />;

  if (!marcas || marcas.length === 0) {
    return (
      <div className="card-surface">
        <EmptyState illustration="generic" title={anunciosConfig.vazio.titulo} description={anunciosConfig.vazio.descricao} />
      </div>
    );
  }

  const marca = marcas.find((item) => item.brandId === marcaAtiva) ?? marcas[0];
  // As explicações das colunas diziam "hoje" em texto fixo. Com a janela
  // variando por canal, dizer "hoje" sobre uma soma de sete dias seria
  // simplesmente falso.
  const naJanela = (dados?.janela?.dias ?? 1) <= 1 ? "nos dados de hoje" : `nos últimos ${dados!.janela!.dias} dias`;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">
      <div className="flex items-center gap-2 md:hidden">
        <Link
          href="/publicidade"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={13} /> {anunciosConfig.produtosDetalhe.voltar}
        </Link>
      </div>

      {/* Marca + filtros de recomendação numa fileira só — eram 2 linhas
          separadas antes, sem motivo pra isso já que os dois são filtro da
          mesma lista. flex-wrap garante que ainda quebra direito em telas
          estreitas, só não força a quebra quando cabe tudo junto.
          Mobile: centralizado, com o canal (Mercado Livre) acima e as
          empresas abaixo — `order` inverte só a leitura visual, sem mudar o
          DOM; `md:contents` desfaz o agrupamento a partir do md, voltando à
          fileira única de sempre (marca, depois canal, depois o horário —
          que já saiu daqui, ver acima). */}
      <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
        <div className="order-1 flex w-full justify-center gap-1.5 md:order-none md:contents">
          <SeletorCanalAnuncios />
        </div>
        <div className="order-2 flex w-full justify-center gap-1.5 md:order-none md:contents">
        {/* A marca que não anuncia neste canal continua na fileira, apagada
            e com o ícone de tomada, em vez de sumir — mesma decisão da Visão
            Geral (some sem explicação, o operador não distingue "não anuncia
            aqui" de "quebrou"). */}
          <SeletorMarca marcas={marcas} ativa={marca.brandId} onChange={setMarcaAtiva} indisponiveis={marcasIndisponiveis} />
        </div>
        <span className="hidden h-px min-w-4 flex-1 bg-border md:block" />
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

      <AvisoJanela janela={dados?.janela ?? null} fim={dados?.janela?.fim ?? null} />

      <Card>
        <CardHead
          title={copy.title}
          // A janela entra no subtítulo porque esta tela não tem calendário:
          // sem isso, "37 anúncios" não diz de quando, e um total de sete dias
          // passa por total do dia.
          subtitle={dados?.janela ? `${copy.description} · ${rotuloDaJanela(dados.janela.dias)}` : copy.description}
          icon={Package}
          accent="var(--acento-2)"
          trailing={(
            <SelectPopover
              valor={filtroEfetivo}
              onChange={setFiltro}
              buttonClassName="press-feedback inline-flex h-11 min-w-[9rem] items-center justify-between gap-2 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:border-selecionado"
              itens={filtrosDisponiveis.map((item) => ({ value: item, label: copy.filtros[item] }))}
            />
          )}
        />
        {carregandoProdutos ? (
          <div className="p-5"><Skeleton className="h-64 w-full" /></div>
        ) : anunciosFiltrados.length === 0 ? (
          <EmptyState illustration="reports" title={copy.vazio} />
        ) : (
          <>
          <div className="divide-y divide-border px-4 py-2 md:hidden">
            {anunciosFiltrados.map((anuncio: AnuncioProduto) => (
              <article key={anuncio.linhaId} className="py-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold leading-snug text-foreground">{anuncio.titulo ?? anuncio.itemId}</h4>
                    {colunas.campanha && <p className="mt-1 text-xs text-muted-foreground">{anuncio.campanhaNome}</p>}
                    {anuncio.sku && <p className="mt-1 font-mono text-[11px] text-muted-foreground">{anuncio.sku}</p>}
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
                    {idsDesperdicio.has(anuncio.linhaId) && (
                      <button type="button" title={copy.desperdicio.titulo} onClick={() => toast.info(copy.desperdicio.titulo)} className="press-feedback -m-1.5 p-1.5">
                        <AlertTriangle size={15} className="text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
                {/* Grade de duas colunas: a segunda de cada par alinha à
                    direita. Com "Criado em" some num canal e presente no
                    outro, o alinhamento não pode estar escrito à mão em cada
                    célula — a paridade do índice é que decide. */}
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {[
                    ...(colunas.criadoEm
                      ? [{ rotulo: "Criado em", valor: <span className="font-medium tabular-nums">{anuncio.criadoEm ? dataCurta.format(new Date(anuncio.criadoEm)) : "Não informada"}</span> }]
                      : []),
                    { rotulo: "Investimento", valor: <span className="font-semibold tabular-nums">{moeda.format(anuncio.investimento)}</span> },
                    { rotulo: "Receita", valor: <span className="font-semibold tabular-nums">{moeda.format(anuncio.receita)}</span> },
                    { rotulo: "ROAS", valor: <span className="font-semibold"><Roas valor={anuncio.roas} /></span> },
                    { rotulo: "Cliques", valor: <span className="tabular-nums">{anuncio.cliques.toLocaleString("pt-BR")}</span> },
                    { rotulo: "Vendas", valor: <span className="tabular-nums">{anuncio.vendas.toLocaleString("pt-BR")}</span> },
                  ].map((campo, indice) => (
                    <div key={campo.rotulo} className={indice % 2 === 1 ? "text-right" : undefined}>
                      <dt className="text-xs text-muted-foreground">{campo.rotulo}</dt>
                      <dd className="mt-0.5">{campo.valor}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          <div className="table-scroll hidden px-1 pb-5 pt-3 md:block sm:px-2">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-medium uppercase text-muted-foreground">
                  <th className="whitespace-nowrap px-3 py-2">{copy.colunas[0]}</th>
                  {colunas.campanha && <th className="whitespace-nowrap px-3 py-2">{copy.colunas[1]}</th>}
                  {colunas.criadoEm && (
                    <th className="whitespace-nowrap px-3 py-2 text-right">
                      <RotuloComInfo descricao="Data em que o anúncio (item) foi criado no Mercado Livre. Não é a data em que ele entrou nesta campanha, é a origem do anúncio em si.">{copy.colunas[2]}</RotuloComInfo>
                    </th>
                  )}
                  <th className="whitespace-nowrap px-3 py-2 text-right">
                    <RotuloComInfo descricao={`Quanto foi gasto em mídia com este anúncio, ${naJanela}.`}>{copy.colunas[3]}</RotuloComInfo>
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">
                    <RotuloComInfo descricao={`Faturamento atribuído a este anúncio ${naJanela}. Não é lucro, pois ainda não desconta investimento, custo do produto, frete, taxas ou impostos.`}>{copy.colunas[4]}</RotuloComInfo>
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">
                    <RotuloComInfo descricao="Receita deste anúncio dividida pelo investimento nele. Ajuda a comparar retorno entre anúncios, mas não é margem nem lucro.">{copy.colunas[5]}</RotuloComInfo>
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">
                    <RotuloComInfo descricao={`Vezes que clicaram neste anúncio ${naJanela}.`}>{copy.colunas[6]}</RotuloComInfo>
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">
                    <RotuloComInfo descricao={`Vendas que vieram deste anúncio pago ${naJanela}. Não conta vendas orgânicas (as que teriam acontecido sem investimento em mídia).`}>{copy.colunas[7]}</RotuloComInfo>
                  </th>
                </tr>
              </thead>
              <tbody>
                {anunciosFiltrados.map((anuncio: AnuncioProduto, indice: number) => (
                  <tr key={anuncio.linhaId} className={indice < anunciosFiltrados.length - 1 ? "border-b border-border" : ""}>
                    <td className="max-w-[260px] px-3 py-2.5 font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{anuncio.titulo ?? anuncio.itemId}</span>
                        {/* O SKU vem depois do título, não numa coluna própria:
                            na Shopee o título é o nome comercial inteiro e o
                            SKU é o que permite achar o mesmo item no Estoque. */}
                        {anuncio.sku && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-normal text-muted-foreground">{anuncio.sku}</span>}
                        {anuncio.recomendado && (
                          <span title={copy.recomendado}><Sparkles size={12} className="shrink-0 text-success" /></span>
                        )}
                        {anuncio.buyBoxWinner && (
                          <span title={copy.buyBox}><Trophy size={12} className="shrink-0 text-warning" /></span>
                        )}
                        {idsDesperdicio.has(anuncio.linhaId) && (
                          <span title={copy.desperdicio.titulo}><AlertTriangle size={12} className="shrink-0 text-destructive" /></span>
                        )}
                      </div>
                    </td>
                    {colunas.campanha && <td className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground">{anuncio.campanhaNome}</td>}
                    {colunas.criadoEm && <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{anuncio.criadoEm ? dataCurta.format(new Date(anuncio.criadoEm)) : "Não informada"}</td>}
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
