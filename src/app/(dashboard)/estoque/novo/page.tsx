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

const STEPS = ["Produto", "Preço e estoque", "Confirmar"];

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
    if (!data.nome.trim()) e.nome = "Nome é obrigatório";
    if (!data.sku.trim()) e.sku = "SKU é obrigatório";
    if (!data.brandId) e.brandId = "Selecione a marca";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep1() {
    const e: Partial<FormData> = {};
    if (!data.preco || Number(data.preco) <= 0) e.preco = "Preço deve ser maior que zero";
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
        toast.success("Produto criado com sucesso!");
        router.push("/estoque");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar produto.");
      }
    });
  }

  const brandLabel = data.brandId === BRAND_KARZI ? "KARZI" : data.brandId === BRAND_WUWU ? "WUWU" : "—";

  return (
    <WizardLayout
      title="Novo produto"
      steps={STEPS}
      currentStep={step}
      onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
      cancelHref="/estoque"
    >
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Dados do produto</h2>
            <p className="text-sm text-muted-foreground mt-1">Identidade do produto no estoque</p>
          </div>
          <WizardField label="Marca" required error={errors.brandId}>
            <select className={selectClass} value={data.brandId} onChange={(e) => set("brandId", e.target.value)}>
              <option value="">Selecione a marca</option>
              <option value={BRAND_KARZI}>KARZI</option>
              <option value={BRAND_WUWU}>WUWU</option>
            </select>
          </WizardField>
          <WizardField label="Nome do produto" required error={errors.nome}>
            <input
              className={inputClass}
              placeholder="Ex: Caixa Organizadora 40L"
              value={data.nome}
              onChange={(e) => set("nome", e.target.value)}
              autoFocus
            />
          </WizardField>
          <WizardField label="SKU" required error={errors.sku}>
            <input
              className={inputClass}
              placeholder="Ex: KZ-001"
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
            <h2 className="text-2xl font-bold text-foreground">Preço e estoque</h2>
            <p className="text-sm text-muted-foreground mt-1">Valores e controle de estoque mínimo</p>
          </div>
          <WizardField label="Preço de venda (R$)" required error={errors.preco}>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={data.preco}
              onChange={(e) => set("preco", e.target.value)}
              autoFocus
            />
          </WizardField>
          <WizardField label="Custo (R$)">
            <input
              className={inputClass}
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={data.custo}
              onChange={(e) => set("custo", e.target.value)}
            />
          </WizardField>
          <WizardField label="Estoque mínimo (unidades)">
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
            <h2 className="text-2xl font-bold text-foreground">Confirmar produto</h2>
            <p className="text-sm text-muted-foreground mt-1">Revise os dados antes de salvar</p>
          </div>

          <div className="rounded-[1.25rem] border border-border bg-card divide-y divide-border overflow-hidden">
            {[
              { label: "Marca", value: brandLabel },
              { label: "Nome", value: data.nome },
              { label: "SKU", value: data.sku.toUpperCase() },
              { label: "Preço", value: data.preco ? `R$ ${Number(data.preco).toFixed(2)}` : "—" },
              { label: "Custo", value: data.custo ? `R$ ${Number(data.custo).toFixed(2)}` : "—" },
              { label: "Estoque mínimo", value: `${data.estoqueMinimo} un.` },
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
            submitLabel="Criar produto"
          />
        </div>
      )}
    </WizardLayout>
  );
}
