import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CategoryIcon } from './CategoryIcon';

// Ícones disponíveis para as categorias (nomes do lucide-react)
export const AVAILABLE_ICONS = [
  'Briefcase', 'Laptop', 'TrendingUp', 'Gift', 'Plus', 'Home', 'Zap', 'Smartphone',
  'Shield', 'Heart', 'GraduationCap', 'UtensilsCrossed', 'Car', 'Tv', 'Shirt', 'User',
  'CreditCard', 'PiggyBank', 'Landmark', 'Wallet', 'Banknote', 'Coins', 'DollarSign',
  'ShoppingCart', 'ShoppingBag', 'Coffee', 'Pizza', 'Beer', 'Wine', 'Plane', 'Train',
  'Bus', 'Bike', 'Fuel', 'Wrench', 'Hammer', 'Paintbrush', 'Scissors', 'Stethoscope',
  'Pill', 'Dumbbell', 'Trophy', 'Gamepad2', 'Music', 'Film', 'Camera', 'Book',
  'BookOpen', 'Newspaper', 'Wifi', 'Phone', 'Mail', 'Globe', 'MapPin', 'Calendar',
  'Clock', 'Tag', 'Tags', 'Percent', 'Calculator', 'Receipt', 'FileText', 'Folder',
  'Baby', 'Dog', 'Cat', 'Flower2', 'TreePine', 'Sun', 'Moon', 'Star', 'Sparkles',
  'Crown', 'Gem', 'Key', 'Lock', 'Umbrella', 'Glasses', 'Watch', 'Headphones',
];

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  children: React.ReactNode;
}

export function IconPicker({ value, onChange, children }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? AVAILABLE_ICONS.filter((name) => name.toLowerCase().includes(search.trim().toLowerCase()))
    : AVAILABLE_ICONS;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <Input
          placeholder="Buscar ícone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm mb-2"
          autoFocus
        />
        <ScrollArea className="h-56">
          <div className="grid grid-cols-6 gap-1 pr-2">
            {filtered.map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                  setSearch('');
                }}
                className={`p-2 rounded-md flex items-center justify-center transition-colors hover:bg-accent ${
                  value === name ? 'bg-accent ring-1 ring-primary' : 'bg-secondary/50'
                }`}
              >
                <CategoryIcon name={name} className="h-4 w-4" />
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-6 text-xs text-muted-foreground text-center py-4">
                Nenhum ícone encontrado
              </p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
