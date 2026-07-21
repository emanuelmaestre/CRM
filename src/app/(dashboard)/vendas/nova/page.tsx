"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  WizardLayout,
  WizardActions,
  WizardField,
  inputClass,
  selectClass,
} from "@/shared/design-system/primitives/WizardLayout";
import { actionCriarOportunidade, actionListarFunil } from "../actions";
import brandsConfig from "@/config/brands.json";
import wizardsConfig from "@/config/wizards.json";

const copy = wizardsConfig.oportunidade;
const BRAND_KARZI = process.env.NEXT_PUBLIC_BRAND_ID_KARZI ?? "";
const BRAND_WUWU = process.env.NEXT_PUBLIC_BRAND_ID_WUWU ?? "";

type Etapa = { id: string; nome: string; ordem: number; cor: string | null };

type FormData = {
  titulo: string;
  brandId: string;
  etapaId: string;
  valor: string;
};

export default function NovaOportunidadeWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [data, setData] = useState<FormData>({ titulo: "", brandId: "", etapaId: "", valor: "" });
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    actionListarFunil().then((res) => setEtapas(res.etapas as Etapa[]));
  }, []);

  function set(field: keyof FormData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validateStep0() {
    const e: Partial<FormData> = {};
    if (!data.titulo.trim()) e.titulo = copy.messages.titleRequired;
    if (!data.brandId) e.brandId = copy.messages.brandRequired;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep1() {
    const e: Partial<FormData> = {};
    if (!data.etapaId) e.etapaId = copy.messages.stageRequired;
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
    fd.set("titulo", data.titulo.trim());
    fd.set("brandId", data.brandId);
    fd.set("etapaId", data.etapaId);
    if (data.valor) fd.set("valor", data.valor);

    startTransition(async () => {
      try {
        await actionCriarOportunidade(fd);
        toast.success(copy.messages.success);
        router.push(copy.cancelHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : copy.messages.error);
      }
    });
  }

  const brandLabel = data.brandId === BRAND_KARZI ? brandsConfig.karzi.label : data.brandId === BRAND_WUWU ? brandsConfig.wuwu.label : "—";
  const etapaLabel = etapas.find((e) => e.id === data.etapaId)?.nome ?? "—";

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
          <WizardField label={copy.fields.titulo.label} required error={errors.titulo}>
            <input
              className={inputClass}
              placeholder={copy.fields.titulo.placeholder}
              value={data.titulo}
              onChange={(e) => set("titulo", e.target.value)}
              autoFocus
            />
          </WizardField>
          <WizardField label={copy.fields.brandId.label} required error={errors.brandId}>
            <select className={selectClass} value={data.brandId} onChange={(e) => set("brandId", e.target.value)}>
              <option value="">{copy.fields.brandId.placeholder}</option>
              <option value={BRAND_KARZI}>{brandsConfig.karzi.label}</option>
              <option value={BRAND_WUWU}>{brandsConfig.wuwu.label}</option>
            </select>
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
          <WizardField label={copy.fields.etapaId.label} required error={errors.etapaId}>
            <select className={selectClass} value={data.etapaId} onChange={(e) => set("etapaId", e.target.value)}>
              <option value="">{copy.fields.etapaId.placeholder}</option>
              {etapas.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          </WizardField>
          <WizardField label={`${copy.fields.valor.label} (R$)`}>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              min="0"
              placeholder={copy.fields.valor.placeholder}
              value={data.valor}
              onChange={(e) => set("valor", e.target.value)}
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
              { label: copy.reviewLabels.titulo, value: data.titulo },
              { label: copy.reviewLabels.brandId, value: brandLabel },
              { label: copy.reviewLabels.etapaId, value: etapaLabel },
              { label: copy.reviewLabels.valor, value: data.valor ? `R$ ${Number(data.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—" },
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
