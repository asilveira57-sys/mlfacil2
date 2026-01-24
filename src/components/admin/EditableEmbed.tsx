import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, Video, Check, X } from 'lucide-react';
import { useSiteContentContext } from '@/contexts/SiteContentContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EditableEmbedProps {
  contentKey: string;
  className?: string;
  placeholder?: React.ReactNode;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^[a-zA-Z0-9_-]{11}$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1] || match[0];
  }
  return null;
}

export function EditableEmbed({ 
  contentKey, 
  className,
  placeholder
}: EditableEmbedProps) {
  const { getText, refresh } = useSiteContentContext();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);
  
  const storedUrl = getText(contentKey);
  const videoId = extractYouTubeId(storedUrl);
  const hasVideo = videoId && !storedUrl.startsWith('home.');

  const renderVideo = () => {
    if (!hasVideo) return null;
    return (
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video"
        className="absolute inset-0 w-full h-full"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  };

  const renderPlaceholder = () => (
    placeholder || (
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Play className="w-8 h-8 text-primary ml-1" />
          </div>
          <p className="text-muted-foreground text-sm">Vídeo de demonstração</p>
        </div>
      </div>
    )
  );

  // Non-admin: render video or placeholder
  if (roleLoading || !isAdmin) {
    return (
      <div className={cn("relative aspect-video bg-card border border-border rounded-2xl overflow-hidden", className)}>
        {hasVideo ? renderVideo() : renderPlaceholder()}
      </div>
    );
  }

  const handleSave = async () => {
    const id = extractYouTubeId(urlInput);
    if (!id) {
      toast.error('URL do YouTube inválida');
      return;
    }
    
    setSaving(true);
    try {
      const pagina = contentKey.split('.')[0] || 'home';
      const secao = contentKey.split('.')[1] || null;
      
      const { error } = await supabase
        .from('site_content')
        .upsert({
          chave: contentKey,
          texto: urlInput.trim(),
          pagina,
          secao,
          tipo: 'embed',
          status: 'ativo',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'chave'
        });

      if (error) throw error;

      await refresh();
      toast.success('Vídeo atualizado!');
      setOpen(false);
      setUrlInput('');
    } catch (error) {
      console.error('[EditableEmbed] Save error:', error);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div 
          className={cn(
            "relative aspect-video bg-card border border-border rounded-2xl overflow-hidden cursor-pointer group",
            "ring-2 ring-transparent hover:ring-primary/50 transition-all",
            className
          )}
        >
          {hasVideo ? renderVideo() : renderPlaceholder()}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <div className="text-white text-sm font-medium flex items-center gap-2">
              <Video className="w-5 h-5" />
              Trocar vídeo
            </div>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Incorporar vídeo do YouTube</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="youtube-url">URL do YouTube</Label>
            <Input
              id="youtube-url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Cole a URL do vídeo do YouTube que deseja exibir
            </p>
          </div>
          
          {urlInput && extractYouTubeId(urlInput) && (
            <div className="aspect-video rounded-lg overflow-hidden bg-muted">
              <iframe
                src={`https://www.youtube.com/embed/${extractYouTubeId(urlInput)}`}
                title="Preview"
                className="w-full h-full"
                frameBorder="0"
              />
            </div>
          )}
          
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              <X className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving || !urlInput.trim() || !extractYouTubeId(urlInput)}
            >
              <Check className="w-4 h-4 mr-1" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
