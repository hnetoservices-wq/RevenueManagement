import { describe, expect, it } from "vitest";
import { comparisonFiltersForYear, isSafeDashboardDateRange } from "../src/features/dashboard/comparison";
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


describe("dashboard date input safety", () => {
  it("rejects incomplete year edits before recalculating the dashboard", () => {
    expect(isSafeDashboardDateRange("0002-01-01", "2026-12-31")).toBe(false);
    expect(isSafeDashboardDateRange("0202-01-01", "2026-12-31")).toBe(false);
    expect(isSafeDashboardDateRange("", "2026-12-31")).toBe(false);
    expect(isSafeDashboardDateRange("2027-02-30", "2027-12-31")).toBe(false);
  });

  it("accepts manually entered dates once the range is complete", () => {
    expect(isSafeDashboardDateRange("2027-01-01", "2027-12-31")).toBe(true);
    expect(isSafeDashboardDateRange("2026-10-01", "2027-03-31")).toBe(true);
  });

  it("prevents reversed or extremely large ranges from freezing the app", () => {
    expect(isSafeDashboardDateRange("2027-01-01", "2026-12-31")).toBe(false);
    expect(isSafeDashboardDateRange("2000-01-01", "2027-12-31")).toBe(false);
    expect(isSafeDashboardDateRange("2099-01-01", "2101-12-31")).toBe(false);
  });
});
