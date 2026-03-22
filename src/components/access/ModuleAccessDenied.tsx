import { ShieldX, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface ModuleAccessDeniedProps {
  moduleName?: string;
}

/**
 * User-friendly 403 screen shown when a user tries to access a module
 * not included in their plan.
 */
export function ModuleAccessDenied({ moduleName }: ModuleAccessDeniedProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-6">
        <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldX className="w-8 h-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">Acesso não disponível</h2>
          <p className="text-sm text-muted-foreground">
            {moduleName
              ? `O módulo "${moduleName}" não está incluído no seu plano atual.`
              : 'Este módulo não está incluído no seu plano atual.'
            }
          </p>
          <p className="text-sm text-muted-foreground">
            Entre em contato com o administrador ou faça upgrade do seu plano para acessar este recurso.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <Button onClick={() => navigate('/dashboard')} className="gap-2">
            <Home className="w-4 h-4" /> Ir para Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
