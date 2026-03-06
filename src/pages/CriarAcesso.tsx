import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Eye, EyeOff, Loader2, MailCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const CriarAcesso = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Post-signup state
  const [showVerifyEmail, setShowVerifyEmail] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        console.info("[CriarAcesso] User already authenticated, redirecting to /dashboard");
        navigate("/dashboard", { replace: true });
      } else {
        setCheckingSession(false);
      }
    });
  }, [navigate]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error(t("auth:password_too_short"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("auth:passwords_dont_match"));
      return;
    }
    if (!acceptTerms) {
      toast.error("Você precisa aceitar os termos para continuar.");
      return;
    }

    setLoading(true);
    console.info("[CriarAcesso] Signup attempt for:", email);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        console.warn("[CriarAcesso] Signup failed:", error.message);
        if (error.message.includes("already registered")) {
          toast.error(t("auth:email_already_registered"));
        } else {
          toast.error(error.message);
        }
        return;
      }

      // If email confirmation is required (user exists but not confirmed)
      if (data?.user && !data.user.email_confirmed_at) {
        console.info("[CriarAcesso] Signup successful, email verification required");
        setSignupEmail(email);
        setShowVerifyEmail(true);
      } else if (data?.session) {
        // Auto-confirmed (shouldn't happen per config, but handle gracefully)
        console.info("[CriarAcesso] Signup successful with auto-confirm, redirecting");
        navigate("/primeiro-acesso", { replace: true });
      }
    } catch (err: any) {
      console.error("[CriarAcesso] Signup error:", err);
      toast.error("Erro inesperado ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-primary p-12 flex-col justify-between text-primary-foreground">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center">
              <BarChart3 className="w-7 h-7" />
            </div>
            <h1 className="text-3xl font-bold">MKTP Fácil</h1>
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Comece sua jornada de sucesso</h2>
            <div className="space-y-4">
              {[
                "Análise completa de custos e margens",
                "Gestão inteligente de anúncios",
                "Importação automática de vendas",
                "Relatórios e métricas em tempo real",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0" />
                  <span className="text-primary-foreground/90">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="text-sm text-primary-foreground/60">
          {t("auth:copyright", { year: currentYear })}
        </div>
      </div>

      {/* Right Side - Signup Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
                <BarChart3 className="w-7 h-7 text-primary-foreground" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">MKTP Fácil</h1>
            </div>
          </div>

          <div className="bg-card p-8 rounded-2xl shadow-elevated border border-border">
            {showVerifyEmail ? (
              <div className="text-center space-y-4 py-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                    <MailCheck className="w-8 h-8 text-primary" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-card-foreground">{t("auth:verify_email")}</h2>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                  {t("auth:verify_email_description")}
                </p>
                {signupEmail && (
                  <p className="text-sm font-medium text-foreground">{signupEmail}</p>
                )}
                <Link to="/auth" className="text-sm text-primary hover:underline mt-4 inline-block">
                  Ir para o login
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-card-foreground mb-2">{t("auth:register_title")}</h2>
                  <p className="text-muted-foreground">{t("auth:register_subtitle")}</p>
                </div>

                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome completo</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Seu nome"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email">{t("auth:email")}</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder={t("auth:email_placeholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">{t("auth:password")}</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Escolha uma senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">{t("auth:confirm_password")}</Label>
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Confirme sua senha"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="terms"
                      checked={acceptTerms}
                      onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                    />
                    <label htmlFor="terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                      {t("auth:terms_agreement")}{" "}
                      <Link to="/termos-de-uso" className="text-primary hover:underline" target="_blank">
                        {t("auth:terms_of_service")}
                      </Link>{" "}
                      e{" "}
                      <Link to="/politica-de-privacidade" className="text-primary hover:underline" target="_blank">
                        {t("auth:privacy_policy")}
                      </Link>.
                    </label>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading || !acceptTerms}>
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {loading ? t("auth:creating_account") : "Criar acesso"}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("auth:has_account")}{" "}
                    <Link to="/auth" className="text-primary font-medium hover:underline">
                      {t("auth:sign_in")}
                    </Link>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CriarAcesso;
