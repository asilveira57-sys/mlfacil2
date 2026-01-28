import { Auth as SupabaseAuth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, TrendingUp, Target, Zap } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check session on mount (once)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    // Listen for auth state changes - only react to actual sign-in events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // CRITICAL: Only navigate on explicit SIGNED_IN, not TOKEN_REFRESHED or other events
      if (event === "SIGNED_IN" && session) {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-primary p-12 flex-col justify-between text-primary-foreground">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center">
              <BarChart3 className="w-7 h-7" />
            </div>
            <h1 className="text-3xl font-bold">ML Analyzer Pro</h1>
          </div>
          
          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-primary-light/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Análise Completa de Anúncios</h3>
                <p className="text-primary-foreground/80 leading-relaxed">
                  Obtenha insights profundos sobre performance, estoque, qualidade e concorrência dos seus produtos no Mercado Livre.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-primary-light/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Monitoramento de Ranking</h3>
                <p className="text-primary-foreground/80 leading-relaxed">
                  Acompanhe suas posições nas buscas, analise palavras-chave e monitore a concorrência em tempo real.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-primary-light/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Integração Automática</h3>
                <p className="text-primary-foreground/80 leading-relaxed">
                  Extensão do Chrome que funciona diretamente nas páginas do Mercado Livre, sem necessidade de copiar e colar.
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="text-sm text-primary-foreground/60">
          © 2024 ML Analyzer Pro. Ferramenta profissional para vendedores do Mercado Livre.
        </div>
      </div>

      {/* Right Side - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
                <BarChart3 className="w-7 h-7 text-primary-foreground" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">ML Analyzer Pro</h1>
            </div>
          </div>

          <div className="bg-card p-8 rounded-2xl shadow-elevated border border-border">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-card-foreground mb-2">
                Bem-vindo de volta
              </h2>
              <p className="text-muted-foreground">
                Entre com sua conta ou crie uma nova para começar
              </p>
            </div>

            <SupabaseAuth
              supabaseClient={supabase}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: "hsl(223 47% 23%)",
                      brandAccent: "hsl(223 45% 35%)",
                      brandButtonText: "hsl(210 40% 98%)",
                      defaultButtonBackground: "hsl(210 40% 96%)",
                      defaultButtonBackgroundHover: "hsl(210 40% 93%)",
                      defaultButtonBorder: "hsl(214 32% 91%)",
                      defaultButtonText: "hsl(222 47% 11%)",
                      dividerBackground: "hsl(214 32% 91%)",
                      inputBackground: "hsl(0 0% 100%)",
                      inputBorder: "hsl(214 32% 91%)",
                      inputBorderHover: "hsl(223 47% 23%)",
                      inputBorderFocus: "hsl(223 47% 23%)",
                      inputText: "hsl(222 47% 11%)",
                      inputLabelText: "hsl(215 16% 47%)",
                      inputPlaceholder: "hsl(215 16% 47%)",
                    },
                    space: {
                      inputPadding: "12px",
                      buttonPadding: "12px 16px",
                    },
                    borderWidths: {
                      buttonBorderWidth: "1px",
                      inputBorderWidth: "1px",
                    },
                    radii: {
                      borderRadiusButton: "0.75rem",
                      buttonBorderRadius: "0.75rem",
                      inputBorderRadius: "0.75rem",
                    },
                  },
                },
                className: {
                  button: "font-medium",
                  input: "font-normal",
                },
              }}
              providers={[]}
              redirectTo={`${window.location.origin}/dashboard`}
              localization={{
                variables: {
                  sign_in: {
                    email_label: "Email",
                    password_label: "Senha",
                    email_input_placeholder: "seu@email.com",
                    password_input_placeholder: "Sua senha",
                    button_label: "Entrar",
                    loading_button_label: "Entrando...",
                    social_provider_text: "Entrar com {{provider}}",
                    link_text: "Já tem uma conta? Entre",
                  },
                  sign_up: {
                    email_label: "Email",
                    password_label: "Senha",
                    email_input_placeholder: "seu@email.com",
                    password_input_placeholder: "Escolha uma senha",
                    button_label: "Criar conta",
                    loading_button_label: "Criando conta...",
                    social_provider_text: "Criar conta com {{provider}}",
                    link_text: "Não tem uma conta? Crie uma",
                    confirmation_text: "Verifique seu email para confirmar",
                  },
                  forgotten_password: {
                    email_label: "Email",
                    password_label: "Senha",
                    email_input_placeholder: "seu@email.com",
                    button_label: "Enviar instruções",
                    loading_button_label: "Enviando instruções...",
                    link_text: "Esqueceu sua senha?",
                    confirmation_text: "Verifique seu email para redefinir sua senha",
                  },
                },
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
