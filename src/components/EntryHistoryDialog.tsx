import { BudgetEntry } from '@/types/finance';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';

interface EntryHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  entry: BudgetEntry | undefined;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function EntryHistoryDialog({
  open,
  onOpenChange,
  categoryName,
  entry,
}: EntryHistoryDialogProps) {
  const history = entry?.history || [];

  // Mostra o valor adicionado em cada alteração (diferença em relação ao registro anterior)
  const rows = history.map((record, i) => {
    const prev = history[i - 1];
    return {
      date: record.date,
      plannedDelta: record.planned - (prev?.planned ?? 0),
      actualDelta: record.actual - (prev?.actual ?? 0),
      planned: record.planned,
      actual: record.actual,
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Histórico — {categoryName}</DialogTitle>
        </DialogHeader>

        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma alteração registrada.
          </p>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1">
              <div className="grid grid-cols-3 text-xs text-muted-foreground uppercase tracking-wider py-2 px-1 border-b border-border/50">
                <span>Data</span>
                <span className="text-right">Planejado (+)</span>
                <span className="text-right">Realizado (+)</span>
              </div>
              {[...rows].reverse().map((record, i) => (
                <div
                  key={i}
                  className="grid grid-cols-3 text-sm py-2 px-1 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <span className="text-muted-foreground text-xs">
                    {format(new Date(record.date), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                  </span>
                  <span className="text-right">
                    {record.plannedDelta !== 0 ? (
                      <>
                        {record.plannedDelta > 0 ? '+' : '−'}
                        {formatCurrency(Math.abs(record.plannedDelta))}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    <span className="block text-[10px] text-muted-foreground">
                      total {formatCurrency(record.planned)}
                    </span>
                  </span>
                  <span className="text-right font-medium">
                    {record.actualDelta !== 0 ? (
                      <>
                        {record.actualDelta > 0 ? '+' : '−'}
                        {formatCurrency(Math.abs(record.actualDelta))}
                      </>
                    ) : (
                      <span className="text-muted-foreground font-normal">—</span>
                    )}
                    <span className="block text-[10px] text-muted-foreground font-normal">
                      total {formatCurrency(record.actual)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
