"use client";

import { useState, useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Eye, PlugZap2, RefreshCw } from "lucide-react";
import { springs, transicao, variantes, escalonamento, staggerExagerado, entradaExagerada } from "@/shared/design-system/motion-variants";
import { actionListarClientes, actionContarClientesPorCanal, actionContarClientesPorMarca } from "./actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo, channelAccent } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
import { NumeroAnimado } from "@/shared/design-system/primitives/NumeroAnimado";
import pagesConfig from "@/config/pages.json";
import channelsConfig from "@/config/channels.json";
import { getBrandConfig, isBrandSlug } from "@/shared/config/brands";

const copy = pagesConfig.clientes;

type CanalVenda = "mercadolivre" | "shopee" | "tiktokshop";

type Cliente = {
  id: string;
  nome: string;
  nomeCompleto?: string | null;
  email?: string | null;
  telefone?: string | null;
  cpfCnpj?: string | null;
  createdAt?: string | Date;
  canais?: string[];
  enderecoRua?: string | null;
  enderecoNumero?: string | null;
  enderecoComplemento?: string | null;
  enderecoBairro?: string | null;
  enderecoCidade?: string | null;
  enderecoEstado?: string | null;
  enderecoCep?: string | null;
  resumoComercial?: { totalPedidos: number; totalGasto: number; ultimoPedidoEm: string | Date | null; relacionamento: string };
};

/** O apelido é o identificador estável do canal (`nome`) — é o que a coluna
 *  principal mostra agora. Nome completo e endereço vêm do destinatário da
 *  entrega (só Mercado Livre, por enquanto) e ganharam colunas próprias em
 *  vez de aparecer como subtítulo, porque passaram a ser dado consultável,
 *  não só um complemento do apelido. */
function formatarData(value?: string | Date) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

// Apelido e nome completo só chegam com o primeiro pedido importado do
// canal — até lá o cliente existe (veio de outro gatilho, ex. mensagem),
// mas esses dois campos estão vazios porque não há pedido nenhum ainda.
// Âmbar em vez de cinza porque isso não é "sem informação" (estado permanente,
// como o "Sem endereço" de endereço) — é um estado transitório que se resolve sozinho
// assim que o primeiro pedido do canal chegar.
const AGUARDANDO_ENVIO = "Aguardando envio";
function CampoOuAguardando({ valor }: { valor?: string | null }) {
  const v = valor?.trim();
  if (v && v !== "Sem endereço") return <>{v}</>;
  return <span className="text-amber-600">{AGUARDANDO_ENVIO}</span>;
}

function enderecoResumo(c: Cliente) {
  const linha1 = [c.enderecoRua, c.enderecoNumero].filter(Boolean).join(", ");
  const linha2 = [c.enderecoBairro, c.enderecoCidade && c.enderecoEstado ? `${c.enderecoCidade}/${c.enderecoEstado}` : c.enderecoCidade]
    .filter(Boolean)
    .join(" — ");
  return [linha1, linha2].filter(Boolean).join(" · ") || null;
}

function brandColor(slug: string) {
  return getBrandConfig(slug)?.color ?? "var(--muted-foreground)";
}

/** Bandeirinha discreta de origem: um ícone pequeno por canal em que o
 *  cliente tem identidade, sem rótulo — é um indício de contexto, não um
 *  filtro nem um destaque. Mais de um canal aparece lado a lado, mesmo
 *  tratamento. */
function CanaisCliente({ canais }: { canais?: string[] }) {
  if (!canais || canais.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 align-middle ml-1.5">
      {canais.map((canal) => (
        <ChannelLogo key={canal} canal={canal} size="xs" variant="logo" />
      ))}
    </span>
  );
}

/** Pulso de seleção: um anel na cor da pílula que nasce colado nela e se
 *  expande sumindo — só toca quando `ativo` PASSA a ser true (AnimatePresence
 *  monta o anel nesse instante, então é um pulso só, não uma animação em
 *  loop). Reduced motion não monta nada. */
function HaloSelecao({ ativo, cor, reduzir }: { ativo: boolean; cor: string; reduzir: boolean | null }) {
  return (
    <AnimatePresence>
      {ativo && !reduzir && (
        <motion.span
          key="halo"
          initial={{ opacity: 0.55, scale: 0.82 }}
          animate={{ opacity: 0, scale: 1.4 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ border: `2px solid ${cor}` }}
        />
      )}
    </AnimatePresence>
  );
}

/* ── Seletor de canal ─────────────────────────────────────────
   Mesmo componente/visual do seletor de canal do Estoque: canal sem conta
   conectada aparece travado, com o motivo à vista. */
function CanalPill({ tipo, total, conectado, ativo, onClick }: {
  tipo: CanalVenda;
  total: number;
  conectado: boolean;
  ativo: boolean;
  onClick: () => void;
}) {
  const reduzir = useReducedMotion();
  const label = (channelsConfig.items as Record<string, { label?: string }>)[tipo]?.label ?? tipo;

  return (
    <motion.button
      type="button"
      variants={entradaExagerada}
      onClick={conectado ? onClick : undefined}
      disabled={!conectado}
      whileHover={conectado && !reduzir ? { y: -2, scale: 1.04 } : undefined}
      whileTap={conectado && !reduzir ? { scale: 0.92 } : undefined}
      aria-pressed={ativo}
      aria-label={label}
      title={conectado ? label : copy.channelSelector.disconnectedHint.replace("{canal}", label)}
      className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 transition-colors ${
        !conectado
          ? "border border-border opacity-50 cursor-not-allowed"
          : ativo
            ? "border-2 border-selecionado bg-selecionado/12"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
    >
      <HaloSelecao ativo={ativo} cor={channelAccent(tipo)} reduzir={reduzir} />
      <ChannelLogo canal={tipo} size="sm" variant="logo" />
      {conectado ? (
        <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
      ) : (
        <PlugZap2 size={14} className="text-muted-foreground" />
      )}
    </motion.button>
  );
}

/* ── Seletor de empresa ───────────────────────────────────────
   Mesmo tratamento das pílulas de canal, ao lado delas — igual ao Estoque.
   Diferente de lá, a lista de Clientes não exige escopo para abrir: empresa e
   canal são filtros opcionais, não um convite obrigatório. */
function MarcaPill({ nome, slug, total, ativo, onClick }: {
  nome: string;
  slug: string;
  total: number;
  ativo: boolean;
  onClick: () => void;
}) {
  const reduzir = useReducedMotion();
  const vazia = total === 0;
  const bloqueada = vazia && !ativo;
  const temIdentidade = isBrandSlug(slug);

  return (
    <motion.button
      type="button"
      variants={entradaExagerada}
      onClick={bloqueada ? undefined : onClick}
      disabled={bloqueada}
      whileHover={!bloqueada && !reduzir ? { y: -2, scale: 1.04 } : undefined}
      whileTap={!bloqueada && !reduzir ? { scale: 0.92 } : undefined}
      aria-pressed={ativo}
      aria-label={nome}
      title={bloqueada ? copy.brandSelector.emptyHint.replace("{marca}", nome) : undefined}
      className={`relative inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 transition-colors ${
        bloqueada
          ? "border border-border opacity-40 cursor-not-allowed"
          : ativo
            ? "border-2 bg-card/70"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={ativo ? { borderColor: brandColor(slug) } : undefined}
    >
      <HaloSelecao ativo={ativo} cor={brandColor(slug)} reduzir={reduzir} />
      {temIdentidade
        ? <BrandLogo brand={slug} height={17} />
        : <span className="text-sm font-semibold text-foreground">{nome}</span>}
      <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
    </motion.button>
  );
}

/** Linha de tabela densa: fade simples, sem o bounce exagerado do resto da
 *  tela — numa grade de linhas coladas, escala/deslocamento por linha faz
 *  elas se atropelarem visualmente. O leque fica reservado pros cards do
 *  mobile e pras pílulas, que têm espaço próprio entre si. */
function variantesLinha(reduzir: boolean | null) {
  return variantes(reduzir, { hidden: { opacity: 0 }, show: { opacity: 1, transition: springs.settleFast } });
}

type ContagemCanais = Awaited<ReturnType<typeof actionContarClientesPorCanal>>;
type ContagemMarcas = Awaited<ReturnType<typeof actionContarClientesPorMarca>>;

export function ClientesLista({ marcasIniciais = [], canaisIniciais = [] }: {
  /** Contagens já resolvidas no servidor (ver page.tsx) — chegam junto com o
   *  HTML, então as pílulas de filtro aparecem no primeiro quadro em vez de
   *  esperarem duas idas ao servidor depois que o JavaScript liga. */
  marcasIniciais?: ContagemMarcas;
  canaisIniciais?: ContagemCanais;
}) {
  const router = useRouter();
  const reduzir = useReducedMotion();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const [, startTransition] = useTransition();

  // Empresa e canal são filtros opcionais e multi-seleção, mesmo padrão do
  // Estoque: Set em vez de string, clicar na ativa desmarca.
  const [brandIds, setBrandIds] = useState<ReadonlySet<string>>(new Set());
  const [canaisSelecionados, setCanaisSelecionados] = useState<ReadonlySet<CanalVenda>>(new Set());
  const [canais, setCanais] = useState<ContagemCanais>(canaisIniciais);
  const [marcas, setMarcas] = useState<ContagemMarcas>(marcasIniciais);

  const brandIdsArray = [...brandIds];
  const canaisArray = [...canaisSelecionados];
  const brandIdsKey = brandIdsArray.slice().sort().join(",");
  const canaisKey = canaisArray.slice().sort().join(",");

  // A primeira execução de cada efeito é pulada só quando o servidor de fato
  // mandou a contagem pronta (ver page.tsx) — aí repeti-la no navegador seria
  // refazer o que acabou de chegar no HTML. Se a pré-busca falhou ou veio
  // vazia, a guarda nasce falsa e a tela busca normalmente, como antes.
  const primeiraContagemMarcas = useRef(marcasIniciais.length > 0);
  const primeiraContagemCanais = useRef(canaisIniciais.length > 0);

  useEffect(() => {
    if (primeiraContagemMarcas.current) { primeiraContagemMarcas.current = false; return; }
    actionContarClientesPorMarca(canaisArray.length ? canaisArray : undefined).then(setMarcas).catch(() => setMarcas([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canaisKey]);

  useEffect(() => {
    if (primeiraContagemCanais.current) { primeiraContagemCanais.current = false; return; }
    actionContarClientesPorCanal(brandIdsArray.length ? brandIdsArray : undefined).then(setCanais).catch(() => setCanais([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandIdsKey]);

  const carregar = useCallback((q?: string, marcasAtuais?: string[], canaisAtuais?: string[]) => {
    const currentRequest = ++requestId.current;
    startTransition(async () => {
      setLoading(true);
      try {
        const res = await actionListarClientes(
          q,
          marcasAtuais?.length ? marcasAtuais : undefined,
          canaisAtuais?.length ? canaisAtuais : undefined,
        );
        if (currentRequest !== requestId.current) return;
        setClientes(res.data as Cliente[]);
        setTotal(res.total);
      } catch {
        if (currentRequest !== requestId.current) return;
        toast.error(copy.messages.loadError);
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    });
  }, []);

  // Sem marca, canal ou busca escolhidos não há o que carregar: a tela
  // mostra o convite, e as contagens de marca/canal (rápidas) já estão
  // aquecendo por trás para quando a escolha acontecer.
  const escopoDefinido = brandIds.size > 0 || canaisSelecionados.size > 0 || busca.trim() !== "";

  useEffect(() => {
    if (!escopoDefinido) return;
    const timer = setTimeout(() => carregar(busca || undefined, brandIdsArray, canaisArray), busca ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, brandIdsKey, canaisKey, carregar, escopoDefinido]);

  function handleBusca(e: React.ChangeEvent<HTMLInputElement>) {
    setBusca(e.target.value);
  }

  function alternarMarca(brandId: string) {
    setBrandIds((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(brandId)) proximo.delete(brandId);
      else proximo.add(brandId);
      return proximo;
    });
  }

  function alternarCanal(tipo: CanalVenda) {
    setCanaisSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(tipo)) proximo.delete(tipo);
      else proximo.add(tipo);
      return proximo;
    });
  }

  return (
    <div>
      {/* Barra de escopo + busca — no desktop (lg+) tudo numa linha só, como
          sempre foi: empresa, canal e busca são a mesma decisão de "o que
          estou olhando". No mobile essa linha única não cabia — a busca
          acabava espremida a ponto do placeholder cortar. Empilha em 3
          linhas (empresa / canal / buscar), cada uma rolando por dentro se
          precisar em vez de quebrar torto. */}
      <motion.div
        variants={staggerExagerado}
        initial="hidden"
        animate="show"
        className="mb-4 flex flex-col items-center gap-3 lg:flex-row lg:flex-wrap lg:justify-center"
      >
        <motion.div
          data-tour="clientes-empresa"
          variants={staggerExagerado}
          className="flex w-full justify-center gap-2.5 overflow-x-auto overscroll-x-contain px-0.5 scrollbar-thin lg:w-auto lg:flex-wrap lg:overflow-visible"
        >
          {marcas.map((marca) => (
            <MarcaPill
              key={marca.brandId}
              nome={marca.name}
              slug={marca.slug}
              total={marca.total}
              ativo={brandIds.has(marca.brandId)}
              onClick={() => alternarMarca(marca.brandId)}
            />
          ))}
        </motion.div>

        <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-border lg:block" />

        <motion.div
          variants={staggerExagerado}
          className="flex w-full justify-center gap-2.5 overflow-x-auto overscroll-x-contain px-0.5 scrollbar-thin lg:w-auto lg:flex-wrap lg:overflow-visible"
        >
          {canais.map((item) => (
            <CanalPill
              key={item.tipo}
              tipo={item.tipo}
              total={item.total}
              conectado={item.conectado}
              ativo={canaisSelecionados.has(item.tipo)}
              onClick={() => alternarCanal(item.tipo)}
            />
          ))}
        </motion.div>

        <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-border lg:block" />

        <motion.input
          variants={entradaExagerada}
          value={busca}
          onChange={handleBusca}
          placeholder={copy.searchPlaceholder}
          className="h-11 w-full px-3.5 rounded-[0.75rem] border-2 border-border bg-card text-sm text-foreground shadow-[0_2px_10px_rgba(14,15,19,.05)] placeholder:text-muted-foreground/80 focus:outline-none focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)] transition-[border-color,box-shadow] lg:max-w-xs lg:flex-1"
        />
      </motion.div>

      {/* Tela limpa: sem escopo, nada de tabela — mesmo padrão do Estoque. */}
      {!escopoDefinido ? (
        <motion.div
          initial={reduzir ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transicao(reduzir, springs.settleFast)}
          className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)]"
        >
          <EmptyState illustration="clients" title={copy.escolha.title} />
        </motion.div>
      ) : (
      <motion.div
        initial={reduzir ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transicao(reduzir, { ...springs.settle, delay: 0.1 })}
        className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="text-sm font-semibold text-foreground">{copy.sectionTitle}</p>
          <div className="flex items-center gap-3">
            {clientes[0]?.createdAt && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <RefreshCw size={11} />
                {dataHora.format(new Date(clientes[0].createdAt))}
              </span>
            )}
            <span className="rounded-full bg-selecionado/10 px-2.5 py-1 text-xs font-bold tabular-nums text-selecionado">
              <NumeroAnimado valor={total} apenasPrimeiraVez={false} duracao={0.5} /> {total === 1 ? "cliente" : "clientes"}
            </span>
          </div>
        </div>

        {loading ? (
          <div>
            {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : clientes.length === 0 ? (
          <EmptyState
            illustration="clients"
            title={busca ? copy.empty.searchTitle : copy.empty.title}
            description={busca ? copy.empty.searchDescription : copy.empty.description}
          />
        ) : (
          <>
          <motion.div
            variants={staggerExagerado}
            initial="hidden"
            animate="show"
            className="md:hidden divide-y divide-border"
            data-testid="clientes-cards"
          >
            {clientes.map((c) => (
              <motion.div variants={variantes(reduzir, entradaExagerada)} key={c.id} className="p-4 space-y-3">
                <button
                  type="button"
                  onClick={() => router.push(`/clientes/${c.id}`)}
                  className="w-full min-h-11 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-foreground">
                      <CampoOuAguardando valor={c.nome} />
                      <CanaisCliente canais={c.canais} />
                    </p>
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{formatarData(c.createdAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground"><CampoOuAguardando valor={c.nomeCompleto} /></p>
                  <p className="text-sm text-muted-foreground mt-1">{c.email ?? c.telefone ?? "Sem contato informado"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5"><CampoOuAguardando valor={enderecoResumo(c)} /></p>
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/clientes/${c.id}`)}
                    title={copy.actions.view}
                    aria-label={copy.actions.view}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[0.625rem] border border-primary/30 bg-primary/5 text-primary transition-colors hover:bg-primary/10"
                  >
                    <Eye size={14} strokeWidth={2} />
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
          <div className="hidden md:block table-scroll" data-testid="clientes-table">
            <table className="w-full min-w-[1120px] table-fixed text-sm">
              <colgroup>
                <col className="w-[10%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[42%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">{copy.columns[0]}</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{copy.columns[1]}</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">{copy.columns[2]}</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">{copy.columns[3]}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <motion.tbody variants={escalonamento(reduzir)} initial="hidden" animate="show">
                {clientes.map((c) => (
                  <motion.tr
                    key={c.id}
                    variants={variantesLinha(reduzir)}
                    whileHover={{ backgroundColor: "rgba(0,0,0,0.018)" }}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-5 py-3.5 text-left align-middle text-muted-foreground hidden sm:table-cell tabular-nums">{formatarData(c.createdAt)}</td>
                    <td className="px-5 py-3.5 text-left align-middle font-medium text-foreground">
                      <button type="button" onClick={() => router.push(`/clientes/${c.id}`)} title={c.nome} className="flex min-h-11 w-full min-w-0 items-center text-left hover:text-primary">
                        <span className="min-w-0 truncate"><CampoOuAguardando valor={c.nome} /></span>
                        <CanaisCliente canais={c.canais} />
                      </button>
                    </td>
                    <td className="truncate px-5 py-3.5 text-left align-middle text-muted-foreground hidden md:table-cell" title={c.nomeCompleto ?? undefined}><CampoOuAguardando valor={c.nomeCompleto} /></td>
                    <td className="truncate px-5 py-3.5 text-left align-middle text-muted-foreground hidden lg:table-cell" title={enderecoResumo(c) ?? undefined}><CampoOuAguardando valor={enderecoResumo(c)} /></td>
                    <td className="px-2 py-3.5 text-center align-middle">
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => router.push(`/clientes/${c.id}`)}
                          title={copy.actions.view}
                          aria-label={copy.actions.view}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/5 text-primary transition-colors hover:bg-primary/10"
                        >
                          <Eye size={14} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
          </>
        )}
      </motion.div>
      )}
    </div>
  );
}
