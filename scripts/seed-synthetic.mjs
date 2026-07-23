import { createRequire } from "node:module";
import { seedSyntheticData } from "./synthetic-seed-lib.mjs";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());

const { catalog, anchor } = await seedSyntheticData({
  databaseUrl: process.env.DATABASE_URL,
  env: process.env,
});

console.log(
  `Seed sintético v${catalog.meta.schemaVersion} aplicado para ${catalog.organization.name} ` +
  `(âncora ${anchor.toISOString().slice(0, 10)}; ${catalog.clients.length} clientes; ` +
  `${catalog.products.length} produtos; ${catalog.orders.length} pedidos).`,
);
