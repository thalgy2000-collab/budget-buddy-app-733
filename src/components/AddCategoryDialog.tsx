import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { Category, TransactionType } from '@/types/finance';

interface AddCategoryDialogProps {
  onAdd: (category: Category) => void;
}

export function AddCategoryDialog({ onAdd }: AddCategoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<TransactionType>('expense');

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({
      id: name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
      name: name.trim(),
      type,
      icon: type === 'income' ? 'Plus' : 'MoreHorizontal',
    });
    setName('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs px-2.5 sm:px-3">
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Nova Categoria</span>
          <span className="inline sm:hidden">Categoria</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle className="font-display">Nova Categoria</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Assinaturas, Academia, Aluguel..."
              maxLength={50}
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={type === 'income' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setType('income')}
                className={type === 'income' ? 'gradient-gold text-accent-foreground' : ''}
              >
                Receita
              </Button>
              <Button
                type="button"
                variant={type === 'expense' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setType('expense')}
              >
                Despesa
              </Button>
            </div>
          </div>
          <Button onClick={handleSubmit} className="w-full">
            Adicionar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
