import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { toast } from 'sonner';

import { OnboardingWelcome } from './steps/OnboardingWelcome';
import { OnboardingObjective } from './steps/OnboardingObjective';
import { OnboardingConnectML } from './steps/OnboardingConnectML';
import { OnboardingMLRules } from './steps/OnboardingMLRules';
import { OnboardingPrintPrefs } from './steps/OnboardingPrintPrefs';
import { OnboardingAccess } from './steps/OnboardingAccess';
import { OnboardingComplete } from './steps/OnboardingComplete';

export type OnboardingObjectiveType = 'labels' | 'sales' | 'both';

export interface OnboardingData {
  objective: OnboardingObjectiveType | null;
  printMode: string;
  labelSize: string;
}

const TOTAL_STEPS = 7;

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { state, refetch, requiresOnboarding, updateOnboarding } = useUserAccess();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    objective: null,
    printMode: 'zpl',
    labelSize: '4x6',
  });

  // Don't show if onboarding is completed
  if (!requiresOnboarding) {
    return null;
  }

  const trialEndDate = state?.trial_end_at 
    ? new Date(state.trial_end_at).toLocaleDateString('pt-BR')
    : null;

  const mlRole = state?.ml_role || 'none';
  const needsMLStep = data.objective === 'sales' || data.objective === 'both';
  const isCollaborator = mlRole === 'collaborator';

  const handleNext = () => {
    // Skip ML steps if objective is labels only
    if (currentStep === 2 && data.objective === 'labels') {
      setCurrentStep(5); // Skip to print prefs
    } else if (currentStep === 3 && !isCollaborator) {
      setCurrentStep(5); // Skip ML rules if owner or none
    } else {
      setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
    }
  };

  const handleBack = () => {
    // Handle reverse skip logic
    if (currentStep === 5 && data.objective === 'labels') {
      setCurrentStep(2);
    } else if (currentStep === 5 && !isCollaborator) {
      setCurrentStep(3);
    } else {
      setCurrentStep(prev => Math.max(prev - 1, 1));
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      // Use the context's updateOnboarding function
      const success = await updateOnboarding({
        status: 'completed',
        objective: data.objective ? [data.objective] : undefined,
        printMode: data.printMode,
        labelSize: data.labelSize,
      });

      if (!success) {
        throw new Error('Erro ao salvar configurações');
      }

      toast.success('Configuração concluída! Bem-vindo ao Mktpfacil.');
      navigate('/dashboard');
    } catch (err) {
      console.error('Erro ao completar onboarding:', err);
      toast.error('Erro ao salvar configurações. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateData = (updates: Partial<OnboardingData>) => {
    setData(prev => ({ ...prev, ...updates }));
  };

  const progress = (currentStep / TOTAL_STEPS) * 100;

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <OnboardingWelcome trialEndDate={trialEndDate} />;
      case 2:
        return (
          <OnboardingObjective 
            selected={data.objective} 
            onSelect={(obj) => updateData({ objective: obj })} 
          />
        );
      case 3:
        return <OnboardingConnectML mlRole={mlRole} />;
      case 4:
        return <OnboardingMLRules mlRole={mlRole} />;
      case 5:
        return (
          <OnboardingPrintPrefs
            printMode={data.printMode}
            labelSize={data.labelSize}
            onChangePrintMode={(mode) => updateData({ printMode: mode })}
            onChangeLabelSize={(size) => updateData({ labelSize: size })}
          />
        );
      case 6:
        return <OnboardingAccess />;
      case 7:
        return <OnboardingComplete objective={data.objective} />;
      default:
        return null;
    }
  };

  const canProceed = () => {
    if (currentStep === 2 && !data.objective) return false;
    return true;
  };

  return (
    <Dialog open modal>
      <DialogContent 
        className="sm:max-w-lg md:max-w-2xl p-0 gap-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Progress bar */}
        <div className="px-6 pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Passo {currentStep} de {TOTAL_STEPS}
            </span>
            <span className="text-sm font-medium text-primary">
              {Math.round(progress)}%
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step content */}
        <div className="p-6 min-h-[300px]">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 py-4 bg-muted/30 border-t">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            Voltar
          </Button>

          {currentStep < TOTAL_STEPS ? (
            <Button 
              onClick={handleNext}
              disabled={!canProceed()}
            >
              Avançar
            </Button>
          ) : (
            <Button 
              onClick={handleComplete}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Salvando...' : 'Concluir e Começar'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
