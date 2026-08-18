"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import { Eye, Loader2, Ruler, TrendingUp } from "lucide-react";
import {
  WizardLayout, WizardActions, WizardField, inputClass, selectClass,
} from "@/shared/design-system/primitives/WizardLayout";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { ChannelLogo } from "@/shared/design-system/primitives/ChannelLogo";
import { springs } from "@/shared/design-system/motion-variants";
import { NumeroAnimado } from "@/shared/design-system/primitives/NumeroAnimado";
import {
  actionListarMarcasEstoque, actionContarProdutosPorCanal,
  actionSimularReguaEstoque, actionAplicarReguaEstoque,
} from "../actions";
import wizardsConfig from "@/config/wizards.json";
import channelsConfig from "@/config/channels.json";
import { getBrandConfig } from "@/shared/config/brands";

const copy = wizardsConfig.estoque;

type CanalVenda = "mercadolivre" | "shopee" | "tiktokshop";
type Simulacao = Awaited<ReturnType<typeof actionSimularReguaEstoque>>;

/* As faixas nascem do padrão do domínio, mas ficam editáveis: quem conhece o
   catálogo sabe melhor que a gente qual estoque um giro de 10/mês exige. */
type Faixa = { vendaMensalMinima: number; minimo: string };
const FAIXAS_INICIAIS: Faixa[] = [
  { vendaMensalMinima: 10, minimo: "12" },
  { vendaMensalMinima: 3, minimo: "4" },
  { vendaMensalMinima: 1, minimo: "2" },
  { vendaMensalMinima: 0, minimo: "0" },
];

function canalLabel(canal: string) {
  const items = channelsConfig.items as Record<string, { label?: string }>;
  return items[canal]?.label ?? canal;
}

function brandColor(slug: string) {
  return getBrandConfig(slug)?.color ?? "var(--muted-foreground)";
}

function inteiroValido(valor: string) {
  const numero = Number(valor);
  return valor.trim() !== "" && Number.isInteger(numero) && numero >= 0;
}

/* ── Métrica da prévia ─────────────────────────────────────────
   Aqui a contagem roda a cada recálculo, não só na estreia: a prévia responde
   à digitação, e ver o número caminhar de 34 para 12 é a informação — mostra
   que a régua ficou mais frouxa. Duração curta para não atrasar a leitura. */
function PreviaNumero({ valor, label, cor }: { valor: number; label: string; cor?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <NumeroAnimado
        valor={valor}
        apenasPrimeiraVez={false}
        duracao={0.32}
        className="block font-bold tabular-nums leading-none text-[21px] tracking-[-0.02em]"
        style={{ color: cor ?? "var(--foreground)" }}
      />
      <span className="text-[11px] text-muted-foreground leading-snug">{label}</span>
    </div>
  );
}

export default function ConfigurarAlertasEstoque() {
  const router = useRouter();
  const reduzir = useReducedMotion();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();

  // Escopo
  const [canal, setCanal] = useState<CanalVenda | "">("");
  const [brandId, setBrandId] = useState("");
  const [somenteSemMinimo, setSomenteSemMinimo] = useState(true);
  const [marcas, setMarcas] = useState<Awaited<ReturnType<typeof actionListarMarcasEstoque>>>([]);
  const [canais, setCanais] = useState<Awaited<ReturnType<typeof actionContarProdutosPorCanal>>>([]);

  // Régua
  const [tipo, setTipo] = useState<"giro" | "fixo">("giro");
  const [minimoFixo, setMinimoFixo] = useState("3");
  const [faixas, setFaixas] = useState<Faixa[]>(FAIXAS_INICIAIS);

  // Prévia
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [excluidos, setExcluidos] = useState<ReadonlySet<string>>(new Set());
  const requestId = useRef(0);

  useEffect(() => {
    Promise.all([actionListarMarcasEstoque(), actionContarProdutosPorCanal()])
      .then(([m, c]) => { setMarcas(m); setCanais(c); })
      .catch(() => toast.error(copy.messages.scopeError));
  }, []);

  const escopo = { brandId: brandId || undefined, canalTipo: canal || undefined, somenteSemMinimo };

  const reguaValida = tipo === "fixo"
    ? inteiroValido(minimoFixo)
    : faixas.every((faixa) => inteiroValido(faixa.minimo));

  const regua = tipo === "fixo"
    ? { tipo: "fixo" as const, minimo: Number(minimoFixo) }
    : {
        tipo: "giro" as const,
        faixas: faixas.map((faixa) => ({
          vendaMensalMinima: faixa.vendaMensalMinima,
          minimo: Number(faixa.minimo),
        })),
      };

  // A prévia é o argumento central do passo 2, então precisa acompanhar a
  // digitação — com debounce, e descartando resposta de requisição vencida.
  const simular = useCallback(async (
    escopoAtual: typeof escopo,
    reguaAtual: typeof regua,
  ) => {
    const atual = ++requestId.current;
    setSimulando(true);
    try {
      const resultado = await actionSimularReguaEstoque(escopoAtual, reguaAtual);
      if (atual !== requestId.current) return;
      setSimulacao(resultado);
    } catch {
      if (atual !== requestId.current) return;
      setSimulacao(null);
      toast.error(copy.regua.previewError);
    } finally {
      if (atual === requestId.current) setSimulando(false);
    }
  }, []);

  const escopoChave = JSON.stringify(escopo);
  const reguaChave = JSON.stringify(regua);

  useEffect(() => {
    if (step === 0) return;
    if (!reguaValida) return;
    const timer = setTimeout(() => {
      simular(JSON.parse(escopoChave), JSON.parse(reguaChave));
    }, 300);
    return () => clearTimeout(timer);
  }, [step, escopoChave, reguaChave, reguaValida, simular]);

  // Sair do escopo invalida quem estava marcado para ficar de fora: os IDs podem
  // nem pertencer mais ao conjunto. Ajuste durante o render (padrão do React
  // para estado derivado) em vez de efeito — evita o render extra com a seleção
  // antiga já na tela.
  const [escopoDaExclusao, setEscopoDaExclusao] = useState(escopoChave);
  if (escopoDaExclusao !== escopoChave) {
    setEscopoDaExclusao(escopoChave);
    setExcluidos(new Set());
  }

  function alternarExclusao(id: string) {
    setExcluidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function aplicar() {
    startTransition(async () => {
      try {
        const resultado = await actionAplicarReguaEstoque(escopo, regua, [...excluidos]);
        if (resultado.atualizados === 0) toast.info(copy.messages.nothingChanged);
        else toast.success(copy.messages.success.replace("{n}", String(resultado.atualizados)));
        router.push(copy.cancelHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : copy.messages.error);
      }
    });
  }

  const resumo = simulacao?.resumo;

  return (
    <WizardLayout
      title={copy.title}
      steps={copy.steps}
      currentStep={step}
      onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
      cancelHref={copy.cancelHref}
    >
      {/* ── Passo 1 · Escopo ───────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-sora)" }}>
              {copy.sections[0].title}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{copy.sections[0].description}</p>
          </div>

          <WizardField label={copy.escopo.channelLabel}>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCanal("")}
                aria-pressed={canal === ""}
                className={`inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
                  canal === ""
                    ? "border-2 border-selecionado bg-selecionado/06 text-foreground"
                    : "border border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {copy.escopo.allChannels}
              </button>
              {canais.filter((item) => item.conectado).map((item) => (
                <button
                  key={item.tipo}
                  type="button"
                  onClick={() => setCanal(item.tipo)}
                  aria-pressed={canal === item.tipo}
                  aria-label={canalLabel(item.tipo)}
                  title={canalLabel(item.tipo)}
                  className={`inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                    canal === item.tipo
                      ? "border-2 border-selecionado bg-selecionado/06 text-foreground"
                      : "border border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <ChannelLogo canal={item.tipo} size="xs" variant="logo" />
                  <span className="tabular-nums opacity-60">{item.total}</span>
                </button>
              ))}
            </div>
          </WizardField>

          <WizardField label={copy.escopo.brandLabel}>
            <select value={brandId} onChange={(event) => setBrandId(event.target.value)} className={selectClass}>
              <option value="">{copy.escopo.allBrands}</option>
              {marcas.map((marca) => <option key={marca.id} value={marca.id}>{marca.name}</option>)}
            </select>
          </WizardField>

          <label className="flex cursor-pointer items-start gap-3 rounded-[0.75rem] border border-border bg-card p-4">
            <input
              type="checkbox"
              checked={somenteSemMinimo}
              onChange={(event) => setSomenteSemMinimo(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-selecionado"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{copy.escopo.onlyWithoutLabel}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{copy.escopo.onlyWithoutHint}</span>
            </span>
          </label>

          <WizardActions onNext={() => setStep(1)} />
        </div>
      )}

      {/* ── Passo 2 · Régua ────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-sora)" }}>
              {copy.sections[1].title}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{copy.sections[1].description}</p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setTipo("giro")}
              aria-pressed={tipo === "giro"}
              className={`flex w-full items-start gap-3 rounded-[0.75rem] border p-4 text-left transition-colors ${
                tipo === "giro" ? "border-selecionado bg-selecionado/05" : "border-border bg-card hover:bg-muted"
              }`}
            >
              <TrendingUp size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  {copy.regua.giroTitle}{" "}
                  <span className="font-medium text-selecionado">· {copy.regua.giroRecommended}</span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{copy.regua.giroDescription}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTipo("fixo")}
              aria-pressed={tipo === "fixo"}
              className={`flex w-full items-start gap-3 rounded-[0.75rem] border p-4 text-left transition-colors ${
                tipo === "fixo" ? "border-selecionado bg-selecionado/05" : "border-border bg-card hover:bg-muted"
              }`}
            >
              <Ruler size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{copy.regua.fixedTitle}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{copy.regua.fixedDescription}</span>
              </span>
            </button>
          </div>

          {tipo === "fixo" ? (
            <WizardField
              label={copy.regua.fixedFieldLabel}
              error={inteiroValido(minimoFixo) ? undefined : copy.regua.minimumInvalid}
            >
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={minimoFixo}
                onChange={(event) => setMinimoFixo(event.target.value)}
                className={`${inputClass} no-spinner max-w-[140px] text-right tabular-nums`}
              />
            </WizardField>
          ) : (
            <div className="space-y-2">
              {faixas.map((faixa, indice) => (
                <div
                  key={faixa.vendaMensalMinima}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[0.75rem] bg-muted/50 px-4 py-3"
                >
                  <span className="text-sm text-muted-foreground">
                    {faixa.vendaMensalMinima === 0 ? (
                      copy.regua.tierZero
                    ) : (
                      <>
                        {copy.regua.tierPrefix}{" "}
                        <strong className="font-semibold text-foreground tabular-nums">{faixa.vendaMensalMinima}</strong>{" "}
                        {copy.regua.tierSuffix}
                      </>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {copy.regua.tierMinimum}
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={faixa.minimo}
                      aria-label={`${copy.regua.tierMinimum} — ${
                        faixa.vendaMensalMinima === 0
                          ? copy.regua.tierZero
                          : `${faixa.vendaMensalMinima}+/mês`
                      }`}
                      onChange={(event) => setFaixas((atual) => atual.map((item, i) =>
                        i === indice ? { ...item, minimo: event.target.value } : item,
                      ))}
                      className="no-spinner h-10 w-[68px] rounded-lg border border-border bg-background px-2 text-right text-sm tabular-nums text-foreground focus:border-[rgba(155,48,217,.5)] focus:shadow-[0_0_0_3px_rgba(155,48,217,.08)] focus:outline-none"
                    />
                    {Number(faixa.minimo) === 0 && (
                      <span className="text-[11px] text-muted-foreground/70">({copy.regua.tierNoAlert})</span>
                    )}
                  </span>
                </div>
              ))}
              {!reguaValida && <p className="text-xs text-destructive">{copy.regua.minimumInvalid}</p>}
            </div>
          )}

          {/* A consequência antes da confirmação — é o que transforma centenas
              de campos numa decisão só. */}
          <div className="rounded-[0.75rem] border border-[rgba(37,99,235,.26)] bg-[rgba(37,99,235,.06)] p-4">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-info">
              <Eye size={14} strokeWidth={2} />
              {copy.regua.previewTitle}
              {simulando && <Loader2 size={12} className="animate-spin" />}
            </p>
            {resumo ? (
              <motion.div
                initial={reduzir ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={springs.settleFast}
                className="flex flex-wrap gap-x-8 gap-y-4"
              >
                <PreviaNumero valor={resumo.alertariam} label={copy.regua.previewAlerting} cor="var(--destructive)" />
                <PreviaNumero valor={resumo.semEstoque} label={copy.regua.previewOutOfStock} cor="var(--warning)" />
                <PreviaNumero valor={resumo.semAlerta} label={copy.regua.previewNoAlert} />
                <PreviaNumero valor={resumo.monitorados} label={copy.regua.previewMonitored} cor="var(--success)" />
              </motion.div>
            ) : (
              <p className="text-xs text-muted-foreground">{copy.regua.previewLoading}</p>
            )}
          </div>

          <WizardActions
            onBack={() => setStep(0)}
            onNext={() => { if (reguaValida) setStep(2); }}
          />
        </div>
      )}

      {/* ── Passo 3 · Revisar ──────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-sora)" }}>
              {copy.sections[2].title}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{copy.sections[2].description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: copy.revisar.summaryScope, valor: resumo?.total ?? 0 },
              { label: copy.revisar.summaryMonitored, valor: resumo?.monitorados ?? 0, cor: "var(--success)" },
              { label: copy.revisar.summaryChanged, valor: resumo?.alterados ?? 0 },
              { label: copy.revisar.summaryAlerting, valor: resumo?.alertariam ?? 0, cor: "var(--destructive)" },
            ].map((item) => (
              <div key={item.label} className="rounded-[0.75rem] border border-border bg-card p-3">
                <p className="text-[22px] font-bold leading-none tabular-nums tracking-[-0.02em]" style={{ color: item.cor ?? "var(--foreground)" }}>
                  {item.valor}
                </p>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-foreground">{copy.revisar.listTitle}</h3>
              {excluidos.size > 0 && (
                <span className="text-xs font-semibold text-warning tabular-nums">
                  {copy.revisar.excludedCount.replace("{n}", String(excluidos.size))}
                </span>
              )}
            </div>

            {simulacao && simulacao.previaAlerta.length > 0 ? (
              <>
                <p className="mb-3 text-xs text-muted-foreground">{copy.revisar.listHint}</p>
                <div className="divide-y divide-border overflow-hidden rounded-[0.75rem] border border-border bg-card">
                  {simulacao.previaAlerta.map((item) => {
                    const fora = excluidos.has(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-opacity ${fora ? "opacity-45" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={!fora}
                          onChange={() => alternarExclusao(item.id)}
                          className="h-4 w-4 shrink-0 accent-selecionado"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{item.nome}</span>
                          <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                            {item.sku} · <span style={{ color: brandColor(item.brandSlug) }}>{item.brandName}</span>
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                          {copy.revisar.balanceLabel} <strong className="text-foreground">{item.saldo}</strong>
                          {" · "}
                          {copy.revisar.minimumLabel} <strong className="text-destructive">{item.minimoProposto}</strong>
                          <span className="block">{item.giroMensal} {copy.revisar.turnoverLabel}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {simulacao.previaTruncada && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {copy.revisar.listTruncated
                      .replace("{mostrados}", String(simulacao.previaAlerta.length))
                      .replace("{total}", String(simulacao.resumo.alertariam))}
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-[0.75rem] border border-border bg-card">
                <EmptyState
                  illustration="healthyStock"
                  title={copy.revisar.listEmpty}
                />
              </div>
            )}
          </div>

          <WizardActions
            onBack={() => setStep(1)}
            isLast
            onSubmit={aplicar}
            isPending={pending}
            submitLabel={copy.actions.submit}
          />
        </div>
      )}
    </WizardLayout>
  );
}
