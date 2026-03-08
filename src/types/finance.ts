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
  updatedAt?: string; // ISO date string
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'salary', name: 'Salário', type: 'income', icon: 'Briefcase' },
  { id: 'bonus1', name: 'Bonus 1', type: 'income', icon: 'Laptop' },
  { id: 'bonus2', name: 'Bonus 2', type: 'income', icon: 'TrendingUp' },
  { id: 'umatch', name: 'Umatch', type: 'income', icon: 'Plus' },
  { id: 'sobra', name: 'Sobra', type: 'income', icon: 'PiggyBank' },
  { id: 'streaming', name: 'Streaming', type: 'expense', icon: 'Tv' },
  { id: 'food', name: 'Alimentação', type: 'expense', icon: 'UtensilsCrossed' },
  { id: 'transport', name: 'Transporte', type: 'expense', icon: 'Car' },
  { id: 'credit-card', name: 'Cartão de crédito', type: 'expense', icon: 'CreditCard' },
  { id: 'investment', name: 'Investimento', type: 'expense', icon: 'TrendingUp' },
  { id: 'piao', name: 'Pião', type: 'expense', icon: 'Baby' },
  { id: 'psicologa', name: 'Psicóloga', type: 'expense', icon: 'Brain' },
  { id: 'pessoal', name: 'Pessoal', type: 'expense', icon: 'User' },
  { id: 'curso', name: 'Curso', type: 'expense', icon: 'BookOpen' },
  { id: 'casa', name: 'Casa', type: 'expense', icon: 'Home' },
  { id: 'faculdade', name: 'Faculdade', type: 'expense', icon: 'GraduationCap' },
  { id: 'moto', name: 'Moto', type: 'expense', icon: 'Bike' },
  { id: 'celular', name: 'Celular', type: 'expense', icon: 'Smartphone' },
];
