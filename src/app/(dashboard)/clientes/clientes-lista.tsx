"use client";

import { useState, useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import { PlugZap2, Eye } from "lucide-react";
import { actionListarClientes, actionContarClientesPorCanal, actionContarClientesPorMarca } from "./actions";
import { SkeletonRow } from "@/shared/design-system/primitives/Skeleton";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { BrandLogo } from "@/shared/design-system/primitives/BrandLogo";
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
};

/** O apelido é o identificador estável do canal (`nome`) — é o que a coluna
 *  principal mostra agora. Nome completo e endereço vêm do destinatário da
 *  entrega (só Mercado Livre, por enquanto) e ganharam colunas próprias em
 *  vez de aparecer como subtítulo, porque passaram a ser dado consultável,
 *  não só um complemento do apelido. */
function formatarData(value?: string | Date) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

// Apelido e nome completo só chegam com o primeiro pedido importado do
// canal — até lá o cliente existe (veio de outro gatilho, ex. mensagem),
// mas esses dois campos estão vazios porque não há pedido nenhum ainda.
// Âmbar em vez de cinza porque isso não é "sem informação" (estado permanente,
// como o "—" de endereço) — é um estado transitório que se resolve sozinho
// assim que o primeiro pedido do canal chegar.
const AGUARDANDO_ENVIO = "Aguardando envio";
function CampoOuAguardando({ valor }: { valor?: string | null }) {
  const v = valor?.trim();
  if (v && v !== "—") return <>{v}</>;
  return <span className="text-amber-600 dark:text-amber-400">{AGUARDANDO_ENVIO}</span>;
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
      onClick={conectado ? onClick : undefined}
      disabled={!conectado}
      whileHover={conectado && !reduzir ? { y: -1 } : undefined}
      whileTap={conectado && !reduzir ? { scale: 0.97 } : undefined}
      aria-pressed={ativo}
      title={conectado ? undefined : copy.channelSelector.disconnectedHint.replace("{canal}", label)}
      className={`inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 transition-colors ${
        !conectado
          ? "border border-border opacity-50 cursor-not-allowed"
          : ativo
            ? "border-2 border-[#9B30D9] bg-[rgba(155,48,217,.12)]"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
    >
      <ChannelLogo canal={tipo} size="sm" variant="logo" />
      <span className="text-sm font-semibold text-foreground">{label}</span>
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
      onClick={bloqueada ? undefined : onClick}
      disabled={bloqueada}
      whileHover={!bloqueada && !reduzir ? { y: -1 } : undefined}
      whileTap={!bloqueada && !reduzir ? { scale: 0.97 } : undefined}
      aria-pressed={ativo}
      aria-label={nome}
      title={bloqueada ? copy.brandSelector.emptyHint.replace("{marca}", nome) : undefined}
      className={`inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 transition-colors ${
        bloqueada
          ? "border border-border opacity-40 cursor-not-allowed"
          : ativo
            ? "border-2 bg-card/70"
            : "border border-border/80 bg-card/40 hover:bg-card/70"
      }`}
      style={ativo ? { borderColor: brandColor(slug) } : undefined}
    >
      {temIdentidade
        ? <BrandLogo brand={slug} height={17} />
        : <span className="text-sm font-semibold text-foreground">{nome}</span>}
      <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
    </motion.button>
  );
}

export function ClientesLista() {
  const router = useRouter();
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
  const [canais, setCanais] = useState<Awaited<ReturnType<typeof actionContarClientesPorCanal>>>([]);
  const [marcas, setMarcas] = useState<Awaited<ReturnType<typeof actionContarClientesPorMarca>>>([]);

  const brandIdsArray = [...brandIds];
  const canaisArray = [...canaisSelecionados];
  const brandIdsKey = brandIdsArray.slice().sort().join(",");
  const canaisKey = canaisArray.slice().sort().join(",");

  useEffect(() => {
    actionContarClientesPorMarca(canaisArray.length ? canaisArray : undefined).then(setMarcas).catch(() => setMarcas([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canaisKey]);

  useEffect(() => {
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

  useEffect(() => {
    const timer = setTimeout(() => carregar(busca || undefined, brandIdsArray, canaisArray), busca ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, brandIdsKey, canaisKey, carregar]);

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
      {/* Barra de escopo — empresa e canal, ambos opcionais: ao contrário do
          Estoque, a lista de Clientes já abre com resultado, e os filtros só
          estreitam o que está sendo mostrado. Centralizada e com identidade
          própria (ícone + rótulo por seção) em vez de só replicar o texto de
          instrução do Estoque — aqui o convite é visual, não escrito. */}
      <div className="mb-5 flex justify-center">
        <div className="w-full max-w-4xl px-8 py-7 sm:px-10">
          <div className="flex flex-col items-center gap-7 lg:flex-row lg:justify-center lg:gap-10">
            <div data-tour="clientes-empresa" className="flex min-w-0 flex-col items-center">
              <div className="flex flex-nowrap justify-center gap-2.5">
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
              </div>
            </div>

            <div
              aria-hidden="true"
              className="hidden h-16 w-px shrink-0 lg:block"
              style={{ background: "linear-gradient(to bottom, transparent, var(--border), transparent)" }}
            />
            <div aria-hidden="true" className="h-px w-28 lg:hidden" style={{ background: "linear-gradient(to right, transparent, var(--border), transparent)" }} />

            <div className="flex min-w-0 flex-col items-center">
              <div className="flex flex-nowrap justify-center gap-2.5">
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
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="mb-4">
        <input
          value={busca}
          onChange={handleBusca}
          placeholder={copy.searchPlaceholder}
          className="w-full sm:w-80 h-11 px-3.5 rounded-[0.75rem] border-2 border-border bg-card text-sm text-foreground shadow-[0_2px_10px_rgba(14,15,19,.05)] placeholder:text-muted-foreground/80 focus:outline-none focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)] transition-[border-color,box-shadow]"
        />
      </div>

      {/* Tabela */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{copy.sectionTitle}</p>
          <span className="text-xs text-muted-foreground">{total} {total === 1 ? "cliente" : "clientes"}</span>
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
          <div className="md:hidden divide-y divide-border" data-testid="clientes-cards">
            {clientes.map((c) => (
              <div key={c.id} className="p-4 space-y-3">
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
                    className="h-11 w-11 inline-flex items-center justify-center rounded-[0.625rem] border border-primary/30 bg-primary/5 text-primary transition-colors hover:bg-primary/10"
                  >
                    <Eye size={17} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto" data-testid="clientes-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">{copy.columns[0]}</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">{copy.columns[1]}</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">{copy.columns[2]}</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">{copy.columns[3]}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {clientes.map((c, i) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.25 }}
                    whileHover={{ backgroundColor: "rgba(0,0,0,0.018)" }}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-5 py-3.5 text-center text-muted-foreground hidden sm:table-cell tabular-nums">{formatarData(c.createdAt)}</td>
                    <td className="px-5 py-3.5 text-center font-medium text-foreground">
                      <button type="button" onClick={() => router.push(`/clientes/${c.id}`)} className="min-h-11 inline-flex items-center hover:text-primary">
                        <CampoOuAguardando valor={c.nome} />
                        <CanaisCliente canais={c.canais} />
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-center text-muted-foreground hidden md:table-cell"><CampoOuAguardando valor={c.nomeCompleto} /></td>
                    <td className="px-5 py-3.5 text-center text-muted-foreground hidden lg:table-cell"><CampoOuAguardando valor={enderecoResumo(c)} /></td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => router.push(`/clientes/${c.id}`)}
                          title={copy.actions.view}
                          aria-label={copy.actions.view}
                          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-primary/30 bg-primary/5 text-primary transition-colors hover:bg-primary/10"
                        >
                          <Eye size={15} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
