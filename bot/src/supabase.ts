import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';
import crypto from 'crypto';

export interface CategoryItem {
  id: string;
  name: string;
  type: string;
  icon: string;
}

export interface BudgetSubItem {
  id: string;
  name: string;
  value: number;
}

export class BudgetService {
  private client: SupabaseClient;
  private userId: string | null = null;
  private email: string | null = null;
  private categoriesCache: CategoryItem[] = [];

  constructor(identifier?: string) {
    this.email = identifier || null;
    this.client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
      },
    });
  }

  getUserId(): string | null {
    return this.userId;
  }

  getEmail(): string | null {
    return this.email;
  }

  async authenticate(): Promise<boolean> {
    if (!config.userEmail || !config.userPassword) {
      console.error('[Supabase] E-mail ou senha não configurados no .env');
      return false;
    }
    return this.authenticateWithCredentials(config.userEmail, config.userPassword);
  }

  async authenticateWithCredentials(email: string, password: string): Promise<boolean> {
    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.user) {
        console.error(`[Supabase] Falha ao autenticar ${email}:`, error?.message);
        return false;
      }

      this.userId = data.user.id;
      this.email = data.user.email || email;
      console.log(`[Supabase] Autenticado com sucesso como: ${this.email} (ID: ${this.userId})`);
      await this.refreshCategories();
      return true;
    } catch (err: any) {
      console.error(`[Supabase] Erro ao autenticar ${email}:`, err.message);
      return false;
    }
  }

  async refreshCategories(): Promise<CategoryItem[]> {
    if (!this.userId) return [];

    const { data, error } = await this.client
      .from('categories')
      .select('id, name, type, icon')
      .eq('user_id', this.userId)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[Supabase] Erro ao buscar categorias:', error.message);
      return [];
    }

    this.categoriesCache = data || [];
    return this.categoriesCache;
  }

  getCategories(type?: 'income' | 'expense'): CategoryItem[] {
    if (!type) return this.categoriesCache;
    return this.categoriesCache.filter((c) => c.type === type);
  }

  async addExpense(params: {
    categoryId: string;
    month: string;
    title: string;
    amount: number;
  }) {
    return this.addTransaction({ ...params, type: 'expense' });
  }

  async addTransaction(params: {
    categoryId: string;
    month: string; // "YYYY-MM"
    title: string;
    amount: number;
    type: 'income' | 'expense';
  }): Promise<{ success: boolean; totalMonthCategory?: number; error?: string }> {
    if (!this.userId) {
      const ok = await this.authenticate();
      if (!ok) return { success: false, error: 'Não autenticado no Supabase' };
    }

    const { categoryId, month, title, amount } = params;

    try {
      // 1. Verificar se já existe lançamento para essa categoria e mês
      const { data: existing, error: fetchErr } = await this.client
        .from('budget_entries')
        .select('*')
        .eq('user_id', this.userId)
        .eq('category_id', categoryId)
        .eq('month', month)
        .maybeSingle();

      if (fetchErr) {
        console.error('[Supabase] Erro ao consultar lançamento:', fetchErr.message);
        return { success: false, error: fetchErr.message };
      }

      const newItem: BudgetSubItem = {
        id: crypto.randomUUID(),
        name: title,
        value: amount,
      };

      const now = new Date().toISOString();

      if (existing) {
        const currentSubItems: BudgetSubItem[] = Array.isArray(existing.sub_items)
          ? existing.sub_items
          : [];
        const newSubItems = [...currentSubItems, newItem];
        const newActual = Number(existing.actual || 0) + amount;

        const history = Array.isArray(existing.history) ? [...existing.history] : [];
        history.push({
          date: now,
          planned: Number(existing.planned || 0),
          actual: newActual,
        });

        const { error: updateErr } = await this.client
          .from('budget_entries')
          .update({
            actual: newActual,
            sub_items: newSubItems,
            history,
            updated_at: now,
          })
          .eq('id', existing.id);

        if (updateErr) {
          console.error('[Supabase] Erro ao atualizar lançamento:', updateErr.message);
          return { success: false, error: updateErr.message };
        }

        return { success: true, totalMonthCategory: newActual };
      } else {
        // Criar novo registro para esse mês/categoria
        const { error: insertErr } = await this.client.from('budget_entries').insert({
          user_id: this.userId,
          category_id: categoryId,
          month,
          planned: 0,
          actual: amount,
          sub_items: [newItem],
          history: [{ date: now, planned: 0, actual: amount }],
          updated_at: now,
        });

        if (insertErr) {
          console.error('[Supabase] Erro ao criar lançamento:', insertErr.message);
          return { success: false, error: insertErr.message };
        }

        return { success: true, totalMonthCategory: amount };
      }
    } catch (err: any) {
      console.error('[Supabase] Exceção ao salvar:', err.message);
      return { success: false, error: err.message };
    }
  }

  async setPlannedBudget(params: {
    categoryId: string;
    month: string; // "YYYY-MM"
    amount: number;
  }): Promise<{ success: boolean; planned?: number; actual?: number; remaining?: number; error?: string }> {
    if (!this.userId) {
      const ok = await this.authenticate();
      if (!ok) return { success: false, error: 'Não autenticado no Supabase' };
    }

    const { categoryId, month, amount } = params;

    try {
      // Verificar se já existe lançamento para essa categoria e mês
      const { data: existing, error: fetchErr } = await this.client
        .from('budget_entries')
        .select('*')
        .eq('user_id', this.userId)
        .eq('category_id', categoryId)
        .eq('month', month)
        .maybeSingle();

      if (fetchErr) {
        console.error('[Supabase] Erro ao consultar lançamento:', fetchErr.message);
        return { success: false, error: fetchErr.message };
      }

      const now = new Date().toISOString();

      if (existing) {
        const currentActual = Number(existing.actual || 0);
        const history = Array.isArray(existing.history) ? [...existing.history] : [];
        history.push({
          date: now,
          planned: amount,
          actual: currentActual,
        });

        const { error: updateErr } = await this.client
          .from('budget_entries')
          .update({
            planned: amount,
            history,
            updated_at: now,
          })
          .eq('id', existing.id);

        if (updateErr) {
          console.error('[Supabase] Erro ao atualizar planejado:', updateErr.message);
          return { success: false, error: updateErr.message };
        }

        return {
          success: true,
          planned: amount,
          actual: currentActual,
          remaining: amount - currentActual,
        };
      } else {
        // Criar novo registro para esse mês/categoria
        const { error: insertErr } = await this.client.from('budget_entries').insert({
          user_id: this.userId,
          category_id: categoryId,
          month,
          planned: amount,
          actual: 0,
          history: [{ date: now, planned: amount, actual: 0 }],
          updated_at: now,
        });

        if (insertErr) {
          console.error('[Supabase] Erro ao criar lançamento planejado:', insertErr.message);
          return { success: false, error: insertErr.message };
        }

        return {
          success: true,
          planned: amount,
          actual: 0,
          remaining: amount,
        };
      }
    } catch (err: any) {
      console.error('[Supabase] Exceção ao salvar planejado:', err.message);
      return { success: false, error: err.message };
    }
  }

  async getMonthBudgetSummary(month: string) {
    if (!this.userId) {
      await this.authenticate();
    }
    if (!this.userId) return null;

    // Buscar todas as categorias (income e expense)
    const { data: allCategories, error: catErr } = await this.client
      .from('categories')
      .select('id, name, type, icon')
      .eq('user_id', this.userId)
      .order('sort_order', { ascending: true });

    if (catErr) {
      console.error('[Supabase] Erro ao carregar categorias:', catErr.message);
      return null;
    }

    // Buscar lançamentos do mês
    const { data: entries, error: entErr } = await this.client
      .from('budget_entries')
      .select('*')
      .eq('user_id', this.userId)
      .eq('month', month);

    if (entErr) {
      console.error('[Supabase] Erro ao carregar lançamentos do mês:', entErr.message);
      return null;
    }

    const categoriesMap = new Map((allCategories || []).map((c) => [c.id, c]));

    const incomes: any[] = [];
    const expenses: any[] = [];
    let totalPlannedIncome = 0;
    let totalActualIncome = 0;
    let totalPlannedExpense = 0;
    let totalActualExpense = 0;

    for (const entry of entries || []) {
      const cat = categoriesMap.get(entry.category_id);
      if (!cat) continue;

      const itemData = {
        categoryId: cat.id,
        categoryName: cat.name,
        type: cat.type,
        planned: Number(entry.planned || 0),
        actual: Number(entry.actual || 0),
        notes: entry.notes,
        paid: entry.paid,
        subItems: Array.isArray(entry.sub_items) ? entry.sub_items : [],
      };

      if (cat.type === 'income') {
        incomes.push(itemData);
        totalPlannedIncome += itemData.planned;
        totalActualIncome += itemData.actual;
      } else {
        expenses.push(itemData);
        totalPlannedExpense += itemData.planned;
        totalActualExpense += itemData.actual;
      }
    }

    return {
      month,
      incomes,
      expenses,
      totals: {
        plannedIncome: totalPlannedIncome,
        actualIncome: totalActualIncome,
        plannedExpense: totalPlannedExpense,
        actualExpense: totalActualExpense,
        actualBalance: totalActualIncome - totalActualExpense,
        plannedBalance: totalPlannedIncome - totalPlannedExpense,
      },
      allCategories: allCategories || [],
    };
  }
}
