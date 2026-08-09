"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import appConfig from "@/config/app.json";

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
    <div className="fixed inset-0 z-[200] flex min-h-0 flex-col bg-background pt-[env(safe-area-inset-top)]">
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
      <div className="grid grid-cols-[minmax(44px,1fr)_minmax(0,2fr)_minmax(44px,1fr)] items-center gap-2 border-b border-border bg-card px-3 py-3 sm:px-6 sm:py-4">
        <button
          onClick={onBack ?? (() => router.push(cancelHref))}
          className="flex min-h-11 min-w-11 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">{onBack ? appConfig.wizard.back : appConfig.wizard.cancel}</span>
        </button>

        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {appConfig.wizard.step} {currentStep + 1} {appConfig.wizard.of} {steps.length} — {steps[currentStep]}
          </p>
        </div>

        <button
          onClick={() => router.push(cancelHref)}
          aria-label={appConfig.wizard.cancel}
          className="ml-auto flex min-h-11 min-w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={18} />
        </button>
      </div>

      {/* Steps indicator */}
      <div className="table-scroll flex shrink-0 items-center justify-start gap-2 border-b border-border bg-card/50 px-4 py-3 sm:justify-center sm:py-4">
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
              <div className={`h-px w-5 shrink-0 transition-colors sm:w-8 ${i < currentStep ? "bg-[#1F8A4C]" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
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
  nextLabel = appConfig.wizard.next,
  submitLabel = appConfig.wizard.submit,
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
    <div className="flex flex-col-reverse gap-3 pt-8 sm:flex-row">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="h-12 px-6 rounded-[0.75rem] border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          ← {appConfig.wizard.back}
        </button>
      )}
      <button
        type={isLast ? "submit" : "button"}
        onClick={isLast ? onSubmit : onNext}
        disabled={isPending}
        className="flex-1 h-12 rounded-[0.75rem] text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
        style={{ background: "var(--gradient-signature)" }}
      >
        {isPending ? appConfig.wizard.saving : isLast ? submitLabel : `${nextLabel} →`}
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
