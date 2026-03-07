import * as Icons from 'lucide-react';
import { LucideProps } from 'lucide-react';

interface CategoryIconProps extends LucideProps {
  name: string;
}

export function CategoryIcon({ name, ...props }: CategoryIconProps) {
  const Icon = (Icons as Record<string, React.ComponentType<LucideProps>>)[name] || Icons.Circle;
  return <Icon {...props} />;
}
