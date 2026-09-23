import { describe, expect, it } from "vitest";
import { comparisonFiltersForYear } from "../src/features/dashboard/comparison";
import type { DashboardFilters } from "../src/domain/models";

const filters: DashboardFilters = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  revenueBasis: "inclusive",
};

describe("dashboard year comparison", () => {
  it("shifts the selected period to a chosen comparison year", () => {
    expect(comparisonFiltersForYear(filters, 2024)).toEqual({
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      revenueBasis: "inclusive",
    });
  });

  it("preserves the shape of partial-year periods", () => {
    expect(comparisonFiltersForYear({ ...filters, startDate: "2026-05-10", endDate: "2026-06-20" }, 2025)).toEqual({
      startDate: "2025-05-10",
      endDate: "2025-06-20",
      revenueBasis: "inclusive",
    });
  });
});
