export type TransactionType = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  icon: string;
}

export interface SubItem {
  id: string;
  name: string;
  value: number;
}

export interface HistoryRecord {
  date: string;
  planned: number;
  actual: number;
}

export interface BudgetEntry {
  id: string;
  categoryId: string;
  month: string; // "2026-03"
  planned: number;
  actual: number;
  updatedAt?: string;
  notes?: string;
  installments?: number;
  currentInstallment?: number;
  dueDate?: string;
  paid?: boolean;
  subItems?: SubItem[];
  history?: HistoryRecord[];
}

export const DEFAULT_CATEGORIES: Category[] = [
  // Receitas
  { id: 'salary', name: 'Salário', type: 'income', icon: 'Briefcase' },
  { id: 'freelance', name: 'Renda Extra / Freelance', type: 'income', icon: 'Laptop' },
  { id: 'investments-income', name: 'Rendimentos', type: 'income', icon: 'TrendingUp' },
  { id: 'bonus', name: 'Bônus / 13º', type: 'income', icon: 'Gift' },
  { id: 'other-income', name: 'Outras Receitas', type: 'income', icon: 'Plus' },
  // Despesas Fixas
  { id: 'housing', name: 'Moradia / Aluguel', type: 'expense', icon: 'Home' },
  { id: 'utilities', name: 'Contas (Água, Luz, Gás)', type: 'expense', icon: 'Zap' },
  { id: 'telecom', name: 'Internet / Celular', type: 'expense', icon: 'Smartphone' },
  { id: 'insurance', name: 'Seguros', type: 'expense', icon: 'Shield' },
  { id: 'health', name: 'Saúde / Plano de Saúde', type: 'expense', icon: 'Heart' },
  { id: 'education', name: 'Educação', type: 'expense', icon: 'GraduationCap' },
  // Despesas Variáveis
  { id: 'food', name: 'Alimentação / Mercado', type: 'expense', icon: 'UtensilsCrossed' },
  { id: 'transport', name: 'Transporte / Combustível', type: 'expense', icon: 'Car' },
  { id: 'leisure', name: 'Lazer / Entretenimento', type: 'expense', icon: 'Tv' },
  { id: 'clothing', name: 'Vestuário', type: 'expense', icon: 'Shirt' },
  { id: 'personal', name: 'Cuidados Pessoais', type: 'expense', icon: 'User' },
  { id: 'subscriptions', name: 'Assinaturas / Streaming', type: 'expense', icon: 'CreditCard' },
  // Financeiro
  { id: 'investment', name: 'Investimentos', type: 'expense', icon: 'PiggyBank' },
  { id: 'credit-card', name: 'Cartão de Crédito', type: 'expense', icon: 'CreditCard' },
  { id: 'loans', name: 'Empréstimos / Parcelas', type: 'expense', icon: 'Landmark' },
];
