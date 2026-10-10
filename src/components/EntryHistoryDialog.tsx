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
          <ScrollArea className="max-h-[65vh] pr-3">
            <ol className="relative ml-3 border-l border-border py-2">
              {[...rows].reverse().map((record, i) => {
                const isFirst = i === 0;
                const renderDelta = (delta: number, total: number, label: string) => (
                  <div className="flex-1 rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                    {delta !== 0 ? (
                      <p className={`text-base font-semibold ${delta > 0 ? 'text-primary' : 'text-destructive'}`}>
                        {delta > 0 ? '+' : '−'} {formatCurrency(Math.abs(delta))}
                      </p>
                    ) : (
                      <p className="text-base text-muted-foreground">sem alteração</p>
                    )}
                    <p className="text-xs text-muted-foreground">Total: {formatCurrency(total)}</p>
                  </div>
                );
                return (
                  <li key={i} className="mb-5 ml-5 last:mb-0">
                    <span
                      className={`absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-background ${
                        isFirst ? 'bg-primary' : 'bg-muted-foreground/50'
                      }`}
                    />
                    <div className="mb-2 flex items-center gap-2">
                      <time className="text-sm font-medium text-foreground">
                        {format(new Date(record.date), "dd 'de' MMM yyyy", { locale: ptBR })}
                      </time>
                      <span className="text-xs text-muted-foreground">
                        às {format(new Date(record.date), 'HH:mm')}
                      </span>
                      {isFirst && (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Mais recente
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {renderDelta(record.plannedDelta, record.planned, 'Planejado')}
                      {renderDelta(record.actualDelta, record.actual, 'Realizado')}
                    </div>
                  </li>
                );
              })}
            </ol>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
