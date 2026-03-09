import { useState, useCallback, useEffect } from 'react';
import { BudgetEntry, Category, DEFAULT_CATEGORIES, SubItem } from '@/types/finance';

const STORAGE_KEY_ENTRIES = 'finance_entries';
const STORAGE_KEY_CATEGORIES = 'finance_categories';

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

export function useBudget() {
  const [entries, setEntries] = useState<BudgetEntry[]>(() =>
    loadFromStorage(STORAGE_KEY_ENTRIES, [])
  );
  const [categories, setCategories] = useState<Category[]>(() => {
    const stored = loadFromStorage<Category[]>(STORAGE_KEY_CATEGORIES, []);
    const defaultIds = DEFAULT_CATEGORIES.map((c) => c.id);
    const hasAll = defaultIds.every((id) => stored.some((c) => c.id === id));
    return hasAll && stored.length > 0 ? stored : DEFAULT_CATEGORIES;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
  }, [categories]);

  const getEntry = useCallback(
    (categoryId: string, month: string) =>
      entries.find((e) => e.categoryId === categoryId && e.month === month),
    [entries]
  );

  const upsertEntry = useCallback(
    (categoryId: string, month: string, planned: number, actual: number) => {
      setEntries((prev) => {
        const now = new Date().toISOString();
        const record = { date: now, planned, actual };
        const idx = prev.findIndex(
          (e) => e.categoryId === categoryId && e.month === month
        );
        if (idx >= 0) {
          const updated = [...prev];
          const existing = updated[idx];
          updated[idx] = {
            ...existing,
            planned,
            actual,
            updatedAt: now,
            history: [...(existing.history || []), record],
          };
          return updated;
        }
        return [
          ...prev,
          {
            id: `${categoryId}-${month}`,
            categoryId,
            month,
            planned,
            actual,
            updatedAt: now,
            history: [record],
          },
        ];
      });
    },
    []
  );

  const getMonthSummary = useCallback(
    (month: string) => {
      const monthEntries = entries.filter((e) => e.month === month);
      const incomeCategories = categories
        .filter((c) => c.type === 'income')
        .map((c) => c.id);
      const expenseCategories = categories
        .filter((c) => c.type === 'expense')
        .map((c) => c.id);

      const plannedIncome = monthEntries
        .filter((e) => incomeCategories.includes(e.categoryId))
        .reduce((sum, e) => sum + e.planned, 0);
      const actualIncome = monthEntries
        .filter((e) => incomeCategories.includes(e.categoryId))
        .reduce((sum, e) => sum + e.actual, 0);
      const plannedExpense = monthEntries
        .filter((e) => expenseCategories.includes(e.categoryId))
        .reduce((sum, e) => sum + e.planned, 0);
      const actualExpense = monthEntries
        .filter((e) => expenseCategories.includes(e.categoryId))
        .reduce((sum, e) => sum + e.actual, 0);

      return {
        plannedIncome,
        actualIncome,
        plannedExpense,
        actualExpense,
        plannedBalance: plannedIncome - plannedExpense,
        actualBalance: actualIncome - actualExpense,
      };
    },
    [entries, categories]
  );

  const addCategory = useCallback((category: Category) => {
    setCategories((prev) => [...prev, category]);
  }, []);

  const renameCategory = useCallback((id: string, newName: string) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: newName } : c))
    );
  }, []);

  const removeCategory = useCallback((id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setEntries((prev) => prev.filter((e) => e.categoryId !== id));
  }, []);

  const duplicatePlanned = useCallback(
    (fromMonth: string, toMonth: string) => {
      const sourceEntries = entries.filter((e) => e.month === fromMonth);
      setEntries((prev) => {
        const updated = [...prev];
        sourceEntries.forEach((src) => {
          const idx = updated.findIndex(
            (e) => e.categoryId === src.categoryId && e.month === toMonth
          );
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], planned: src.planned, updatedAt: new Date().toISOString() };
          } else {
            updated.push({
              id: `${src.categoryId}-${toMonth}`,
              categoryId: src.categoryId,
              month: toMonth,
              planned: src.planned,
              actual: 0,
              updatedAt: new Date().toISOString(),
            });
          }
        });
        return updated;
      });
    },
    [entries]
  );

  const updateEntryDetails = useCallback(
    (categoryId: string, month: string, details: Partial<BudgetEntry>) => {
      setEntries((prev) => {
        const idx = prev.findIndex(
          (e) => e.categoryId === categoryId && e.month === month
        );
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...details, updatedAt: new Date().toISOString() };
          return updated;
        }
        return [
          ...prev,
          {
            id: `${categoryId}-${month}`,
            categoryId,
            month,
            planned: 0,
            actual: 0,
            ...details,
            updatedAt: new Date().toISOString(),
          },
        ];
      });
    },
    []
  );

  return {
    entries,
    categories,
    getEntry,
    upsertEntry,
    getMonthSummary,
    addCategory,
    removeCategory,
    duplicatePlanned,
    updateEntryDetails,
  };
}
