"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  WizardLayout, WizardActions, WizardField, inputClass, selectClass,
} from "@/shared/design-system/primitives/WizardLayout";
import { actionCriarOportunidade, actionListarFunil, actionListarReferenciasFunil } from "../actions";
import wizardsConfig from "@/config/wizards.json";

const copy = wizardsConfig.oportunidade;
type Etapa = { id: string; nome: string; ordem: number; cor: string | null };
type Referencia = { id: string; nome: string };
type FormData = {
  titulo: string; brandId: string; etapaId: string; valor: string; clienteId: string; responsavelId: string;
};

export default function NovaOportunidadeWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [marcas, setMarcas] = useState<Referencia[]>([]);
  const [clientes, setClientes] = useState<Referencia[]>([]);
  const [responsaveis, setResponsaveis] = useState<Referencia[]>([]);
  const [data, setData] = useState<FormData>({
    titulo: "", brandId: "", etapaId: "", valor: "", clienteId: "", responsavelId: "",
  });
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    Promise.all([actionListarFunil(), actionListarReferenciasFunil()])
      .then(([funil, refs]) => {
        setEtapas(funil.etapas as Etapa[]);
        setMarcas(refs.marcas);
        setClientes(refs.clientes);
        setResponsaveis(refs.responsaveis);
      })
      .catch(() => toast.error(copy.messages.referencesError));
  }, []);

  function set(field: keyof FormData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validateStep0() {
    const nextErrors: Partial<FormData> = {};
    if (!data.titulo.trim()) nextErrors.titulo = copy.messages.titleRequired;
    if (!data.brandId) nextErrors.brandId = copy.messages.brandRequired;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function validateStep1() {
    const nextErrors: Partial<FormData> = {};
    if (!data.etapaId) nextErrors.etapaId = copy.messages.stageRequired;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function nextStep() {
    if (step === 0 && !validateStep0()) return;
    if (step === 1 && !validateStep1()) return;
    setStep((current) => current + 1);
  }

  function submit() {
    const formData = new FormData();
    formData.set("titulo", data.titulo.trim());
    formData.set("brandId", data.brandId);
    formData.set("etapaId", data.etapaId);
    if (data.valor) formData.set("valor", data.valor);
    if (data.clienteId) formData.set("clienteId", data.clienteId);
    if (data.responsavelId) formData.set("responsavelId", data.responsavelId);

    startTransition(async () => {
      try {
        await actionCriarOportunidade(formData);
        toast.success(copy.messages.success);
        router.push(copy.cancelHref);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : copy.messages.error);
      }
    });
  }

  const review = [
    { label: copy.reviewLabels.titulo, value: data.titulo },
    { label: copy.reviewLabels.brandId, value: marcas.find((item) => item.id === data.brandId)?.nome ?? "—" },
    { label: copy.reviewLabels.etapaId, value: etapas.find((item) => item.id === data.etapaId)?.nome ?? "—" },
    { label: copy.reviewLabels.valor, value: data.valor ? `R$ ${Number(data.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—" },
    { label: copy.reviewLabels.clienteId, value: clientes.find((item) => item.id === data.clienteId)?.nome ?? "—" },
    { label: copy.reviewLabels.responsavelId, value: responsaveis.find((item) => item.id === data.responsavelId)?.nome ?? "—" },
  ];

  return (
    <WizardLayout title={copy.title} steps={copy.steps} currentStep={step} onBack={step > 0 ? () => setStep((current) => current - 1) : undefined} cancelHref={copy.cancelHref}>
      {step === 0 && (
        <div className="space-y-6">
          <div><h2 className="text-2xl font-bold text-foreground">{copy.sections[0].title}</h2><p className="text-sm text-muted-foreground mt-1">{copy.sections[0].description}</p></div>
          <WizardField label={copy.fields.titulo.label} required error={errors.titulo}><input className={inputClass} placeholder={copy.fields.titulo.placeholder} value={data.titulo} onChange={(event) => set("titulo", event.target.value)} autoFocus /></WizardField>
          <WizardField label={copy.fields.brandId.label} required error={errors.brandId}>
            <select className={selectClass} value={data.brandId} onChange={(event) => set("brandId", event.target.value)}><option value="">{copy.fields.brandId.placeholder}</option>{marcas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>
          </WizardField>
          <WizardActions onNext={nextStep} />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <div><h2 className="text-2xl font-bold text-foreground">{copy.sections[1].title}</h2><p className="text-sm text-muted-foreground mt-1">{copy.sections[1].description}</p></div>
          <WizardField label={copy.fields.etapaId.label} required error={errors.etapaId}><select className={selectClass} value={data.etapaId} onChange={(event) => set("etapaId", event.target.value)}><option value="">{copy.fields.etapaId.placeholder}</option>{etapas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></WizardField>
          <WizardField label={`${copy.fields.valor.label} (R$)`}><input className={inputClass} type="number" step="0.01" min="0" placeholder={copy.fields.valor.placeholder} value={data.valor} onChange={(event) => set("valor", event.target.value)} /></WizardField>
          <WizardField label={copy.fields.clienteId.label}><select className={selectClass} value={data.clienteId} onChange={(event) => set("clienteId", event.target.value)}><option value="">{copy.fields.clienteId.placeholder}</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></WizardField>
          <WizardField label={copy.fields.responsavelId.label}><select className={selectClass} value={data.responsavelId} onChange={(event) => set("responsavelId", event.target.value)}><option value="">{copy.fields.responsavelId.placeholder}</option>{responsaveis.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></WizardField>
          <WizardActions onBack={() => setStep(0)} onNext={nextStep} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div><h2 className="text-2xl font-bold text-foreground">{copy.sections[2].title}</h2><p className="text-sm text-muted-foreground mt-1">{copy.sections[2].description}</p></div>
          <div className="rounded-[1.25rem] border border-border bg-card divide-y divide-border overflow-hidden">{review.map(({ label, value }) => <div key={label} className="flex items-center justify-between gap-4 px-5 py-4"><span className="text-sm text-muted-foreground">{label}</span><span className="text-sm font-medium text-foreground text-right">{value}</span></div>)}</div>
          <WizardActions onBack={() => setStep(1)} isLast onSubmit={submit} isPending={pending} submitLabel={copy.actions.submit} />
        </div>
      )}
    </WizardLayout>
  );
}
