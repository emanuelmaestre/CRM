"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { FileText, Check } from "lucide-react";
import { WizardLayout, WizardActions } from "@/shared/design-system/primitives/WizardLayout";
import wizardsConfig from "@/config/wizards.json";
import { previewImportacao, confirmarImportacao } from "./actions";

const cfg = wizardsConfig.importacao;

type PreviewResult = {
  loteId: string;
  totalLinhas: number;
  aceitos: number;
  rejeitados: number;
  erros: { linha: number; motivo: string }[];
  preview: boolean;
};

/* ── CSV parser simples ──────────────────────────────────────────── */
function parseCsv(text: string): Record<string, string>[] {
  const linhas = text.trim().split(/\r?\n/);
  if (linhas.length < 2) return [];
  const cabecalhos = linhas[0].split(",").map((h) => h.trim().toLowerCase());
  return linhas.slice(1).map((linha) => {
    const valores = linha.split(",");
    return Object.fromEntries(cabecalhos.map((h, i) => [h, (valores[i] ?? "").trim()]));
  });
}

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0, 0, 0.2, 1] as [number, number, number, number] } },
};

/* ── Step 1 — Upload ─────────────────────────────────────────────── */
function StepUpload({
  onParsed,
}: {
  onParsed: (rows: Record<string, string>[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function processarArquivo(file: File) {
    if (!file.name.endsWith(".csv")) {
      setErro("Apenas arquivos .csv são aceitos.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) { setErro("Arquivo vazio ou sem dados após o cabeçalho."); return; }
      setErro(null);
      onParsed(rows);
    };
    reader.readAsText(file, "UTF-8");
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processarArquivo(file);
  }

  function downloadModelo() {
    const blob = new Blob([cfg.columns.template + "\n"], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "modelo-importacao-clientes.csv";
    a.click();
  }

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{cfg.sections[0].title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{cfg.hints.upload}</p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-[1.25rem] p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
          dragging ? "border-foreground bg-muted/60" : "border-border hover:border-foreground/40 hover:bg-muted/30"
        }`}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-white"
          style={{ background: "var(--gradient-signature)", opacity: 0.85 }}
        >
          <FileText size={22} strokeWidth={1.75} />
        </div>
        <p className="text-sm font-medium text-foreground text-center">{cfg.labels.dropzone}</p>
        <p className="text-xs text-muted-foreground">{cfg.labels.fileType}</p>
        <input
          ref={inputRef}
          type="file"
          aria-label={cfg.labels.fileAriaLabel}
          data-testid="arquivo-csv"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) processarArquivo(f); }}
        />
      </div>

      {erro && (
        <p className="text-sm text-[#C21820] bg-[#C21820]/08 rounded-xl px-4 py-3">{erro}</p>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">{cfg.labels.or}</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <button
        type="button"
        onClick={downloadModelo}
        className="w-full h-11 rounded-[0.75rem] border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        ↓ {cfg.labels.templateDownload}
      </button>
    </motion.div>
  );
}

/* ── Step 2 — Prévia ─────────────────────────────────────────────── */
function StepPrevia({ resultado }: { resultado: PreviewResult }) {
  const temErros = resultado.erros.length > 0;

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{cfg.sections[1].title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{cfg.hints.preview}</p>
      </div>

      <div className="grid grid-cols-3 gap-3" data-testid="previa-resumo">
        {[
          { label: cfg.labels.total, value: resultado.totalLinhas, color: "var(--foreground)" },
          { label: cfg.labels.accepted, value: resultado.aceitos, color: "#1F8A4C" },
          { label: cfg.labels.rejected, value: resultado.rejeitados, color: resultado.rejeitados > 0 ? "#C21820" : "#1F8A4C" },
        ].map((stat, index) => (
          <div key={stat.label} data-testid={index === 0 ? "previa-total" : undefined} className="rounded-[1rem] bg-card border border-border p-4 text-center">
            <p className="text-2xl font-bold tabular-nums" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {temErros ? (
        <div data-testid="previa-erros" className="rounded-[1rem] border border-[#C21820]/30 bg-[#C21820]/05 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#C21820]/20">
            <p className="text-sm font-semibold text-[#C21820]">{cfg.labels.errorsTitle}</p>
          </div>
          <div className="divide-y divide-[#C21820]/10 max-h-48 overflow-y-auto">
            {resultado.erros.map((e) => (
              <div key={e.linha} className="flex gap-3 px-4 py-2.5">
                <span className="text-xs font-semibold text-[#C21820] shrink-0 tabular-nums">
                  {cfg.labels.line} {e.linha}
                </span>
                <span className="text-xs text-muted-foreground">{e.motivo}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p data-testid="previa-sem-erros" className="text-sm text-[#1F8A4C] bg-[#1F8A4C]/08 rounded-xl px-4 py-3">{cfg.labels.noErrors}</p>
      )}
    </motion.div>
  );
}

/* ── Step 3 — Confirmar ──────────────────────────────────────────── */
function StepConfirmar({ resultado }: { resultado: PreviewResult }) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{cfg.sections[2].title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{cfg.hints.confirm}</p>
      </div>

      <div className="rounded-[1rem] bg-card border border-border divide-y divide-border">
        {[
          { label: cfg.labels.total, value: resultado.totalLinhas },
          { label: cfg.labels.accepted, value: resultado.aceitos },
          { label: cfg.labels.rejected, value: resultado.rejeitados },
        ].map((row) => (
          <div key={row.label} className="flex justify-between px-5 py-3">
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span className="text-sm font-semibold text-foreground tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>

      {resultado.rejeitados > 0 && (
        <p className="text-xs text-muted-foreground bg-muted rounded-xl px-4 py-3">
          {resultado.rejeitados} {resultado.rejeitados === 1 ? cfg.labels.ignoredSingular : cfg.labels.ignoredPlural} {cfg.labels.invalidRowsSuffix}
        </p>
      )}
    </motion.div>
  );
}

/* ── Sucesso ─────────────────────────────────────────────────────── */
function Sucesso({ aceitos }: { aceitos: number }) {
  const router = useRouter();
  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center gap-6 px-6">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-white"
        style={{ background: "var(--gradient-signature)" }}
      >
        <Check size={32} strokeWidth={2.25} />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">{cfg.labels.successTitle}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {aceitos} {aceitos === 1 ? cfg.labels.importedSingular : cfg.labels.importedPlural} {cfg.labels.importedRowsSuffix}
        </p>
      </div>
      <button
        onClick={() => router.push(cfg.cancelHref)}
        className="h-12 px-8 rounded-[0.75rem] text-sm font-semibold text-white"
        style={{ background: "var(--gradient-signature)" }}
      >
        {cfg.labels.viewClients}
      </button>
    </div>
  );
}

/* ── Página principal ────────────────────────────────────────────── */
export default function ImportacaoPage() {
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [pending, setPending] = useState(false);
  const [sucesso, setSucesso] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function aoAvancarUpload() {
    if (rows.length === 0) return;
    setPending(true);
    setErro(null);
    try {
      const resultado = await previewImportacao(rows);
      setPreview(resultado);
      setStep(1);
    } catch {
      setErro(cfg.labels.errorMessage);
    } finally {
      setPending(false);
    }
  }

  async function aoConfirmar() {
    if (!preview || preview.aceitos === 0) return;
    setPending(true);
    setErro(null);
    try {
      const resultado = await confirmarImportacao(rows);
      setSucesso(resultado.aceitos);
    } catch {
      setErro(cfg.labels.errorMessage);
    } finally {
      setPending(false);
    }
  }

  if (sucesso !== null) return <Sucesso aceitos={sucesso} />;

  return (
    <WizardLayout
      title={cfg.title}
      steps={cfg.steps}
      currentStep={step}
      onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
      cancelHref={cfg.cancelHref}
    >
      <AnimatePresence mode="wait">
        <div key={step}>
          {step === 0 && (
            <>
              <StepUpload onParsed={(r) => { setRows(r); }} />
              {erro && <p className="mt-4 text-sm text-[#C21820]">{erro}</p>}
              <WizardActions
                onNext={aoAvancarUpload}
                isPending={pending}
                nextLabel={rows.length > 0 ? `Pré-visualizar (${rows.length} linhas)` : "Pré-visualizar"}
              />
            </>
          )}

          {step === 1 && preview && (
            <>
              <StepPrevia resultado={preview} />
              <WizardActions
                onBack={() => setStep(0)}
                onNext={() => setStep(2)}
                isLast={false}
              />
            </>
          )}

          {step === 2 && preview && (
            <>
              <StepConfirmar resultado={preview} />
              {erro && <p className="mt-4 text-sm text-[#C21820]">{erro}</p>}
              <WizardActions
                onBack={() => setStep(1)}
                onSubmit={aoConfirmar}
                isLast
                isPending={pending}
                submitLabel={cfg.labels.submit}
              />
            </>
          )}
        </div>
      </AnimatePresence>
    </WizardLayout>
  );
}
