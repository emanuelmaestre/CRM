"use client";

import { motion } from "framer-motion";
import { PageHeader } from "@/shared/design-system/primitives/PageHeader";
import { EmptyState } from "@/shared/design-system/primitives/EmptyState";
import {
  Building2, Plug, Users, Cpu, HeartPulse, Brain,
  CheckCircle2, Clock, ExternalLink,
} from "lucide-react";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number,number,number,number] } },
};

function Card({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -2, boxShadow: "0 8px 28px rgba(14,15,19,.1)" }}
      transition={{ duration: 0.18 }}
      className="rounded-[1.25rem] bg-card shadow-[0_2px_16px_rgba(14,15,19,.07)]"
    >
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
          <Icon size={14} strokeWidth={1.75} />
        </div>
        <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </motion.div>
  );
}

function Row({ label, value, accent }: { label: string; value?: string; accent?: string }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {value && (
        <span className="text-sm font-medium text-foreground" style={accent ? { color: accent } : undefined}>
          {value}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
      connected ? "bg-[#1F8A4C]/10 text-[#1F8A4C]" : "bg-muted text-muted-foreground"
    }`}>
      {connected
        ? <><motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 2, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-[#1F8A4C]" /> Ativo</>
        : <><Clock size={11} strokeWidth={2} /> Pendente</>
      }
    </span>
  );
}

function IntegrationRow({ name, description, href, color, connected = false }: {
  name: string; description?: string; href?: string; color?: string; connected?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ x: 2 }}
      className="flex justify-between items-center py-3 border-b border-border last:border-0"
    >
      <div>
        <p className="text-sm font-medium text-foreground">{name}</p>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="ml-3 flex-shrink-0 flex items-center gap-2">
        {href ? (
          <motion.a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold text-white shadow-sm"
            style={{ background: color ?? "var(--foreground)" }}
          >
            Abrir <ExternalLink size={10} strokeWidth={2.5} />
          </motion.a>
        ) : (
          <StatusBadge connected={connected} />
        )}
      </div>
    </motion.div>
  );
}

export default function ConfiguracoesPage() {
  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Organização, integrações, usuários, sistema e saúde"
      />

      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">

        {/* Linha 1 */}
        <div className="grid md:grid-cols-2 gap-5">
          <Card title="Organização" icon={Building2}>
            <Row label="Marcas ativas" value="KARZI, WUWU" />
            <Row label="Plano" value="Acelera" />
          </Card>

          <Card title="Usuários" icon={Users}>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-foreground">admin@crm.com.br</p>
                <p className="text-xs text-muted-foreground mt-0.5">Administrador</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1F8A4C]/10 text-[#1F8A4C]">
                <motion.span
                  animate={{ scale: [1, 1.4, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-1.5 h-1.5 rounded-full bg-[#1F8A4C]"
                />
                Ativo
              </span>
            </div>
          </Card>
        </div>

        {/* Integrações */}
        <Card title="Integrações" icon={Plug}>
          <IntegrationRow name="WhatsApp (Z-API)" connected={false} />
          <IntegrationRow
            name="Shopee" description="Seller Centre Brasil"
            href="https://seller.shopee.com.br" color="#EE4D2D"
          />
          <IntegrationRow
            name="Mercado Livre" description="Gerencie anúncios e vendas"
            href="https://www.mercadolivre.com.br/vendas" color="#FFE600"
          />
          <IntegrationRow
            name="TikTok Shop" description="Seller Center"
            href="https://seller-br.tiktok.com" color="#010101"
          />
          <IntegrationRow name="Inngest" connected={false} />
          <IntegrationRow name="OpenAI" connected={false} />
        </Card>

        {/* Sistema */}
        <Card title="Sistema" icon={Cpu}>
          <Row label="Versão" value="LEO v1.0" />
          <Row label="Ambiente" value="Desenvolvimento" />
        </Card>

        {/* Saúde */}
        <div>
          <motion.h2
            variants={fadeUp}
            className="flex items-center gap-2 text-[15px] font-bold text-foreground mb-4"
          >
            <HeartPulse size={16} strokeWidth={1.75} className="text-muted-foreground" />
            Saúde do Sistema
          </motion.h2>
          <div className="grid md:grid-cols-2 gap-5">
            <Card title="Conectores" icon={Plug}>
              <EmptyState illustration="generic" title="Sem conectores configurados"
                description="Configure as contas dos canais para monitorar a saúde aqui." />
            </Card>
            <Card title="Fila de jobs" icon={Cpu}>
              <EmptyState illustration="generic" title="Nenhum job em execução"
                description="Jobs ativos e falhas aparecem aqui em tempo real." />
            </Card>
            <Card title="Dead-letter (falhas definitivas)" icon={CheckCircle2}>
              <EmptyState illustration="alerts" title="Nenhuma falha definitiva"
                description="Jobs que esgotaram tentativas aparecem aqui para reprocessamento." />
            </Card>
            <Card title="Backups" icon={HeartPulse}>
              <EmptyState illustration="generic" title="Aguardando primeiro backup"
                description="Backups diários automáticos. O último é exibido aqui." />
            </Card>
          </div>
        </div>

        {/* Inteligência */}
        <div>
          <motion.h2
            variants={fadeUp}
            className="flex items-center gap-2 text-[15px] font-bold text-foreground mb-4"
          >
            <Brain size={16} strokeWidth={1.75} className="text-muted-foreground" />
            Inteligência
          </motion.h2>
          <div className="grid md:grid-cols-2 gap-5">
            <Card title="Consumo de IA" icon={Brain}>
              <EmptyState illustration="reports" title="Sem dados de consumo"
                description="O consumo de tokens aparece aqui conforme a IA é utilizada." />
            </Card>
            <Card title="Insights do funil" icon={Brain}>
              <EmptyState illustration="funnel" title="Nenhum insight gerado"
                description="Insights semanais serão exibidos aqui após a integração de dados." />
            </Card>
          </div>
        </div>

      </motion.div>
    </div>
  );
}
