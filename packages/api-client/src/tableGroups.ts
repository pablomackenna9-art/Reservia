import type { SupabaseClient } from "@supabase/supabase-js";

export interface TableGroupInfo {
  groupId: string;
  tableIds: string[];
}

/** Every table's group membership, keyed by table id — tables not in any group just aren't in the map. */
export async function listTableGroups(
  supabase: SupabaseClient,
  restaurantId: string,
): Promise<Map<string, TableGroupInfo>> {
  const { data, error } = await supabase
    .from("table_groups")
    .select("id, table_group_members(table_id)")
    .eq("restaurant_id", restaurantId);

  if (error) throw error;

  const byTable = new Map<string, TableGroupInfo>();
  for (const group of data ?? []) {
    const members = (group.table_group_members as { table_id: string }[]) ?? [];
    const tableIds = members.map((m) => m.table_id);
    if (tableIds.length < 2) continue; // a group with <2 members isn't really "joined"
    const info: TableGroupInfo = { groupId: group.id as string, tableIds };
    for (const id of tableIds) byTable.set(id, info);
  }
  return byTable;
}

/** Links two tables as one combined party. Purely a grouping — moving them visually closer is a separate step. */
export async function joinTables(
  supabase: SupabaseClient,
  restaurantId: string,
  tableAId: string,
  tableBId: string,
  groupName: string,
): Promise<string> {
  const { data: group, error: groupError } = await supabase
    .from("table_groups")
    .insert({ restaurant_id: restaurantId, name: groupName })
    .select("id")
    .single();
  if (groupError) throw groupError;

  const { error: memberError } = await supabase.from("table_group_members").insert([
    { table_group_id: group.id, table_id: tableAId },
    { table_group_id: group.id, table_id: tableBId },
  ]);
  if (memberError) throw memberError;

  return group.id as string;
}

/** Undoes a join for every table in that group, not just the one clicked — a "mesa unida" is a single unit. */
export async function ungroupTables(supabase: SupabaseClient, groupId: string): Promise<void> {
  const { error } = await supabase.from("table_groups").delete().eq("id", groupId);
  if (error) throw error;
  // table_group_members rows cascade-delete with the group (FK on delete cascade).
}
