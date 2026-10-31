import { describe, expect, it } from 'vitest';
import { getFilteredChartSummary } from '@/lib/chartSummary';
import type { BudgetEntry, Category } from '@/types/finance';

const categories: Category[] = [
  { id: 'food', name: 'Alimentação', type: 'expense', icon: 'Utensils' },
  { id: 'utilities', name: 'Contas', type: 'expense', icon: 'Zap' },
  { id: 'salary', name: 'Salário', type: 'income', icon: 'Briefcase' },
];
const entries: BudgetEntry[] = [
  { id: '1', categoryId: 'food', month: '2026-09', planned: 100, actual: 80 },
  { id: '2', categoryId: 'food', month: '2026-10', planned: 150, actual: 120 },
  { id: '3', categoryId: 'utilities', month: '2026-09', planned: 200, actual: 180 },
  { id: '4', categoryId: 'utilities', month: '2026-10', planned: 250, actual: 230 },
  { id: '5', categoryId: 'salary', month: '2026-10', planned: 1000, actual: 900 },
];

describe('chart category filters', () => {
  it('includes only selected expenses in every month of the trend', () => {
    expect(['2026-09', '2026-10'].map((month) =>
      getFilteredChartSummary(entries, categories, month, ['food'], 'expense').actualExpense,
    )).toEqual([80, 120]);
  });

  it('clearing categories produces zero totals instead of all categories', () => {
    expect(getFilteredChartSummary(entries, categories, '2026-10', [], 'all')).toEqual({
      plannedIncome: 0, actualIncome: 0, plannedExpense: 0, actualExpense: 0,
      plannedBalance: 0, actualBalance: 0,
    });
  });

  it('uses selected categories for both planned and actual summary totals', () => {
    expect(getFilteredChartSummary(entries, categories, '2026-10', ['food', 'salary'], 'all'))
      .toEqual({ plannedIncome: 1000, actualIncome: 900, plannedExpense: 150,
        actualExpense: 120, plannedBalance: 850, actualBalance: 780 });
  });

  it('applies the transaction type together with category selection', () => {
    const summary = getFilteredChartSummary(entries, categories, '2026-10', ['food', 'salary'], 'expense');
    expect(summary.actualIncome).toBe(0);
    expect(summary.actualExpense).toBe(120);
  });
});