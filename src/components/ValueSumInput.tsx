import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus } from 'lucide-react';

interface ValueSumInputProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ValueSumInput({ value, onChange, ariaLabel }: ValueSumInputProps) {
  const [open, setOpen] = useState(false);
  const [add, setAdd] = useState('');

  const current = parseFloat(value) || 0;
  const addend = parseFloat(add.replace(',', '.')) || 0;

  const handleSum = () => {
    if (!add.trim()) return;
    const result = Math.round((current + addend) * 100) / 100;
    onChange(result.toString());
    setAdd('');
    setOpen(false);
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        type="number"
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 text-right h-8 text-sm"
        min="0"
        step="0.01"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" aria-label="Somar valor">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3 space-y-2" align="end">
          <p className="text-xs text-muted-foreground">Somar ao valor atual ({formatBRL(current)})</p>
          <Input
            autoFocus
            type="number"
            inputMode="decimal"
            placeholder="0,00"
            value={add}
            onChange={(e) => setAdd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSum();
              }
            }}
            className="h-8 text-sm"
            step="0.01"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">= {formatBRL(current + addend)}</span>
            <Button type="button" size="sm" className="h-7 text-xs" onClick={handleSum}>
              Somar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
