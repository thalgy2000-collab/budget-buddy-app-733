import { Category } from '@/types/finance';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Filter, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ChartFiltersProps {
  categories: Category[];
  selectedCategories: string[];
  onCategoriesChange: (ids: string[]) => void;
  typeFilter: 'all' | 'income' | 'expense';
  onTypeFilterChange: (type: 'all' | 'income' | 'expense') => void;
  trendMonths: number;
  onTrendMonthsChange: (months: number) => void;
}

export function ChartFilters({
  categories,
  selectedCategories,
  onCategoriesChange,
  typeFilter,
  onTypeFilterChange,
  trendMonths,
  onTrendMonthsChange,
}: ChartFiltersProps) {
  const filteredCategories = categories.filter((c) =>
    typeFilter === 'all' ? true : c.type === typeFilter
  );

  const toggleCategory = (id: string) => {
    if (selectedCategories.includes(id)) {
      onCategoriesChange(selectedCategories.filter((c) => c !== id));
    } else {
      onCategoriesChange([...selectedCategories, id]);
    }
  };

  const selectAll = () => onCategoriesChange(filteredCategories.map((c) => c.id));
  const clearAll = () => onCategoriesChange([]);

  return (
    <div className="bg-card rounded-xl shadow-card p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Filter className="h-4 w-4" />
        Filtros
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Type filter */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Tipo</span>
          <ToggleGroup
            type="single"
            value={typeFilter}
            onValueChange={(v) => {
              if (v) onTypeFilterChange(v as 'all' | 'income' | 'expense');
            }}
            size="sm"
          >
            <ToggleGroupItem value="all" className="text-xs px-3">Todos</ToggleGroupItem>
            <ToggleGroupItem value="income" className="text-xs px-3">Receitas</ToggleGroupItem>
            <ToggleGroupItem value="expense" className="text-xs px-3">Despesas</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Trend period */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Período tendência</span>
          <Select value={String(trendMonths)} onValueChange={(v) => onTrendMonthsChange(Number(v))}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 meses</SelectItem>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="9">9 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Category chips */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Categorias</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={selectAll}>
            Selecionar todas
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={clearAll}>
            <X className="h-3 w-3 mr-1" /> Limpar
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filteredCategories.map((cat) => {
            const isSelected = selectedCategories.includes(cat.id);
            return (
              <Badge
                key={cat.id}
                variant={isSelected ? 'default' : 'outline'}
                className="cursor-pointer text-xs transition-colors"
                onClick={() => toggleCategory(cat.id)}
              >
                {cat.type === 'income' ? '💰' : '💸'} {cat.name}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );
}
