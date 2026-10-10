import { useState, useEffect } from 'react';
import { format, subMonths, addMonths, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useBudget } from '@/hooks/useBudget';
import { MonthSelector } from '@/components/MonthSelector';
import { SummaryCards } from '@/components/SummaryCards';
import { BudgetTable } from '@/components/BudgetTable';
import { AddCategoryDialog } from '@/components/AddCategoryDialog';
import { BarChart3, Copy, PieChart, LogOut, Eye, EyeOff, Undo2, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const Index = () => {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [hideValues, setHideValues] = useState(false);
  const { categories, loading, getEntry, upsertEntry, getMonthSummary, addCategory, renameCategory, duplicatePlanned, undoDuplicate, canUndoDuplicate, updateEntryDetails } = useBudget();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const currentDate = parse(month, 'yyyy-MM', new Date());
  const prevMonth = format(subMonths(currentDate, 1), 'yyyy-MM');
  const nextMonth = format(addMonths(currentDate, 1), 'yyyy-MM');
  const prevLabel = format(subMonths(currentDate, 1), "MMM/yy", { locale: ptBR });
  const nextLabel = format(addMonths(currentDate, 1), "MMM/yy", { locale: ptBR });
  const currentLabel = format(currentDate, "MMM/yy", { locale: ptBR });

  const handleDuplicate = (fromMonth: string, fromLabel: string) => {
    duplicatePlanned(fromMonth, month);
    toast.success(`Valores planejados de ${fromLabel} copiados para ${currentLabel}`, {
      action: {
        label: 'Desfazer',
        onClick: () => {
          undoDuplicate();
          toast.success('Duplicação desfeita');
        },
      },
      duration: 10000,
    });
  };

  const summary = getMonthSummary(month);
  const incomeCategories = categories.filter((c) => c.type === 'income');
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  return (
    <div className="min-h-screen bg-background overflow-x-hidden w-full">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-10 w-full">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          {/* Logo & Nome */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="p-1.5 sm:p-2 rounded-xl gradient-gold shrink-0">
              <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-accent-foreground" />
            </div>
            <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight truncate">Finance Fácil</h1>
          </div>

          {/* Desktop Actions (telas médias e grandes) */}
          <div className="hidden md:flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHideValues((v) => !v)}
              className="h-8 gap-1.5 text-xs"
              aria-label={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
              aria-pressed={hideValues}
            >
              {hideValues ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {hideValues ? 'Mostrar' : 'Ocultar'}
            </Button>
            {canUndoDuplicate && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  undoDuplicate();
                  toast.success('Duplicação desfeita');
                }}
                className="h-8 gap-1.5 text-xs"
                aria-label="Desfazer duplicação"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Desfazer
              </Button>
            )}
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
            <Button size="sm" variant="ghost" onClick={signOut} className="h-8 gap-1.5 text-xs text-muted-foreground">
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </Button>
          </div>

          {/* Mobile Actions (celular) */}
          <div className="flex md:hidden items-center gap-1.5 shrink-0">
            <AddCategoryDialog onAdd={addCategory} />
            
            <Button
              size="icon"
              variant="outline"
              onClick={() => navigate('/graficos')}
              className="h-8 w-8 shrink-0"
              title="Gráficos"
            >
              <PieChart className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" title="Mais opções">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setHideValues((v) => !v)} className="gap-2 text-xs">
                  {hideValues ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {hideValues ? 'Mostrar valores' : 'Ocultar valores'}
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={() => handleDuplicate(prevMonth, prevLabel)} className="gap-2 text-xs">
                  <Copy className="h-4 w-4" />
                  Copiar planejado de {prevLabel}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDuplicate(nextMonth, nextLabel)} className="gap-2 text-xs">
                  <Copy className="h-4 w-4" />
                  Copiar planejado de {nextLabel}
                </DropdownMenuItem>

                {canUndoDuplicate && (
                  <DropdownMenuItem
                    onClick={() => {
                      undoDuplicate();
                      toast.success('Duplicação desfeita');
                    }}
                    className="gap-2 text-xs"
                  >
                    <Undo2 className="h-4 w-4" />
                    Desfazer duplicação
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem onClick={signOut} className="gap-2 text-xs text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" />
                  Sair da conta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        <SummaryCards {...summary} hideValues={hideValues} />

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
            hideValues={hideValues}
          />
          <BudgetTable
            title="💸 Despesas"
            categories={expenseCategories}
            month={month}
            getEntry={getEntry}
            upsertEntry={upsertEntry}
            updateEntryDetails={updateEntryDetails}
            renameCategory={renameCategory}
            hideValues={hideValues}
          />
        </div>
      </main>
    </div>
  );
};

export default Index;
