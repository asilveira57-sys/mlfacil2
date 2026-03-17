import { SystemEmpty } from '@/components/ui/system-states';

interface DashboardEmptyStateProps {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * @deprecated Use SystemEmpty from '@/components/ui/system-states' directly.
 * Kept for backward compatibility.
 */
export function DashboardEmptyState({
  title,
  message,
  icon,
  className = '',
}: DashboardEmptyStateProps) {
  return (
    <SystemEmpty
      title={title}
      message={message}
      icon={icon}
      className={className}
    />
  );
}
