#!/usr/bin/env node
// Divide las mesas grandes de un restaurante en módulos DENTRO de su misma huella (el plano no cambia).
// Regla por defecto: módulos medianos de 4 y el resto chico:  6 -> 4+2,  8 -> 4+4,  10 -> 4+4+2.
//
// Uso:
//   node supabase/seed/split-big-tables.mjs --slug cnit              # solo muestra el plan (no cambia nada)
//   node supabase/seed/split-big-tables.mjs --slug cnit --apply      # lo aplica
// Opciones: --min 6 (capacidad mínima para dividir, por defecto 6)
//
// Requiere la migración 0034_table_modules.sql. Las reservas que ya estaban en una mesa grande pasan a
// ocupar los módulos necesarios (quedan como unión con número).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const headers = { "Content-Type": "application/json", apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SLUG = arg("--slug", "");
const MIN = Number(arg("--min", "6"));
const APPLY = args.includes("--apply");
if (!SLUG) {
  console.error("Falta --slug <restaurante>");
  process.exit(1);
}

const rest = async (path, init = {}) => {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

function suggestSplit(capacity) {
  let remaining = Math.max(2, Math.round(capacity));
  const parts = [];
  while (remaining >= 4 && parts.length < 5) {
    parts.push(4);
    remaining -= 4;
  }
  if (remaining > 0) parts.push(remaining);
  return parts.length === 1 ? [Math.ceil(parts[0] / 2), Math.floor(parts[0] / 2)].filter((p) => p > 0) : parts;
}

const [restaurant] = await rest(`restaurants?slug=eq.${SLUG}&select=id,name`);
if (!restaurant) throw new Error(`No existe el restaurante '${SLUG}'.`);
const tables = await rest(
  `tables?restaurant_id=eq.${restaurant.id}&active=eq.true&layout_id=is.null&capacity_max=gte.${MIN}&select=id,name,capacity_max,width,height&order=capacity_max.desc`,
);
console.log(`${restaurant.name}: ${tables.length} mesas de ${MIN} o más personas para dividir`);
for (const t of tables) {
  const parts = suggestSplit(t.capacity_max);
  console.log(`  Mesa ${t.name} (${t.capacity_max}p) -> ${parts.join(" + ")}  = ${parts.map((p, i) => `${t.name}-${"ABCDEF"[i]}(${p})`).join(", ")}`);
  if (APPLY) await rest("rpc/split_table_into_modules", { method: "POST", body: JSON.stringify({ p_table: t.id, p_capacities: parts }) });
}
console.log(APPLY ? "Listo: mesas divididas." : "\nEsto fue solo una vista previa. Agrega --apply para aplicarlo.");
