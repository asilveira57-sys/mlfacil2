import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StickyNote, Paperclip, X as XIcon, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  const [pastedImages, setPastedImages] = useState<{ file: File; preview: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const modules = getAvailableModules();

  // Handle paste for images — capture and show preview
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) {
        const preview = URL.createObjectURL(file);
        setPastedImages((prev) => [...prev, { file, preview }]);
        setPendingFiles((prev) => [...prev, file]);
      }
    }
  }, []);

  // Handle file selection
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const preview = URL.createObjectURL(file);
        setPastedImages((prev) => [...prev, { file, preview }]);
      }
    }
    setPendingFiles((prev) => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
    setPastedImages((prev) => {
      const fileToRemove = pendingFiles[index];
      return prev.filter((p) => p.file !== fileToRemove);
    });
  }, [pendingFiles]);

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
    // Cleanup previews
    pastedImages.forEach((p) => URL.revokeObjectURL(p.preview));
    setTitle('');
    setContent('');
    setColorHex(NOTE_COLORS[0].hex);
    setSelectedModule(moduleKey);
    setPendingFiles([]);
    setPastedImages([]);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-no-drag>
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
        rows={3}
        className="text-sm resize-none"
      />

      {/* Pasted image previews */}
      {pastedImages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pastedImages.map((img, i) => (
            <div key={i} className="relative group">
              <img
                src={img.preview}
                alt="Preview"
                className="h-16 w-16 object-cover rounded border border-border"
              />
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(img.preview);
                  setPastedImages((prev) => prev.filter((_, idx) => idx !== i));
                  setPendingFiles((prev) => prev.filter((f) => f !== img.file));
                }}
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <XIcon className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Non-image file previews */}
      {pendingFiles.filter((f) => !f.type.startsWith('image/')).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pendingFiles.map((file, i) => {
            if (file.type.startsWith('image/')) return null;
            return (
              <div
                key={i}
                className="relative group flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs text-muted-foreground"
              >
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[100px]">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="ml-0.5 text-muted-foreground hover:text-destructive"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            );
          })}
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
          title={t('actions.upload_image', { defaultValue: 'Inserir imagem / anexo' })}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Module selector with scroll */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">📌</span>
        <Select value={selectedModule} onValueChange={setSelectedModule}>
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[200px]">
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
