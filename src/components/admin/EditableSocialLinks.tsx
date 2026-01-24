import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Twitter, Linkedin, Instagram, Youtube, Check, X, Settings } from 'lucide-react';
import { useSiteContentContext } from '@/contexts/SiteContentContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SocialLink {
  key: string;
  icon: React.ElementType;
  label: string;
  placeholder: string;
}

const socialLinks: SocialLink[] = [
  { key: 'home.footer.social_twitter', icon: Twitter, label: 'Twitter / X', placeholder: 'https://twitter.com/...' },
  { key: 'home.footer.social_linkedin', icon: Linkedin, label: 'LinkedIn', placeholder: 'https://linkedin.com/company/...' },
  { key: 'home.footer.social_instagram', icon: Instagram, label: 'Instagram', placeholder: 'https://instagram.com/...' },
  { key: 'home.footer.social_youtube', icon: Youtube, label: 'YouTube', placeholder: 'https://youtube.com/@...' },
];

interface EditableSocialLinksProps {
  className?: string;
}

export function EditableSocialLinks({ className }: EditableSocialLinksProps) {
  const { getText, refresh } = useSiteContentContext();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const initial: Record<string, string> = {};
    socialLinks.forEach(link => {
      const val = getText(link.key);
      initial[link.key] = val.startsWith('home.') ? '' : val;
    });
    setValues(initial);
  }, [getText]);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const link of socialLinks) {
        const pagina = link.key.split('.')[0] || 'home';
        const secao = link.key.split('.')[1] || null;
        
        const { error } = await supabase
          .from('site_content')
          .upsert({
            chave: link.key,
            texto: values[link.key] || '',
            pagina,
            secao,
            tipo: 'link',
            status: 'ativo',
            updated_at: new Date().toISOString()
          }, { onConflict: 'chave' });
        if (error) throw error;
      }

      await refresh();
      toast.success('Links atualizados!');
      setOpen(false);
    } catch (error) {
      console.error('[EditableSocialLinks] Save error:', error);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const renderIcons = () => (
    <div className={cn("flex items-center gap-3", className)}>
      {socialLinks.map(link => {
        const url = getText(link.key);
        const hasUrl = url && !url.startsWith('home.');
        const Icon = link.icon;
        
        if (!hasUrl && !isAdmin) return null;
        
        return (
          <a
            key={link.key}
            href={hasUrl ? url : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="w-10 h-10 rounded-full bg-muted hover:bg-primary/10 flex items-center justify-center transition-colors"
            onClick={(e) => !hasUrl && e.preventDefault()}
          >
            <Icon className="w-5 h-5 text-muted-foreground" />
          </a>
        );
      })}
    </div>
  );

  // Non-admin: just render icons
  if (roleLoading || !isAdmin) {
    return renderIcons();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="relative group cursor-pointer">
          {renderIcons()}
          <div className="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <Settings className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar redes sociais</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {socialLinks.map(link => {
            const Icon = link.icon;
            return (
              <div key={link.key} className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {link.label}
                </Label>
                <Input
                  placeholder={link.placeholder}
                  value={values[link.key] || ''}
                  onChange={(e) => setValues(prev => ({ ...prev, [link.key]: e.target.value }))}
                />
              </div>
            );
          })}
          
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              <X className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Check className="w-4 h-4 mr-1" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
