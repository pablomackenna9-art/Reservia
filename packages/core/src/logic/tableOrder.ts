/**
 * Orden "humano" de nombres de mesa -- "2" antes que "10", no alfabético
 * (que pondría "10" antes que "2"). Sirve tanto para `Table.name` como para
 * `TableCandidate.tableNames[0]`, que comparten el mismo formato de string.
 */
export function compareTableNames(a: string, b: string): number {
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}
