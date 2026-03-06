import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/contexts/UserAccessContext";
import { useOnboardingEvents } from "@/hooks/useOnboardingEvents";
import { useCompanyLogoUpload } from "@/hooks/useCompanyLogoUpload";
import {
  BarChart3, Loader2, CheckCircle2, Circle, ArrowRight, ArrowLeft,
  Rocket, Building2, Upload, ImageIcon, Settings2, Link2, Database, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// ── Step definitions ──────────────────────────────────────────────
interface OnboardingStepDef {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  optional?: boolean;
}

const STEPS: OnboardingStepDef[] = [
  { id: "validate",  title: "Validar conta",               description: "Verificação de sessão e dados básicos",       icon: Shield },
  { id: "company",   title: "Dados da empresa",            description: "Criar ou confirmar sua empresa no sistema",   icon: Building2 },
  { id: "logo",      title: "Logomarca da empresa",        description: "Personalize relatórios e documentos",         icon: ImageIcon, optional: true },
  { id: "prefs",     title: "Preferências iniciais",       description: "Configurações base do seu ambiente",          icon: Settings2 },
  { id: "connect",   title: "Conexão com marketplace",     description: "Vincule sua conta do Mercado Livre",          icon: Link2 },
  { id: "import",    title: "Importação inicial",          description: "Importar últimos 30 dias de operação",        icon: Database },
  { id: "activate",  title: "Ativar ambiente",             description: "Liberar acesso ao painel principal",          icon: Rocket },
];

// ── Persisted state ───────────────────────────────────────────────
interface OnboardingProgress {
  currentStep: number;
  completedSteps: string[];
  companyId: string | null;
  companyName: string;
  logoUrl: string | null;
}

const STORAGE_KEY = "mktp_onboarding_progress";

function loadProgress(): OnboardingProgress {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { currentStep: 0, completedSteps: [], companyId: null, companyName: "", logoUrl: null };
}

function saveProgress(p: OnboardingProgress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

// ── Main Component ────────────────────────────────────────────────
const PrimeiroAcesso = () => {
  const navigate = useNavigate();
  const { loading: accessLoading, isAuthenticated, requiresOnboarding, updateOnboarding, refetch } = useUserAccess();
  const { registerEvent } = useOnboardingEvents();
  const { uploadLogo, uploading: logoUploading, error: logoError } = useCompanyLogoUpload();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [progress, setProgress] = useState<OnboardingProgress>(loadProgress);
  const [completing, setCompleting] = useState(false);
  const [companyNameInput, setCompanyNameInput] = useState(progress.companyName);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(progress.logoUrl);

  const currentStep = progress.currentStep;
  const completedSteps = progress.completedSteps;

  // Persist on change
  useEffect(() => { saveProgress(progress); }, [progress]);

  // Register first access event
  useEffect(() => {
    registerEvent("onboarding_page_opened");
  }, [registerEvent]);

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth", { replace: true });
      } else {
        setCheckingAuth(false);
        // Auto-complete validate step
        if (!completedSteps.includes("validate")) {
          completeStep("validate");
          registerEvent("account_validated", { user_id: session.user.id });
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // If onboarding done, go to dashboard
  useEffect(() => {
    if (!accessLoading && isAuthenticated && !requiresOnboarding) {
      navigate("/dashboard", { replace: true });
    }
  }, [accessLoading, isAuthenticated, requiresOnboarding, navigate]);

  // ── Step helpers ──
  const completeStep = useCallback((stepId: string) => {
    setProgress(prev => {
      const completed = prev.completedSteps.includes(stepId)
        ? prev.completedSteps
        : [...prev.completedSteps, stepId];
      const stepIndex = STEPS.findIndex(s => s.id === stepId);
      const nextStep = Math.max(prev.currentStep, stepIndex + 1);
      return { ...prev, completedSteps: completed, currentStep: Math.min(nextStep, STEPS.length - 1) };
    });
  }, []);

  const goToStep = useCallback((index: number) => {
    setProgress(prev => ({ ...prev, currentStep: index }));
  }, []);

  // ── Company creation ──
  const handleCreateCompany = async () => {
    if (!companyNameInput.trim()) {
      toast.error("Informe o nome da empresa.");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if company already exists
      const { data: existing } = await supabase
        .from("companies")
        .select("id, display_name")
        .eq("user_id", user.id)
        .limit(1);

      let companyId: string;

      if (existing && existing.length > 0) {
        companyId = existing[0].id;
        // Update name if needed
        await supabase.from("companies").update({ display_name: companyNameInput.trim() }).eq("id", companyId);
      } else {
        const { data: newCompany, error } = await supabase
          .from("companies")
          .insert({ display_name: companyNameInput.trim(), user_id: user.id })
          .select("id")
          .single();

        if (error) throw error;
        companyId = newCompany.id;
      }

      setProgress(prev => ({ ...prev, companyId, companyName: companyNameInput.trim() }));
      registerEvent("company_created", { company_id: companyId, company_name: companyNameInput.trim() }, companyId);
      completeStep("company");
      toast.success("Empresa configurada com sucesso!");
    } catch (err: any) {
      console.error("[Onboarding] Company creation error:", err);
      toast.error("Erro ao criar empresa: " + (err.message || "Tente novamente"));
    }
  };

  // ── Logo upload ──
  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleLogoUpload = async () => {
    if (!logoFile || !progress.companyId) return;

    const result = await uploadLogo(logoFile, progress.companyId);
    if (result) {
      setProgress(prev => ({ ...prev, logoUrl: result.logoUrl }));
      setLogoPreview(result.logoUrl);
      registerEvent("company_logo_uploaded", {
        company_id: progress.companyId,
        width: result.width,
        height: result.height,
        format: result.format,
        size_bytes: result.sizeBytes,
      }, progress.companyId);
      completeStep("logo");
      toast.success("Logomarca enviada com sucesso!");
    }
  };

  const handleSkipLogo = () => {
    completeStep("logo");
    registerEvent("company_logo_skipped", {}, progress.companyId);
  };

  // ── Preferences ──
  const handleSavePrefs = () => {
    registerEvent("preferences_configured", {}, progress.companyId);
    completeStep("prefs");
    toast.success("Preferências salvas!");
  };

  // ── Marketplace (placeholder) ──
  const handleSkipConnect = () => {
    registerEvent("marketplace_connection_skipped", {}, progress.companyId);
    completeStep("connect");
  };

  // ── Import (placeholder) ──
  const handleSkipImport = () => {
    registerEvent("initial_import_skipped", {}, progress.companyId);
    completeStep("import");
  };

  // ── Final activation ──
  const handleActivate = async () => {
    setCompleting(true);
    try {
      const success = await updateOnboarding({ status: "completed" });
      if (success) {
        registerEvent("onboarding_completed", {
          completed_steps: completedSteps,
          total_steps: STEPS.length,
        }, progress.companyId);
        registerEvent("dashboard_released", {}, progress.companyId);
        localStorage.removeItem(STORAGE_KEY);
        await refetch();
        toast.success("Ambiente ativado! Bem-vindo ao MKTP Fácil.");
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      console.error("[Onboarding] Activation error:", err);
      toast.error("Erro ao ativar ambiente.");
    } finally {
      setCompleting(false);
    }
  };

  // ── Loading ──
  if (checkingAuth || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const completedCount = completedSteps.length;
  const progressPercent = (completedCount / STEPS.length) * 100;
  const currentStepDef = STEPS[currentStep];

  // ── Render step content ──
  const renderStepContent = () => {
    switch (currentStepDef?.id) {
      case "validate":
        return (
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
            <h3 className="text-xl font-bold text-foreground">Conta validada</h3>
            <p className="text-muted-foreground">Sua sessão está ativa e seus dados estão seguros.</p>
            <Button onClick={() => goToStep(1)} className="gap-2">
              Continuar <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        );

      case "company":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-foreground mb-1">Dados da empresa</h3>
              <p className="text-sm text-muted-foreground">Informe o nome da sua empresa. Você poderá editar depois.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-name">Nome da empresa</Label>
              <Input
                id="company-name"
                placeholder="Ex: Loja do João"
                value={companyNameInput}
                onChange={(e) => setCompanyNameInput(e.target.value)}
                maxLength={120}
              />
            </div>
            <Button onClick={handleCreateCompany} disabled={!companyNameInput.trim()} className="gap-2 w-full">
              Confirmar empresa <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        );

      case "logo":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-foreground mb-1">Logomarca da empresa</h3>
              <p className="text-sm text-muted-foreground">
                A logomarca será utilizada para personalizar relatórios e documentos gerados pelo sistema.
              </p>
            </div>

            {logoPreview && (
              <div className="flex justify-center">
                <div className="border border-border rounded-xl p-4 bg-muted/30">
                  <img src={logoPreview} alt="Preview" className="max-h-24 max-w-[300px] object-contain" />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Arquivo (PNG ou SVG, máx 2MB, mín 400×120px)</Label>
              <div className="flex items-center gap-3">
                <label className="flex-1">
                  <div className="flex items-center gap-2 justify-center border-2 border-dashed border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {logoFile ? logoFile.name : "Escolher arquivo"}
                    </span>
                  </div>
                  <input type="file" accept=".png,.svg" className="hidden" onChange={handleLogoSelect} />
                </label>
              </div>
              {logoError && <p className="text-sm text-destructive">{logoError}</p>}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleSkipLogo} className="flex-1">
                Pular e fazer depois
              </Button>
              <Button onClick={handleLogoUpload} disabled={!logoFile || logoUploading} className="flex-1 gap-2">
                {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Enviar logomarca
              </Button>
            </div>
          </div>
        );

      case "prefs":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-foreground mb-1">Preferências iniciais</h3>
              <p className="text-sm text-muted-foreground">
                Configurações básicas do seu ambiente. Você poderá alterar tudo depois nas configurações.
              </p>
            </div>
            <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-3">
              <p className="text-sm text-muted-foreground">
                As preferências padrão já estão configuradas para a maioria dos vendedores. Você pode avançar agora e ajustar depois.
              </p>
            </div>
            <Button onClick={handleSavePrefs} className="gap-2 w-full">
              Salvar e continuar <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        );

      case "connect":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-foreground mb-1">Conexão com marketplace</h3>
              <p className="text-sm text-muted-foreground">
                Vincule sua conta do Mercado Livre para importar dados de vendas, anúncios e campanhas.
              </p>
            </div>
            <div className="rounded-xl border border-border p-6 bg-muted/20 text-center space-y-3">
              <Link2 className="w-12 h-12 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                A conexão com o Mercado Livre será disponibilizada em breve. Você poderá conectar depois dentro do sistema.
              </p>
            </div>
            <Button onClick={handleSkipConnect} variant="outline" className="gap-2 w-full">
              Continuar sem conectar <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        );

      case "import":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-foreground mb-1">Importação inicial</h3>
              <p className="text-sm text-muted-foreground">
                Ao conectar o marketplace, importaremos automaticamente os últimos 30 dias de vendas, anúncios e campanhas ADS.
              </p>
            </div>
            <div className="rounded-xl border border-border p-6 bg-muted/20 text-center space-y-3">
              <Database className="w-12 h-12 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                A importação será feita automaticamente após a conexão com o marketplace. Você pode continuar e importar depois.
              </p>
            </div>
            <Button onClick={handleSkipImport} variant="outline" className="gap-2 w-full">
              Continuar <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        );

      case "activate":
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Rocket className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground mb-2">Tudo pronto para ativar!</h3>
              <p className="text-muted-foreground">
                Seu ambiente está configurado. Clique abaixo para acessar o painel principal.
              </p>
            </div>
            <div className="text-left rounded-xl border border-border p-4 bg-muted/20 space-y-1 text-sm text-muted-foreground max-w-sm mx-auto">
              <p>✓ Conta validada</p>
              <p>✓ Empresa: <span className="text-foreground font-medium">{progress.companyName || "—"}</span></p>
              <p>✓ {progress.logoUrl ? "Logomarca enviada" : "Logomarca: configurar depois"}</p>
              <p>✓ Preferências configuradas</p>
              <p className="text-xs pt-1 text-muted-foreground/60">
                Você poderá completar as etapas de conexão e importação a qualquer momento.
              </p>
            </div>
            <Button size="lg" onClick={handleActivate} disabled={completing} className="gap-2 px-8">
              {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              {completing ? "Ativando..." : "Ativar e entrar no painel"}
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">MKTP Fácil</h1>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium ml-2">
            Primeiro Acesso
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-2">Preparando seu ambiente</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Siga as etapas abaixo para configurar sua conta e começar a usar o sistema.
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Progresso de ativação</span>
            <span className="text-sm font-medium text-primary">{completedCount}/{STEPS.length}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Steps sidebar */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden h-fit">
            {STEPS.map((step, index) => {
              const isCompleted = completedSteps.includes(step.id);
              const isCurrent = currentStep === index;
              const StepIcon = step.icon;

              return (
                <button
                  key={step.id}
                  onClick={() => goToStep(index)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                    index < STEPS.length - 1 ? "border-b border-border" : ""
                  } ${isCurrent ? "bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <div className="flex-shrink-0">
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    ) : isCurrent ? (
                      <StepIcon className="w-5 h-5 text-primary" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground/30" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground"
                    }`}>
                      {step.title}
                    </p>
                    {step.optional && (
                      <span className="text-[10px] text-muted-foreground/60">Opcional</span>
                    )}
                  </div>
                  {isCurrent && !isCompleted && (
                    <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      Atual
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Step content */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-6 min-h-[320px]">
            {renderStepContent()}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Etapa {currentStep + 1} de {STEPS.length}
          </p>
          {currentStep < STEPS.length - 1 && completedSteps.includes(currentStepDef?.id) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToStep(currentStep + 1)}
              className="gap-1"
            >
              Próximo <ArrowRight className="w-4 h-4" />
            </Button>
          )}
          {(currentStep >= STEPS.length - 1 || !completedSteps.includes(currentStepDef?.id)) && (
            <div className="w-[100px]" /> // spacer
          )}
        </div>
      </main>
    </div>
  );
};

export default PrimeiroAcesso;
