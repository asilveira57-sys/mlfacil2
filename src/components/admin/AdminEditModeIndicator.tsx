import { useUserRole } from '@/hooks/useUserRole';
import { Pencil } from 'lucide-react';

export function AdminEditModeIndicator() {
  const { isAdmin, loading } = useUserRole();

  if (loading || !isAdmin) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium">
        <Pencil className="w-4 h-4" />
        Modo Edição
      </div>
    </div>
  );
}
