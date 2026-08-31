#!/usr/bin/env node
// Seeds a demo restaurant — Salón Principal, Terraza, Barra y Privado, con
// ~26 mesas de formas y capacidades variadas — para poder ver el plano
// funcionando sin construir todavía el editor de plano (Fase 6).
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed/demo.mjs
//
// Idempotente: si ya existe un restaurante con el slug "restaurante-demo",
// no crea nada de nuevo y termina sin error.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@reservia.app";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "ReserviaDemo2026!";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function auth(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} auth/${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

const SHAPES = ["round", "square", "rectangle"];
const CAPACITY_TIERS = [2, 4, 4, 6, 8];

/** Places `count` tables on an evenly spaced grid inside a zone, varying shape/capacity cyclically. */
function layoutTables(zone, count, namePrefix, startNumber) {
  const cols = Math.ceil(Math.sqrt((count * zone.width) / zone.height));
  const rows = Math.ceil(count / cols);
  const unit = Math.min(zone.width, zone.height) / 8;

  const tables = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const shape = SHAPES[i % SHAPES.length];
    const capacity = CAPACITY_TIERS[i % CAPACITY_TIERS.length];
    const sizeMult = capacity <= 2 ? 0.75 : capacity <= 4 ? 1 : capacity <= 6 ? 1.25 : 1.5;
    const width = shape === "rectangle" ? unit * sizeMult * 1.4 : unit * sizeMult;
    const height = unit * sizeMult;

    tables.push({
      zone_id: zone.id,
      restaurant_id: zone.restaurant_id,
      name: String(startNumber + i),
      number: startNumber + i,
      shape,
      capacity_min: Math.max(1, capacity - 2),
      capacity_max: capacity,
      pos_x: ((col + 0.5) / cols) * 76 + 12, // 12–88%, keeps tables off the edges
      pos_y: ((row + 0.5) / rows) * 76 + 12,
      width,
      height,
      rotation: 0,
      joinable: capacity <= 4,
    });
  }
  return tables;
}

async function main() {
  const existing = await rest(`restaurants?slug=eq.restaurante-demo&select=id`);
  if (existing.length > 0) {
    console.log("Ya existe restaurante-demo — nada que hacer.");
    return;
  }

  console.log("Creando usuario demo…");
  let user;
  try {
    user = await auth("admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Leslie (Demo)" },
      }),
    });
  } catch (err) {
    // Usuario ya existe de una corrida anterior parcial — lo buscamos.
    const list = await auth(`admin/users?email=${encodeURIComponent(DEMO_EMAIL)}`);
    user = list.users?.[0];
    if (!user) throw err;
  }

  console.log("Creando restaurante…");
  const [restaurant] = await rest("restaurants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      name: "Restaurante Demo",
      slug: "restaurante-demo",
      status: "active",
      created_by: user.id,
    }),
  });

  console.log("Creando zonas…");
  const zoneSpecs = [
    { name: "Salón Principal", type: "salon", sort_order: 0, width: 1000, height: 700, count: 12, start: 10 },
    { name: "Terraza", type: "terraza", sort_order: 1, width: 700, height: 500, count: 6, start: 30 },
    { name: "Barra", type: "barra", sort_order: 2, width: 500, height: 260, count: 4, start: 40 },
    { name: "Privado", type: "privado", sort_order: 3, width: 500, height: 400, count: 4, start: 50 },
  ];

  const zones = await rest("zones", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(
      zoneSpecs.map((z) => ({
        restaurant_id: restaurant.id,
        name: z.name,
        type: z.type,
        sort_order: z.sort_order,
        width: z.width,
        height: z.height,
      })),
    ),
  });

  console.log("Creando mesas…");
  const allTables = zoneSpecs.flatMap((spec) => {
    const zone = zones.find((z) => z.name === spec.name);
    return layoutTables({ ...zone, width: spec.width, height: spec.height }, spec.count, spec.name, spec.start);
  });

  await rest("tables", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(allTables),
  });

  console.log(`Listo: ${zones.length} zonas, ${allTables.length} mesas.`);
  console.log(`Login demo: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
