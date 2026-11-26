/** Carta del restaurante y solicitudes de los clientes por mesa (QR). Precios en CLP, IVA incluido. */

export const MENU_STATIONS = ["cocina", "barra"] as const;
export type MenuStation = (typeof MENU_STATIONS)[number];

export interface MenuCategory {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  station: MenuStation;
  sortOrder: number;
  active: boolean;
}

export interface MenuVariant {
  name: string;
  price: number;
}

export interface MenuDish {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  variants: MenuVariant[];
  tags: string[];
  allergens: string[];
  soldOut: boolean;
  featured: boolean;
  imageUrl: string | null;
  sortOrder: number;
  active: boolean;
}

/** Etiquetas y alérgenos que se ofrecen como atajos al crear un plato (se pueden escribir otros). */
export const MENU_TAG_SUGGESTIONS = ["Vegetariano", "Vegano", "Sin gluten", "Picante", "Nuevo", "Del chef"] as const;
export const MENU_ALLERGEN_SUGGESTIONS = ["Gluten", "Lácteos", "Huevo", "Frutos secos", "Maní", "Mariscos", "Pescado", "Soya"] as const;

export const TABLE_REQUEST_KINDS = ["waiter", "bill", "water", "order", "other"] as const;
export type TableRequestKind = (typeof TABLE_REQUEST_KINDS)[number];
export type TableRequestStatus = "pending" | "seen" | "done" | "cancelled";

export const TABLE_REQUEST_LABEL: Record<TableRequestKind, string> = {
  waiter: "Llamar al mozo",
  bill: "Pedir la cuenta",
  water: "Agua o hielo",
  order: "Pedido",
  other: "Otra solicitud",
};

export interface TableRequestItem {
  dishId: string;
  name: string;
  price: number;
  qty: number;
  variant: string | null;
  note: string | null;
}

export interface TableRequest {
  id: string;
  restaurantId: string;
  tableId: string;
  kind: TableRequestKind;
  items: TableRequestItem[];
  note: string | null;
  status: TableRequestStatus;
  createdAt: string;
  handledAt: string | null;
}

/** Pesos chilenos sin decimales: $8.900. */
export function formatCLP(amount: number): string {
  return `$${Math.round(amount).toLocaleString("es-CL")}`;
}

/** Total de un pedido (precio de cada plato por su cantidad). */
export function requestTotal(items: Pick<TableRequestItem, "price" | "qty">[]): number {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}
