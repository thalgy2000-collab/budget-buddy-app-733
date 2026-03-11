import { useState } from 'react';
import { format, subMonths, addMonths, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useBudget } from '@/hooks/useBudget';
import { MonthSelector } from '@/components/MonthSelector';
import { SummaryCards } from '@/components/SummaryCards';
import { BudgetTable } from '@/components/BudgetTable';
import { AddCategoryDialog } from '@/components/AddCategoryDialog';
import { BarChart3, Copy, PieChart, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

const Index = () => {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const { categories, getEntry, upsertEntry, getMonthSummary, addCategory, renameCategory, duplicatePlanned, updateEntryDetails } = useBudget();
  const navigate = useNavigate();

  const currentDate = parse(month, 'yyyy-MM', new Date());
  const prevMonth = format(subMonths(currentDate, 1), 'yyyy-MM');
  const nextMonth = format(addMonths(currentDate, 1), 'yyyy-MM');
  const prevLabel = format(subMonths(currentDate, 1), "MMM/yy", { locale: ptBR });
  const nextLabel = format(addMonths(currentDate, 1), "MMM/yy", { locale: ptBR });
  const currentLabel = format(currentDate, "MMM/yy", { locale: ptBR });

  const handleDuplicate = (fromMonth: string, fromLabel: string) => {
    duplicatePlanned(fromMonth, month);
    toast.success(`Valores planejados de ${fromLabel} copiados para ${currentLabel}`);
  };

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                  <Copy className="h-3.5 w-3.5" />
                  Duplicar planejado
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleDuplicate(prevMonth, prevLabel)}>
                  Copiar de {prevLabel}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDuplicate(nextMonth, nextLabel)}>
                  Copiar de {nextLabel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AddCategoryDialog onAdd={addCategory} />
            <Button size="sm" variant="outline" onClick={() => navigate('/graficos')} className="h-8 gap-1.5 text-xs">
              <PieChart className="h-3.5 w-3.5" />
              Gráficos
            </Button>
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
            updateEntryDetails={updateEntryDetails}
            renameCategory={renameCategory}
          />
          <BudgetTable
            title="💸 Despesas"
            categories={expenseCategories}
            month={month}
            getEntry={getEntry}
            upsertEntry={upsertEntry}
            updateEntryDetails={updateEntryDetails}
            renameCategory={renameCategory}
          />
        </div>
      </main>
    </div>
  );
};

export default Index;
