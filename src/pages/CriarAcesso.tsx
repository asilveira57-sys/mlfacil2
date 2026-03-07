import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Eye, EyeOff, Loader2, MailCheck, DollarSign, Target, BarChart2, Award, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import consultantPhoto from "@/assets/consultant-photo.png";

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
        if (error.message.includes("already registered")) {
          toast.error(t("auth:email_already_registered"));
        } else {
          toast.error(error.message);
        }
        return;
      }

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
    <div className="min-h-screen flex bg-background">
      {/* Left Column */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between p-12 xl:p-16"
        style={{
          background: "linear-gradient(165deg, hsl(223 47% 18%), hsl(223 50% 28%), hsl(223 45% 22%))",
        }}
      >
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative z-10 space-y-12">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-white tracking-tight">MKTP Fácil</span>
          </div>

          {/* Hero text */}
          <div className="space-y-5 max-w-md">
            <h1 className="text-[2.5rem] leading-[1.1] font-bold text-white tracking-tight">
              Consultoria aplicada ao Mercado Livre
            </h1>
            <p className="text-white/60 text-base leading-relaxed">
              Sistema criado por consultor certificado que transforma práticas de consultoria em ferramentas para vendedores.
            </p>
          </div>

          {/* Benefits */}
          <div className="space-y-5">
            {[
              { icon: DollarSign, text: "Lucro real por produto" },
              { icon: Target, text: "Estratégia para anúncios" },
              { icon: BarChart2, text: "Dados claros da operação" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-accent-light" style={{ color: "hsl(189 85% 55%)" }} />
                </div>
                <span className="text-white/80 text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Authority block */}
        <div className="relative z-10 flex items-center gap-4 pt-8 border-t border-white/10">
          <img
            src={consultantPhoto}
            alt="Consultor certificado"
            className="w-14 h-14 rounded-full object-cover ring-2 ring-white/20"
          />
          <div>
            <p className="text-white text-sm font-medium">Consultor certificado do Mercado Livre</p>
            <p className="text-white/50 text-xs mt-0.5">14 anos vendendo na plataforma</p>
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="w-full lg:w-[55%] flex items-center justify-center p-6 sm:p-8 lg:p-12">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground tracking-tight">MKTP Fácil</span>
          </div>

          <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-8 sm:p-10">
            {showVerifyEmail ? (
              <VerifyEmailState email={signupEmail} t={t} />
            ) : (
              <>
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-card-foreground tracking-tight">Crie sua conta</h2>
                  <p className="text-muted-foreground text-sm mt-1.5">
                    Comece a organizar sua operação no Mercado Livre.
                  </p>
                </div>

                <form onSubmit={handleSignup} className="space-y-5">
                  <FieldGroup label="Nome completo" id="name">
                    <Input
                      id="name"
                      type="text"
                      placeholder="Seu nome"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                      className="h-11"
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
                      className="h-11"
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
                        className="h-11 pr-10"
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
                      className="h-11"
                    />
                  </FieldGroup>

                  <div className="flex items-start gap-2.5 pt-1">
                    <Checkbox
                      id="terms"
                      checked={acceptTerms}
                      onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                      className="mt-0.5"
                    />
                    <label htmlFor="terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
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

                  <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={loading || !acceptTerms}>
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {loading ? "Criando conta..." : "Criar acesso"}
                  </Button>
                </form>

                {/* Trust text */}
                <p className="text-center text-xs text-muted-foreground mt-4">
                  Cadastro rápido e seguro.
                </p>

                {/* Authority badges */}
                <div className="flex items-center justify-center gap-4 mt-5 pt-5 border-t border-border/50">
                  <div className="flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">Consultor certificado</span>
                  </div>
                  <div className="w-px h-3 bg-border" />
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">14 anos de mercado</span>
                  </div>
                </div>

                {/* Login link */}
                <div className="mt-6 text-center">
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
  return (
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
      <Link to="/auth" className="text-sm text-primary hover:underline mt-4 inline-block">
        Ir para o login
      </Link>
    </div>
  );
}

export default CriarAcesso;
