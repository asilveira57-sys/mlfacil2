import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, DollarSign, Target, TrendingUp, Eye, EyeOff, Loader2, Users, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import consultantPhoto from "@/assets/consultant-photo.png";

const AuthLeftColumn = () => (
  <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col justify-between p-12 text-primary-foreground">
    {/* Background layers */}
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(223_47%_28%)_0%,_hsl(223_47%_18%)_50%,_hsl(223_50%_12%)_100%)]" />
    
    {/* Subtle grid/dashboard texture */}
    <div className="absolute inset-0 opacity-[0.04]" style={{
      backgroundImage: `
        linear-gradient(hsl(210 40% 80%) 1px, transparent 1px),
        linear-gradient(90deg, hsl(210 40% 80%) 1px, transparent 1px),
        linear-gradient(hsl(210 40% 80%) 0.5px, transparent 0.5px),
        linear-gradient(90deg, hsl(210 40% 80%) 0.5px, transparent 0.5px)
      `,
      backgroundSize: '60px 60px, 60px 60px, 15px 15px, 15px 15px',
    }} />
    
    {/* Floating chart-like decorations */}
    <div className="absolute top-20 right-12 w-32 h-20 opacity-[0.06] border border-white/20 rounded-lg" />
    <div className="absolute bottom-40 right-20 w-24 h-16 opacity-[0.04] border border-white/20 rounded-lg" />
    <div className="absolute top-1/3 right-8 w-1 h-32 opacity-[0.08] bg-gradient-to-b from-transparent via-white to-transparent" />
    
    {/* Smooth right-edge blend */}
    <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-r from-transparent to-background z-10" />

    <div className="relative z-20">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-14">
        <div className="w-11 h-11 bg-accent/90 rounded-xl flex items-center justify-center shadow-lg">
          <BarChart3 className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">MKTP Fácil</h1>
      </div>

      {/* Benefit Cards */}
      <div className="space-y-4">
        <BenefitCard
          icon={<DollarSign className="w-5 h-5" />}
          title="Lucro real por produto"
          description="Calcule margens considerando custos, comissões, taxas e frete antes de alterar preços."
        />
        <BenefitCard
          icon={<Target className="w-5 h-5" />}
          title="Análise de anúncios e posicionamento"
          description="Visualize desempenho, estrutura e posicionamento dos produtos para decisões mais seguras."
        />
        <BenefitCard
          icon={<TrendingUp className="w-5 h-5" />}
          title="Visão clara da operação"
          description="Acompanhe vendas, indicadores e movimentações do negócio com dados organizados."
        />
      </div>
    </div>

    <div className="relative z-20 space-y-5">
      {/* Authority Card */}
      <div className="bg-white/[0.07] backdrop-blur-sm rounded-2xl p-5 border border-white/[0.08] shadow-lg">
        <div className="flex items-center gap-4">
          <img
            src={consultantPhoto}
            alt="Alexandre Silveira"
            className="w-14 h-14 rounded-full object-cover ring-2 ring-accent/40 shadow-md"
          />
          <div>
            <p className="font-semibold text-base">Alexandre Silveira</p>
            <p className="text-sm text-primary-foreground/70 leading-snug mt-0.5">
              Consultor certificado do Mercado Livre
              <br />
              14 anos vendendo na plataforma
            </p>
          </div>
          <Shield className="w-5 h-5 text-accent/70 ml-auto flex-shrink-0" />
        </div>
      </div>

      {/* Activity line */}
      <div className="flex items-start gap-3 px-1">
        <Users className="w-4 h-4 text-primary-foreground/40 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-primary-foreground/50 leading-relaxed">
          Sistema utilizado diariamente por vendedores do Mercado Livre para análise de operação, precificação e gestão estratégica.
        </p>
      </div>
    </div>
  </div>
);

const BenefitCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <div className="bg-white/[0.06] backdrop-blur-sm rounded-xl p-5 border border-white/[0.07] shadow-sm hover:bg-white/[0.09] transition-colors duration-300">
    <div className="flex items-start gap-4">
      <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-[15px] mb-1.5">{title}</h3>
        <p className="text-sm text-primary-foreground/65 leading-relaxed">{description}</p>
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <AuthLeftColumn />

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-8">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10 text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-11 h-11 bg-primary rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">MKTP Fácil</h1>
            </div>
          </div>

          <div className="bg-card p-8 sm:p-10 rounded-2xl shadow-elevated border border-border/60">
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
