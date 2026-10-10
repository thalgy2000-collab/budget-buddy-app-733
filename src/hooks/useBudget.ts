import { useState, useCallback, useEffect } from 'react';
import { BudgetEntry, Category, DEFAULT_CATEGORIES, SubItem } from '@/types/finance';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface DbCategory {
  id: string;
  user_id: string;
  key: string;
  name: string;
  type: string;
  icon: string;
  sort_order: number;
}

interface DbEntry {
  id: string;
  user_id: string;
  category_id: string;
  month: string;
  planned: number;
  actual: number;
  notes: string | null;
  installments: number | null;
  current_installment: number | null;
  due_date: string | null;
  paid: boolean | null;
  sub_items: any;
  history: any;
  updated_at: string;
}

function toCategory(db: DbCategory): Category {
  return { id: db.id, name: db.name, type: db.type as 'income' | 'expense', icon: db.icon };
}

function toEntry(db: DbEntry): BudgetEntry {
  return {
    id: db.id,
    categoryId: db.category_id,
    month: db.month,
    planned: Number(db.planned),
    actual: Number(db.actual),
    updatedAt: db.updated_at,
    notes: db.notes ?? undefined,
    installments: db.installments ?? undefined,
    currentInstallment: db.current_installment ?? undefined,
    dueDate: db.due_date ?? undefined,
    paid: db.paid ?? undefined,
    subItems: db.sub_items ?? undefined,
    history: db.history ?? undefined,
  };
}

export function useBudget() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Seed default categories for new users
  const seedDefaults = useCallback(async (userId: string) => {
    const defaults = DEFAULT_CATEGORIES.map((c, i) => ({
      user_id: userId,
      key: c.id,
      name: c.name,
      type: c.type,
      icon: c.icon,
      sort_order: i,
    }));
    const { data, error } = await supabase.from('categories').insert(defaults).select();
    if (error) {
      console.error('Error seeding categories:', error);
      return [];
    }
    return (data || []).map(toCategory);
  }, []);

  // Load data
  useEffect(() => {
    if (!user) {
      setCategories([]);
      setEntries([]);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      // Load categories
      let { data: cats, error: catsErr } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order');

      if (catsErr) {
        console.error(catsErr);
        toast.error('Erro ao carregar categorias');
      }

      let categoryList = (cats || []).map(toCategory);

      // Seed defaults if empty
      if (categoryList.length === 0) {
        categoryList = await seedDefaults(user.id);
      }

      setCategories(categoryList);

      // Load entries
      const { data: ents, error: entsErr } = await supabase
        .from('budget_entries')
        .select('*');

      if (entsErr) {
        console.error(entsErr);
        toast.error('Erro ao carregar lançamentos');
      }

      setEntries((ents || []).map(toEntry));
      setLoading(false);
    };

    load();
  }, [user, seedDefaults]);

  const getEntry = useCallback(
    (categoryId: string, month: string) =>
      entries.find((e) => e.categoryId === categoryId && e.month === month),
    [entries]
  );

  const upsertEntry = useCallback(
    async (categoryId: string, month: string, planned: number, actual: number) => {
      if (!user) return;
      pushUndo();
      const existing = entries.find((e) => e.categoryId === categoryId && e.month === month);
      const now = new Date().toISOString();
      const record = { date: now, planned, actual };
      const history = JSON.parse(JSON.stringify([...(existing?.history || []), record]));

      if (existing) {
        const { data, error } = await supabase
          .from('budget_entries')
          .update({ planned, actual, history } as any)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) { toast.error('Erro ao salvar'); return; }
        setEntries((prev) => prev.map((e) => (e.id === existing.id ? toEntry(data) : e)));
      } else {
        const { data, error } = await supabase
          .from('budget_entries')
          .insert([{
            user_id: user.id,
            category_id: categoryId,
            month,
            planned,
            actual,
            history,
          }] as any)
          .select()
          .single();
        if (error) { toast.error('Erro ao salvar'); return; }
        setEntries((prev) => [...prev, toEntry(data)]);
      }
    },
    [user, entries, pushUndo]
  );

  const getMonthSummary = useCallback(
    (month: string) => {
      const monthEntries = entries.filter((e) => e.month === month);
      const incomeIds = categories.filter((c) => c.type === 'income').map((c) => c.id);
      const expenseIds = categories.filter((c) => c.type === 'expense').map((c) => c.id);

      const plannedIncome = monthEntries.filter((e) => incomeIds.includes(e.categoryId)).reduce((s, e) => s + e.planned, 0);
      const actualIncome = monthEntries.filter((e) => incomeIds.includes(e.categoryId)).reduce((s, e) => s + e.actual, 0);
      const plannedExpense = monthEntries.filter((e) => expenseIds.includes(e.categoryId)).reduce((s, e) => s + e.planned, 0);
      const actualExpense = monthEntries.filter((e) => expenseIds.includes(e.categoryId)).reduce((s, e) => s + e.actual, 0);

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

  const addCategory = useCallback(
    async (category: Category) => {
      if (!user) return;
      pushUndo();
      const { data, error } = await supabase
        .from('categories')
        .insert({
          user_id: user.id,
          key: category.id,
          name: category.name,
          type: category.type,
          icon: category.icon,
          sort_order: categories.length,
        })
        .select()
        .single();
      if (error) { toast.error('Erro ao adicionar categoria'); return; }
      setCategories((prev) => [...prev, toCategory(data)]);
    },
    [user, categories, pushUndo]
  );

  const renameCategory = useCallback(
    async (id: string, newName: string) => {
      pushUndo();
      const { error } = await supabase
        .from('categories')
        .update({ name: newName })
        .eq('id', id);
      if (error) { toast.error('Erro ao renomear'); return; }
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name: newName } : c)));
    },
    [pushUndo]
  );

  const removeCategory = useCallback(
    async (id: string) => {
      pushUndo();
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) { toast.error('Erro ao remover'); return; }
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setEntries((prev) => prev.filter((e) => e.categoryId !== id));
    },
    [pushUndo]
  );

  // ---------- Undo stack (Ctrl+Z) ----------
  interface Snapshot {
    entries: BudgetEntry[];
    categories: Category[];
  }
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [
      ...prev.slice(-29),
      { entries: JSON.parse(JSON.stringify(entries)), categories: JSON.parse(JSON.stringify(categories)) },
    ]);
  }, [entries, categories]);

  const undo = useCallback(async () => {
    if (!user) return;
    const snap = undoStack[undoStack.length - 1];
    if (!snap) return;
    setUndoStack((prev) => prev.slice(0, -1));

    // Restore entries: delete rows not in snapshot, upsert snapshot rows
    const snapEntryIds = snap.entries.map((e) => e.id);
    const entriesToDelete = entries.filter((e) => !snapEntryIds.includes(e.id)).map((e) => e.id);
    if (entriesToDelete.length > 0) {
      await supabase.from('budget_entries').delete().in('id', entriesToDelete);
    }
    for (const e of snap.entries) {
      await supabase.from('budget_entries').upsert({
        id: e.id,
        user_id: user.id,
        category_id: e.categoryId,
        month: e.month,
        planned: e.planned,
        actual: e.actual,
        notes: e.notes ?? null,
        installments: e.installments ?? null,
        current_installment: e.currentInstallment ?? null,
        due_date: e.dueDate ?? null,
        paid: e.paid ?? null,
        sub_items: e.subItems ?? null,
        history: e.history ?? null,
      } as any);
    }

    // Restore categories
    const snapCatIds = snap.categories.map((c) => c.id);
    const catsToDelete = categories.filter((c) => !snapCatIds.includes(c.id)).map((c) => c.id);
    if (catsToDelete.length > 0) {
      await supabase.from('categories').delete().in('id', catsToDelete);
    }
    for (const c of snap.categories) {
      await supabase.from('categories').upsert({
        id: c.id,
        user_id: user.id,
        key: c.id,
        name: c.name,
        type: c.type,
        icon: c.icon,
      } as any);
    }

    setEntries(snap.entries);
    setCategories(snap.categories);
  }, [user, undoStack, entries, categories]);

  const duplicatePlanned = useCallback(
    async (fromMonth: string, toMonth: string) => {
      if (!user) return;
      pushUndo();
      const sourceEntries = entries.filter((e) => e.month === fromMonth);
      for (const src of sourceEntries) {
        const existing = entries.find((e) => e.categoryId === src.categoryId && e.month === toMonth);
        if (existing) {
          await supabase.from('budget_entries').update({ planned: src.planned }).eq('id', existing.id);
        } else {
          await supabase.from('budget_entries').insert({
            user_id: user.id,
            category_id: src.categoryId,
            month: toMonth,
            planned: src.planned,
            actual: 0,
          });
        }
      }
      // Reload entries
      const { data } = await supabase.from('budget_entries').select('*');
      setEntries((data || []).map(toEntry));
    },
    [user, entries, pushUndo]
  );

  const updateEntryDetails = useCallback(
    async (categoryId: string, month: string, details: Partial<BudgetEntry>) => {
      if (!user) return;
      pushUndo();
      const existing = entries.find((e) => e.categoryId === categoryId && e.month === month);
      const dbDetails: any = {};
      if (details.notes !== undefined) dbDetails.notes = details.notes;
      if (details.installments !== undefined) dbDetails.installments = details.installments;
      if (details.currentInstallment !== undefined) dbDetails.current_installment = details.currentInstallment;
      if (details.dueDate !== undefined) dbDetails.due_date = details.dueDate;
      if (details.paid !== undefined) dbDetails.paid = details.paid;
      if (details.subItems !== undefined) dbDetails.sub_items = details.subItems;
      if (details.actual !== undefined) {
        dbDetails.actual = details.actual;
        const now = new Date().toISOString();
        dbDetails.history = JSON.parse(
          JSON.stringify([
            ...(existing?.history || []),
            { date: now, planned: existing?.planned ?? 0, actual: details.actual },
          ])
        );
      }

      if (existing) {
        const { data, error } = await supabase
          .from('budget_entries')
          .update(dbDetails)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) { toast.error('Erro ao salvar detalhes'); return; }
        setEntries((prev) => prev.map((e) => (e.id === existing.id ? toEntry(data) : e)));
      } else {
        const { data, error } = await supabase
          .from('budget_entries')
          .insert({
            user_id: user.id,
            category_id: categoryId,
            month,
            ...dbDetails,
          })
          .select()
          .single();
        if (error) { toast.error('Erro ao salvar detalhes'); return; }
        setEntries((prev) => [...prev, toEntry(data)]);
      }
    },
    [user, entries, pushUndo]
  );

  return {
    entries,
    categories,
    loading,
    getEntry,
    upsertEntry,
    getMonthSummary,
    addCategory,
    renameCategory,
    removeCategory,
    duplicatePlanned,
    undo,
    canUndo: undoStack.length > 0,
    updateEntryDetails,
  };
}
