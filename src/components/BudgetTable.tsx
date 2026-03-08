import { useState } from 'react';
import { Category, BudgetEntry } from '@/types/finance';
import { CategoryIcon } from './CategoryIcon';
import { Input } from '@/components/ui/input';
import { Check, X, Pencil, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BudgetTableProps {
  title: string;
  categories: Category[];
  month: string;
  getEntry: (categoryId: string, month: string) => BudgetEntry | undefined;
  upsertEntry: (categoryId: string, month: string, planned: number, actual: number) => void;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface RowDraft {
  planned: string;
  actual: string;
}

export function BudgetTable({ title, categories, month, getEntry, upsertEntry }: BudgetTableProps) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});

  const handleStartEdit = () => {
    const initial: Record<string, RowDraft> = {};
    categories.forEach((cat) => {
      const entry = getEntry(cat.id, month);
      initial[cat.id] = {
        planned: entry?.planned?.toString() || '0',
        actual: entry?.actual?.toString() || '0',
      };
    });
    setDrafts(initial);
    setEditing(true);
  };

  const handleSaveAll = () => {
    categories.forEach((cat) => {
      const draft = drafts[cat.id];
      if (draft) {
        upsertEntry(cat.id, month, parseFloat(draft.planned) || 0, parseFloat(draft.actual) || 0);
      }
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const updateDraft = (catId: string, field: 'planned' | 'actual', value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [catId]: { ...prev[catId], [field]: value },
    }));
  };

  const totalPlanned = categories.reduce((sum, c) => sum + (getEntry(c.id, month)?.planned || 0), 0);
  const totalActual = categories.reduce((sum, c) => sum + (getEntry(c.id, month)?.actual || 0), 0);
  const type = categories[0]?.type || 'expense';
  const totalDiff = type === 'income' ? totalActual - totalPlanned : totalPlanned - totalActual;

  return (
    <div className="bg-card rounded-xl shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {editing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleCancel} className="h-8 gap-1.5 text-xs">
              <X className="h-3.5 w-3.5" />
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSaveAll} className="h-8 gap-1.5 text-xs">
              <Check className="h-3.5 w-3.5" />
              Salvar tudo
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={handleStartEdit} className="h-8 gap-1.5 text-xs">
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-muted-foreground uppercase tracking-wider">
              <th className="text-left py-3 px-4 font-medium">Categoria</th>
              <th className="text-right py-3 px-4 font-medium">Planejado</th>
              <th className="text-right py-3 px-4 font-medium">Realizado</th>
              <th className="text-right py-3 px-4 font-medium">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => {
              const entry = getEntry(cat.id, month);
              const plannedVal = entry?.planned || 0;
              const actualVal = entry?.actual || 0;
              const diff = cat.type === 'income' ? actualVal - plannedVal : plannedVal - actualVal;

              return (
                <tr key={cat.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-secondary">
                        <CategoryIcon name={cat.icon} className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{cat.name}</span>
                        {entry?.updatedAt && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1 cursor-default">
                                  <Clock className="h-2.5 w-2.5" />
                                  {format(new Date(entry.updatedAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Última edição: {format(new Date(entry.updatedAt), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {editing ? (
                      <Input
                        type="number"
                        value={drafts[cat.id]?.planned || '0'}
                        onChange={(e) => updateDraft(cat.id, 'planned', e.target.value)}
                        className="w-28 ml-auto text-right h-8 text-sm"
                        min="0"
                        step="0.01"
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">{formatCurrency(plannedVal)}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {editing ? (
                      <Input
                        type="number"
                        value={drafts[cat.id]?.actual || '0'}
                        onChange={(e) => updateDraft(cat.id, 'actual', e.target.value)}
                        className="w-28 ml-auto text-right h-8 text-sm"
                        min="0"
                        step="0.01"
                      />
                    ) : (
                      <span className="text-sm font-semibold">{formatCurrency(actualVal)}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`text-sm font-medium ${diff >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 font-semibold">
              <td className="py-3 px-4 text-sm">Total</td>
              <td className="py-3 px-4 text-right text-sm text-muted-foreground">{formatCurrency(totalPlanned)}</td>
              <td className="py-3 px-4 text-right text-sm">{formatCurrency(totalActual)}</td>
              <td className="py-3 px-4 text-right text-sm">
                <span className={totalDiff >= 0 ? 'text-success' : 'text-destructive'}>
                  {totalDiff >= 0 ? '+' : ''}{formatCurrency(totalDiff)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
