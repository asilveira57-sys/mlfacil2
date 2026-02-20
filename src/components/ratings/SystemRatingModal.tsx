import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { StarRating } from './StarRating';
import {
  useMySystemRating,
  useUpsertSystemRating,
  useActiveConsentTemplate,
  useSubmitConsent,
  useCreateTestimonialCandidate,
} from '@/hooks/useRatings';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  userName?: string;
  userCompany?: string;
};

export function SystemRatingModal({ open, onOpenChange, userId, userName, userCompany }: Props) {
  const { data: existing } = useMySystemRating(userId);
  const upsert = useUpsertSystemRating();
  const { data: template } = useActiveConsentTemplate('testimonial_publication_v1');
  const submitConsent = useSubmitConsent();
  const createCandidate = useCreateTestimonialCandidate();

  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [consentLanding, setConsentLanding] = useState(false);
  const [consentSocial, setConsentSocial] = useState(false);
  const [showName, setShowName] = useState(true);
  const [showCompany, setShowCompany] = useState(true);
  const [showPhoto, setShowPhoto] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [displayCompany, setDisplayCompany] = useState('');

  useEffect(() => {
    if (existing) {
      setStars(existing.stars);
      setComment(existing.comment || '');
    }
  }, [existing]);

  useEffect(() => {
    setDisplayName(userName || '');
    setDisplayCompany(userCompany || '');
  }, [userName, userCompany]);

  const showConsentBlock = stars === 5;
  const hasConsent = consentLanding || consentSocial;
  const saving = upsert.isPending;

  const handleSubmit = async () => {
    if (stars < 1) return;
    try {
      const ratingResult = await upsert.mutateAsync({ userId, stars, comment });

      if (showConsentBlock && hasConsent && template) {
        const channels: string[] = [];
        if (consentLanding) channels.push('landing');
        if (consentSocial) channels.push('social');

        const consentResult = await submitConsent.mutateAsync({
          userId,
          templateId: template.id,
          consentKey: template.key,
          consentVersion: template.version,
          accepted: true,
          source: 'system_rating_modal',
          metadata: { channels, show_name: showName, show_company: showCompany, show_photo: showPhoto, display_name: displayName, display_company: displayCompany },
        });

        if (comment?.trim() && ratingResult?.id) {
          await createCandidate.mutateAsync({
            userId,
            sourceType: 'system_rating',
            sourceId: ratingResult.id,
            stars,
            text: comment,
            channels,
            consentId: consentResult.id,
          });
        }
      }

      toast.success('Avaliação salva com sucesso!');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar avaliação');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Avaliar o Sistema</DialogTitle>
          <DialogDescription>Como você avalia o Marketplace Fácil?</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex justify-center">
            <StarRating value={stars} onChange={setStars} size="lg" />
          </div>

          <Textarea
            placeholder="Conte um pouco da sua experiência (opcional, até 500 caracteres)"
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 500))}
            rows={3}
          />
          <p className="text-xs text-muted-foreground text-right">{comment.length}/500</p>

          {showConsentBlock && template && (
            <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
              <p className="text-sm font-medium">🎉 Obrigado pela nota máxima!</p>
              <p className="text-xs text-muted-foreground">{template.body}</p>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox id="c-landing" checked={consentLanding} onCheckedChange={(v) => setConsentLanding(!!v)} />
                  <Label htmlFor="c-landing" className="text-sm">Autorizo uso na landing page</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="c-social" checked={consentSocial} onCheckedChange={(v) => setConsentSocial(!!v)} />
                  <Label htmlFor="c-social" className="text-sm">Autorizo uso em mídias sociais</Label>
                </div>
              </div>

              {hasConsent && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground">Preferências de exibição</p>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <Checkbox id="s-name" checked={showName} onCheckedChange={(v) => setShowName(!!v)} />
                      <Label htmlFor="s-name" className="text-xs">Nome</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Checkbox id="s-company" checked={showCompany} onCheckedChange={(v) => setShowCompany(!!v)} />
                      <Label htmlFor="s-company" className="text-xs">Empresa</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Checkbox id="s-photo" checked={showPhoto} onCheckedChange={(v) => setShowPhoto(!!v)} />
                      <Label htmlFor="s-photo" className="text-xs">Foto</Label>
                    </div>
                  </div>
                  <Input placeholder="Nome para exibição" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-8 text-sm" />
                  <Input placeholder="Empresa para exibição" value={displayCompany} onChange={(e) => setDisplayCompany(e.target.value)} className="h-8 text-sm" />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={stars < 1 || saving}>
            {saving ? 'Salvando...' : existing ? 'Atualizar' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
