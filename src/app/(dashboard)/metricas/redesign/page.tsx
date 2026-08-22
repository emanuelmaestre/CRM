import { Sora, Inter } from "next/font/google";
import { MosaicoRedesign } from "./mosaico-redesign";

/* Rota de PREVIEW do redesenho do mosaico de Métricas — vive dentro do grupo
   (dashboard), então herda autenticação e a TopNav do app real. Não substitui
   /metricas: é a proposta lado a lado, pra comparar antes de portar.

   As fontes do Design System "Sinal Duplo" (Sora nos títulos/métricas, Inter
   no corpo) são carregadas por next/font aqui e expostas como variáveis CSS,
   ficando restritas a esta página — o resto do app continua com a tipografia
   de sempre. */
const sora = Sora({ subsets: ["latin"], weight: ["600", "700"], variable: "--fonte-sora", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--fonte-inter", display: "swap" });

export default function Page() {
  return (
    <div className={`${sora.variable} ${inter.variable}`}>
      <MosaicoRedesign />
    </div>
  );
}
