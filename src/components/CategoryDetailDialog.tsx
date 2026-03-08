import { useState, useEffect } from 'react';
import { Category, BudgetEntry, SubItem } from '@/types/finance';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2 } from 'lucide-react';
import { CategoryIcon } from './CategoryIcon';

interface CategoryDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category;
  entry: BudgetEntry | undefined;
  onSave: (details: Partial<BudgetEntry>) => void;
}

export function CategoryDetailDialog({
  open,
  onOpenChange,
  category,
  entry,
  onSave,
}: CategoryDetailDialogProps) {
  const [notes, setNotes] = useState('');
  const [installments, setInstallments] = useState('');
  const [currentInstallment, setCurrentInstallment] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paid, setPaid] = useState(false);
  const [subItems, setSubItems] = useState<SubItem[]>([]);

  useEffect(() => {
    if (open) {
      setNotes(entry?.notes || '');
      setInstallments(entry?.installments?.toString() || '');
      setCurrentInstallment(entry?.currentInstallment?.toString() || '');
      setDueDate(entry?.dueDate || '');
      setPaid(entry?.paid || false);
      setSubItems(entry?.subItems || []);
    }
  }, [open, entry]);

  const addSubItem = () => {
    setSubItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: '', value: 0 },
    ]);
  };

  const updateSubItem = (id: string, field: 'name' | 'value', val: string) => {
    setSubItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, [field]: field === 'value' ? parseFloat(val) || 0 : val }
          : item
      )
    );
  };

  const removeSubItem = (id: string) => {
    setSubItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = () => {
    onSave({
      notes: notes || undefined,
      installments: installments ? parseInt(installments) : undefined,
      currentInstallment: currentInstallment ? parseInt(currentInstallment) : undefined,
      dueDate: dueDate || undefined,
      paid,
      subItems: subItems.length > 0 ? subItems : undefined,
    });
    onOpenChange(false);
  };

  const subTotal = subItems.reduce((sum, item) => sum + item.value, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary">
              <CategoryIcon name={category.icon} className="h-5 w-5 text-muted-foreground" />
            </div>
            {category.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Notas */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Observações
            </Label>
            <Textarea
              placeholder="Adicione notas sobre esta categoria..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none text-sm"
              rows={3}
            />
          </div>

          {/* Parcelas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Total de parcelas
              </Label>
              <Input
                type="number"
                placeholder="Ex: 12"
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                min="0"
                className="text-sm h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Parcela atual
              </Label>
              <Input
                type="number"
                placeholder="Ex: 3"
                value={currentInstallment}
                onChange={(e) => setCurrentInstallment(e.target.value)}
                min="0"
                className="text-sm h-9"
              />
            </div>
          </div>

          {/* Vencimento e Status */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Vencimento
              </Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="text-sm h-9"
              />
            </div>
            <div className="flex items-center gap-3 pb-1">
              <Switch checked={paid} onCheckedChange={setPaid} />
              <Label className="text-sm font-medium">
                {paid ? 'Pago' : 'Pendente'}
              </Label>
            </div>
          </div>

          {/* Sub-itens */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Sub-itens
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addSubItem}
                className="h-7 gap-1 text-xs"
              >
                <Plus className="h-3 w-3" />
                Adicionar
              </Button>
            </div>
            {subItems.length > 0 && (
              <div className="space-y-2">
                {subItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Input
                      placeholder="Nome"
                      value={item.name}
                      onChange={(e) => updateSubItem(item.id, 'name', e.target.value)}
                      className="text-sm h-8 flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="Valor"
                      value={item.value || ''}
                      onChange={(e) => updateSubItem(item.id, 'value', e.target.value)}
                      className="text-sm h-8 w-28 text-right"
                      min="0"
                      step="0.01"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeSubItem(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
                <div className="text-right text-xs text-muted-foreground pt-1">
                  Subtotal: R$ {subTotal.toFixed(2)}
                </div>
              </div>
            )}
          </div>

          <Button onClick={handleSave} className="w-full">
            Salvar detalhes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
