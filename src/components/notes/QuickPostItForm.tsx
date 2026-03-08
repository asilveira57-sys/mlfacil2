import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StickyNote, Paperclip, X as XIcon, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { NOTE_COLORS } from '@/types/notes';
import { useActiveModuleKey, MODULE_LABELS, getAvailableModules } from '@/hooks/useActiveModuleKey';

interface QuickPostItFormProps {
  onSubmit: (data: { title: string; content: string; colorHex: string; moduleKey: string; files?: File[] }) => void;
  isSubmitting?: boolean;
}

export function QuickPostItForm({ onSubmit, isSubmitting }: QuickPostItFormProps) {
  const { t } = useTranslation('notes');
  const moduleKey = useActiveModuleKey();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [colorHex, setColorHex] = useState<string>(NOTE_COLORS[0].hex);
  const [selectedModule, setSelectedModule] = useState<string>(moduleKey);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const modules = getAvailableModules();

  // Handle paste for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();
    const newFiles: File[] = [];
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) newFiles.push(file);
    }
    setPendingFiles((prev) => [...prev, ...newFiles]);
  }, []);

  // Handle file selection
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles((prev) => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim() && pendingFiles.length === 0) return;
    onSubmit({
      title: title.trim(),
      content: content.trim(),
      colorHex,
      moduleKey: selectedModule,
      files: pendingFiles.length > 0 ? pendingFiles : undefined,
    });
    setTitle('');
    setContent('');
    setColorHex(NOTE_COLORS[0].hex);
    setSelectedModule(moduleKey);
    setPendingFiles([]);
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
        onPaste={handlePaste}
        rows={2}
        className="text-sm resize-none"
      />

      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pendingFiles.map((file, i) => (
            <div
              key={i}
              className="relative group flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs text-muted-foreground"
            >
              {file.type.startsWith('image/') ? (
                <ImageIcon className="h-3 w-3 shrink-0" />
              ) : (
                <Paperclip className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate max-w-[100px]">{file.name}</span>
              <button
                type="button"
                onClick={() => removePendingFile(i)}
                className="ml-0.5 text-muted-foreground hover:text-destructive"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Color picker + attach button */}
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
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={t('actions.upload_image', { defaultValue: 'Inserir imagem' })}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Module selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">📌</span>
        <Select value={selectedModule} onValueChange={setSelectedModule}>
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__global__">
              {t('postit.global', { defaultValue: 'Geral (todos os módulos)' })}
            </SelectItem>
            {modules.map((m) => (
              <SelectItem key={m.key} value={m.key}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="submit"
        size="sm"
        className="w-full"
        disabled={isSubmitting || (!title.trim() && !content.trim() && pendingFiles.length === 0)}
      >
        {isSubmitting
          ? t('postit.creating', { defaultValue: 'Criando...' })
          : t('postit.create_and_pin', { defaultValue: 'Criar e Fixar' })}
      </Button>
    </form>
  );
}
