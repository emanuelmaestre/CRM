"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = copy.messages.emailInvalid;
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
            <input
              className={inputClass}
              type="email"
              placeholder={copy.fields.email.placeholder}
              value={data.email}
              onChange={(e) => set("email", e.target.value)}
              autoFocus
            />
          </WizardField>
          <WizardField label={copy.fields.telefone.label}>
            <input
              className={inputClass}
              placeholder={copy.fields.telefone.placeholder}
              value={data.telefone}
              onChange={(e) => set("telefone", e.target.value)}
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
