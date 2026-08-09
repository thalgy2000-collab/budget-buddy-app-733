import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';

interface SummaryCardsProps {
  plannedIncome: number;
  actualIncome: number;
  plannedExpense: number;
  actualExpense: number;
  plannedBalance: number;
  actualBalance: number;
  hideValues?: boolean;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function CardItem({
  label,
  planned,
  actual,
  icon: Icon,
  variant,
}: {
  label: string;
  planned: number;
  actual: number;
  icon: React.ElementType;
  variant: 'income' | 'expense' | 'balance';
}) {
  const colors = {
    income: 'bg-success/10 text-success',
    expense: 'bg-destructive/10 text-destructive',
    balance: 'bg-accent/15 text-accent-foreground',
  };

  const iconColors = {
    income: 'text-success',
    expense: 'text-destructive',
    balance: 'text-accent',
  };

  return (
    <div className="bg-card rounded-xl p-5 shadow-card flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[variant]}`}>
          <Icon className={`h-5 w-5 ${iconColors[variant]}`} />
        </div>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-display font-bold">{formatCurrency(actual)}</p>
        <p className="text-xs text-muted-foreground">
          Planejado: {formatCurrency(planned)}
        </p>
      </div>
      {planned > 0 && (
        <div className="w-full bg-secondary rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${
              variant === 'income'
                ? 'bg-success'
                : variant === 'expense'
                ? 'bg-destructive'
                : 'bg-accent'
            }`}
            style={{ width: `${Math.min((actual / planned) * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function SummaryCards(props: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <CardItem
        label="Receitas"
        planned={props.plannedIncome}
        actual={props.actualIncome}
        icon={TrendingUp}
        variant="income"
      />
      <CardItem
        label="Despesas"
        planned={props.plannedExpense}
        actual={props.actualExpense}
        icon={TrendingDown}
        variant="expense"
      />
      <CardItem
        label="Saldo"
        planned={props.plannedBalance}
        actual={props.actualBalance}
        icon={Wallet}
        variant="balance"
      />
    </div>
  );
}
