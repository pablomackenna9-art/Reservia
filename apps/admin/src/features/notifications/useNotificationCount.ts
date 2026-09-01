import { useEffect, useState } from "react";
import { listReservationsNeedingAttention } from "@reservia/api-client";
import { supabase } from "../../lib/supabase";

/** Polls restaurant-wide so the sidebar badge stays honest without a manual refresh. */
export function useNotificationCount(restaurantId: string | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;

    async function refresh() {
      const { pendingApproval, unassignedTable } = await listReservationsNeedingAttention(supabase, restaurantId!);
      if (!cancelled) setCount(pendingApproval.length + unassignedTable.length);
    }

    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [restaurantId]);

  return count;
}
