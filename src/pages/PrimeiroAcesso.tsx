import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/contexts/UserAccessContext";
import { BarChart3, Loader2, CheckCircle2, Circle, ArrowRight, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}

const PrimeiroAcesso = () => {
  const navigate = useNavigate();
  const { loading: accessLoading, isAuthenticated, requiresOnboarding, updateOnboarding, refetch } = useUserAccess();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [completing, setCompleting] = useState(false);

  // Steps for future expansion — currently a simplified welcome
  const [steps] = useState<OnboardingStep[]>([
    { id: "welcome", title: "Bem-vindo ao MKTP Fácil", description: "Seu ambiente está sendo preparado", completed: true },
    { id: "profile", title: "Dados da empresa", description: "Configurações básicas do seu negócio", completed: false },
    { id: "marketplace", title: "Conexão com marketplace", description: "Vincule sua conta do Mercado Livre", completed: false },
    { id: "import", title: "Importação inicial", description: "Importar vendas e anúncios", completed: false },
    { id: "activate", title: "Ativação de módulos", description: "Escolha os recursos que vai usar", completed: false },
  ]);

  const completedCount = steps.filter((s) => s.completed).length;
  const progressPercent = (completedCount / steps.length) * 100;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        console.info("[PrimeiroAcesso] No session, redirecting to /auth");
        navigate("/auth", { replace: true });
      } else {
        setCheckingAuth(false);
      }
    });
  }, [navigate]);

  // If onboarding is already completed, go to dashboard
  useEffect(() => {
    if (!accessLoading && isAuthenticated && !requiresOnboarding) {
      console.info("[PrimeiroAcesso] Onboarding already completed, redirecting to /dashboard");
      navigate("/dashboard", { replace: true });
    }
  }, [accessLoading, isAuthenticated, requiresOnboarding, navigate]);

  const handleCompleteOnboarding = async () => {
    setCompleting(true);
    console.info("[PrimeiroAcesso] Completing onboarding");

    try {
      const success = await updateOnboarding({ status: "completed" });
      if (success) {
        console.info("[PrimeiroAcesso] Onboarding completed, redirecting to /dashboard");
        await refetch();
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      console.error("[PrimeiroAcesso] Error completing onboarding:", err);
    } finally {
      setCompleting(false);
    }
  };

  if (checkingAuth || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">MKTP Fácil</h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
              <Rocket className="w-10 h-10 text-primary" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-3">
            Vamos preparar seu ambiente
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Seu acesso foi criado com sucesso! Siga os passos abaixo para configurar sua conta e começar a usar o sistema.
          </p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Progresso de ativação</span>
            <span className="text-sm font-medium text-primary">{completedCount}/{steps.length}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Steps Checklist */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden mb-8">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-center gap-4 px-6 py-5 ${
                index < steps.length - 1 ? "border-b border-border" : ""
              } ${step.completed ? "bg-primary/5" : ""}`}
            >
              <div className="flex-shrink-0">
                {step.completed ? (
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                ) : (
                  <Circle className="w-6 h-6 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-semibold ${step.completed ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
              </div>
              {!step.completed && index === completedCount && (
                <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                  Próximo
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Action */}
        <div className="text-center space-y-4">
          <Button size="lg" onClick={handleCompleteOnboarding} disabled={completing} className="gap-2 px-8">
            {completing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            {completing ? "Finalizando..." : "Ir para o painel"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Você poderá completar as etapas de ativação a qualquer momento dentro do sistema.
          </p>
        </div>
      </main>
    </div>
  );
};

export default PrimeiroAcesso;
