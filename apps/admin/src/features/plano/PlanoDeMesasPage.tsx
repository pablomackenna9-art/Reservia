import { useState } from "react";
import { buildTableGroups, compareTableNames, DECOR_KINDS, DECOR_META } from "@reservia/core";
import { useRestaurant } from "../restaurants/RestaurantProvider";
import { ZoneCanvas } from "./ZoneCanvas";
import { TableDetailPanel } from "./TableDetailPanel";
import { NewTableForm } from "./NewTableForm";
import { useFloorPlan } from "./useFloorPlan";
import { CompleteReservationModal } from "../reservations/CompleteReservationModal";

export function PlanoDeMesasPage() {
  const { current } = useRestaurant();
  const restaurantId = current?.restaurant.id;

  const {
    zones,
    tables,
    decor,
    splitTable,
    mergeModules,
    returnModuleToHome,
    releaseReservationTable,
    addDecor,
    updateDecorProps,
    removeDecor,
    reservationsToday,
    reservationsByTable,
    tableGroups,
    loading,
    reload,
    getTableStatus,
    getTurnoverWarning,
    moveTable,
    updateTableProps,
    toggleTableBlocked,
    duplicateTable,
    deleteTable,
    changeReservationStatus,
    pendingCompletion,
    confirmCompletion,
    skipCompletion,
    cancelCompletion,
    seatWalkIn,
    joinTablesTogether,
    unjoinTable,
    moveReservationToTable,
    saveReservationNotes,
  } = useFloorPlan(restaurantId);

  const [activeZoneId, setActiveZoneId] = useState<string | "all">("all");
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedDecorId, setSelectedDecorId] = useState<string | null>(null);
  const [joinSourceId, setJoinSourceId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showNewTable, setShowNewTable] = useState(false);

  const visibleZones = activeZoneId === "all" ? zones : zones.filter((z) => z.id === activeZoneId);
  const visibleTables = tables
    .filter((t) => activeZoneId === "all" || t.zoneId === activeZoneId)
    .sort((a, b) => compareTableNames(a.name, b.name));

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedTableZone = selectedTable ? zones.find((z) => z.id === selectedTable.zoneId) ?? null : null;

  const selectedDecor = decor.find((d) => d.id === selectedDecorId) ?? null;
  const decorZone = (activeZoneId === "all" ? [...zones].sort((a, b) => a.sortOrder - b.sortOrder)[0] : zones.find((z) => z.id === activeZoneId)) ?? null;

  async function handleAddDecor(kind: (typeof DECOR_KINDS)[number]) {
    if (!decorZone) return;
    const id = await addDecor(decorZone.id, kind);
    if (id) {
      setSelectedDecorId(id);
      setSelectedTableId(null);
    }
  }

  async function handleDeleteDecor() {
    if (!selectedDecor) return;
    if (!confirm(`¿Quitar ${DECOR_META[selectedDecor.kind].label.toLowerCase()} del plano?`)) return;
    await removeDecor(selectedDecor.id);
    setSelectedDecorId(null);
  }

  async function handleSelectTable(id: string | null) {
    if (id) setSelectedDecorId(null);
    if (joinSourceId && id && id !== joinSourceId) {
      const groupId = await joinTablesTogether(joinSourceId, id);
      if (!groupId) alert("Solo se pueden unir mesas de la misma zona.");
      setJoinSourceId(null);
      setSelectedTableId(joinSourceId);
      return;
    }
    setJoinSourceId(null);
    setSelectedTableId(id);
  }

  if (loading) {
    return <div className="p-3 sm:p-6 text-ink-muted text-[15px]">Cargando plano…</div>;
  }

  if (zones.length === 0) {
    return (
      <div className="p-3 sm:p-6">
        <div className="rounded-2xl bg-surface min-h-[80vh] grid place-items-center">
          <p className="text-sm text-ink-muted">Este restaurante todavía no tiene zonas configuradas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 xl:h-[calc(100vh-68px)] flex flex-col">
      <header className="mb-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 xl:gap-4">
        <h1 className="font-serif text-4xl font-normal leading-tight">Plano de mesas</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5 max-w-full overflow-x-auto">
            <ZoneTab label="Todo" active={activeZoneId === "all"} onClick={() => setActiveZoneId("all")} />
            {[...zones]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((zone) => (
                <ZoneTab
                  key={zone.id}
                  label={zone.name}
                  active={activeZoneId === zone.id}
                  onClick={() => setActiveZoneId(zone.id)}
                />
              ))}
          </div>
          {editMode && (
            <button
              onClick={() => setShowNewTable(true)}
              className="rounded-[10px] bg-accent text-accent-ink px-3 py-1.5 text-sm font-semibold"
            >
              + Agregar mesa
            </button>
          )}
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`rounded-lg px-3 py-1.5 text-sm border ${
              editMode ? "bg-accent text-accent-ink border-accent" : "bg-surface text-ink-muted border-line"
            }`}
          >
            {editMode ? "Listo" : "Editar plano"}
          </button>
        </div>
      </header>

      <p className="text-[13px] text-ink-faint mb-3">
        Arrastra una mesa para moverla — se guarda sola.
        {editMode && " En modo edición puedes agregar, duplicar y eliminar mesas, y decorar el plano con plantas, columnas, barra y más."}
      </p>

      {editMode && (
        <div className="mb-3 rounded-xl bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-ink-muted shrink-0">Decorar {decorZone ? `· ${decorZone.name}` : ""}:</span>
            <div className="flex gap-1.5 overflow-x-auto max-w-full">
              {DECOR_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => handleAddDecor(kind)}
                  className="h-10 px-3 shrink-0 rounded-[10px] bg-surface-2 border border-line text-sm hover:border-accent active:scale-[0.97]"
                >
                  + {DECOR_META[kind].label}
                </button>
              ))}
            </div>
          </div>

          {selectedDecor ? (
            <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold mr-1">{DECOR_META[selectedDecor.kind].label} seleccionada</span>
              <DecorButton onClick={() => updateDecorProps(selectedDecor.id, { rotation: (selectedDecor.rotation + 345) % 360 })} label="↺ Girar" />
              <DecorButton onClick={() => updateDecorProps(selectedDecor.id, { rotation: (selectedDecor.rotation + 15) % 360 })} label="↻ Girar" />
              {STRETCHABLE.includes(selectedDecor.kind) && (
                <>
                  <DecorButton onClick={() => updateDecorProps(selectedDecor.id, { width: Math.max(30, Math.round(selectedDecor.width * 0.85)) })} label="↔ Acortar" />
                  <DecorButton onClick={() => updateDecorProps(selectedDecor.id, { width: Math.min(1200, Math.round(selectedDecor.width * 1.18)) })} label="↔ Alargar" />
                </>
              )}
              <DecorButton
                onClick={() =>
                  updateDecorProps(selectedDecor.id, {
                    width: Math.max(12, Math.round(selectedDecor.width * 0.87)),
                    height: Math.max(12, Math.round(selectedDecor.height * 0.87)),
                  })
                }
                label="Más chico"
              />
              <DecorButton
                onClick={() =>
                  updateDecorProps(selectedDecor.id, {
                    width: Math.min(1200, Math.round(selectedDecor.width * 1.15)),
                    height: Math.min(500, Math.round(selectedDecor.height * 1.15)),
                  })
                }
                label="Más grande"
              />
              <button type="button" onClick={handleDeleteDecor} className="h-10 px-3 rounded-[10px] text-sm font-semibold text-status-occupied">
                Quitar
              </button>
              <span className="text-[13px] text-ink-faint">Arrástralo en el plano para moverlo.</span>
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-ink-faint">Toca una opción para agregarla y luego arrástrala hasta su lugar. Toca un objeto del plano para girarlo, cambiarle el tamaño o quitarlo. Los sofás y banquetas se pueden alargar: las mesas pegadas a un sofá usan el sofá como asiento y dejan de mostrar sillas de ese lado.</p>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 flex gap-4">
        <div className="flex-1 min-w-0 h-[68dvh] xl:h-auto rounded-2xl overflow-hidden bg-surface-2">
          <ZoneCanvas
            zones={visibleZones}
            tables={visibleTables}
            selectedTableId={selectedTableId}
            onSelectTable={handleSelectTable}
            onMoveTable={moveTable}
            getTableStatus={getTableStatus}
            getTurnoverWarning={getTurnoverWarning}
            decor={decor}
            decorEditable={editMode}
            selectedDecorId={selectedDecorId}
            onSelectDecor={(id) => {
              setSelectedDecorId(id);
              if (id) setSelectedTableId(null);
            }}
            onMoveDecor={(id, positionX, positionY) => updateDecorProps(id, { positionX, positionY })}
          />
        </div>

        {selectedTable && selectedTableZone && restaurantId && (
          <TableDetailPanel
            key={selectedTable.id}
            table={selectedTable}
            groupLabel={buildTableGroups(tables, zones).byTable.get(selectedTable.id)?.label}
            groupCapacity={buildTableGroups(tables, zones).byTable.get(selectedTable.id)?.capacity}
            restaurantId={restaurantId}
            zoneName={selectedTableZone.name}
            status={getTableStatus(selectedTable.id)}
            reservationsToday={reservationsByTable.get(selectedTable.id) ?? []}
            allReservationsToday={reservationsToday}
            allTables={tables}
            groupInfo={tableGroups.get(selectedTable.id)}
            joinPending={joinSourceId === selectedTable.id}
            editable={editMode}
            onClose={() => {
              setSelectedTableId(null);
              setJoinSourceId(null);
            }}
            onDelete={async () => {
              if (await deleteTable(selectedTable.id)) setSelectedTableId(null);
            }}
            onDuplicate={async () => {
              const newId = await duplicateTable(selectedTable.id);
              if (newId) setSelectedTableId(newId);
            }}
            onChangeReservationStatus={changeReservationStatus}
            onSeatWalkIn={(partySize, name, phone, email) => seatWalkIn(selectedTable.id, partySize, name, phone, email)}
            onMoveReservation={moveReservationToTable}
            onReleaseTable={releaseReservationTable}
            onSaveNotes={saveReservationNotes}
            onStartJoin={() => setJoinSourceId(selectedTable.id)}
            onCancelJoin={() => setJoinSourceId(null)}
            onUnjoin={() => unjoinTable(selectedTable.id)}
            onUpdateTable={(patch) => updateTableProps(selectedTable.id, patch)}
            onSplit={(capacities) => splitTable(selectedTable.id, capacities)}
            onMergeModules={selectedTable.layoutId ? async () => { await mergeModules(selectedTable.layoutId!); setSelectedTableId(null); } : undefined}
            onReturnHome={() => returnModuleToHome(selectedTable.id)}
            onToggleBlocked={(blocked, reason) => toggleTableBlocked(selectedTable.id, blocked, reason)}
          />
        )}
      </div>

      {showNewTable && restaurantId && (
        <NewTableForm
          restaurantId={restaurantId}
          zones={zones}
          defaultZoneId={activeZoneId === "all" ? zones[0]!.id : activeZoneId}
          onCancel={() => setShowNewTable(false)}
          onCreated={() => {
            setShowNewTable(false);
            reload();
          }}
        />
      )}

      {pendingCompletion && (
        <CompleteReservationModal
          reservationId={pendingCompletion.id}
          customerName={pendingCompletion.customerName}
          onCancel={cancelCompletion}
          onConfirm={confirmCompletion}
          onSkip={skipCompletion}
        />
      )}
    </div>
  );
}

/** Objetos largos: además de agrandarse parejos, se pueden alargar o acortar (un sofá pegado a la pared, un muro). */
const STRETCHABLE: readonly string[] = ["sofa", "wall", "planter", "bar"];

function DecorButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="h-10 px-3 rounded-[10px] bg-surface-2 border border-line text-sm hover:border-accent active:scale-[0.97]">
      {label}
    </button>
  );
}

function ZoneTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 xl:h-10 shrink-0 rounded-[10px] px-4 text-sm transition-colors ${
        active ? "bg-accent text-accent-ink" : "bg-surface text-ink-muted hover:text-ink border border-line"
      }`}
    >
      {label}
    </button>
  );
}
