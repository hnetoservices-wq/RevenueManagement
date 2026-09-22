import { enumerateDates } from "./dates";
import type { InventoryClosure, IsoDate, Property, RoomType } from "./models";

function roomTypeIsActive(roomType: RoomType, date: IsoDate) {
  return (!roomType.activeFrom || roomType.activeFrom <= date)
    && (!roomType.activeTo || roomType.activeTo >= date);
}

function closureApplies(closure: InventoryClosure, roomTypeId: string, date: IsoDate) {
  return closure.roomTypeId === roomTypeId
    && closure.startDate <= date
    && closure.endDate >= date;
}

export function configuredInventoryForDate(property: Property, date: IsoDate): number {
  return property.roomTypes.reduce(
    (sum, roomType) => sum + (roomTypeIsActive(roomType, date) ? roomType.inventoryCount : 0),
    0,
  );
}

export function unavailableInventoryForDate(property: Property, date: IsoDate): number {
  const closures = property.inventoryClosures ?? [];
  return property.roomTypes.reduce((sum, roomType) => {
    if (!roomTypeIsActive(roomType, date)) return sum;
    const unavailable = closures
      .filter((closure) => closureApplies(closure, roomType.id, date))
      .reduce((quantity, closure) => quantity + closure.quantity, 0);
    return sum + Math.min(roomType.inventoryCount, Math.max(0, unavailable));
  }, 0);
}

export function availableInventoryForDate(property: Property, date: IsoDate): number {
  return Math.max(0, configuredInventoryForDate(property, date) - unavailableInventoryForDate(property, date));
}

export function unavailableRoomNights(property: Property, startDate: IsoDate, endDate: IsoDate): number {
  return enumerateDates(startDate, endDate)
    .reduce((sum, date) => sum + unavailableInventoryForDate(property, date), 0);
}

export function validateInventoryClosure(
  property: Property,
  closure: InventoryClosure,
  existingClosures: InventoryClosure[] = property.inventoryClosures ?? [],
): string[] {
  const issues: string[] = [];
  const roomType = property.roomTypes.find((room) => room.id === closure.roomTypeId);

  if (closure.propertyId !== property.id) issues.push("The closure belongs to a different property.");
  if (!roomType) issues.push("Select a valid room type.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closure.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(closure.endDate)) {
    issues.push("Enter a valid start and end date.");
  } else if (closure.endDate < closure.startDate) {
    issues.push("The end date cannot be before the start date.");
  }
  if (!Number.isInteger(closure.quantity) || closure.quantity <= 0) {
    issues.push("Unavailable quantity must be a positive whole number.");
  }
  if (roomType && closure.quantity > roomType.inventoryCount) {
    issues.push(`You cannot close more than ${roomType.inventoryCount} room${roomType.inventoryCount === 1 ? "" : "s"} of this type.`);
  }

  if (!issues.length && roomType) {
    const others = existingClosures.filter(
      (item) => item.id !== closure.id && item.propertyId === property.id && item.roomTypeId === roomType.id,
    );
    for (const date of enumerateDates(closure.startDate, closure.endDate)) {
      const alreadyUnavailable = others
        .filter((item) => item.startDate <= date && item.endDate >= date)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (alreadyUnavailable + closure.quantity > roomType.inventoryCount) {
        issues.push(`Too many ${roomType.canonicalName} rooms would be unavailable on ${date}.`);
        break;
      }
    }
  }

  return issues;
}
