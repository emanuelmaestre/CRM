import { describe, expect, it } from "vitest";
import {
  aplicarCooldown,
  agruparAlertasSemelhantes,
  deduplicarLote,
  processarAlertas,
  type Alerta,
} from "@/modules/anuncios/application/alertas";

function alerta(parcial: Partial<Alerta>): Alerta {
  return {
    chave: "camp-1:tipo",
    prioridade: "importante",
    campanhaId: "camp-1",
    campanhaNome: "Campanha 1",
    titulo: "Título",
    descricao: "Descrição",
    geradoEm: new Date("2026-08-14T10:00:00.000Z"),
    ...parcial,
  };
}

describe("Central de Alertas — sinal, não ruído", () => {
  it("deduplica alertas com a mesma chave no mesmo lote, mantendo o mais recente", () => {
    const antigo = alerta({ geradoEm: new Date("2026-08-14T08:00:00.000Z") });
    const novo = alerta({ geradoEm: new Date("2026-08-14T10:00:00.000Z"), descricao: "atualizado" });
    const resultado = deduplicarLote([antigo, novo]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].descricao).toBe("atualizado");
  });

  it("aplica cooldown: mesmo alerta não reaparece antes do intervalo configurado", () => {
    const agora = new Date("2026-08-14T10:00:00.000Z");
    const ultimaOcorrencia = new Map([["camp-1:tipo", new Date("2026-08-14T04:00:00.000Z")]]); // 6h atrás
    const resultado = aplicarCooldown([alerta({})], ultimaOcorrencia, 24, agora);
    expect(resultado).toHaveLength(0); // cooldown de 24h, só passou 6h
  });

  it("deixa passar depois que o cooldown expira", () => {
    const agora = new Date("2026-08-14T10:00:00.000Z");
    const ultimaOcorrencia = new Map([["camp-1:tipo", new Date("2026-08-13T09:00:00.000Z")]]); // 25h atrás
    const resultado = aplicarCooldown([alerta({})], ultimaOcorrencia, 24, agora);
    expect(resultado).toHaveLength(1);
  });

  it("alerta nunca visto antes sempre passa pelo cooldown", () => {
    const resultado = aplicarCooldown([alerta({})], new Map(), 24);
    expect(resultado).toHaveLength(1);
  });

  it("agrupa alertas semelhantes entre campanhas diferentes (2+), mantém únicos separados", () => {
    const alertas = [
      alerta({ chave: "camp-1:x", campanhaId: "camp-1", titulo: "Perda por orçamento" }),
      alerta({ chave: "camp-2:x", campanhaId: "camp-2", titulo: "Perda por orçamento" }),
      alerta({ chave: "camp-3:y", campanhaId: "camp-3", titulo: "Título único" }),
    ];
    const { individuais, grupos } = agruparAlertasSemelhantes(alertas);
    expect(individuais).toHaveLength(1);
    expect(individuais[0].titulo).toBe("Título único");
    expect(grupos).toHaveLength(1);
    expect(grupos[0].alertas).toHaveLength(2);
  });

  it("processarAlertas ordena por prioridade: crítico antes de oportunidade", () => {
    const { individuais } = processarAlertas(
      [
        alerta({ chave: "a", prioridade: "oportunidade", titulo: "Oportunidade" }),
        alerta({ chave: "b", prioridade: "critico", titulo: "Crítico" }),
      ],
      new Map(),
      24,
    );
    expect(individuais[0].prioridade).toBe("critico");
    expect(individuais[1].prioridade).toBe("oportunidade");
  });

  it("pipeline completo: dedup + cooldown + agrupamento não perde nem duplica alerta legítimo", () => {
    const agora = new Date("2026-08-14T10:00:00.000Z");
    const resultado = processarAlertas(
      [alerta({ chave: "novo:1" }), alerta({ chave: "novo:1" })], // duplicado no lote
      new Map(), // nunca visto
      24,
      agora,
    );
    expect(resultado.individuais).toHaveLength(1);
  });
});
