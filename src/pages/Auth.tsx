import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, DollarSign, Target, TrendingUp, Lightbulb, Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import alexandrePhoto from "@/assets/alexandre-silveira.png";
import WhatsAppFloatingButton from "@/components/WhatsAppFloatingButton";
import seloML from "@/assets/selo-consultoria-ml.avif";

const BenefitCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <div className="bg-white/[0.06] rounded-lg px-4 py-3 border border-white/[0.06]">
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <h3 className="font-medium text-[13px] text-primary-foreground/90">{title}</h3>
        <p className="text-[11px] text-primary-foreground/50 leading-relaxed mt-0.5">{description}</p>
      </div>
    </div>
  </div>
);

const AuthLeftColumn = () => (
  <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col justify-center gap-5 p-10 pl-12 pr-10 text-primary-foreground">
    {/* Background — subtle radial gradient */}
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,_hsl(223_47%_26%)_0%,_hsl(223_50%_14%)_100%)]" />

    {/* Faint grid texture */}
    <div className="absolute inset-0 opacity-[0.03]" style={{
      backgroundImage: `
        linear-gradient(hsl(210 40% 80%) 1px, transparent 1px),
        linear-gradient(90deg, hsl(210 40% 80%) 1px, transparent 1px)
      `,
      backgroundSize: '50px 50px',
    }} />

    {/* Clean hard edge — no gradient */}
    <div className="absolute inset-y-0 right-0 w-px z-10 bg-border/20" />

    <div className="relative z-20">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-accent/90 rounded-xl flex items-center justify-center">
          <BarChart3 className="w-4.5 h-4.5 text-white" />
        </div>
        <h1 className="text-lg font-bold tracking-tight">MKTP Fácil</h1>
      </div>

      {/* Benefit Cards */}
      <div className="space-y-2">
        <BenefitCard
          icon={<DollarSign className="w-4 h-4 text-accent" />}
          title="Lucro real por produto"
          description="Calcule margens considerando custos, comissões, taxas e frete antes de alterar preços."
        />
        <BenefitCard
          icon={<Target className="w-4 h-4 text-accent" />}
          title="Análise de anúncios e posicionamento"
          description="Visualize desempenho, estrutura e posicionamento dos produtos para decisões mais seguras."
        />
        <BenefitCard
          icon={<TrendingUp className="w-4 h-4 text-accent" />}
          title="Visão clara da operação"
          description="Acompanhe vendas, indicadores e movimentações do negócio com dados organizados."
        />
        <BenefitCard
          icon={<Lightbulb className="w-4 h-4 text-accent" />}
          title="Decisões baseadas em dados"
          description="Transforme informações da sua operação em ações estratégicas para crescer no Mercado Livre."
        />
      </div>
    </div>

    {/* Authority Card — compact, institutional */}
    <div className="relative z-20">
      <div className="bg-white/[0.05] rounded-lg px-3 py-2.5 border border-white/[0.06] w-fit">
        <div className="flex items-center gap-3">
          <img
            src={alexandrePhoto}
            alt="Alexandre Silveira"
            className="w-10 h-10 rounded-full object-cover object-[center_20%] ring-2 ring-white/10 flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="font-semibold text-[13px] text-primary-foreground leading-tight">Alexandre Silveira</p>
            <p className="text-[11px] text-primary-foreground/55 leading-tight mt-0.5">
              Consultor certificado do Mercado Livre · 14 anos na plataforma
            </p>
          </div>
          <img
            src={seloML}
            alt="Selo Consultoria Certificada Mercado Livre"
            className="h-12 w-auto flex-shrink-0 opacity-90"
          />
        </div>
      </div>
    </div>
  </div>
);

const Auth = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // State for unconfirmed email resend flow
  const [unconfirmedEmail, setUnconfirmedEmail] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  useEffect(() => {
    let isActive = true;
    let resolved = false;

    const timeoutId = window.setTimeout(() => {
      if (!isActive || resolved) return;
      console.warn("[Auth] Session check timed out after 5s, showing login form");
      setCheckingSession(false);
    }, 5_000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!isActive) return;
        resolved = true;
        window.clearTimeout(timeoutId);

        if (session) {
          // Send to /dashboard — ProtectedRoute will redirect to /primeiro-acesso
          // ONLY if onboarding is actually pending. This prevents the bug where
          // users who already completed onboarding land on /primeiro-acesso.
          navigate("/dashboard", { replace: true });
          return;
        }

        setCheckingSession(false);
      })
      .catch(() => {
        if (!isActive) return;
        resolved = true;
        window.clearTimeout(timeoutId);
        setCheckingSession(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        // Always send to /dashboard — ProtectedRoute decides whether to forward
        // to /primeiro-acesso based on the real onboarding state.
        navigate("/dashboard", { replace: true });
      } else if (event === "SIGNED_OUT") {
        setCheckingSession(false);
      }
    });

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.includes("Email not confirmed")) {
          // Show inline resend UI instead of just a toast
          setUnconfirmedEmail(email);
          // Auto-trigger a resend
          try {
            await supabase.auth.resend({ type: 'signup', email });
            setResendCountdown(30);
          } catch { /* silent */ }
        } else {
          toast.error(t("auth:invalid_credentials"));
        }
        // Log failed login attempt
        try {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (currentUser) {
            await supabase.from('security_events').insert([{
              user_id: currentUser.id,
              event_type: 'login',
              user_agent: navigator.userAgent,
              success: false,
              metadata: { reason: error.message },
            }]);
          }
        } catch { /* silent */ }
      } else if (signInData?.user) {
        // Log successful login
        try {
          await supabase.from('security_events').insert([{
            user_id: signInData.user.id,
            event_type: 'login',
            user_agent: navigator.userAgent,
            success: true,
            metadata: { login_at: new Date().toISOString() },
          }]);
        } catch { /* silent */ }

        if (signInData.session) {
          // Route through /dashboard so ProtectedRoute can read the real
          // onboarding state and only redirect to /primeiro-acesso when needed.
          navigate("/dashboard", { replace: true });
        }
      }
    } catch {
      toast.error("Erro inesperado ao fazer login.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unconfirmedEmail || resendCountdown > 0) return;
    setResendingVerification(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: unconfirmedEmail,
      });
      if (error) throw error;
      toast.success('E-mail de verificação reenviado!');
      setResendCountdown(30);
    } catch (err: any) {
      toast.error(`Erro ao reenviar: ${err.message}`);
    } finally {
      setResendingVerification(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;

    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: any) {
      const msg = String(err?.message || err?.error_description || "");
      const status = err?.status ?? err?.statusCode;
      if (status === 429 || /rate limit|too many|over.*email.*rate/i.test(msg)) {
        toast.error(
          "Muitas tentativas. Aguarde alguns minutos antes de solicitar um novo e-mail de recuperação."
        );
      } else {
        toast.error("Erro ao enviar e-mail de recuperação. Tente novamente em instantes.");
      }
    } finally {
      setForgotLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-background flex">
      <AuthLeftColumn />

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-8">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10 text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">MKTP Fácil</h1>
            </div>
          </div>

          <div className="bg-card p-8 sm:p-10 rounded-2xl shadow-lg border border-border/50">
            {unconfirmedEmail ? (
              <div className="text-center space-y-4 py-6">
                <div className="flex justify-center">
                  <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center">
                    <MailCheck className="w-7 h-7 text-primary" />
                  </div>
                </div>
                <h2 className="text-xl font-bold text-card-foreground">Verifique seu e-mail</h2>
                <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                  Enviamos um link de verificação para confirmar sua conta. Verifique sua caixa de entrada.
                </p>
                <p className="text-sm font-medium text-foreground">{unconfirmedEmail}</p>

                {/* Spam/Promotions warning */}
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-left max-w-sm mx-auto">
                  <p className="text-xs text-amber-800 dark:text-amber-200 font-medium mb-1">⚠️ Não encontrou o e-mail?</p>
                  <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5 list-disc list-inside">
                    <li>Verifique a pasta <strong>Spam</strong> ou <strong>Lixo eletrônico</strong></li>
                    <li>No Gmail, cheque a aba <strong>Promoções</strong></li>
                    <li>Aguarde alguns segundos para o e-mail chegar</li>
                  </ul>
                </div>

                <div className="pt-2">
                  {resendCountdown > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Reenviar em <span className="font-mono font-semibold text-foreground">{resendCountdown}s</span>
                    </p>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResendVerification}
                      disabled={resendingVerification}
                    >
                      {resendingVerification ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Reenviando...
                        </>
                      ) : (
                        <>
                          <MailCheck className="h-4 w-4 mr-1" />
                          Reenviar e-mail de verificação
                        </>
                      )}
                    </Button>
                  )}
                </div>

                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Se ainda não receber, entre em contato pelo WhatsApp no canto inferior direito.
                </p>

                <button
                  onClick={() => setUnconfirmedEmail("")}
                  className="text-sm text-primary hover:underline mt-4 inline-block font-medium"
                >
                  Voltar ao login
                </button>
              </div>
            ) : forgotMode ? (
              forgotSent ? (
                <div className="text-center space-y-4 py-4">
                  <div className="flex justify-center">
                    <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center">
                      <MailCheck className="w-7 h-7 text-primary" />
                    </div>
                  </div>
                  <h2 className="text-xl font-bold text-card-foreground">{t("auth:email_sent")}</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Enviamos um link de recuperação para <strong>{forgotEmail}</strong>.
                  </p>

                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-left max-w-sm mx-auto">
                    <p className="text-xs text-amber-800 dark:text-amber-200 font-medium mb-1">⚠️ Não encontrou o e-mail?</p>
                    <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5 list-disc list-inside">
                      <li>Verifique a pasta <strong>Spam</strong> ou <strong>Lixo eletrônico</strong></li>
                      <li>No Gmail, cheque a aba <strong>Promoções</strong></li>
                      <li>Remetente: <strong>noreply@notifica.mktpfacil.com</strong></li>
                    </ul>
                  </div>

                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Não chegou em 2 minutos? Use o WhatsApp no canto inferior direito.
                  </p>

                  <button onClick={() => { setForgotMode(false); setForgotSent(false); }} className="text-sm text-primary hover:underline mt-4 font-medium">
                    Voltar ao login
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-8">
                    <h2 className="text-xl font-bold text-card-foreground mb-1.5">{t("auth:forgot_password_title")}</h2>
                    <p className="text-muted-foreground text-sm">{t("auth:forgot_password_subtitle")}</p>
                  </div>
                  <form onSubmit={handleForgotPassword} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">{t("auth:email")}</Label>
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder={t("auth:email_placeholder")}
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                        className="h-11"
                      />
                    </div>
                    <Button type="submit" className="w-full h-11" disabled={forgotLoading}>
                      {forgotLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      {forgotLoading ? t("auth:sending_reset") : t("auth:reset_password")}
                    </Button>
                    <button type="button" onClick={() => setForgotMode(false)} className="text-sm text-primary hover:underline w-full text-center block font-medium">
                      Voltar ao login
                    </button>
                  </form>
                </>
              )
            ) : (
              <>
                <div className="mb-8">
                  <h2 className="text-xl font-bold text-card-foreground mb-1.5">Acesse sua conta</h2>
                  <p className="text-muted-foreground text-sm">Entre para continuar utilizando o MKTP Fácil.</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
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
                      className="h-11"
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
                        className="pr-10 h-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button type="button" onClick={() => { setForgotMode(true); setForgotEmail(email); }} className="text-sm text-primary hover:underline font-medium">
                      {t("auth:forgot_password")}
                    </button>
                  </div>

                  <Button type="submit" className="w-full h-11 text-[15px]" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {loading ? t("auth:signing_in") : "Entrar"}
                  </Button>
                </form>

                <div className="mt-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("auth:no_account")}{" "}
                    <Link to="/criar-acesso" className="text-primary font-semibold hover:underline">
                      Criar acesso
                    </Link>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <WhatsAppFloatingButton />
    </div>
  );
};

export default Auth;
