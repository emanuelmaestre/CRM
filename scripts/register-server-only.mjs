import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const serverOnly = pathToFileURL(require.resolve("next/dist/compiled/server-only/empty.js")).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: serverOnly, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
