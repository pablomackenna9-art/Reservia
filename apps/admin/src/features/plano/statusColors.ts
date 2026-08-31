import type { TableLiveStatusValue } from "@reservia/core";

// Mirrors the `status.*` colors in tailwind.config.ts — Konva can't read
// CSS custom properties, so the hex values are duplicated here.
export const STATUS_COLORS: Record<TableLiveStatusValue, string> = {
  available: "#4cae83",
  reserved: "#5b9bda",
  arriving: "#e0ac4e",
  occupied: "#dd7c68",
  paying: "#b389de",
  blocked: "#8a7f6d",
};
