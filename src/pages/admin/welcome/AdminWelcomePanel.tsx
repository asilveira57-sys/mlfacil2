import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminWelcomeFlows } from './AdminWelcomeFlows';
import { AdminWelcomeSteps } from './AdminWelcomeSteps';
import { AdminWelcomeAudit } from './AdminWelcomeAudit';
import type { OnboardingFlow } from '@/hooks/useWelcomeOnboarding';

type View = 'flows' | 'steps' | 'audit';

export function AdminWelcomePanel() {
  const [view, setView] = useState<View>('flows');
  const [selectedFlow, setSelectedFlow] = useState<OnboardingFlow | null>(null);

  const handleEditSteps = (flow: OnboardingFlow) => {
    setSelectedFlow(flow);
    setView('steps');
  };

  const handleViewAudit = (flow: OnboardingFlow) => {
    setSelectedFlow(flow);
    setView('audit');
  };

  const handleBack = () => {
    setView('flows');
    setSelectedFlow(null);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Boas-Vindas / Onboarding</h1>
        <p className="text-muted-foreground">
          Gerencie os fluxos de boas-vindas exibidos aos usuários ao entrar no sistema
        </p>
      </div>

      {view === 'flows' && (
        <Tabs defaultValue="flows">
          <TabsList>
            <TabsTrigger value="flows">Fluxos</TabsTrigger>
          </TabsList>
          <TabsContent value="flows" className="mt-4">
            <AdminWelcomeFlows
              onEditSteps={handleEditSteps}
              onViewAudit={handleViewAudit}
            />
          </TabsContent>
        </Tabs>
      )}

      {view === 'steps' && selectedFlow && (
        <AdminWelcomeSteps flow={selectedFlow} onBack={handleBack} />
      )}

      {view === 'audit' && selectedFlow && (
        <AdminWelcomeAudit flow={selectedFlow} onBack={handleBack} />
      )}
    </div>
  );
}
