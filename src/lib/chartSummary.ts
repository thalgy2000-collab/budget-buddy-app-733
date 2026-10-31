import type { BudgetEntry, Category, TransactionType } from '@/types/finance';

/** Chart-only totals; budget totals remain independent of chart filters. */
export function getFilteredChartSummary(
  entries: BudgetEntry[],
  categories: Category[],
  month: string,
  selectedCategories: string[],
  typeFilter: 'all' | TransactionType,
) {
  const selectedIds = new Set(selectedCategories);
  const categoryTypes = new Map(
    categories
      .filter((category) => selectedIds.has(category.id) &&
        (typeFilter === 'all' || category.type === typeFilter))
      .map((category) => [category.id, category.type]),
  );
  const totals = { plannedIncome: 0, actualIncome: 0, plannedExpense: 0, actualExpense: 0 };

  for (const entry of entries) {
    if (entry.month !== month) continue;
    const type = categoryTypes.get(entry.categoryId);
    if (type === 'income') {
      totals.plannedIncome += entry.planned;
      totals.actualIncome += entry.actual;
    } else if (type === 'expense') {
      totals.plannedExpense += entry.planned;
      totals.actualExpense += entry.actual;
    }
  }

  return {
    ...totals,
    plannedBalance: totals.plannedIncome - totals.plannedExpense,
    actualBalance: totals.actualIncome - totals.actualExpense,
  };
}