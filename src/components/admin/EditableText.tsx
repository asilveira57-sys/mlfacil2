import { useState, useEffect, ElementType } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Check, X } from 'lucide-react';
import { useSiteContentContext } from '@/contexts/SiteContentContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EditableTextProps {
  contentKey: string;
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'div';
  className?: string;
  multiline?: boolean;
  children?: React.ReactNode;
}

export function EditableText({ 
  contentKey, 
  as = 'span', 
  className,
  multiline = false,
  children
}: EditableTextProps) {
  const { getText, refresh, content } = useSiteContentContext();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  
  const displayText = getText(contentKey);
  
  useEffect(() => {
    setValue(displayText);
  }, [displayText]);
  
  const Tag = as as ElementType;

  const hasDbOverride = contentKey in content;

  // Non-admin: render DB override if available, otherwise children (i18n), otherwise default
  if (roleLoading || !isAdmin) {
    return <Tag className={className}>{(hasDbOverride ? displayText : children) || displayText}</Tag>;
  }

  const handleSave = async () => {
    if (value === displayText) {
      setOpen(false);
      return;
    }
    
    setSaving(true);
    try {
      // Extract pagina from contentKey (e.g., "home.hero.title" -> "home")
      const pagina = contentKey.split('.')[0] || 'home';
      const secao = contentKey.split('.')[1] || null;
      
      // Upsert into site_content
      const { error } = await supabase
        .from('site_content')
        .upsert({
          chave: contentKey,
          texto: value,
          pagina,
          secao,
          tipo: 'texto',
          status: 'ativo',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'chave'
        });

      if (error) throw error;

      await refresh();
      toast.success('Texto atualizado!');
      setOpen(false);
    } catch (error) {
      console.error('[EditableText] Save error:', error);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(displayText);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Tag 
          className={cn(
            className, 
            "cursor-pointer relative group inline-block",
            "hover:ring-2 hover:ring-primary/50 hover:ring-offset-2 rounded transition-all"
          )}
        >
          {(hasDbOverride ? displayText : children) || displayText}
          <Pencil className="absolute -right-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
        </Tag>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground font-mono truncate">
            {contentKey}
          </div>
          {multiline ? (
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={4}
              className="resize-none"
            />
          ) : (
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          )}
          <div className="flex gap-2 justify-end">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleCancel}
              disabled={saving}
            >
              <X className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave}
              disabled={saving}
            >
              <Check className="w-4 h-4 mr-1" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
