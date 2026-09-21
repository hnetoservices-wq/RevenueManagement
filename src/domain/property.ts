import type { Property } from "./models";

export const MALMERENDAS_PROPERTY: Property = {
  id: "malmerendas",
  name: "Malmerendas Boutique Lodging",
  currency: "EUR",
  timezone: "Europe/Lisbon",
  roomTypes: [
    "Superior King Studio",
    "Deluxe Suite",
    "Junior Suite",
    "Attic Loft",
    "Terrace Loft",
    "Garden Studio",
  ].map((canonicalName, index) => ({
    id: `malmerendas-room-${index + 1}`,
    propertyId: "malmerendas",
    canonicalName,
    inventoryCount: 1,
    activeFrom: null,
    activeTo: null,
  })),
};

export const DEFAULT_STATUS_MAPPING = new Map([
  ["confirmed", "active"],
  ["modified", "active"],
  ["cancelled", "cancelled"],
] as const);
