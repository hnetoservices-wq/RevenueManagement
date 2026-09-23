import { describe, expect, it } from "vitest";
import { calculateCostSummary, vatFromGross, type ExpenseRecord, type SalaryRecord } from "../src/features/costs/types";

const expense = (overrides: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: "e1", propertyId: "malmerendas", date: "2026-09-01", description: "Eletricidade",
  categoryId: "utilities", supplierId: null, grossCents: 12300, vatRate: 23,
  vatCents: vatFromGross(12300, 23), paymentStatus: "paid", recurring: true,
  invoiceNumber: "", notes: "", ...overrides,
});

const salary = (overrides: Partial<SalaryRecord> = {}): SalaryRecord => ({
  id: "s1", propertyId: "malmerendas", month: "2026-09", employeeName: "Pessoa",
  role: "Receção", grossSalaryCents: 100000, employerCostsCents: 23750,
  mealAllowanceCents: 15000, otherCostsCents: 0, totalCostCents: 138750,
  paymentStatus: "paid", notes: "", ...overrides,
});

describe("cost management", () => {
  it("extracts VAT from a gross amount", () => {
    expect(vatFromGross(12300, 23)).toBe(2300);
    expect(vatFromGross(10000, 0)).toBe(0);
  });

  it("summarises operating costs, payroll and pending amounts", () => {
    const result = calculateCostSummary(
      [expense(), expense({ id: "e2", grossCents: 5000, vatCents: 0, paymentStatus: "pending" })],
      [salary({ paymentStatus: "pending" })],
    );
    expect(result.operatingExpensesCents).toBe(17300);
    expect(result.payrollCents).toBe(138750);
    expect(result.totalCostsCents).toBe(156050);
    expect(result.pendingCents).toBe(143750);
    expect(result.vatCents).toBe(2300);
  });
});
