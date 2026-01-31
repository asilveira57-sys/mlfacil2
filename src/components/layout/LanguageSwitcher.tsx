import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, SupportedLanguage } from '@/lib/i18n';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  variant?: 'icon' | 'compact' | 'full';
  className?: string;
}

export function LanguageSwitcher({ variant = 'compact', className }: LanguageSwitcherProps) {
  const { currentLanguage, changeLanguage } = useLanguagePreference();
  
  const currentLabel = LANGUAGE_LABELS[currentLanguage as SupportedLanguage] || LANGUAGE_LABELS['pt-BR'];

  const handleSelect = (lang: SupportedLanguage) => {
    if (lang !== currentLanguage) {
      changeLanguage(lang);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === 'icon' ? 'icon' : 'sm'}
          className={cn(
            'gap-1.5 text-muted-foreground hover:text-foreground',
            variant === 'icon' && 'h-8 w-8',
            className
          )}
        >
          {variant === 'icon' ? (
            <Globe className="h-4 w-4" />
          ) : (
            <>
              <Globe className="h-4 w-4" />
              <span className="text-xs font-medium">{currentLabel.short}</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const label = LANGUAGE_LABELS[lang];
          const isActive = lang === currentLanguage;
          
          return (
            <DropdownMenuItem
              key={lang}
              onClick={() => handleSelect(lang)}
              className={cn(
                'flex items-center gap-2 cursor-pointer',
                isActive && 'bg-accent'
              )}
            >
              <span className="text-base">{label.flag}</span>
              <span className="flex-1">{label.label}</span>
              {isActive && (
                <span className="text-xs text-muted-foreground">✓</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
