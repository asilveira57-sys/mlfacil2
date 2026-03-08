import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { NOTE_COLORS } from '@/types/notes';
import { useActiveModuleKey, MODULE_LABELS } from '@/hooks/useActiveModuleKey';

interface QuickPostItFormProps {
  onSubmit: (data: { title: string; content: string; colorHex: string; moduleKey: string }) => void;
  isSubmitting?: boolean;
}

export function QuickPostItForm({ onSubmit, isSubmitting }: QuickPostItFormProps) {
  const { t } = useTranslation('notes');
  const moduleKey = useActiveModuleKey();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [colorHex, setColorHex] = useState(NOTE_COLORS[0].hex);

  const moduleLabel = MODULE_LABELS[moduleKey] || moduleKey;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) return;
    onSubmit({ title: title.trim(), content: content.trim(), colorHex, moduleKey });
    setTitle('');
    setContent('');
    setColorHex(NOTE_COLORS[0].hex);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <StickyNote className="h-4 w-4" />
        <span>{t('postit.new_postit', { defaultValue: 'Novo Post-it' })}</span>
      </div>

      <Input
        placeholder={t('postit.title_placeholder', { defaultValue: 'Título...' })}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="text-sm"
        autoFocus
      />

      <Textarea
        placeholder={t('postit.content_placeholder', { defaultValue: 'Descrição rápida...' })}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
        className="text-sm resize-none"
      />

      {/* Color picker */}
      <div className="flex items-center gap-1.5">
        {NOTE_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            onClick={() => setColorHex(c.hex)}
            className={cn(
              'h-5 w-5 rounded-full border-2 transition-transform hover:scale-110',
              colorHex === c.hex ? 'border-foreground scale-110' : 'border-transparent'
            )}
            style={{ backgroundColor: c.hex }}
            title={c.label}
          />
        ))}
      </div>

      {/* Pin target info */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>📌</span>
        <span>
          {t('postit.pin_to_module', {
            defaultValue: 'Fixar em: {{module}}',
            module: moduleLabel,
          })}
        </span>
      </div>

      <Button
        type="submit"
        size="sm"
        className="w-full"
        disabled={isSubmitting || (!title.trim() && !content.trim())}
      >
        {isSubmitting
          ? t('postit.creating', { defaultValue: 'Criando...' })
          : t('postit.create_and_pin', { defaultValue: 'Criar e Fixar' })}
      </Button>
    </form>
  );
}
