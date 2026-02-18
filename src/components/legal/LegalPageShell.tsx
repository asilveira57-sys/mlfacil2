import { useState, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSiteContentContext } from '@/contexts/SiteContentContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SeoHead } from '@/components/seo/SeoHead';

interface LegalPageProps {
  contentKey: string;
  defaultContent: string;
  editLabel: string;
  successMessage: string;
}

export function renderMarkdown(text: string) {
  return text
    .split('\n\n')
    .map((block, i) => {
      const trimmed = block.trim();
      if (!trimmed) return null;

      if (trimmed.startsWith('# ')) {
        return <h1 key={i} className="text-3xl font-bold text-foreground mb-6">{trimmed.slice(2)}</h1>;
      }
      if (trimmed.startsWith('## ')) {
        return <h2 key={i} className="text-xl font-semibold text-foreground mt-8 mb-3">{trimmed.slice(3)}</h2>;
      }
      if (trimmed.startsWith('### ')) {
        return <h3 key={i} className="text-lg font-medium text-foreground mt-6 mb-2">{trimmed.slice(4)}</h3>;
      }

      if (trimmed.includes('\n- ')) {
        const lines = trimmed.split('\n');
        const intro = lines[0].startsWith('- ') ? null : lines.shift();
        const items = (intro ? lines : [lines[0], ...lines.slice(1)])
          .filter(l => l.startsWith('- '))
          .map(l => l.slice(2));
        return (
          <div key={i} className="mb-4">
            {intro && <p className="text-muted-foreground mb-2">{renderInline(intro)}</p>}
            <ul className="list-disc pl-6 space-y-1">
              {items.map((item, j) => (
                <li key={j} className="text-muted-foreground">{renderInline(item)}</li>
              ))}
            </ul>
          </div>
        );
      }

      return <p key={i} className="text-muted-foreground mb-4 leading-relaxed">{renderInline(trimmed)}</p>;
    })
    .filter(Boolean);
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function LegalPageShell({ contentKey, defaultContent, editLabel, successMessage }: LegalPageProps) {
  const { getText, refresh } = useSiteContentContext();
  const { isAdmin } = useUserRole();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const contentFromDb = getText(contentKey);
  const hasDbContent = contentFromDb !== contentKey;
  const pageContent = hasDbContent ? contentFromDb : defaultContent;

  const pagina = contentKey.split('.')[0];
  const secao = contentKey.split('.')[1] || 'content';

  const handleEdit = () => {
    setEditValue(pageContent);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('site_content')
        .upsert({
          chave: contentKey,
          texto: editValue,
          pagina,
          secao,
          tipo: 'texto',
          status: 'ativo',
          updated_at: new Date().toISOString()
        }, { onConflict: 'chave' });

      if (error) throw error;
      await refresh();
      setEditing(false);
      toast.success(successMessage);
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SeoHead />
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card">
          <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Voltar ao início
            </Link>
            {isAdmin && !editing && (
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Pencil className="w-4 h-4 mr-2" />
                {editLabel}
              </Button>
            )}
          </div>
        </header>

        <main className="container mx-auto px-4 md:px-6 py-12 max-w-3xl">
          {editing ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Editando conteúdo</h2>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Use Markdown: # Título, ## Subtítulo, **negrito**, - item de lista
              </p>
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="min-h-[600px] font-mono text-sm"
              />
            </div>
          ) : (
            <article className="prose prose-sm max-w-none">
              {renderMarkdown(pageContent)}
            </article>
          )}
        </main>

        <footer className="border-t border-border bg-card py-6">
          <div className="container mx-auto px-4 md:px-6 text-center">
            <p className="text-sm text-muted-foreground">
              © 2025 MKTP Fácil. Todos os direitos reservados.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
