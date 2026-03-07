import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, addMonths, subMonths, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MonthSelectorProps {
  month: string;
  onChange: (month: string) => void;
}

export function MonthSelector({ month, onChange }: MonthSelectorProps) {
  const date = parse(month, 'yyyy-MM', new Date());

  const label = format(date, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(format(subMonths(date, 1), 'yyyy-MM'))}
        className="h-9 w-9 rounded-full"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="font-display text-lg font-semibold capitalize min-w-[200px] text-center">
        {label}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(format(addMonths(date, 1), 'yyyy-MM'))}
        className="h-9 w-9 rounded-full"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
