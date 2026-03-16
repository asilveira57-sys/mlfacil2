import { Inbox } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface DashboardEmptyStateProps {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function DashboardEmptyState({
  title = 'Nenhum dado encontrado ainda.',
  message = 'Esse módulo será preenchido automaticamente quando houver atividade na conta.',
  icon,
  className = '',
}: DashboardEmptyStateProps) {
  return (
    <Card className={`p-8 text-center ${className}`}>
      <div className="flex flex-col items-center justify-center space-y-3">
        {icon || <Inbox className="w-12 h-12 text-muted-foreground/40" />}
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground max-w-sm">{message}</p>
      </div>
    </Card>
  );
}
