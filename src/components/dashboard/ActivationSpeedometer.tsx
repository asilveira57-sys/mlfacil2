import { CheckCircle2, Circle, Zap, Link2, Download, Receipt, BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useMLConnectionState } from '@/hooks/useMLConnectionState';

interface ActivationStep {
  key: string;
  label: string;
  icon: React.ReactNode;
  completed: boolean;
}

export function ActivationSpeedometer() {
  const { flags } = useUserAccess();
  const { accounts } = useActiveAccount();
  const connectionInfo = useMLConnectionState();

  // Use real connection state — not the backend mlConnected flag
  const isReallyConnected = connectionInfo.state === 'CONNECTED' || accounts.length > 0;

  const steps: ActivationStep[] = [
    {
      key: 'ml_connect',
      label: 'Conectar Mercado Livre',
      icon: <Link2 className="h-4 w-4" />,
      completed: isReallyConnected,
    },
    {
      key: 'import_orders',
      label: 'Importar vendas',
      icon: <Download className="h-4 w-4" />,
      completed: isReallyConnected, // Import happens automatically on connection
    },
    {
      key: 'import_listings',
      label: 'Importar anúncios',
      icon: <BarChart3 className="h-4 w-4" />,
      completed: isReallyConnected, // Listings sync happens with connection
    },
    {
      key: 'sync_costs',
      label: 'Sincronizar custos',
      icon: <Receipt className="h-4 w-4" />,
      completed: isReallyConnected, // Basic costs sync happens with orders
    },
    {
      key: 'activate_modules',
      label: 'Ativar módulos',
      icon: <Zap className="h-4 w-4" />,
      completed: (flags?.onboarding_completed ?? false) && (flags?.has_active_subscription ?? false),
    },
  ];

  const completedCount = steps.filter(s => s.completed).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  // Don't show if fully activated
  if (completedCount === steps.length) return null;

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Ativação do Sistema
            </h3>
            <p className="text-sm text-muted-foreground">
              {completedCount}/{steps.length} etapas concluídas
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold text-primary">{progressPercent}%</span>
          </div>
        </div>

        <Progress value={progressPercent} className="h-3 mb-4" />

        <div className="space-y-2">
          {steps.map((step) => (
            <div
              key={step.key}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                step.completed 
                  ? 'bg-primary/5 text-foreground' 
                  : 'text-muted-foreground'
              }`}
            >
              {step.completed ? (
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
              )}
              <span className="flex items-center gap-2 text-sm">
                {step.icon}
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
