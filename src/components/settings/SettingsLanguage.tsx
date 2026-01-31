import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, SupportedLanguage } from '@/lib/i18n';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { cn } from '@/lib/utils';

export function SettingsLanguage() {
  const { t } = useTranslation();
  const { currentLanguage, changeLanguage } = useLanguagePreference();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          {t('settings:language.title')}
        </CardTitle>
        <CardDescription>
          {t('settings:language.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const label = LANGUAGE_LABELS[lang];
            const isActive = lang === currentLanguage;

            return (
              <Button
                key={lang}
                variant={isActive ? 'default' : 'outline'}
                className={cn(
                  'h-auto py-4 px-4 flex flex-col items-center gap-2 relative',
                  isActive && 'ring-2 ring-primary ring-offset-2'
                )}
                onClick={() => changeLanguage(lang)}
              >
                <span className="text-2xl">{label.flag}</span>
                <span className="font-medium">{label.label}</span>
                <span className="text-xs text-muted-foreground">({label.short})</span>
                {isActive && (
                  <Check className="absolute top-2 right-2 h-4 w-4" />
                )}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
