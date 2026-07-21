"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";

interface WizardLayoutProps {
  title: string;
  steps: string[];
  currentStep: number;
  children: React.ReactNode;
  onBack?: () => void;
  cancelHref?: string;
}

export function WizardLayout({
  title,
  steps,
  currentStep,
  children,
  onBack,
  cancelHref = "/",
}: WizardLayoutProps) {
  const router = useRouter();
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col">
      {/* Barra de progresso superior */}
      <div className="h-1 bg-border relative overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            width: `${progress}%`,
            background: "var(--gradient-signature)",
          }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <button
          onClick={onBack ?? (() => router.push(cancelHref))}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          {onBack ? "Voltar" : "Cancelar"}
        </button>

        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Etapa {currentStep + 1} de {steps.length} — {steps[currentStep]}
          </p>
        </div>

        <button
          onClick={() => router.push(cancelHref)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center justify-center gap-2 py-4 border-b border-border bg-card/50">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  i < currentStep
                    ? "bg-[#1F8A4C] text-white"
                    : i === currentStep
                    ? "text-white"
                    : "bg-muted text-muted-foreground"
                }`}
                style={i === currentStep ? { background: "var(--gradient-signature)" } : undefined}
              >
                {i < currentStep ? "✓" : i + 1}
              </div>
              <span
                className={`text-xs font-medium hidden sm:block ${
                  i === currentStep ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-8 h-px transition-colors duration-300 ${i < currentStep ? "bg-[#1F8A4C]" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-10">
          {children}
        </div>
      </div>
    </div>
  );
}

/* Botões de ação do wizard */
export function WizardActions({
  onBack,
  onNext,
  onSubmit,
  isLast = false,
  isPending = false,
  nextLabel = "Próximo",
  submitLabel = "Confirmar e salvar",
}: {
  onBack?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
  isLast?: boolean;
  isPending?: boolean;
  nextLabel?: string;
  submitLabel?: string;
}) {
  return (
    <div className="flex gap-3 pt-8">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="h-12 px-6 rounded-[0.75rem] border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          ← Voltar
        </button>
      )}
      <button
        type={isLast ? "submit" : "button"}
        onClick={isLast ? onSubmit : onNext}
        disabled={isPending}
        className="flex-1 h-12 rounded-[0.75rem] text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
        style={{ background: "var(--gradient-signature)" }}
      >
        {isPending ? "Salvando…" : isLast ? submitLabel : `${nextLabel} →`}
      </button>
    </div>
  );
}

/* Campo de formulário padrão do wizard */
export function WizardField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">
        {label}
        {required && <span className="text-[#C21820] ml-1">*</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-[#C21820]">{error}</p>}
    </div>
  );
}

export const inputClass =
  "w-full h-12 px-4 rounded-[0.75rem] border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow";

export const selectClass =
  "w-full h-12 px-4 rounded-[0.75rem] border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow";
