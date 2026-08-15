import "@testing-library/jest-dom";

// jsdom não implementa matchMedia, e todo componente que respeita
// prefers-reduced-motion o consulta — sem este stub, renderizar qualquer card
// animado quebra no teste por um motivo que não existe no navegador. Padrão
// "não reduzir": o teste vê a mesma versão animada que a maioria dos usuários.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
