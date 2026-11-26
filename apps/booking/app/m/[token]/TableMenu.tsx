"use client";

import { useEffect, useState } from "react";
import { getPublicMenu, resolveTableQr, type PublicMenu } from "@reservia/api-client";
import { buildTableGroups, tableBaseName } from "@reservia/core";
import { supabase } from "../../../lib/supabase";
import { MenuScreen } from "../../_menu/MenuScreen";

/** Lo que ve el cliente al escanear el QR de su mesa: la carta con el pedido y los avisos rápidos. */
export function TableMenu({ token }: { token: string }) {
  const [state, setState] = useState<{ menu: PublicMenu; label: string } | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resolved = await resolveTableQr(supabase, token);
        if (!resolved) return !cancelled && setState(null);
        const menu = await getPublicMenu(supabase, resolved.restaurant.slug);
        if (!menu) return !cancelled && setState(null);
        // El mismo número que ve el personal en el plano (mesas pegadas o separadas incluidas).
        const table = resolved.tables.find((t) => t.id === resolved.tableId);
        const group = buildTableGroups(resolved.tables, resolved.zones).byTable.get(resolved.tableId);
        const label = group?.label || (table ? tableBaseName(table) : "");
        if (!cancelled) setState({ menu, label });
      } catch {
        if (!cancelled) setState(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === undefined) return <p className="grid min-h-screen place-items-center text-sm text-ink-muted">Cargando la carta…</p>;
  if (state === null) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center">
        <div className="max-w-sm">
          <h1 className="font-serif text-[36px] leading-none mb-3">No encontramos esta mesa</h1>
          <p className="text-[15px] text-ink-muted">El código no es válido. Pídele ayuda al personal del restaurante.</p>
        </div>
      </main>
    );
  }
  return <MenuScreen menu={state.menu} table={{ token, label: state.label }} />;
}
