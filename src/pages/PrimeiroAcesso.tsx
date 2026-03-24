import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/contexts/UserAccessContext";
import { useOnboardingEvents } from "@/hooks/useOnboardingEvents";
import {
  BarChart3, Loader2, ArrowRight, Rocket, Building2, Printer,
  User, Sparkles, PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// ZPL plan tier ID — must match DB
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
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { step: "welcome", userName: "", companyName: "", companyId: null, planChoice: null };
}

function saveState(s: OnboardingState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

const PrimeiroAcesso = () => {
  const navigate = useNavigate();
  const { loading: accessLoading, isAuthenticated, requiresOnboarding, updateOnboarding, selectPlan, refetch } = useUserAccess();
  const { registerEvent } = useOnboardingEvents();

  const [state, setState] = useState<OnboardingState>(loadState);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Persist on change
  useEffect(() => { saveState(state); }, [state]);

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth", { replace: true });
      } else {
        setLoading(false);
        registerEvent("onboarding_page_opened");
        registerEvent("email_confirmed_return", { user_id: session.user.id });

        // Pre-fill name from signup metadata
        if (!state.userName && session.user.user_metadata?.full_name) {
          setState(prev => ({ ...prev, userName: session.user.user_metadata?.full_name || "" }));
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

  const goTo = useCallback((step: OnboardingStep) => {
    setState(prev => ({ ...prev, step }));
  }, []);

  // ── Step: Save user name ──
  const handleSaveName = async () => {
    if (!state.userName.trim()) {
      toast.error("Por favor, informe seu nome.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update auth metadata
      await supabase.auth.updateUser({ data: { full_name: state.userName.trim() } });

      // Update profiles table
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

  // ── Step: Save company ──
  const handleSaveCompany = async () => {
    if (!state.companyName.trim()) {
      toast.error("Informe o nome da empresa.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check existing
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

  // ── Step: Plan choice ──
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

        // Complete onboarding immediately for ZPL
        const success = await updateOnboarding({ status: "completed" });
        if (success) {
          registerEvent("onboarding_completed", { plan: "zpl" }, state.companyId);
          localStorage.removeItem(STORAGE_KEY);
          await refetch();
          toast.success("Ambiente ZPL ativado!");
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

  // ── Step: Skip connect (placeholder → user will connect from dashboard) ──
  const handleConnectLater = async () => {
    setSubmitting(true);
    try {
      registerEvent("marketplace_connection_deferred", {}, state.companyId);
      const success = await updateOnboarding({ status: "completed" });
      if (success) {
        registerEvent("onboarding_completed", { plan: "full", connected: false }, state.companyId);
        localStorage.removeItem(STORAGE_KEY);
        await refetch();
        toast.success("Ambiente ativado! Conecte o Mercado Livre no painel.");
        navigate("/dashboard", { replace: true });
      }
    } catch (err: any) {
      console.error("[Onboarding] Activation error:", err);
      toast.error("Erro ao ativar ambiente.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Final activation (after import) ──
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

  // ── Loading ──
  if (loading || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Step renders ──
  const renderStep = () => {
    switch (state.step) {
      // ═══════════════════════════════════════════════
      // TELA 1 — BOAS-VINDAS
      // ═══════════════════════════════════════════════
      case "welcome":
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in duration-500">
            <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-8">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Seja muito bem-vindo ao MKTP Fácil
            </h1>
            <p className="text-muted-foreground max-w-lg text-lg leading-relaxed mb-10">
              O MKTP Fácil foi desenvolvido para aplicar técnicas práticas de consultoria, organização, automação e acompanhamento da operação do seller em um só lugar.
            </p>
            <Button size="lg" onClick={() => goTo("name")} className="gap-2 px-10 text-base">
              Avançar <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        );

      // ═══════════════════════════════════════════════
      // TELA 2 — NOME DO USUÁRIO
      // ═══════════════════════════════════════════════
      case "name":
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
              <User className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Prometo ser breve.
            </h2>
            <p className="text-muted-foreground text-lg mb-8">
              Mas preciso saber seu nome.
            </p>
            <div className="w-full max-w-sm space-y-4">
              <Input
                placeholder="Seu nome"
                value={state.userName}
                onChange={(e) => setState(prev => ({ ...prev, userName: e.target.value }))}
                maxLength={80}
                className="text-center text-lg h-12"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && !submitting && state.userName.trim() && handleSaveName()}
              />
              <Button
                size="lg"
                onClick={handleSaveName}
                disabled={!state.userName.trim() || submitting}
                className="gap-2 w-full text-base"
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
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Também preciso saber o nome da sua empresa
            </h2>
            <p className="text-muted-foreground text-lg mb-8">
              para criar seu workspace.
            </p>
            <div className="w-full max-w-sm space-y-4">
              <Input
                placeholder="Nome da empresa"
                value={state.companyName}
                onChange={(e) => setState(prev => ({ ...prev, companyName: e.target.value }))}
                maxLength={120}
                className="text-center text-lg h-12"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && !submitting && state.companyName.trim() && handleSaveCompany()}
              />
              <Button
                size="lg"
                onClick={handleSaveCompany}
                disabled={!state.companyName.trim() || submitting}
                className="gap-2 w-full text-base"
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
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {state.userName ? `${state.userName}, você` : "Você"} vai testar as ferramentas de Mercado Livre ou somente impressão em ZPL?
            </h2>
            <p className="text-muted-foreground mb-8">Escolha como deseja usar o sistema.</p>

            <div className="w-full max-w-lg grid gap-4">
              <Card
                className="cursor-pointer hover:border-primary/60 transition-all hover:shadow-lg border-2 group"
                onClick={() => !submitting && handlePlanChoice("full")}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                      <BarChart3 className="w-7 h-7 text-primary" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-semibold text-lg text-foreground mb-1">Quero testar Mercado Livre</h3>
                      <p className="text-sm text-muted-foreground">
                        Dashboard completo, análises de vendas, radiografia de anúncios, publicidade, envios, promoções e muito mais.
                      </p>
                      <p className="text-xs text-primary mt-2 font-medium">Requer conexão com Mercado Livre</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card
                className="cursor-pointer hover:border-primary/60 transition-all hover:shadow-lg border-2 group"
                onClick={() => !submitting && handlePlanChoice("zpl")}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-muted rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-muted/80 transition-colors">
                      <Printer className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-semibold text-lg text-foreground mb-1">Quero usar somente ZPL</h3>
                      <p className="text-sm text-muted-foreground">
                        Impressão de etiquetas, calculadora de precificação, comissões e outras ferramentas — sem integração.
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">Sem necessidade de conta no Mercado Livre</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {submitting && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-6">
                <Loader2 className="w-4 h-4 animate-spin" /> Configurando seu ambiente...
              </div>
            )}
          </div>
        );

      // ═══════════════════════════════════════════════
      // TELA 5 — CONEXÃO MERCADO LIVRE
      // ═══════════════════════════════════════════════
      case "connect":
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
              <BarChart3 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Conectar conta do Mercado Livre
            </h2>
            <p className="text-muted-foreground max-w-md mb-8">
              Para importar seus dados e ativar o painel completo, vincule sua conta do Mercado Livre. A conexão é rápida e segura via OAuth oficial.
            </p>
            <div className="w-full max-w-sm space-y-3">
              <Button
                size="lg"
                className="gap-2 w-full text-base"
                onClick={() => {
                  registerEvent("marketplace_connection_started", {}, state.companyId);
                  // Navigate to the ML OAuth connection flow
                  navigate("/settings?section=contas");
                }}
              >
                Conectar Mercado Livre <ArrowRight className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={handleConnectLater}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Conectar depois e entrar no sistema
              </Button>
            </div>
          </div>
        );

      // ═══════════════════════════════════════════════
      // TELA 6 — IMPORTAÇÃO EM ANDAMENTO
      // ═══════════════════════════════════════════════
      case "importing":
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in duration-500">
            <Loader2 className="w-16 h-16 text-primary animate-spin mb-6" />
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Estamos importando as vendas dos últimos 30 dias
            </h2>
            <p className="text-muted-foreground text-lg mb-4">
              Enquanto isso, vá buscar um café. ☕
            </p>
            <p className="text-sm text-muted-foreground">
              Avisaremos quando estiver terminado.
            </p>
          </div>
        );

      // ═══════════════════════════════════════════════
      // TELA 7 — TUDO PRONTO (CELEBRAÇÃO)
      // ═══════════════════════════════════════════════
      case "done":
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in duration-500">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 animate-bounce">
              <PartyPopper className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-3">
              🎉 Tudo pronto!
            </h2>
            <p className="text-muted-foreground text-lg max-w-md mb-8">
              Seu ambiente inicial já foi preparado e o sistema está liberado para uso.
            </p>
            <Button
              size="lg"
              onClick={handleFinalize}
              disabled={submitting}
              className="gap-2 px-10 text-base"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-5 h-5" />}
              Entrar no sistema
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  // ── Step indicator dots ──
  const stepOrder: OnboardingStep[] = ["welcome", "name", "company", "plan"];
  const currentIndex = stepOrder.indexOf(state.step);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      {/* Minimal header */}
      <header className="border-b border-border/50 bg-card/60 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">MKTP Fácil</span>
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
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  i === currentIndex
                    ? "bg-primary w-6"
                    : i < currentIndex
                    ? "bg-primary/40"
                    : "bg-muted-foreground/20"
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
