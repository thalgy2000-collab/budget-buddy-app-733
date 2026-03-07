import { useState } from 'react';
import { Category, BudgetEntry } from '@/types/finance';
import { CategoryIcon } from './CategoryIcon';
import { Input } from '@/components/ui/input';
import { Check, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

function EditableRow({
  category,
  entry,
  month,
  upsertEntry,
}: {
  category: Category;
  entry: BudgetEntry | undefined;
  month: string;
  upsertEntry: BudgetTableProps['upsertEntry'];
}) {
  const [editing, setEditing] = useState(false);
  const [planned, setPlanned] = useState(entry?.planned?.toString() || '0');
  const [actual, setActual] = useState(entry?.actual?.toString() || '0');

  const handleEdit = () => {
    setPlanned(entry?.planned?.toString() || '0');
    setActual(entry?.actual?.toString() || '0');
    setEditing(true);
  };

  const handleSave = () => {
    upsertEntry(category.id, month, parseFloat(planned) || 0, parseFloat(actual) || 0);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const plannedVal = entry?.planned || 0;
  const actualVal = entry?.actual || 0;
  const diff = category.type === 'income' ? actualVal - plannedVal : plannedVal - actualVal;

  return (
    <tr className="group border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-secondary">
            <CategoryIcon name={category.icon} className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="text-sm font-medium">{category.name}</span>
        </div>
      </td>
      <td className="py-3 px-4 text-right">
        {editing ? (
          <Input
            type="number"
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
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
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            className="w-28 ml-auto text-right h-8 text-sm"
            min="0"
            step="0.01"
          />
        ) : (
          <span className="text-sm font-semibold">{formatCurrency(actualVal)}</span>
        )}
      </td>
      <td className="py-3 px-4 text-right">
        <span
          className={`text-sm font-medium ${
            diff >= 0 ? 'text-success' : 'text-destructive'
          }`}
        >
          {diff >= 0 ? '+' : ''}
          {formatCurrency(diff)}
        </span>
      </td>
      <td className="py-3 px-2 text-right w-20">
        {editing ? (
          <div className="flex gap-1 justify-end">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave}>
              <Check className="h-3.5 w-3.5 text-success" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
              <X className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleEdit}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </td>
    </tr>
  );
}

export function BudgetTable({ title, categories, month, getEntry, upsertEntry }: BudgetTableProps) {
  const totalPlanned = categories.reduce((sum, c) => sum + (getEntry(c.id, month)?.planned || 0), 0);
  const totalActual = categories.reduce((sum, c) => sum + (getEntry(c.id, month)?.actual || 0), 0);
  const type = categories[0]?.type || 'expense';
  const totalDiff = type === 'income' ? totalActual - totalPlanned : totalPlanned - totalActual;

  return (
    <div className="bg-card rounded-xl shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-muted-foreground uppercase tracking-wider">
              <th className="text-left py-3 px-4 font-medium">Categoria</th>
              <th className="text-right py-3 px-4 font-medium">Planejado</th>
              <th className="text-right py-3 px-4 font-medium">Realizado</th>
              <th className="text-right py-3 px-4 font-medium">Diferença</th>
              <th className="w-20 py-3 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <EditableRow
                key={cat.id}
                category={cat}
                entry={getEntry(cat.id, month)}
                month={month}
                upsertEntry={upsertEntry}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 font-semibold">
              <td className="py-3 px-4 text-sm">Total</td>
              <td className="py-3 px-4 text-right text-sm text-muted-foreground">
                {formatCurrency(totalPlanned)}
              </td>
              <td className="py-3 px-4 text-right text-sm">{formatCurrency(totalActual)}</td>
              <td className="py-3 px-4 text-right text-sm">
                <span className={totalDiff >= 0 ? 'text-success' : 'text-destructive'}>
                  {totalDiff >= 0 ? '+' : ''}
                  {formatCurrency(totalDiff)}
                </span>
              </td>
              <td className="w-20"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
