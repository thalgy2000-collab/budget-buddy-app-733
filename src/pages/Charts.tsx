import { useState } from 'react';
import { format, subMonths, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useBudget } from '@/hooks/useBudget';
import { MonthSelector } from '@/components/MonthSelector';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--destructive))',
  'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)',
  'hsl(262, 83%, 58%)',
  'hsl(199, 89%, 48%)',
  'hsl(346, 77%, 50%)',
  'hsl(24, 94%, 50%)',
  'hsl(173, 58%, 39%)',
  'hsl(47, 100%, 47%)',
  'hsl(291, 47%, 51%)',
  'hsl(210, 79%, 46%)',
];

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const Charts = () => {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const { categories, getEntry, entries, getMonthSummary } = useBudget();
  const navigate = useNavigate();

  const summary = getMonthSummary(month);
  const incomeCategories = categories.filter((c) => c.type === 'income');
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  // Bar chart: planned vs actual per expense category
  const expenseBarData = expenseCategories.map((cat) => {
    const entry = getEntry(cat.id, month);
    return {
      name: cat.name,
      Planejado: entry?.planned || 0,
      Realizado: entry?.actual || 0,
    };
  });

  const incomeBarData = incomeCategories.map((cat) => {
    const entry = getEntry(cat.id, month);
    return {
      name: cat.name,
      Planejado: entry?.planned || 0,
      Realizado: entry?.actual || 0,
    };
  });

  // Pie chart: actual expense distribution
  const expensePieData = expenseCategories
    .map((cat) => {
      const entry = getEntry(cat.id, month);
      return { name: cat.name, value: entry?.actual || 0 };
    })
    .filter((d) => d.value > 0);

  // Monthly trend (last 6 months)
  const currentDate = parse(month, 'yyyy-MM', new Date());
  const trendData = Array.from({ length: 6 }, (_, i) => {
    const m = format(subMonths(currentDate, 5 - i), 'yyyy-MM');
    const s = getMonthSummary(m);
    return {
      month: format(parse(m, 'yyyy-MM', new Date()), 'MMM/yy', { locale: ptBR }),
      Receita: s.actualIncome,
      Despesa: s.actualExpense,
      Saldo: s.actualBalance,
    };
  });

  // Summary bar
  const summaryData = [
    { name: 'Receita', Planejado: summary.plannedIncome, Realizado: summary.actualIncome },
    { name: 'Despesa', Planejado: summary.plannedExpense, Realizado: summary.actualExpense },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl gradient-gold">
              <BarChart3 className="h-5 w-5 text-accent-foreground" />
            </div>
            <h1 className="font-display text-xl font-bold tracking-tight">FinPlan</h1>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/')}>
            Voltar ao orçamento
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        <div className="flex justify-center">
          <MonthSelector month={month} onChange={setMonth} />
        </div>

        {/* Resumo geral */}
        <div className="bg-card rounded-xl shadow-card p-5">
          <h2 className="font-display text-lg font-semibold mb-4">📊 Resumo Geral</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={summaryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="Planejado" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Realizado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tendência mensal */}
        <div className="bg-card rounded-xl shadow-card p-5">
          <h2 className="font-display text-lg font-semibold mb-4">📈 Tendência (6 meses)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="Receita" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Despesa" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Receitas por categoria */}
          <div className="bg-card rounded-xl shadow-card p-5">
            <h2 className="font-display text-lg font-semibold mb-4">💰 Receitas por Categoria</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={incomeBarData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="Planejado" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} />
                <Bar dataKey="Realizado" fill="hsl(142, 76%, 36%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Distribuição de despesas */}
          <div className="bg-card rounded-xl shadow-card p-5">
            <h2 className="font-display text-lg font-semibold mb-4">🍕 Distribuição de Despesas</h2>
            {expensePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={expensePieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {expensePieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">Nenhuma despesa registrada neste mês.</p>
            )}
          </div>
        </div>

        {/* Despesas por categoria */}
        <div className="bg-card rounded-xl shadow-card p-5">
          <h2 className="font-display text-lg font-semibold mb-4">💸 Despesas por Categoria</h2>
          <ResponsiveContainer width="100%" height={Math.max(300, expenseBarData.length * 35)}>
            <BarChart data={expenseBarData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="Planejado" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} />
              <Bar dataKey="Realizado" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </main>
    </div>
  );
};

export default Charts;
