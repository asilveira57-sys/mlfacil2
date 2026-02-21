import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  X,
  Loader2,
} from 'lucide-react';
import type {
  OnboardingFlow,
  OnboardingStep,
  OnboardingUserProgress,
} from '@/hooks/useWelcomeOnboarding';
import {
  useStartOnboardingProgress,
  useRecordStepEvent,
  useUpdateOnboardingProgress,
  useCompleteOnboarding,
  useSkipOnboarding,
} from '@/hooks/useWelcomeOnboarding';
import { cn } from '@/lib/utils';

interface WelcomeOnboardingModalProps {
  flow: OnboardingFlow;
  steps: OnboardingStep[];
  existingProgress: OnboardingUserProgress | null;
  userId: string;
  companyId: string;
  sellerId: string;
  onClose: () => void;
}

/** Simple markdown renderer (bold, newlines) without external dep */
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground">
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i}>
            {parts.map((part, j) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j}>{part.slice(2, -2)}</strong>;
              }
              return <span key={j}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export function WelcomeOnboardingModal({
  flow,
  steps,
  existingProgress,
  userId,
  companyId,
  sellerId,
  onClose,
}: WelcomeOnboardingModalProps) {
  const navigate = useNavigate();
  const startedRef = useRef(false);

  const [progressId, setProgressId] = useState<string | null>(existingProgress?.id ?? null);
  const [currentStep, setCurrentStep] = useState(existingProgress?.step_atual ?? 1);
  const [payloadRespostas, setPayloadRespostas] = useState<Record<string, unknown>>(
    existingProgress?.payload_respostas ?? {}
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const startProgress = useStartOnboardingProgress();
  const recordEvent = useRecordStepEvent();
  const updateProgress = useUpdateOnboardingProgress();
  const completeOnboarding = useCompleteOnboarding();
  const skipOnboarding = useSkipOnboarding();

  const step = steps[currentStep - 1];
  const totalSteps = steps.length;
  const progressPct = Math.round(((currentStep - 1) / totalSteps) * 100);
  const isLast = currentStep === totalSteps;
  const isFirst = currentStep === 1;
  const startedAt = existingProgress?.started_at ?? new Date().toISOString();

  // Start progress on mount (once)
  useEffect(() => {
    if (startedRef.current || existingProgress) return;
    startedRef.current = true;
    startProgress.mutate(
      { userId, companyId, sellerId, flow },
      { onSuccess: (data) => { if (data?.id) setProgressId(data.id); } }
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync progressId when existingProgress changes
  useEffect(() => {
    if (existingProgress?.id && !progressId) setProgressId(existingProgress.id);
  }, [existingProgress?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Record view event on step change
  useEffect(() => {
    if (!step) return;
    recordEvent.mutate({
      companyId, sellerId, userId,
      flowId: flow.id, flowVersao: flow.versao,
      step, evento: 'view',
    });
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Checklist helpers ──────────────────────────────────────────────────────
  const getChecklist = useCallback(() => {
    const schema = step?.validacao_schema;
    if (!schema || schema.type !== 'checklist') return [];
    return (schema.items ?? []) as Array<{ id: string; label: string; required: boolean }>;
  }, [step]);

  const toggleCheckItem = (id: string) => {
    const key = `step_${step?.id}_checklist`;
    const current = (payloadRespostas[key] as string[] | undefined) ?? [];
    const updated = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    setPayloadRespostas((p) => ({ ...p, [key]: updated }));
  };

  const getCheckedItems = (): string[] => {
    const key = `step_${step?.id}_checklist`;
    return (payloadRespostas[key] as string[] | undefined) ?? [];
  };

  // ── Pergunta text helper ───────────────────────────────────────────────────
  const getPerguntaValue = (): string => {
    const key = `step_${step?.id}_resposta`;
    return (payloadRespostas[key] as string | undefined) ?? '';
  };

  const setPerguntaValue = (val: string) => {
    const key = `step_${step!.id}_resposta`;
    setPayloadRespostas((p) => ({ ...p, [key]: val }));
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const validateStep = (): boolean => {
    if (!step.obrigatoria) return true;
    const schema = step.validacao_schema;

    if (step.tipo === 'checklist' && schema) {
      const items = (schema.items ?? []) as Array<{ id: string; required: boolean }>;
      const minRequired = (schema.minRequired as number | undefined) ?? 0;
      const checked = getCheckedItems();
      const allRequiredChecked = items.filter((i) => i.required).every((i) => checked.includes(i.id));
      if (!allRequiredChecked || checked.length < minRequired) {
        setValidationError('Selecione os itens obrigatórios para continuar.');
        return false;
      }
    }

    if (step.tipo === 'pergunta') {
      if (!getPerguntaValue().trim()) {
        setValidationError('Esta pergunta é obrigatória.');
        return false;
      }
    }

    return true;
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleNext = async () => {
    setValidationError(null);

    if (!validateStep()) {
      recordEvent.mutate({
        companyId, sellerId, userId,
        flowId: flow.id, flowVersao: flow.versao,
        step, evento: 'fail_validation',
      });
      return;
    }

    recordEvent.mutate({
      companyId, sellerId, userId,
      flowId: flow.id, flowVersao: flow.versao,
      step, evento: 'next',
    });

    if (isLast) {
      if (!progressId) {
        console.warn('[WelcomeOnboarding] progressId is null – closing modal as fallback');
        onClose();
        return;
      }
      completeOnboarding.mutate(
        { progressId, flow, steps, userId, companyId, sellerId, payloadRespostas, startedAt },
        { onSuccess: onClose }
      );
    } else {
      const next = currentStep + 1;
      setCurrentStep(next);
      if (progressId) updateProgress.mutate({ progressId, stepAtual: next, payloadRespostas });
    }
  };

  const handleBack = () => {
    if (isFirst) return;
    setValidationError(null);
    recordEvent.mutate({
      companyId, sellerId, userId,
      flowId: flow.id, flowVersao: flow.versao,
      step, evento: 'back',
    });
    const prev = currentStep - 1;
    setCurrentStep(prev);
    if (progressId) updateProgress.mutate({ progressId, stepAtual: prev, payloadRespostas });
  };

  const handleSkip = () => {
    if (!progressId) { onClose(); return; }
    skipOnboarding.mutate({ progressId }, { onSuccess: onClose });
  };

  const handleCta = () => {
    if (!step.cta_route) return;
    recordEvent.mutate({
      companyId, sellerId, userId,
      flowId: flow.id, flowVersao: flow.versao,
      step, evento: 'cta_click',
      details: { cta_route: step.cta_route },
    });
    navigate(step.cta_route);
  };

  const isBusy = startProgress.isPending || completeOnboarding.isPending || skipOnboarding.isPending;

  // ── Render step content ────────────────────────────────────────────────────
  const renderStepContent = () => {
    if (!step) return null;

    switch (step.tipo) {
      case 'texto':
      case 'aviso':
        return <SimpleMarkdown text={step.conteudo ?? ''} />;

      case 'midia':
        return (
          <div className="space-y-4">
            {step.media_url && (
              <img src={step.media_url} alt={step.titulo} className="w-full rounded-lg object-cover max-h-64" />
            )}
            {step.conteudo && <SimpleMarkdown text={step.conteudo} />}
          </div>
        );

      case 'video':
        return (
          <div className="space-y-4">
            {step.video_url && (
              <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-lg">
                <iframe
                  src={step.video_url}
                  className="absolute top-0 left-0 w-full h-full border-0"
                  allowFullScreen
                  title={step.titulo}
                />
              </div>
            )}
            {step.conteudo && <SimpleMarkdown text={step.conteudo} />}
          </div>
        );

      case 'checklist': {
        const items = getChecklist();
        const checked = getCheckedItems();
        return (
          <div className="space-y-4">
            {step.conteudo && <SimpleMarkdown text={step.conteudo} />}
            <div className="space-y-2">
              {items.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={checked.includes(item.id)}
                    onCheckedChange={() => toggleCheckItem(item.id)}
                  />
                  <span className="text-sm">
                    {item.label}
                    {item.required && <span className="text-destructive ml-1">*</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      }

      case 'pergunta':
        return (
          <div className="space-y-4">
            {step.conteudo && <SimpleMarkdown text={step.conteudo} />}
            <Textarea
              value={getPerguntaValue()}
              onChange={(e) => setPerguntaValue(e.target.value)}
              placeholder="Sua resposta..."
              rows={4}
              className="resize-none"
            />
          </div>
        );

      default:
        return step.conteudo ? <SimpleMarkdown text={step.conteudo} /> : null;
    }
  };

  return (
    <Dialog open modal>
      <DialogContent
        className="max-w-2xl w-full p-0 gap-0 overflow-hidden"
        onInteractOutside={(e) => {
          if (flow.exigir_conclusao) e.preventDefault();
        }}
      >
        {/* Hide default close button via CSS */}
        <style>{`[data-state="open"] [data-dialog-close-button] { display: none !important; }`}</style>

        {/* Header */}
        <div className="relative bg-primary px-6 py-5 text-primary-foreground">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium opacity-70 uppercase tracking-wider mb-1">{flow.nome}</p>
              <h2 className="text-xl font-bold leading-tight">{step?.titulo}</h2>
            </div>
            {!flow.exigir_conclusao && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 shrink-0"
                onClick={handleSkip}
                disabled={isBusy}
                title="Pular boas-vindas"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs opacity-70 mb-1.5">
              <span>Etapa {currentStep} de {totalSteps}</span>
              <span>{progressPct}% concluído</span>
            </div>
            <Progress value={progressPct} className="h-1.5 bg-primary-foreground/20" />
          </div>

          {/* Step dots */}
          <div className="flex items-center gap-1.5 mt-3">
            {steps.map((s, i) => (
              <div
                key={s.id}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i + 1 < currentStep ? 'bg-primary-foreground w-3'
                    : i + 1 === currentStep ? 'bg-primary-foreground w-5'
                    : 'bg-primary-foreground/30 w-1.5'
                )}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="max-h-[50vh] min-h-[200px]">
          <div className="px-6 py-5 space-y-4">
            {renderStepContent()}

            {step?.cta_label && step?.cta_route && (
              <Button variant="outline" size="sm" className="gap-2 mt-2" onClick={handleCta}>
                <ExternalLink className="h-3.5 w-3.5" />
                {step.cta_label}
              </Button>
            )}

            {validationError && (
              <p className="text-sm text-destructive font-medium">{validationError}</p>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30">
          <div>
            {!flow.exigir_conclusao && (
              <Button variant="ghost" size="sm" className="text-muted-foreground text-xs" onClick={handleSkip} disabled={isBusy}>
                Pular introdução
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleBack} disabled={isFirst || isBusy} className="gap-1.5">
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </Button>
            <Button size="sm" onClick={handleNext} disabled={isBusy} className="gap-1.5 min-w-[100px]">
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isLast ? (
                <><CheckCircle2 className="h-4 w-4" />Concluir</>
              ) : (
                <>Avançar<ChevronRight className="h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
