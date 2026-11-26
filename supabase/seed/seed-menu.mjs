#!/usr/bin/env node
// Carta de ejemplo para un restaurante (por defecto el demo). Idempotente: si ya tiene categorías, no hace nada.
// Uso: node supabase/seed/seed-menu.mjs [--slug restaurante-demo]
// Requiere la migración 0037_menu_and_table_requests.sql.
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
const headers = { "Content-Type": "application/json", apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: "return=representation" };
const rest = async (path, init = {}) => {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
};
const i = process.argv.indexOf("--slug");
const slug = i >= 0 ? process.argv[i + 1] : "restaurante-demo";

const [restaurant] = await rest(`restaurants?slug=eq.${slug}&select=id,name`);
if (!restaurant) throw new Error(`No existe el restaurante '${slug}'.`);
const existing = await rest(`menu_categories?restaurant_id=eq.${restaurant.id}&select=id&limit=1`);
if (existing.length) {
  console.log(`${restaurant.name} ya tiene carta: no se cambia nada.`);
  process.exit(0);
}

const carta = [
  ["Entradas", "cocina", [
    ["Ceviche clásico", 9800, "Reineta, leche de tigre, cebolla morada y cilantro", { featured: true, tags: ["Sin gluten"], allergens: ["Pescado"] }],
    ["Empanadas de pino", 6200, "Dos unidades, horneadas", { allergens: ["Gluten", "Huevo"] }],
    ["Burrata con tomates", 8900, "Tomates de la huerta y albahaca", { allergens: ["Lácteos"], tags: ["Vegetariano"] }],
  ]],
  ["Platos principales", "cocina", [
    ["Lomo vetado", 17900, "Con papas rústicas y ensalada", { variants: [{ name: "300 g", price: 17900 }, { name: "400 g", price: 21900 }] }],
    ["Risotto de hongos", 14500, "Hongos silvestres y parmesano", { tags: ["Vegetariano"], allergens: ["Lácteos"] }],
    ["Salmón grillado", 16800, "Con puré de coliflor y limón", { allergens: ["Pescado"] }],
  ]],
  ["Postres", "cocina", [
    ["Panqueque celestino", 5900, "Manjar y nueces", { allergens: ["Lácteos", "Frutos secos"] }],
    ["Helado artesanal", 4500, "Tres bolas a elección"],
  ]],
  ["Bebidas", "barra", [
    ["Limonada menta jengibre", 4200, ""],
    ["Vino de la casa", 4800, "Tinto o blanco", { variants: [{ name: "Copa", price: 4800 }, { name: "Botella", price: 17500 }] }],
    ["Café de grano", 2900, ""],
  ]],
];

for (const [ci, [name, station, dishes]] of carta.entries()) {
  const [cat] = await rest("menu_categories", { method: "POST", body: JSON.stringify({ restaurant_id: restaurant.id, name, station, sort_order: ci }) });
  for (const [di, [dname, price, description, extra = {}]] of dishes.entries()) {
    await rest("menu_dishes", {
      method: "POST",
      body: JSON.stringify({ restaurant_id: restaurant.id, category_id: cat.id, name: dname, price, description, sort_order: di, variants: extra.variants ?? [], tags: extra.tags ?? [], allergens: extra.allergens ?? [], featured: Boolean(extra.featured) }),
    });
  }
}
console.log(`Carta de ejemplo creada en ${restaurant.name}.`);
