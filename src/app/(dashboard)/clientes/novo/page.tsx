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

const STEPS = ["Dados pessoais", "Contato", "Revisar"];

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
    if (!data.nome.trim() || data.nome.trim().length < 2) e.nome = "Nome deve ter ao menos 2 caracteres";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep1() {
    const e: Partial<FormData> = {};
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = "E-mail inválido";
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
        toast.success("Cliente criado com sucesso!");
        router.push("/clientes");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar cliente.");
      }
    });
  }

  return (
    <WizardLayout
      title="Novo cliente"
      steps={STEPS}
      currentStep={step}
      onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
      cancelHref="/clientes"
    >
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Dados pessoais</h2>
            <p className="text-sm text-muted-foreground mt-1">Informações principais do cliente</p>
          </div>
          <WizardField label="Nome completo" required error={errors.nome}>
            <input
              className={inputClass}
              placeholder="Ex: Maria da Silva"
              value={data.nome}
              onChange={(e) => set("nome", e.target.value)}
              autoFocus
            />
          </WizardField>
          <WizardField label="CPF / CNPJ">
            <input
              className={inputClass}
              placeholder="000.000.000-00 ou 00.000.000/0001-00"
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
            <h2 className="text-2xl font-bold text-foreground">Contato</h2>
            <p className="text-sm text-muted-foreground mt-1">Como entrar em contato com {data.nome || "o cliente"}</p>
          </div>
          <WizardField label="E-mail" error={errors.email}>
            <input
              className={inputClass}
              type="email"
              placeholder="cliente@exemplo.com"
              value={data.email}
              onChange={(e) => set("email", e.target.value)}
              autoFocus
            />
          </WizardField>
          <WizardField label="WhatsApp">
            <input
              className={inputClass}
              placeholder="(11) 99999-9999"
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
            <h2 className="text-2xl font-bold text-foreground">Confirmar cadastro</h2>
            <p className="text-sm text-muted-foreground mt-1">Revise os dados antes de salvar</p>
          </div>

          <div className="rounded-[1.25rem] border border-border bg-card divide-y divide-border overflow-hidden">
            {[
              { label: "Nome", value: data.nome },
              { label: "CPF / CNPJ", value: data.cpfCnpj || "—" },
              { label: "E-mail", value: data.email || "—" },
              { label: "WhatsApp", value: data.telefone || "—" },
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
            submitLabel="Criar cliente"
          />
        </div>
      )}
    </WizardLayout>
  );
}
