import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/contexts/UserAccessContext";
import { useOnboardingEvents } from "@/hooks/useOnboardingEvents";
import {
  BarChart3, Loader2, ArrowRight, Rocket, Building2, Printer,
  User, Sparkles, CheckCircle2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const ZPL_PLAN_ID = "a0000000-0000-0000-0000-000000000001";

type OnboardingStep = "welcome" | "name" | "company" | "plan" | "connect" | "importing" | "done";

interface OnboardingState {
  step: OnboardingStep;
  userName: string;
  companyName: string;
  companyId: string | null;
  planChoice: "full" | "zpl" | null;
}

const STORAGE_KEY = "mktp_onboarding_v2";

function loadState(): OnboardingState {
  const initial: OnboardingState = { step: "welcome", userName: "", companyName: "", companyId: null, planChoice: null };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as OnboardingState;
      const step = parsed.step;
      // Validate consistency: advanced steps require previous data to be filled
      const advancedSteps: OnboardingStep[] = ["connect", "importing", "done"];
      if (advancedSteps.includes(step)) {
        if (!parsed.userName?.trim() || !parsed.companyName?.trim() || !parsed.planChoice) {
          console.info("[PrimeiroAcesso] Stale/inconsistent localStorage state detected, resetting to welcome");
          localStorage.removeItem(STORAGE_KEY);
          return initial;
        }
      }
      return parsed;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return initial;
}

function saveState(s: OnboardingState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

const PrimeiroAcesso = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loading: accessLoading, isAuthenticated, requiresOnboarding, updateOnboarding, selectPlan, refetch } = useUserAccess();
  const { registerEvent } = useOnboardingEvents();

  const [state, setState] = useState<OnboardingState>(loadState);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [importProgress, setImportProgress] = useState({ phase: 1, processed: 0, total: 0 });
  const importPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { saveState(state); }, [state]);

  // Detect ml_connected param from OAuth callback
  useEffect(() => {
    const mlConnected = searchParams.get("ml_connected");
    if (mlConnected === "true") {
      const nickname = searchParams.get("nickname") || "";
      registerEvent("marketplace_connected_return", { nickname });
      setState(prev => ({ ...prev, step: "importing", planChoice: "full" }));
      // Clean URL params
      window.history.replaceState({}, "", "/primeiro-acesso");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth", { replace: true });
      } else {
        setLoading(false);
        registerEvent("onboarding_page_opened");
        if (!state.userName && session.user.user_metadata?.full_name) {
          setState(prev => ({ ...prev, userName: session.user.user_metadata?.full_name || "" }));
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // CRITICAL: Only redirect to dashboard when onboarding is TRULY completed
  // AND user is NOT in the import/done flow (they must explicitly click "Acessar sistema")
  useEffect(() => {
    if (!accessLoading && isAuthenticated && !requiresOnboarding) {
      // Block redirect if user is in importing or done steps — they MUST finalize explicitly
      const isInImportFlow = state.step === "importing" || state.step === "done";
      if (!isInImportFlow) {
        localStorage.removeItem(STORAGE_KEY);
        navigate("/dashboard", { replace: true });
      }
    }
  }, [accessLoading, isAuthenticated, requiresOnboarding, navigate, state.step]);

  // Poll for import progress when on "importing" step
  useEffect(() => {
    if (state.step !== "importing") {
      if (importPollRef.current) {
        clearInterval(importPollRef.current);
        importPollRef.current = null;
      }
      return;
    }

    const pollImport = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Check for active sync jobs (sync_jobs uses "module" not "job_type", "created_by_user_id" not "user_id")
        const { data: jobs } = await supabase
          .from("sync_jobs")
          .select("id, status, metadata, module")
          .eq("created_by_user_id", user.id)
          .in("module", ["orders", "sales", "initial"])
          .order("created_at", { ascending: false })
          .limit(3);

        if (!jobs || jobs.length === 0) {
          // No sync jobs yet — might still be starting, wait
          return;
        }

        const activeJob = jobs.find((j: any) => j.status === "running" || j.status === "pending" || j.status === "processing");
        const completedJob = jobs.find((j: any) => j.status === "success" || j.status === "done");

        if (activeJob) {
          const meta = (activeJob as any).metadata as any;
          setImportProgress({
            phase: meta?.phase || 1,
            processed: meta?.processed_records || 0,
            total: meta?.total_records || 0,
          });
        } else if (completedJob) {
          // Import finished — move to done step
          registerEvent("import_completed", { job_id: (completedJob as any).id });
          setState(prev => ({ ...prev, step: "done" }));
        }
      } catch (err) {
        console.error("[Onboarding] Poll error:", err);
      }
    };

    // Initial poll
    pollImport();
    importPollRef.current = setInterval(pollImport, 3000);

    return () => {
      if (importPollRef.current) {
        clearInterval(importPollRef.current);
        importPollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  const goTo = useCallback((step: OnboardingStep) => {
    setState(prev => ({ ...prev, step }));
  }, []);

  // ── Save user name ──
  const handleSaveName = async () => {
    if (!state.userName.trim()) {
      toast.error("Por favor, informe seu nome.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.auth.updateUser({ data: { full_name: state.userName.trim() } });
      await supabase.from("profiles").upsert({
        id: user.id,
        full_name: state.userName.trim(),
        email: user.email,
      }, { onConflict: "id" });
      registerEvent("user_name_saved", { name: state.userName.trim() });
      goTo("company");
    } catch (err: any) {
      console.error("[Onboarding] Save name error:", err);
      toast.error("Erro ao salvar nome.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Save company ──
  const handleSaveCompany = async () => {
    if (!state.companyName.trim()) {
      toast.error("Informe o nome da empresa.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      let companyId: string;
      if (existing && existing.length > 0) {
        companyId = existing[0].id;
        await supabase.from("companies").update({ display_name: state.companyName.trim() }).eq("id", companyId);
      } else {
        const { data: newCompany, error } = await supabase
          .from("companies")
          .insert({ display_name: state.companyName.trim(), user_id: user.id })
          .select("id")
          .single();
        if (error) throw error;
        companyId = newCompany.id;
      }
      setState(prev => ({ ...prev, companyId }));
      registerEvent("company_created", { company_id: companyId, company_name: state.companyName.trim() }, companyId);
      goTo("plan");
    } catch (err: any) {
      console.error("[Onboarding] Company error:", err);
      toast.error("Erro ao criar empresa: " + (err.message || "Tente novamente"));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Plan choice ──
  const handlePlanChoice = async (choice: "full" | "zpl") => {
    setSubmitting(true);
    try {
      setState(prev => ({ ...prev, planChoice: choice }));
      if (choice === "zpl") {
        const ok = await selectPlan(ZPL_PLAN_ID);
        if (!ok) throw new Error("Failed to select ZPL plan");
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await (supabase as any).from("user_plan_assignments").insert({
            user_id: user.id,
            plan_tier_id: ZPL_PLAN_ID,
            status: "active",
            notes: "Selected during onboarding",
            created_by: user.id,
          });
        }
        registerEvent("plan_selected", { plan: "zpl", plan_id: ZPL_PLAN_ID }, state.companyId);
        const success = await updateOnboarding({ status: "completed" });
        if (success) {
          registerEvent("onboarding_completed", { plan: "zpl" }, state.companyId);
          localStorage.removeItem(STORAGE_KEY);
          await refetch();
          toast.success("Ambiente pronto!");
          navigate("/dashboard", { replace: true });
        }
      } else {
        registerEvent("plan_selected", { plan: "full" }, state.companyId);
        goTo("connect");
      }
    } catch (err: any) {
      console.error("[Onboarding] Plan error:", err);
      toast.error("Erro ao selecionar modo de uso.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Skip connect ──
  const handleConnectLater = async () => {
    setSubmitting(true);
    try {
      registerEvent("marketplace_connection_deferred", {}, state.companyId);
      const success = await updateOnboarding({ status: "completed" });
      if (success) {
        registerEvent("onboarding_completed", { plan: "full", connected: false }, state.companyId);
        localStorage.removeItem(STORAGE_KEY);
        await refetch();
        toast.success("Ambiente ativado!");
        navigate("/dashboard", { replace: true });
      }
    } catch (err: any) {
      console.error("[Onboarding] Activation error:", err);
      toast.error("Erro ao ativar ambiente.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Final activation (from "done" step) ──
  const handleFinalize = async () => {
    setSubmitting(true);
    try {
      const success = await updateOnboarding({ status: "completed" });
      if (success) {
        registerEvent("onboarding_completed", { plan: "full", connected: true }, state.companyId);
        localStorage.removeItem(STORAGE_KEY);
        await refetch();
        navigate("/dashboard", { replace: true });
      }
    } catch (err: any) {
      console.error("[Onboarding] Final error:", err);
      toast.error("Erro ao finalizar.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Skip import (go to done directly) ──
  const handleSkipImport = async () => {
    registerEvent("import_skipped", {}, state.companyId);
    goTo("done");
  };

  if (loading || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderStep = () => {
    switch (state.step) {
      // ═══════════════════════════════════════════════
      // TELA 1 — BOAS-VINDAS
      // ═══════════════════════════════════════════════
      case "welcome":
        return (
          <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-4 animate-fade-in">
            <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-8 animate-scale-in">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-3 tracking-tight">
              Bem-vindo ao MKTP Fácil
            </h1>
            <p className="text-muted-foreground max-w-md text-base leading-relaxed mb-10">
              Aqui você organiza, acompanha e melhora sua operação com base em práticas reais de consultoria — tudo em um só lugar.
            </p>
            <Button size="lg" onClick={() => goTo("name")} className="gap-2 px-12 text-base h-12 rounded-xl">
              Começar <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        );

      // ═══════════════════════════════════════════════
      // TELA 2 — NOME DO USUÁRIO
      // ═══════════════════════════════════════════════
      case "name":
        return (
          <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-4 animate-fade-in">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 animate-scale-in">
              <User className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Como você prefere ser chamado?
            </h2>
            <p className="text-muted-foreground text-base mb-8">
              Vamos personalizar sua experiência dentro do sistema.
            </p>
            <div className="w-full max-w-sm space-y-4">
              <Input
                placeholder="Seu nome"
                value={state.userName}
                onChange={(e) => setState(prev => ({ ...prev, userName: e.target.value }))}
                maxLength={80}
                className="text-center text-lg h-12 rounded-xl border-border/60 focus:border-primary transition-colors"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && !submitting && state.userName.trim() && handleSaveName()}
              />
              <Button
                size="lg"
                onClick={handleSaveName}
                disabled={!state.userName.trim() || submitting}
                className="gap-2 w-full text-base h-12 rounded-xl"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Avançar <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        );

      // ═══════════════════════════════════════════════
      // TELA 3 — NOME DA EMPRESA
      // ═══════════════════════════════════════════════
      case "company":
        return (
          <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-4 animate-fade-in">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 animate-scale-in">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Qual o nome da sua empresa?
            </h2>
            <p className="text-muted-foreground text-base mb-8">
              Vamos usar esse nome para organizar seu ambiente e suas tarefas.
            </p>
            <div className="w-full max-w-sm space-y-4">
              <Input
                placeholder="Nome da empresa"
                value={state.companyName}
                onChange={(e) => setState(prev => ({ ...prev, companyName: e.target.value }))}
                maxLength={120}
                className="text-center text-lg h-12 rounded-xl border-border/60 focus:border-primary transition-colors"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && !submitting && state.companyName.trim() && handleSaveCompany()}
              />
              <Button
                size="lg"
                onClick={handleSaveCompany}
                disabled={!state.companyName.trim() || submitting}
                className="gap-2 w-full text-base h-12 rounded-xl"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Avançar <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        );

      // ═══════════════════════════════════════════════
      // TELA 4 — ESCOLHA DO MODO DE USO
      // ═══════════════════════════════════════════════
      case "plan":
        return (
          <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-4 animate-fade-in">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Como você quer usar o sistema?
            </h2>
            <p className="text-muted-foreground text-base mb-8">
              Você pode mudar isso depois, se precisar.
            </p>

            <div className="w-full max-w-lg grid gap-4">
              <Card
                className="cursor-pointer border-2 border-border/60 hover:border-primary/70 transition-all duration-200 hover:shadow-md group"
                onClick={() => !submitting && handlePlanChoice("full")}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors duration-200">
                      <BarChart3 className="w-7 h-7 text-primary" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-semibold text-lg text-foreground mb-1">Gerenciar Mercado Livre</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Importe vendas, acompanhe resultados e use ferramentas de análise.
                      </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-primary transition-colors duration-200 mt-4 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>

              <Card
                className="cursor-pointer border-2 border-border/60 hover:border-primary/70 transition-all duration-200 hover:shadow-md group"
                onClick={() => !submitting && handlePlanChoice("zpl")}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-muted rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-muted/80 transition-colors duration-200">
                      <Printer className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-semibold text-lg text-foreground mb-1">Usar apenas etiquetas (ZPL)</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Impressão de etiquetas e uso das ferramentas básicas.
                      </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-primary transition-colors duration-200 mt-4 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {submitting && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-6 animate-fade-in">
                <Loader2 className="w-4 h-4 animate-spin" /> Preparando seu ambiente...
              </div>
            )}
          </div>
        );

      // ═══════════════════════════════════════════════
      // TELA 5 — CONEXÃO MERCADO LIVRE
      // ═══════════════════════════════════════════════
      case "connect":
        return (
          <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-4 animate-fade-in">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 animate-scale-in">
              <BarChart3 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Conectar conta do Mercado Livre
            </h2>
            <p className="text-muted-foreground max-w-md mb-6 text-base leading-relaxed">
              Vincule sua conta para importar seus dados e ativar o painel completo. A conexão é rápida e segura.
            </p>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 max-w-md mb-8">
              <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                <strong>Importante:</strong> Use a <strong>conta principal (titular)</strong> do Mercado Livre para autenticar. Contas colaboradoras não possuem acesso completo aos dados.
              </p>
            </div>
            <div className="w-full max-w-sm space-y-3">
              <Button
                size="lg"
                className="gap-2 w-full text-base h-12 rounded-xl"
                disabled={submitting}
                onClick={async () => {
                  setSubmitting(true);
                  registerEvent("marketplace_connection_started", {}, state.companyId);
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session) {
                      toast.error("Sessão expirada. Faça login novamente.");
                      navigate("/auth");
                      return;
                    }
                    const response = await supabase.functions.invoke('ml-auth-url', {
                      body: { frontendOrigin: window.location.origin },
                      headers: { Authorization: `Bearer ${session.access_token}` },
                    });
                    if (response.error) throw response.error;
                    if (response.data?.authUrl) {
                      window.location.href = response.data.authUrl;
                    } else {
                      throw new Error("URL de autorização não recebida");
                    }
                  } catch (err: any) {
                    console.error("[Onboarding] ML connect error:", err);
                    toast.error("Erro ao conectar: " + (err?.message || "Tente novamente"));
                    setSubmitting(false);
                  }
                }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Conectar Mercado Livre <ArrowRight className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground transition-colors"
                onClick={handleConnectLater}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Conectar depois
              </Button>
            </div>
          </div>
        );

      // ═══════════════════════════════════════════════
      // TELA 6 — IMPORTAÇÃO EM ANDAMENTO (FIXA)
      // ═══════════════════════════════════════════════
      case "importing":
        return (
          <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-4 animate-fade-in">
            <div className="relative w-20 h-20 mb-8">
              <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping opacity-20" />
              <div className="relative w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3">
              Estamos preparando seus dados
            </h2>
            <p className="text-muted-foreground text-base mb-2 max-w-md leading-relaxed">
              Estamos importando suas vendas recentes para montar seu ambiente.
            </p>
            <p className="text-sm text-muted-foreground/70 mb-6">
              Isso pode levar alguns minutos.
            </p>
            {importProgress.total > 0 && (
              <div className="w-full max-w-sm mb-6">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Fase {importProgress.phase}</span>
                  <span>{importProgress.processed} / {importProgress.total}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${Math.min((importProgress.processed / importProgress.total) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
            <div className="bg-muted/40 rounded-xl px-5 py-3 text-sm text-muted-foreground max-w-sm mb-6">
              Você pode deixar essa tela aberta. Avisaremos quando estiver pronto.
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground/60 hover:text-foreground"
              onClick={handleSkipImport}
            >
              Pular e entrar no sistema
            </Button>
          </div>
        );

      // ═══════════════════════════════════════════════
      // TELA 7 — TUDO PRONTO (CELEBRAÇÃO)
      // ═══════════════════════════════════════════════
      case "done":
        return (
          <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-4 animate-fade-in">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 animate-scale-in">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-3">
              Tudo pronto
            </h2>
            <p className="text-muted-foreground text-base max-w-md mb-10 leading-relaxed">
              Seu ambiente inicial já foi preparado. Agora você pode começar a usar o sistema.
            </p>
            <Button
              size="lg"
              onClick={handleFinalize}
              disabled={submitting}
              className="gap-2 px-12 text-base h-12 rounded-xl"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-5 h-5" />}
              Acessar sistema
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  const stepOrder: OnboardingStep[] = ["welcome", "name", "company", "plan"];
  const currentIndex = stepOrder.indexOf(state.step);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      {/* Minimal header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground tracking-tight">MKTP Fácil</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {renderStep()}

        {/* Step dots (only for the 4 main steps) */}
        {currentIndex >= 0 && (
          <div className="flex items-center justify-center gap-2 mt-10">
            {stepOrder.map((s, i) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentIndex
                    ? "bg-primary w-7"
                    : i < currentIndex
                    ? "bg-primary/40 w-2.5"
                    : "bg-muted-foreground/20 w-2.5"
                }`}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PrimeiroAcesso;
