import { useState } from 'react';
import { format } from 'date-fns';
import { useBudget } from '@/hooks/useBudget';
import { MonthSelector } from '@/components/MonthSelector';
import { SummaryCards } from '@/components/SummaryCards';
import { BudgetTable } from '@/components/BudgetTable';
import { AddCategoryDialog } from '@/components/AddCategoryDialog';
import { BarChart3 } from 'lucide-react';

const Index = () => {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const { categories, getEntry, upsertEntry, getMonthSummary, addCategory } = useBudget();

  const summary = getMonthSummary(month);
  const incomeCategories = categories.filter((c) => c.type === 'income');
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl gradient-gold">
              <BarChart3 className="h-5 w-5 text-accent-foreground" />
            </div>
            <h1 className="font-display text-xl font-bold tracking-tight">FinPlan</h1>
          </div>
          <div className="flex items-center gap-3">
            <AddCategoryDialog onAdd={addCategory} />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Month Navigation */}
        <div className="flex justify-center">
          <MonthSelector month={month} onChange={setMonth} />
        </div>

        {/* Summary */}
        <SummaryCards {...summary} />

        {/* Tables */}
        <div className="space-y-6">
          <BudgetTable
            title="💰 Receitas"
            categories={incomeCategories}
            month={month}
            getEntry={getEntry}
            upsertEntry={upsertEntry}
          />
          <BudgetTable
            title="💸 Despesas"
            categories={expenseCategories}
            month={month}
            getEntry={getEntry}
            upsertEntry={upsertEntry}
          />
        </div>
      </main>
    </div>
  );
};

export default Index;
