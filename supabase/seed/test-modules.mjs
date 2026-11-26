#!/usr/bin/env node
// Prueba de humo de split_table_into_modules / merge_table_modules en el restaurante demo (mesa temporal que se borra al final).
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
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
};

const [demo] = await rest("restaurants?slug=eq.restaurante-demo&select=id");
const [zone] = await rest(`zones?restaurant_id=eq.${demo.id}&select=id&limit=1`);
const [t] = await rest("tables", {
  method: "POST",
  body: JSON.stringify({ restaurant_id: demo.id, zone_id: zone.id, name: "T99", capacity_min: 8, capacity_max: 10, shape: "rectangle", width: 140, height: 50, pos_x: 50, pos_y: 50, rotation: 0, joinable: true }),
});
console.log("mesa temporal", t.id);
try {
  const split = await rest("rpc/split_table_into_modules", { method: "POST", body: JSON.stringify({ p_table: t.id, p_capacities: [4, 4, 2] }) });
  console.log("split ->", JSON.stringify(split));
  const mods = await rest(`tables?restaurant_id=eq.${demo.id}&name=like.T99*&select=id,name,capacity_max,pos_x,pos_y,width,height,layout_id,home_x,home_y&order=name`);
  console.table(mods);
  const layout = mods[0].layout_id;
  await rest("rpc/merge_table_modules", { method: "POST", body: JSON.stringify({ p_layout: layout }) });
  const [after] = await rest(`tables?id=eq.${t.id}&select=name,capacity_max,pos_x,pos_y,width,height,layout_id,active`);
  console.log("tras deshacer ->", JSON.stringify(after));
  const left = await rest(`tables?restaurant_id=eq.${demo.id}&name=like.T99*&active=eq.true&select=id,name`);
  console.log("mesas T99 activas tras deshacer:", left.length);
} finally {
  const ids = await rest(`tables?restaurant_id=eq.${demo.id}&name=like.T99*&select=id`);
  for (const r of ids) await rest(`tables?id=eq.${r.id}`, { method: "DELETE" }).catch((e) => console.log("no se pudo borrar", r.id, e.message));
  await rest(`table_layouts?restaurant_id=eq.${demo.id}&name=like.T99*`, { method: "DELETE" }).catch(() => {});
  console.log("limpieza lista");
}
