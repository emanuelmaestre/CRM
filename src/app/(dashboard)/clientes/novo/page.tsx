"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  WizardLayout,
  WizardActions,
  WizardField,
  inputClass,
} from "@/shared/design-system/primitives/WizardLayout";
import { actionCriarCliente } from "../actions";
import wizardsConfig from "@/config/wizards.json";

const copy = wizardsConfig.cliente;

type FormData = {
  nome: string;
  cpfCnpj: string;
  email: string;
  telefone: string;
};

function isEmailValid(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

function isPhoneValid(v: string) {
  const d = v.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 13;
}

type FieldStatus = "empty" | "valid" | "invalid";

function FieldIndicator({ status }: { status: FieldStatus }) {
  if (status === "empty") return null;
  if (status === "valid")
    return <CheckCircle2 size={16} strokeWidth={2} className="text-[#1F8A4C]" />;
  return <XCircle size={16} strokeWidth={2} className="text-[#C21820]" />;
}

function ValidatedInput({
  type = "text",
  placeholder,
  value,
  onChange,
  validate,
  autoFocus,
}: {
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  validate: (v: string) => boolean;
  autoFocus?: boolean;
}) {
  const status: FieldStatus = !value ? "empty" : validate(value) ? "valid" : "invalid";
  const borderColor =
    status === "valid"
      ? "ring-2 ring-[#1F8A4C]/40 border-[#1F8A4C]/40"
      : status === "invalid"
      ? "ring-2 ring-[#C21820]/40 border-[#C21820]/40"
      : "";

  return (
    <div className="relative flex items-center">
      <input
        type={type}
        className={`${inputClass} pr-10 ${borderColor}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
      <span className="absolute right-3 pointer-events-none">
        <FieldIndicator status={status} />
      </span>
    </div>
  );
}

export default function NovoClienteWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [data, setData] = useState<FormData>({ nome: "", cpfCnpj: "", email: "", telefone: "" });
  const [pending, startTransition] = useTransition();

  function set(field: keyof FormData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validateStep0() {
    const e: Partial<FormData> = {};
    if (!data.nome.trim() || data.nome.trim().length < 2) e.nome = copy.messages.nameInvalid;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep1() {
    const e: Partial<FormData> = {};
    if (data.email && !isEmailValid(data.email)) e.email = copy.messages.emailInvalid;
    if (data.telefone && !isPhoneValid(data.telefone)) e.telefone = "Número inválido. Informe DDD + número (ex: 16994578922).";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function nextStep() {
    if (step === 0 && !validateStep0()) return;
    if (step === 1 && !validateStep1()) return;
    setStep((s) => s + 1);
  }

  function submit() {
    const fd = new FormData();
    fd.set("nome", data.nome.trim());
    if (data.cpfCnpj) fd.set("cpfCnpj", data.cpfCnpj.trim());
    if (data.email) fd.set("email", data.email.trim());
    if (data.telefone) {
      const digits = data.telefone.replace(/\D/g, "");
      fd.set("telefone", "+" + (digits.startsWith("55") ? digits : "55" + digits));
    }

    startTransition(async () => {
      try {
        await actionCriarCliente(fd);
        toast.success(copy.messages.success);
        router.push(copy.cancelHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : copy.messages.error);
      }
    });
  }

  return (
    <WizardLayout
      title={copy.title}
      steps={copy.steps}
      currentStep={step}
      onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
      cancelHref={copy.cancelHref}
    >
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{copy.sections[0].title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{copy.sections[0].description}</p>
          </div>
          <WizardField label={copy.fields.nome.label} required error={errors.nome}>
            <input
              className={inputClass}
              placeholder={copy.fields.nome.placeholder}
              value={data.nome}
              onChange={(e) => set("nome", e.target.value)}
              autoFocus
            />
          </WizardField>
          <WizardField label={copy.fields.cpfCnpj.label}>
            <input
              className={inputClass}
              placeholder={copy.fields.cpfCnpj.placeholder}
              value={data.cpfCnpj}
              onChange={(e) => set("cpfCnpj", e.target.value)}
            />
          </WizardField>
          <WizardActions onNext={nextStep} />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{copy.sections[1].title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{copy.sections[1].description}</p>
          </div>
          <WizardField label={copy.fields.email.label} error={errors.email}>
            <ValidatedInput
              type="email"
              placeholder={copy.fields.email.placeholder}
              value={data.email}
              onChange={(v) => set("email", v)}
              validate={isEmailValid}
              autoFocus
            />
          </WizardField>
          <WizardField label={copy.fields.telefone.label} error={errors.telefone}>
            <ValidatedInput
              placeholder={copy.fields.telefone.placeholder}
              value={data.telefone}
              onChange={(v) => set("telefone", v)}
              validate={isPhoneValid}
            />
          </WizardField>
          <WizardActions onBack={() => setStep(0)} onNext={nextStep} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{copy.sections[2].title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{copy.sections[2].description}</p>
          </div>

          <div className="rounded-[1.25rem] border border-border bg-card divide-y divide-border overflow-hidden">
            {[
              { label: copy.reviewLabels.nome, value: data.nome },
              { label: copy.reviewLabels.cpfCnpj, value: data.cpfCnpj || "—" },
              { label: copy.reviewLabels.email, value: data.email || "—" },
              { label: copy.reviewLabels.telefone, value: data.telefone || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-5 py-4">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-sm font-medium text-foreground">{value}</span>
              </div>
            ))}
          </div>

          <WizardActions
            onBack={() => setStep(1)}
            isLast
            onSubmit={submit}
            isPending={pending}
            submitLabel={copy.actions.submit}
          />
        </div>
      )}
    </WizardLayout>
  );
}
