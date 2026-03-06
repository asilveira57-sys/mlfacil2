import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, DollarSign, LayoutDashboard, Settings2, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const Auth = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentYear = new Date().getFullYear();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Forgot password state
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        console.info("[Auth] User already authenticated, redirecting to /dashboard");
        navigate("/dashboard", { replace: true });
      } else {
        setCheckingSession(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        console.info("[Auth] SIGNED_IN event, redirecting to /dashboard");
        navigate("/dashboard", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    console.info("[Auth] Login attempt for:", email);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.warn("[Auth] Login failed:", error.message);
        if (error.message.includes("Email not confirmed")) {
          toast.error("E-mail não verificado. Verifique sua caixa de entrada.");
        } else {
          toast.error(t("auth:invalid_credentials"));
        }
      } else {
        console.info("[Auth] Login successful for:", email);
      }
    } catch (err: any) {
      console.error("[Auth] Login error:", err);
      toast.error("Erro inesperado ao fazer login.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;

    setForgotLoading(true);
    console.info("[Auth] Password reset requested for:", forgotEmail);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
      console.info("[Auth] Password reset email sent to:", forgotEmail);
    } catch (err: any) {
      console.error("[Auth] Password reset error:", err);
      toast.error("Erro ao enviar e-mail de recuperação.");
    } finally {
      setForgotLoading(false);
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
          
          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-primary-light/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">{t("auth:features.complete_analysis_title")}</h3>
                <p className="text-primary-foreground/80 leading-relaxed">{t("auth:features.complete_analysis_desc")}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-primary-light/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">{t("auth:features.ranking_title")}</h3>
                <p className="text-primary-foreground/80 leading-relaxed">{t("auth:features.ranking_desc")}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-primary-light/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <Settings2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">{t("auth:features.integration_title")}</h3>
                <p className="text-primary-foreground/80 leading-relaxed">{t("auth:features.integration_desc")}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="text-sm text-primary-foreground/60">
          {t("auth:copyright", { year: currentYear })}
        </div>
      </div>

      {/* Right Side - Login Form */}
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
            {forgotMode ? (
              forgotSent ? (
                <div className="text-center space-y-4 py-4">
                  <h2 className="text-2xl font-bold text-card-foreground">{t("auth:email_sent")}</h2>
                  <p className="text-muted-foreground text-sm">
                    Enviamos um link de recuperação para <strong>{forgotEmail}</strong>.
                    <br />Verifique sua caixa de entrada.
                  </p>
                  <button onClick={() => { setForgotMode(false); setForgotSent(false); }} className="text-sm text-primary hover:underline mt-4">
                    Voltar ao login
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-card-foreground mb-2">{t("auth:forgot_password_title")}</h2>
                    <p className="text-muted-foreground text-sm">{t("auth:forgot_password_subtitle")}</p>
                  </div>
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">{t("auth:email")}</Label>
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder={t("auth:email_placeholder")}
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={forgotLoading}>
                      {forgotLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      {forgotLoading ? t("auth:sending_reset") : t("auth:reset_password")}
                    </Button>
                    <button type="button" onClick={() => setForgotMode(false)} className="text-sm text-primary hover:underline w-full text-center block">
                      Voltar ao login
                    </button>
                  </form>
                </>
              )
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-card-foreground mb-2">{t("auth:login_title")}</h2>
                  <p className="text-muted-foreground">{t("auth:login_subtitle")}</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("auth:email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t("auth:email_placeholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">{t("auth:password")}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder={t("auth:password_placeholder")}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
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

                  <div className="flex justify-end">
                    <button type="button" onClick={() => { setForgotMode(true); setForgotEmail(email); }} className="text-sm text-primary hover:underline">
                      {t("auth:forgot_password")}
                    </button>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {loading ? t("auth:signing_in") : t("auth:login")}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("auth:no_account")}{" "}
                    <Link to="/criar-acesso" className="text-primary font-medium hover:underline">
                      Criar acesso
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

export default Auth;
