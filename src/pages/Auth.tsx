import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, DollarSign, Target, TrendingUp, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import alexandrePhoto from "@/assets/alexandre-silveira.png";
import seloML from "@/assets/selo-ml-certificado.png";

const BenefitCard = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <div className="bg-white/[0.06] rounded-xl px-5 py-4 border border-white/[0.06]">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <h3 className="font-medium text-[14px] text-primary-foreground/90">{title}</h3>
    </div>
  </div>
);

const AuthLeftColumn = () => (
  <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col justify-between p-12 text-primary-foreground">
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

    {/* Soft edge blend into right column — narrow 60-80px */}
    <div className="absolute inset-y-0 right-0 w-[70px] bg-gradient-to-r from-transparent to-background z-10" />

    <div className="relative z-20">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-16">
        <div className="w-10 h-10 bg-accent/90 rounded-xl flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">MKTP Fácil</h1>
      </div>

      {/* Benefit Cards — lightweight */}
      <div className="space-y-3 max-w-sm">
        <BenefitCard
          icon={<DollarSign className="w-4 h-4 text-accent" />}
          title="Lucro real por produto"
        />
        <BenefitCard
          icon={<Target className="w-4 h-4 text-accent" />}
          title="Análise de anúncios e posicionamento"
        />
        <BenefitCard
          icon={<TrendingUp className="w-4 h-4 text-accent" />}
          title="Visão clara da operação"
        />
      </div>
    </div>

    {/* Authority Card — compact, horizontal */}
    <div className="relative z-20">
      <div className="bg-white/[0.05] rounded-xl p-3.5 border border-white/[0.06] max-w-[380px]">
        <div className="flex items-center gap-3">
          <img
            src={alexandrePhoto}
            alt="Alexandre Silveira"
            className="w-11 h-11 rounded-full object-cover ring-2 ring-white/10 flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm text-primary-foreground">Alexandre Silveira</p>
            <p className="text-xs text-primary-foreground/60 leading-snug mt-0.5">
              Consultor certificado do Mercado Livre
            </p>
            <p className="text-xs text-primary-foreground/50">
              14 anos vendendo na plataforma
            </p>
          </div>
          <img
            src={seloML}
            alt="Selo Consultoria Certificada Mercado Livre"
            className="h-7 w-auto flex-shrink-0 opacity-80"
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard", { replace: true });
      } else {
        setCheckingSession(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate("/dashboard", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.includes("Email not confirmed")) {
          toast.error("E-mail não verificado. Verifique sua caixa de entrada.");
        } else {
          toast.error(t("auth:invalid_credentials"));
        }
      }
    } catch {
      toast.error("Erro inesperado ao fazer login.");
    } finally {
      setLoading(false);
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
    } catch {
      toast.error("Erro ao enviar e-mail de recuperação.");
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
            {forgotMode ? (
              forgotSent ? (
                <div className="text-center space-y-4 py-4">
                  <h2 className="text-xl font-bold text-card-foreground">{t("auth:email_sent")}</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Enviamos um link de recuperação para <strong>{forgotEmail}</strong>.
                    <br />Verifique sua caixa de entrada.
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
    </div>
  );
};

export default Auth;
