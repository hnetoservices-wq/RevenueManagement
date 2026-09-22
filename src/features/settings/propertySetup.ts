import type { Property } from "../../domain/models";

export interface PropertyRoomDraft {
  id: string;
  name: string;
  quantity: number;
}

export interface PropertyDraft {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  totalRooms: number;
  rooms: PropertyRoomDraft[];
}

export function propertyToDraft(property: Property): PropertyDraft {
  const activeRooms = property.roomTypes.filter((room) => room.inventoryCount > 0 && room.activeTo === null);
  return {
    id: property.id,
    name: property.name,
    currency: property.currency,
    timezone: property.timezone,
    totalRooms: activeRooms.reduce((sum, room) => sum + room.inventoryCount, 0),
    rooms: activeRooms.map((room) => ({
      id: room.id,
      name: room.canonicalName,
      quantity: room.inventoryCount,
    })),
  };
}

export function blankPropertyDraft(id: string, roomId: string): PropertyDraft {
  return {
    id,
    name: "",
    currency: "EUR",
    timezone: "Europe/Lisbon",
    totalRooms: 1,
    rooms: [{ id: roomId, name: "", quantity: 1 }],
  };
}

export function configuredRoomCount(draft: PropertyDraft): number {
  return draft.rooms.reduce((sum, room) => sum + (Number.isFinite(room.quantity) ? room.quantity : 0), 0);
}

export function validatePropertyDraft(draft: PropertyDraft): string[] {
  const issues: string[] = [];
  if (!draft.name.trim()) issues.push("Property name is required.");
  if (!/^[A-Z]{3}$/.test(draft.currency.trim().toUpperCase())) issues.push("Currency must use a 3-letter code such as EUR.");
  if (!draft.timezone.trim()) issues.push("Timezone is required.");
  if (!Number.isInteger(draft.totalRooms) || draft.totalRooms <= 0) issues.push("Number of rooms must be a positive whole number.");
  if (!draft.rooms.length) issues.push("Add at least one room type.");

  const names = new Set<string>();
  for (const room of draft.rooms) {
    const name = room.name.trim();
    if (!name) issues.push("Every room type needs the exact name used in Amenitiz.");
    const key = name.toLowerCase();
    if (name && names.has(key)) issues.push(`Room type '${name}' is duplicated.`);
    if (name) names.add(key);
    if (!Number.isInteger(room.quantity) || room.quantity <= 0) {
      issues.push(`${name || "Room type"} must have a positive whole-number quantity.`);
    }
  }

  const configured = configuredRoomCount(draft);
  if (Number.isInteger(draft.totalRooms) && draft.totalRooms > 0 && configured !== draft.totalRooms) {
    issues.push(`Room-type quantities add up to ${configured}, but Number of rooms is ${draft.totalRooms}.`);
  }
  return Array.from(new Set(issues));
}

export function draftToProperty(draft: PropertyDraft): Property {
  return {
    id: draft.id,
    name: draft.name.trim(),
    currency: draft.currency.trim().toUpperCase(),
    timezone: draft.timezone.trim(),
    roomTypes: draft.rooms.map((room) => ({
      id: room.id,
      propertyId: draft.id,
      canonicalName: room.name.trim(),
      inventoryCount: room.quantity,
      activeFrom: null,
      activeTo: null,
    })),
  };
}
