import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Eye, EyeOff, Loader2, MailCheck, DollarSign, Target, TrendingUp, Award, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import alexandrePhoto from "@/assets/alexandre-silveira.png";
import seloML from "@/assets/selo-consultoria-ml.avif";
import WhatsAppFloatingButton from "@/components/WhatsAppFloatingButton";

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
  const [showVerifyEmail, setShowVerifyEmail] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/primeiro-acesso", { replace: true });
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

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/primeiro-acesso`,
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          toast.error(t("auth:email_already_registered"));
        } else {
          toast.error(error.message);
        }
        return;
      }

      // Mark terms acceptance for sync on first login
      localStorage.setItem('mktp_pending_terms_consent', new Date().toISOString());

      if (data?.user && !data.user.email_confirmed_at) {
        setSignupEmail(email);
        setShowVerifyEmail(true);
      } else if (data?.session) {
        navigate("/primeiro-acesso", { replace: true });
      }
    } catch {
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
    <div className="h-screen overflow-hidden bg-background flex">
      {/* Left Column — matches Auth page pattern */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col justify-center gap-5 p-10 pl-12 pr-10 text-primary-foreground">
        {/* Background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,_hsl(223_47%_26%)_0%,_hsl(223_50%_14%)_100%)]" />

        {/* Faint grid texture */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `
            linear-gradient(hsl(210 40% 80%) 1px, transparent 1px),
            linear-gradient(90deg, hsl(210 40% 80%) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }} />

        {/* Clean hard edge */}
        <div className="absolute inset-y-0 right-0 w-px z-10 bg-border/20" />

        <div className="relative z-20">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-accent/90 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-4.5 h-4.5 text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">MKTP Fácil</h1>
          </div>

          {/* Hero text */}
          <div className="mb-4">
            <h2 className="text-[1.5rem] leading-[1.15] font-bold text-primary-foreground tracking-tight">
              Consultoria aplicada ao Mercado Livre
            </h2>
            <p className="text-primary-foreground/50 text-[13px] leading-relaxed mt-2">
              Sistema criado por consultor certificado que transforma práticas de consultoria em ferramentas para vendedores.
            </p>
          </div>

          {/* Benefit Cards */}
          <div className="space-y-2">
            <div className="bg-white/[0.06] rounded-lg px-4 py-3 border border-white/[0.06]">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <DollarSign className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <h3 className="font-medium text-[13px] text-primary-foreground/90">Descubra o lucro real de cada venda</h3>
                  <p className="text-[11px] text-primary-foreground/50 leading-relaxed mt-0.5">Pare de vender no escuro e entenda exatamente quanto sobra em cada produto considerando taxas, comissões e frete.</p>
                </div>
              </div>
            </div>
            <div className="bg-white/[0.06] rounded-lg px-4 py-3 border border-white/[0.06]">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Target className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <h3 className="font-medium text-[13px] text-primary-foreground/90">Tome decisões mais inteligentes nos anúncios</h3>
                  <p className="text-[11px] text-primary-foreground/50 leading-relaxed mt-0.5">Visualize desempenho, estrutura e posicionamento dos seus anúncios para vender mais sem aumentar custos.</p>
                </div>
              </div>
            </div>
            <div className="bg-white/[0.06] rounded-lg px-4 py-3 border border-white/[0.06]">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <TrendingUp className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <h3 className="font-medium text-[13px] text-primary-foreground/90">Tenha clareza total da sua operação</h3>
                  <p className="text-[11px] text-primary-foreground/50 leading-relaxed mt-0.5">Centralize vendas, custos e indicadores da sua loja em um único lugar para administrar seu negócio com segurança.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Authority Card — compact, matching Auth page */}
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

      {/* Right Column */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground tracking-tight">MKTP Fácil</span>
          </div>

          <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-6 sm:p-8">
            {showVerifyEmail ? (
              <VerifyEmailState email={signupEmail} t={t} />
            ) : (
              <>
                <div className="mb-5">
                  <h2 className="text-xl font-bold text-card-foreground tracking-tight">Crie sua conta</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    Comece a organizar sua operação no Mercado Livre.
                  </p>
                </div>

                <form onSubmit={handleSignup} className="space-y-3.5">
                  <FieldGroup label="Nome completo" id="name">
                    <Input
                      id="name"
                      type="text"
                      placeholder="Seu nome"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                      className="h-10"
                    />
                  </FieldGroup>

                  <FieldGroup label="E-mail" id="signup-email">
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="h-10"
                    />
                  </FieldGroup>

                  <FieldGroup label="Senha" id="signup-password">
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Crie uma senha segura"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        className="h-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FieldGroup>

                  <FieldGroup label="Confirmar senha" id="confirm-password">
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Repita sua senha"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="h-10"
                    />
                  </FieldGroup>

                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="terms"
                      checked={acceptTerms}
                      onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                      className="mt-0.5"
                    />
                    <label htmlFor="terms" className="text-[11px] text-muted-foreground leading-relaxed cursor-pointer">
                      Ao criar sua conta você concorda com nossos{" "}
                      <Link to="/termos-de-uso" className="text-primary hover:underline" target="_blank">
                        Termos de Serviço
                      </Link>{" "}
                      e{" "}
                      <Link to="/politica-de-privacidade" className="text-primary hover:underline" target="_blank">
                        Política de Privacidade
                      </Link>.
                    </label>
                  </div>

                  <Button type="submit" className="w-full h-10 text-sm font-medium" disabled={loading || !acceptTerms}>
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {loading ? "Criando conta..." : "Criar acesso"}
                  </Button>
                </form>

                {/* Login link */}
                <div className="mt-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Já tem uma conta?{" "}
                    <Link to="/auth" className="text-primary font-medium hover:underline">
                      Entrar
                    </Link>
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Copyright - mobile */}
          <p className="lg:hidden text-center text-xs text-muted-foreground mt-6">
            {t("auth:copyright", { year: currentYear })}
          </p>
        </div>
      </div>
    </div>
  );
};

/* ─── Subcomponents ─── */

function FieldGroup({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-foreground">{label}</Label>
      {children}
    </div>
  );
}

function VerifyEmailState({ email, t }: { email: string; t: any }) {
  const [countdown, setCountdown] = useState(30);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleResend = useCallback(async () => {
    if (!email || countdown > 0) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (error) throw error;
      toast.success('E-mail de verificação reenviado!');
      setCountdown(30);
    } catch (err: any) {
      toast.error(`Erro ao reenviar: ${err.message}`);
    } finally {
      setResending(false);
    }
  }, [email, countdown]);

  return (
    <>
    <div className="text-center space-y-4 py-6">
      <div className="flex justify-center">
        <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center">
          <MailCheck className="w-7 h-7 text-primary" />
        </div>
      </div>
      <h2 className="text-xl font-bold text-card-foreground">{t("auth:verify_email")}</h2>
      <p className="text-muted-foreground text-sm max-w-xs mx-auto">
        {t("auth:verify_email_description")}
      </p>
      {email && <p className="text-sm font-medium text-foreground">{email}</p>}

      {/* Spam/Promotions warning */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-left max-w-sm mx-auto">
        <p className="text-xs text-amber-800 dark:text-amber-200 font-medium mb-1">⚠️ Não encontrou o e-mail?</p>
        <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5 list-disc list-inside">
          <li>Verifique a pasta <strong>Spam</strong> ou <strong>Lixo eletrônico</strong></li>
          <li>No Gmail, cheque a aba <strong>Promoções</strong></li>
          <li>Aguarde até 2 minutos para o e-mail chegar</li>
        </ul>
      </div>
      
      <div className="pt-2">
        {countdown > 0 ? (
          <p className="text-sm text-muted-foreground">
            Reenviar em <span className="font-mono font-semibold text-foreground">{countdown}s</span>
          </p>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? (
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

      <Link to="/auth" className="text-sm text-primary hover:underline mt-4 inline-block">
        Ir para o login
      </Link>
    </div>
    <WhatsAppFloatingButton />
    </>
  );
}

export default CriarAcesso;
