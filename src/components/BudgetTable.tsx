import { useState } from 'react';
import { Category, BudgetEntry } from '@/types/finance';
import { CategoryIcon } from './CategoryIcon';
import { Input } from '@/components/ui/input';
import { Check, X, Pencil, Info, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CategoryDetailDialog } from './CategoryDetailDialog';
import { EntryHistoryDialog } from './EntryHistoryDialog';
import { Badge } from '@/components/ui/badge';
import { ValueSumInput } from './ValueSumInput';

interface BudgetTableProps {
  title: string;
  categories: Category[];
  month: string;
  getEntry: (categoryId: string, month: string) => BudgetEntry | undefined;
  upsertEntry: (categoryId: string, month: string, planned: number, actual: number) => void;
  updateEntryDetails: (categoryId: string, month: string, details: Partial<BudgetEntry>) => void;
  renameCategory: (id: string, newName: string) => void;
  hideValues?: boolean;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function maskCurrency(value: number) {
  const formatted = formatCurrency(value);
  return formatted.replace(/[\d.,]/g, (c) => (c === 'R' || c === '$' || c === ' ' ? c : '•'));
}

function maskText(text: string) {
  return text.replace(/./g, '•');
}

interface RowDraft {
  planned: string;
  actual: string;
}

export function BudgetTable({ title, categories, month, getEntry, upsertEntry, updateEntryDetails, renameCategory }: BudgetTableProps) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [detailCat, setDetailCat] = useState<Category | null>(null);
  const [historyCat, setHistoryCat] = useState<Category | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleStartEdit = () => {
    const initial: Record<string, RowDraft> = {};
    categories.forEach((cat) => {
      const entry = getEntry(cat.id, month);
      initial[cat.id] = {
        planned: entry?.planned ? entry.planned.toString() : '',
        actual: entry?.actual ? entry.actual.toString() : '',
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
                      {editingCatId === cat.id ? (
                        <Input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editingName.trim()) renameCategory(cat.id, editingName.trim());
                              setEditingCatId(null);
                            } else if (e.key === 'Escape') {
                              setEditingCatId(null);
                            }
                          }}
                          onBlur={() => {
                            if (editingName.trim()) renameCategory(cat.id, editingName.trim());
                            setEditingCatId(null);
                          }}
                          className="h-7 text-sm w-32 px-1.5"
                        />
                      ) : (
                        <span
                          className="text-sm font-medium cursor-pointer hover:underline"
                          onClick={() => { setEditingCatId(cat.id); setEditingName(cat.name); }}
                        >
                          {cat.name}
                        </span>
                      )}
                      {entry?.installments && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {entry.currentInstallment || '?'}/{entry.installments}
                        </Badge>
                      )}
                      {entry?.paid !== undefined && (
                        <Badge variant={entry.paid ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                          {entry.paid ? 'Pago' : 'Pendente'}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-auto shrink-0"
                        onClick={(e) => { e.stopPropagation(); setDetailCat(cat); }}
                      >
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {editing ? (
                      <ValueSumInput
                        ariaLabel={`Planejado ${cat.name}`}
                        value={drafts[cat.id]?.planned ?? ''}
                        onChange={(v) => updateDraft(cat.id, 'planned', v)}
                      />
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        {(entry?.history?.length || 0) > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 shrink-0"
                            onClick={() => setHistoryCat(cat)}
                          >
                            <History className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        )}
                        {entry?.updatedAt ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm text-muted-foreground cursor-default">{formatCurrency(plannedVal)}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Editado em {format(new Date(entry.updatedAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-sm text-muted-foreground">{formatCurrency(plannedVal)}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {editing ? (
                      <ValueSumInput
                        ariaLabel={`Realizado ${cat.name}`}
                        value={drafts[cat.id]?.actual ?? ''}
                        onChange={(v) => updateDraft(cat.id, 'actual', v)}
                      />
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        {entry?.updatedAt ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm font-semibold cursor-default">{formatCurrency(actualVal)}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Editado em {format(new Date(entry.updatedAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-sm font-semibold">{formatCurrency(actualVal)}</span>
                        )}
                      </div>
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

      {detailCat && (
        <CategoryDetailDialog
          open={!!detailCat}
          onOpenChange={(open) => !open && setDetailCat(null)}
          category={detailCat}
          entry={getEntry(detailCat.id, month)}
          onSave={(details) => updateEntryDetails(detailCat.id, month, details)}
        />
      )}

      {historyCat && (
        <EntryHistoryDialog
          open={!!historyCat}
          onOpenChange={(open) => !open && setHistoryCat(null)}
          categoryName={historyCat.name}
          entry={getEntry(historyCat.id, month)}
        />
      )}
    </div>
  );
}
