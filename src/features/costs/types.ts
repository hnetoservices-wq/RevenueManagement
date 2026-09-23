export type CostPaymentStatus = "paid" | "pending";

export interface CostCategory {
  id: string;
  propertyId: string;
  name: string;
  description: string;
  active: boolean;
}

export interface Supplier {
  id: string;
  propertyId: string;
  name: string;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  paymentTermsDays: number | null;
  notes: string;
  active: boolean;
}

export interface ExpenseRecord {
  id: string;
  propertyId: string;
  date: string;
  description: string;
  categoryId: string;
  supplierId: string | null;
  grossCents: number;
  vatRate: number | null;
  vatCents: number;
  paymentStatus: CostPaymentStatus;
  recurring: boolean;
  invoiceNumber: string;
  notes: string;
}

export interface SalaryRecord {
  id: string;
  propertyId: string;
  month: string;
  employeeName: string;
  role: string;
  grossSalaryCents: number;
  employerCostsCents: number;
  mealAllowanceCents: number;
  otherCostsCents: number;
  totalCostCents: number;
  paymentStatus: CostPaymentStatus;
  notes: string;
}

export interface CostSummary {
  operatingExpensesCents: number;
  payrollCents: number;
  totalCostsCents: number;
  pendingCents: number;
  vatCents: number;
}

export function calculateCostSummary(expenses: ExpenseRecord[], salaries: SalaryRecord[]): CostSummary {
  const operatingExpensesCents = expenses.reduce((sum, item) => sum + item.grossCents, 0);
  const payrollCents = salaries.reduce((sum, item) => sum + item.totalCostCents, 0);
  const pendingCents = expenses
    .filter((item) => item.paymentStatus === "pending")
    .reduce((sum, item) => sum + item.grossCents, 0)
    + salaries
      .filter((item) => item.paymentStatus === "pending")
      .reduce((sum, item) => sum + item.totalCostCents, 0);
  const vatCents = expenses.reduce((sum, item) => sum + item.vatCents, 0);
  return {
    operatingExpensesCents,
    payrollCents,
    totalCostsCents: operatingExpensesCents + payrollCents,
    pendingCents,
    vatCents,
  };
}

export function vatFromGross(grossCents: number, vatRate: number | null): number {
  if (!vatRate || vatRate <= 0) return 0;
  return Math.round(grossCents * vatRate / (100 + vatRate));
}
