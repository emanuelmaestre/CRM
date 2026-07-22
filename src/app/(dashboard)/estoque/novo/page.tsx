"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  WizardLayout,
  WizardActions,
  WizardField,
  inputClass,
  selectClass,
} from "@/shared/design-system/primitives/WizardLayout";
import { actionCriarProduto } from "../actions";
import brandsConfig from "@/config/brands.json";
import wizardsConfig from "@/config/wizards.json";

const copy = wizardsConfig.produto;

const BRAND_KARZI = process.env.NEXT_PUBLIC_BRAND_ID_KARZI ?? "";
const BRAND_WUWU = process.env.NEXT_PUBLIC_BRAND_ID_WUWU ?? "";

type FormData = {
  nome: string;
  sku: string;
  brandId: string;
  preco: string;
  custo: string;
  estoqueMinimo: string;
};

export default function NovoProdutoWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [data, setData] = useState<FormData>({
    nome: "", sku: "", brandId: "", preco: "", custo: "", estoqueMinimo: "0",
  });
  const [pending, startTransition] = useTransition();

  function set(field: keyof FormData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validateStep0() {
    const e: Partial<FormData> = {};
    if (!data.nome.trim()) e.nome = copy.messages.nameRequired;
    if (!data.sku.trim()) e.sku = copy.messages.skuRequired;
    if (!data.brandId) e.brandId = copy.messages.brandRequired;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep1() {
    const e: Partial<FormData> = {};
    if (!data.preco || Number(data.preco) <= 0) e.preco = copy.messages.priceInvalid;
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
    fd.set("sku", data.sku.trim().toUpperCase());
    fd.set("brandId", data.brandId);
    fd.set("preco", data.preco);
    if (data.custo) fd.set("custo", data.custo);
    fd.set("estoqueMinimo", data.estoqueMinimo || "0");

    startTransition(async () => {
      try {
        await actionCriarProduto(fd);
        toast.success(copy.messages.success);
        router.push(copy.cancelHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : copy.messages.error);
      }
    });
  }

  const brandLabel = data.brandId === BRAND_KARZI ? brandsConfig.karzi.label : data.brandId === BRAND_WUWU ? brandsConfig.wuwu.label : "—";

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
          <WizardField label={copy.fields.brandId.label} required error={errors.brandId}>
            <select className={selectClass} value={data.brandId} onChange={(e) => set("brandId", e.target.value)}>
              <option value="">{copy.fields.brandId.placeholder}</option>
              <option value={BRAND_KARZI}>{brandsConfig.karzi.label}</option>
              <option value={BRAND_WUWU}>{brandsConfig.wuwu.label}</option>
            </select>
          </WizardField>
          <WizardField label={copy.fields.nome.label} required error={errors.nome}>
            <input
              className={inputClass}
              placeholder={copy.fields.nome.placeholder}
              value={data.nome}
              onChange={(e) => set("nome", e.target.value)}
              autoFocus
            />
          </WizardField>
          <WizardField label={copy.fields.sku.label} required error={errors.sku}>
            <input
              className={inputClass}
              placeholder={copy.fields.sku.placeholder}
              value={data.sku}
              onChange={(e) => set("sku", e.target.value)}
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
          <WizardField label={`${copy.fields.preco.label} (R$)`} required error={errors.preco}>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              min="0"
              placeholder={copy.fields.preco.placeholder}
              value={data.preco}
              onChange={(e) => set("preco", e.target.value)}
              autoFocus
            />
          </WizardField>
          <WizardField label={`${copy.fields.custo.label} (R$)`}>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              min="0"
              placeholder={copy.fields.custo.placeholder}
              value={data.custo}
              onChange={(e) => set("custo", e.target.value)}
            />
          </WizardField>
          <WizardField label={`${copy.fields.estoqueMinimo.label} (unidades)`}>
            <input
              className={inputClass}
              type="number"
              min="0"
              value={data.estoqueMinimo}
              onChange={(e) => set("estoqueMinimo", e.target.value)}
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
              { label: copy.reviewLabels.brandId, value: brandLabel },
              { label: copy.reviewLabels.nome, value: data.nome },
              { label: copy.reviewLabels.sku, value: data.sku.toUpperCase() },
              { label: copy.reviewLabels.preco, value: data.preco ? `R$ ${Number(data.preco).toFixed(2)}` : "—" },
              { label: copy.reviewLabels.custo, value: data.custo ? `R$ ${Number(data.custo).toFixed(2)}` : "—" },
              { label: copy.reviewLabels.estoqueMinimo, value: `${data.estoqueMinimo} un.` },
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
