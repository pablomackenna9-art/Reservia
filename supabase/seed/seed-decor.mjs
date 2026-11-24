#!/usr/bin/env node
// Pone decoración de ejemplo (plantas, árboles, jardineras, puerta...) en los restaurantes indicados,
// según el nombre de cada zona. Es idempotente: borra la decoración anterior de ese restaurante y la rearma.
//
// Uso:   node supabase/seed/seed-decor.mjs [slug1 slug2 ...]     (por defecto: restaurante-demo cnit vinoteca)
// Requiere haber aplicado la migración 0033_zone_decor.sql.

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
const rest = async (path, init = {}) => {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

// Tamaños base (mismas unidades que el ancho/alto de una mesa en una zona de 700 de alto).
const META = {
  plant: [46, 46],
  tree: [86, 86],
  planter: [120, 36],
  column: [30, 30],
  wall: [130, 14],
  door: [62, 62],
  bar: [190, 52],
  sofa: [116, 42],
};

// [tipo, x%, y%, rotación, escala]
const BY_ZONE = {
  "Salón Principal": [
    ["tree", 3, 5, 0, 1],
    ["tree", 97, 5, 0, 0.9],
    ["planter", 20, 2.5, 0, 1],
    ["planter", 80, 2.5, 0, 1],
    ["plant", 3, 50, 0, 0.9],
    ["plant", 97, 50, 0, 0.9],
    ["plant", 3, 95, 0, 1],
    ["door", 94, 97, 0, 1],
  ],
  Terraza: [
    ["tree", 3, 6, 0, 1.1],
    ["tree", 97, 94, 0, 1.1],
    ["planter", 28, 2.5, 0, 1],
    ["planter", 68, 2.5, 0, 1],
    ["plant", 50, 53, 0, 1],
    ["plant", 97, 50, 0, 1],
    ["planter", 2.5, 50, 90, 1],
  ],
  Barra: [
    ["plant", 48, 45, 0, 1],
    ["plant", 97, 92, 0, 1],
    ["plant", 3, 92, 0, 1],
  ],
  Privado: [
    ["plant", 4, 6, 0, 1],
    ["plant", 96, 6, 0, 1],
    ["plant", 96, 94, 0, 1],
    ["door", 6, 96, 0, 1],
  ],
};

const slugs = process.argv.slice(2);
const targets = slugs.length ? slugs : ["restaurante-demo", "cnit", "vinoteca"];

for (const slug of targets) {
  const [restaurant] = await rest(`restaurants?slug=eq.${slug}&select=id,name`);
  if (!restaurant) {
    console.log(`- ${slug}: no existe, se omite`);
    continue;
  }
  const zones = await rest(`zones?restaurant_id=eq.${restaurant.id}&select=id,name,height`);
  await rest(`zone_decor?restaurant_id=eq.${restaurant.id}`, { method: "DELETE" });
  const rows = [];
  for (const zone of zones) {
    const factor = Math.max(0.3, zone.height / 700);
    for (const [kind, x, y, rotation, scale] of BY_ZONE[zone.name] ?? []) {
      const [w, h] = META[kind];
      rows.push({
        restaurant_id: restaurant.id,
        zone_id: zone.id,
        kind,
        pos_x: x,
        pos_y: y,
        width: Math.round(w * factor * scale),
        height: Math.round(h * factor * scale),
        rotation,
      });
    }
  }
  if (rows.length) await rest("zone_decor", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
  console.log(`- ${restaurant.name}: ${rows.length} objetos de decoración`);
}
