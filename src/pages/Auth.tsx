import { Auth as SupabaseAuth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart3, TrendingUp, Target, Zap } from "lucide-react";

const Auth = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    // Check session on mount (once)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Redirect to dashboard on sign in
      if (event === "SIGNED_IN" && session) {
        navigate("/dashboard");
      }
      // Redirect to home page on sign out
      if (event === "SIGNED_OUT") {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Build localization object based on current language
  const getLocalization = () => {
    return {
      variables: {
        sign_in: {
          email_label: t('auth:email'),
          password_label: t('auth:password'),
          email_input_placeholder: t('auth:email_placeholder', { defaultValue: 'seu@email.com' }),
          password_input_placeholder: t('auth:password_placeholder', { defaultValue: 'Sua senha' }),
          button_label: t('auth:sign_in'),
          loading_button_label: t('auth:signing_in', { defaultValue: 'Entrando...' }),
          social_provider_text: t('auth:or_continue_with') + " {{provider}}",
          link_text: t('auth:has_account') + " " + t('auth:sign_in'),
        },
        sign_up: {
          email_label: t('auth:email'),
          password_label: t('auth:password'),
          email_input_placeholder: t('auth:email_placeholder', { defaultValue: 'seu@email.com' }),
          password_input_placeholder: t('auth:password_placeholder', { defaultValue: 'Escolha uma senha' }),
          button_label: t('auth:create_account'),
          loading_button_label: t('auth:creating_account', { defaultValue: 'Criando conta...' }),
          social_provider_text: t('auth:or_continue_with') + " {{provider}}",
          link_text: t('auth:no_account') + " " + t('auth:sign_up'),
          confirmation_text: t('auth:check_inbox'),
        },
        forgotten_password: {
          email_label: t('auth:email'),
          password_label: t('auth:password'),
          email_input_placeholder: t('auth:email_placeholder', { defaultValue: 'seu@email.com' }),
          button_label: t('auth:reset_password'),
          loading_button_label: t('auth:sending_reset', { defaultValue: 'Enviando instruções...' }),
          link_text: t('auth:forgot_password'),
          confirmation_text: t('auth:check_inbox'),
        },
      },
    };
  };

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
                <h3 className="text-xl font-semibold mb-2">{t('auth:features.complete_analysis_title')}</h3>
                <p className="text-primary-foreground/80 leading-relaxed">
                  {t('auth:features.complete_analysis_desc')}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-primary-light/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">{t('auth:features.ranking_title')}</h3>
                <p className="text-primary-foreground/80 leading-relaxed">
                  {t('auth:features.ranking_desc')}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-primary-light/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">{t('auth:features.integration_title')}</h3>
                <p className="text-primary-foreground/80 leading-relaxed">
                  {t('auth:features.integration_desc')}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="text-sm text-primary-foreground/60">
          {t('auth:copyright', { year: currentYear })}
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
                {t('auth:login_title')}
              </h2>
              <p className="text-muted-foreground">
                {t('auth:login_subtitle')}
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
              localization={getLocalization()}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
