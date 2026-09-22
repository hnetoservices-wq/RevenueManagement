import { describe, expect, it } from "vitest";
import { draftToProperty, validatePropertyDraft, type PropertyDraft } from "../src/features/settings/propertySetup";

const valid: PropertyDraft = {
  id: "fonte-santa",
  name: "Fonte Santa",
  currency: "EUR",
  timezone: "Europe/Lisbon",
  totalRooms: 5,
  rooms: [
    { id: "r1", name: "Casa da Estufa", quantity: 2 },
    { id: "r2", name: "Suite Conselheiro", quantity: 1 },
    { id: "r3", name: "Quarto Junior", quantity: 2 },
  ],
};

describe("property setup", () => {
  it("requires configured room quantities to equal the declared total inventory", () => {
    expect(validatePropertyDraft(valid)).toEqual([]);
    const invalid = { ...valid, totalRooms: 6 };
    expect(validatePropertyDraft(invalid)).toContain("Room-type quantities add up to 5, but Number of rooms is 6.");
  });

  it("requires unique exact room names", () => {
    const duplicate: PropertyDraft = {
      ...valid,
      rooms: [...valid.rooms, { id: "r4", name: "casa da estufa", quantity: 1 }],
      totalRooms: 6,
    };
    expect(validatePropertyDraft(duplicate).some((issue) => issue.includes("duplicated"))).toBe(true);
  });

  it("converts the draft into active room types for import matching", () => {
    const property = draftToProperty(valid);
    expect(property.name).toBe("Fonte Santa");
    expect(property.roomTypes).toHaveLength(3);
    expect(property.roomTypes.reduce((sum, room) => sum + room.inventoryCount, 0)).toBe(5);
    expect(property.roomTypes[0].canonicalName).toBe("Casa da Estufa");
  });
});
