import { icons } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  name: string | null;
  className?: string;
}

export function WidgetIcon({ name, className }: Props) {
  if (!name) return null;
  const LucideIcon = (icons as any)[name];
  if (!LucideIcon) return null;
  return <LucideIcon className={cn('h-4 w-4', className)} />;
}
