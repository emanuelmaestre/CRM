"use client";

import { useState, useTransition, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
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

/* ── Validação CPF ── */
function isCpfValid(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 || r === 11 ? 0 : r;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

/* ── Validação CNPJ ── */
function isCnpjValid(digits: string): boolean {
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (len: number) => {
    let sum = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += Number(digits[len - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

function isCpfCnpjValid(v: string): boolean {
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return isCpfValid(d);
  if (d.length === 14) return isCnpjValid(d);
  return false;
}

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
  const [fetchingCnpj, setFetchingCnpj] = useState(false);
  const cnpjTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function set(field: keyof FormData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  const handleCpfCnpj = useCallback((value: string) => {
    set("cpfCnpj", value);
    const digits = value.replace(/\D/g, "");
    if (cnpjTimer.current) clearTimeout(cnpjTimer.current);
    if (digits.length === 14 && isCnpjValid(digits)) {
      cnpjTimer.current = setTimeout(async () => {
        setFetchingCnpj(true);
        try {
          const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
          if (res.ok) {
            const json = await res.json();
            const razao = (json.razao_social || json.nome_fantasia || "").trim();
            if (razao) {
              setData((prev) => ({ ...prev, cpfCnpj: value, nome: razao }));
              toast.success(`Empresa encontrada: ${razao}`);
            }
          }
        } catch { /* silently ignore */ }
        finally { setFetchingCnpj(false); }
      }, 600);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <WizardField
            label={data.cpfCnpj.replace(/\D/g, "").length === 14 ? "CNPJ" : copy.fields.cpfCnpj.label}
          >
            <div className="relative flex items-center">
              <input
                className={`${inputClass} pr-10 ${
                  data.cpfCnpj && isCpfCnpjValid(data.cpfCnpj)
                    ? "ring-2 ring-[#1F8A4C]/40 border-[#1F8A4C]/40"
                    : data.cpfCnpj
                    ? "ring-2 ring-[#C21820]/40 border-[#C21820]/40"
                    : ""
                }`}
                placeholder={copy.fields.cpfCnpj.placeholder}
                value={data.cpfCnpj}
                onChange={(e) => handleCpfCnpj(e.target.value)}
              />
              <span className="absolute right-3 pointer-events-none">
                {fetchingCnpj
                  ? <Loader2 size={16} className="animate-spin text-muted-foreground" />
                  : <FieldIndicator status={!data.cpfCnpj ? "empty" : isCpfCnpjValid(data.cpfCnpj) ? "valid" : "invalid"} />
                }
              </span>
            </div>
            {data.cpfCnpj.replace(/\D/g, "").length === 14 && isCpfCnpjValid(data.cpfCnpj) && (
              <p className="text-[11px] text-[#1F8A4C] mt-1">
                {fetchingCnpj ? "Buscando razão social…" : "CNPJ válido"}
              </p>
            )}
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
