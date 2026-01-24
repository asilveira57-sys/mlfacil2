import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImageIcon, Upload, Link, Check, X, Loader2 } from 'lucide-react';
import { useSiteContentContext } from '@/contexts/SiteContentContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useDropzone } from 'react-dropzone';

interface EditableImageProps {
  contentKey: string;
  className?: string;
  alt?: string;
  placeholder?: React.ReactNode;
  aspectRatio?: 'auto' | 'video' | 'square';
}

export function EditableImage({ 
  contentKey, 
  className,
  alt = 'Imagem',
  placeholder,
  aspectRatio = 'auto'
}: EditableImageProps) {
  const { getText, refresh } = useSiteContentContext();
  const { isAdmin, loading: roleLoading, userId } = useUserRole();
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const imageUrl = getText(contentKey);
  const hasImage = imageUrl && !imageUrl.startsWith('home.');

  const aspectClasses = {
    auto: '',
    video: 'aspect-video',
    square: 'aspect-square'
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${contentKey.replace(/\./g, '-')}-${Date.now()}.${fileExt}`;
      const filePath = `site-content/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('public-assets')
        .getPublicUrl(filePath);

      await saveImageUrl(publicUrl);
    } catch (error) {
      console.error('[EditableImage] Upload error:', error);
      toast.error('Erro ao fazer upload da imagem');
    } finally {
      setUploading(false);
    }
  }, [contentKey]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']
    },
    maxFiles: 1,
    disabled: uploading
  });

  const saveImageUrl = async (url: string) => {
    setSaving(true);
    try {
      const pagina = contentKey.split('.')[0] || 'home';
      const secao = contentKey.split('.')[1] || null;
      
      const { error } = await supabase
        .from('site_content')
        .upsert({
          chave: contentKey,
          texto: url,
          pagina,
          secao,
          tipo: 'imagem',
          status: 'ativo',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'chave'
        });

      if (error) throw error;

      await refresh();
      toast.success('Imagem atualizada!');
      setOpen(false);
      setUrlInput('');
    } catch (error) {
      console.error('[EditableImage] Save error:', error);
      toast.error('Erro ao salvar imagem');
    } finally {
      setSaving(false);
    }
  };

  const handleUrlSave = () => {
    if (!urlInput.trim()) return;
    saveImageUrl(urlInput.trim());
  };

  // Non-admin: render image or placeholder
  if (roleLoading || !isAdmin) {
    if (hasImage) {
      return <img src={imageUrl} alt={alt} className={cn(aspectClasses[aspectRatio], className)} />;
    }
    return <>{placeholder}</>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div 
          className={cn(
            "cursor-pointer relative group overflow-hidden rounded-lg",
            "ring-2 ring-transparent hover:ring-primary/50 transition-all",
            aspectClasses[aspectRatio],
            className
          )}
        >
          {hasImage ? (
            <img src={imageUrl} alt={alt} className="w-full h-full object-cover" />
          ) : (
            placeholder || (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
              </div>
            )
          )}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="text-white text-sm font-medium flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Trocar imagem
            </div>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar imagem</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="upload" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="url">
              <Link className="w-4 h-4 mr-2" />
              URL
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="mt-4">
            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                uploading && "opacity-50 cursor-not-allowed"
              )}
            >
              <input {...getInputProps()} />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Enviando...</p>
                </div>
              ) : isDragActive ? (
                <p className="text-primary">Solte a imagem aqui...</p>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Arraste uma imagem ou clique para selecionar
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    PNG, JPG, GIF, WebP ou SVG
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="url" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="image-url">URL da imagem</Label>
              <Input
                id="image-url"
                placeholder="https://exemplo.com/imagem.jpg"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                <X className="w-4 h-4 mr-1" />
                Cancelar
              </Button>
              <Button onClick={handleUrlSave} disabled={saving || !urlInput.trim()}>
                <Check className="w-4 h-4 mr-1" />
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        {hasImage && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-2">Imagem atual:</p>
            <img src={imageUrl} alt="Preview" className="w-full max-h-32 object-contain rounded" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
