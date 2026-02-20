import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, Share2, Bookmark, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConsultantTipBySlug, useToggleTipInteraction, useUserTipInteractions, useRegisterTipView } from '@/hooks/useConsultantTips';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

const NIVEL_LABELS: Record<string, string> = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
};

export default function PublicTipPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: tip, isLoading } = useConsultantTipBySlug(slug ?? '');
  const { data: interactions } = useUserTipInteractions(tip?.id);
  const toggle = useToggleTipInteraction();
  const registerView = useRegisterTipView();
  const { toast } = useToast();

  useEffect(() => {
    if (tip?.id) registerView(tip.id);
  }, [tip?.id, registerView]);

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).catch(() => {});
    toast({ title: 'Link copiado!' });
    if (tip?.id) toggle.mutate({ tipId: tip.id, tipo: 'compartilhar' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando dica...</div>
      </div>
    );
  }

  if (!tip) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Sparkles className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">Dica não encontrada.</p>
        <Link to="/">
          <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
        </Link>
      </div>
    );
  }

  const body = tip.conteudo_json?.body ?? '';
  const highlights = tip.conteudo_json?.highlights ?? [];

  return (
    <>
      {/* SEO Meta tags via document.title + meta */}
      {typeof document !== 'undefined' && (document.title = `${tip.titulo} | Marketplace Fácil`)}

      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Início
              </Button>
            </Link>
            <span className="text-muted-foreground/50">|</span>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Dica de Consultor</span>
            </div>
          </div>
        </div>

        {/* Card 2:3 */}
        <div className="max-w-sm mx-auto px-4 py-8">
          <div className="rounded-2xl border border-border shadow-lg overflow-hidden bg-card">
            {/* Header strip */}
            <div className="px-6 py-4 bg-primary/5 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-primary uppercase tracking-widest">
                  Dica de Consultor
                </span>
                {tip.nivel && (
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {NIVEL_LABELS[tip.nivel]}
                  </Badge>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4" style={{ minHeight: 420 }}>
              {tip.categoria && (
                <span className="text-xs text-muted-foreground">{tip.categoria}</span>
              )}
              <h1 className="text-xl font-bold text-foreground leading-snug">{tip.titulo}</h1>

              {body && (
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              )}

              {highlights.length > 0 && (
                <ul className="space-y-2 mt-4">
                  {highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Tags */}
              {tip.tags && tip.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {tip.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">#{tag}</Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-border/40 bg-muted/20 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className={cn('gap-2', interactions?.liked && 'text-rose-500')}
                onClick={() => tip.id && toggle.mutate({ tipId: tip.id, tipo: 'like' })}
              >
                <Heart className={cn('h-4 w-4', interactions?.liked && 'fill-rose-500')} />
                Gostei
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn('gap-2', interactions?.saved && 'text-primary')}
                onClick={() => tip.id && toggle.mutate({ tipId: tip.id, tipo: 'salvar' })}
              >
                <Bookmark className={cn('h-4 w-4', interactions?.saved && 'fill-primary')} />
                Salvar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 ml-auto"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4" />
                Compartilhar
              </Button>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground mb-2">
              Gostou da dica? Acesse o Marketplace Fácil
            </p>
            <Link to="/auth">
              <Button size="sm">Criar conta grátis</Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
