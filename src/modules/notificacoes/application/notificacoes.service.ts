import { and, desc, eq, inArray } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { brand, eventoDominio } from "@/shared/lib/db/schema";
import { getBrandConfig } from "@/shared/config/brands";
import { CATALOGO_AUTOMACOES_WHATSAPP } from "@/shared/lib/whatsapp/catalogo-automacoes";

const TIPOS_NOTIFICAVEIS = CATALOGO_AUTOMACOES_WHATSAPP.map((item) => item.chave);
const LIMITE = 20;

/** O sino não precisa de uma fonte de dados própria — os mesmos eventos de
 *  domínio que já viram aviso de WhatsApp (ver catalogo-automacoes.ts) são
 *  a lista certa aqui também: já são curados, já têm emoji e categoria.
 *  Diferente do WhatsApp, aqui não formatamos texto final — devolvemos os
 *  dados brutos e o componente decide como mostrar (aviso em tempo real vs
 *  lista num popover têm necessidades de layout diferentes). */
export async function listarNotificacoesRecentes(ctx: CrudContext) {
  const eventos = await ctx.db
    .select({
      id: eventoDominio.id,
      tipo: eventoDominio.tipo,
      brandId: eventoDominio.brandId,
      criadoEm: eventoDominio.createdAt,
    })
    .from(eventoDominio)
    .where(and(eq(eventoDominio.orgId, ctx.orgId), inArray(eventoDominio.tipo, TIPOS_NOTIFICAVEIS)))
    .orderBy(desc(eventoDominio.createdAt))
    .limit(LIMITE);

  const brandIds = [...new Set(eventos.map((e) => e.brandId).filter((id): id is string => id !== null))];
  const marcas = brandIds.length > 0
    ? await ctx.db.select({ id: brand.id, slug: brand.slug, nome: brand.name }).from(brand).where(inArray(brand.id, brandIds))
    : [];
  const marcaPorId = new Map(marcas.map((m) => [m.id, getBrandConfig(m.slug)?.label ?? m.nome]));

  return eventos.map((evento) => ({
    id: evento.id,
    tipo: evento.tipo,
    criadoEm: evento.criadoEm.toISOString(),
    empresa: evento.brandId ? marcaPorId.get(evento.brandId) ?? null : null,
  }));
}
