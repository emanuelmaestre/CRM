"use client";

import { motion } from "framer-motion";
import { StatCard } from "@/shared/design-system/primitives/StatCard";
import { SectionCard } from "@/shared/design-system/primitives/SectionCard";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import { BrandChip } from "@/shared/design-system/primitives/BrandChip";

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.24,
      ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
      delay: i * 0.04,
    },
  }),
};

export default function DashboardPage() {
  return (
    <div>
      <motion.div
        initial="hidden"
        animate="visible"
        custom={0}
        variants={fadeUp}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-sora)" }}>
          Painel
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral da operação — KARZI &amp; WUWU</p>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Pedidos hoje", value: "—", sub: "Aguardando integração" },
          { label: "Receita do mês", value: "—", sub: "Aguardando integração" },
          { label: "Clientes ativos", value: "—", sub: "Base importada" },
          { label: "SKUs em alerta", value: "—", sub: "Estoque mínimo" },
        ].map((card, i) => (
          <motion.div key={card.label} initial="hidden" animate="visible" custom={i + 1} variants={fadeUp}>
            <StatCard {...card} />
          </motion.div>
        ))}
      </div>

      {/* Marcas */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {(["karzi", "wuwu"] as const).map((brand, i) => (
          <motion.div key={brand} initial="hidden" animate="visible" custom={i + 5} variants={fadeUp}>
            <SectionCard
              title={brand.toUpperCase()}
              actions={<BrandChip brand={brand} />}
            >
              <EmptyState
                illustration="reports"
                title="Sem dados ainda"
                description={`Conecte os canais da ${brand.toUpperCase()} para ver os números aqui.`}
              />
            </SectionCard>
          </motion.div>
        ))}
      </div>

      {/* Alertas de estoque */}
      <motion.div initial="hidden" animate="visible" custom={7} variants={fadeUp}>
        <SectionCard title="Alertas de estoque">
          <EmptyState
            illustration="alerts"
            title="Nenhum alerta"
            description="Quando um SKU atingir o estoque mínimo, aparece aqui."
          />
        </SectionCard>
      </motion.div>
    </div>
  );
}
