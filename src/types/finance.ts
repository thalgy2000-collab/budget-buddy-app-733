export type TransactionType = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  icon: string;
}

export interface BudgetEntry {
  id: string;
  categoryId: string;
  month: string; // "2026-03"
  planned: number;
  actual: number;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'salary', name: 'Salário', type: 'income', icon: 'Briefcase' },
  { id: 'bonus1', name: 'Bonus 1', type: 'income', icon: 'Laptop' },
  { id: 'bonus2', name: 'Bonus 2', type: 'income', icon: 'TrendingUp' },
  { id: 'umatch', name: 'Umatch', type: 'income', icon: 'Plus' },
  { id: 'sobra', name: 'Sobra', type: 'income', icon: 'PiggyBank' },
  { id: 'housing', name: 'Moradia', type: 'expense', icon: 'Home' },
  { id: 'food', name: 'Alimentação', type: 'expense', icon: 'UtensilsCrossed' },
  { id: 'transport', name: 'Transporte', type: 'expense', icon: 'Car' },
  { id: 'health', name: 'Saúde', type: 'expense', icon: 'Heart' },
  { id: 'education', name: 'Educação', type: 'expense', icon: 'GraduationCap' },
  { id: 'entertainment', name: 'Lazer', type: 'expense', icon: 'Gamepad2' },
  { id: 'shopping', name: 'Compras', type: 'expense', icon: 'ShoppingBag' },
  { id: 'bills', name: 'Contas', type: 'expense', icon: 'Receipt' },
  { id: 'other-expense', name: 'Outros (Despesa)', type: 'expense', icon: 'MoreHorizontal' },
];
