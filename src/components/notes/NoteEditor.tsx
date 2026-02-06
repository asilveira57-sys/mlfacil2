import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Pin,
  Send,
  Archive,
  ImagePlus,
  Check,
  Loader2,
  Bold,
  Italic,
  List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { NOTE_COLORS } from '@/types/notes';
import type { Note } from '@/types/notes';

interface NoteEditorProps {
  note: Note;
  isPinned?: boolean;
  isSaving?: boolean;
  onBack: () => void;
  onUpdate: (updates: Partial<Note>) => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onSendToTasks?: () => void;
  onArchive?: () => void;
  onPasteImage?: (data: DataTransfer) => void;
  onUploadImage?: (file: File) => void;
}

export function NoteEditor({
  note,
  isPinned,
  isSaving,
  onBack,
  onUpdate,
  onPin,
  onUnpin,
  onSendToTasks,
  onArchive,
  onPasteImage,
  onUploadImage,
}: NoteEditorProps) {
  const { t } = useTranslation('notes');
  const [title, setTitle] = useState(note.title);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSavedContent = useRef(note.content_plain);

  // Initialize content
  useEffect(() => {
    if (editorRef.current && note.content_plain) {
      // Use HTML content if rich content exists, otherwise use plain
      if (note.content_rich && typeof note.content_rich === 'object' && (note.content_rich as any).html) {
        editorRef.current.innerHTML = (note.content_rich as any).html;
      } else {
        editorRef.current.innerText = note.content_plain;
      }
    }
  }, [note.id]); // Only re-init when note ID changes

  // Title change handler
  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      onUpdate({ title: value });
    },
    [onUpdate]
  );

  // Content change handler
  const handleContentChange = useCallback(() => {
    if (!editorRef.current) return;
    const plain = editorRef.current.innerText || '';
    const html = editorRef.current.innerHTML || '';
    if (plain !== lastSavedContent.current) {
      lastSavedContent.current = plain;
      onUpdate({
        content_plain: plain,
        content_rich: { html } as any,
      });
    }
  }, [onUpdate]);

  // Paste handler for images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const hasImage = items.some((item) => item.type.startsWith('image/'));
      if (hasImage && onPasteImage) {
        e.preventDefault();
        onPasteImage(e.clipboardData);
      }
    },
    [onPasteImage]
  );

  // Format commands
  const execCommand = useCallback((command: string) => {
    document.execCommand(command, false);
    editorRef.current?.focus();
  }, []);

  // File upload
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && onUploadImage) {
        onUploadImage(file);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [onUploadImage]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('bold')}>
              <Bold className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Negrito</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('italic')}>
              <Italic className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Itálico</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => execCommand('insertUnorderedList')}>
              <List className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Lista</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('actions.upload_image')}</TooltipContent>
        </Tooltip>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        <div className="flex-1" />

        {/* Color picker */}
        <div className="relative">
          <button
            className="h-5 w-5 rounded-full border-2 border-background shadow-sm"
            style={{ backgroundColor: note.color_hex }}
            onClick={() => setShowColorPicker(!showColorPicker)}
          />
          {showColorPicker && (
            <div className="absolute right-0 top-8 z-50 bg-popover border rounded-lg shadow-lg p-2 flex gap-1.5">
              {NOTE_COLORS.map((color) => (
                <button
                  key={color.hex}
                  className="h-6 w-6 rounded-full border-2 border-transparent hover:border-foreground/30 transition-colors"
                  style={{ backgroundColor: color.hex }}
                  onClick={() => {
                    onUpdate({ color_hex: color.hex });
                    setShowColorPicker(false);
                  }}
                  title={color.label}
                />
              ))}
            </div>
          )}
        </div>

        {/* Save indicator */}
        {isSaving ? (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('saving')}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-2">
            <Check className="h-3 w-3" />
            {t('auto_saved')}
          </span>
        )}
      </div>

      {/* Title */}
      <div className="px-4 pt-3">
        <Input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder={t('untitled')}
          className="border-none text-base font-semibold p-0 h-auto focus-visible:ring-0 bg-transparent"
        />
      </div>

      {/* Content editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="flex-1 px-4 py-2 text-sm text-foreground outline-none overflow-y-auto prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-4 [&_ol]:pl-4"
        onInput={handleContentChange}
        onPaste={handlePaste}
        data-placeholder={t('no_notes_hint')}
      />

      {/* Action bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-t bg-muted/30">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={isPinned ? onUnpin : onPin}
            >
              <Pin className="h-3.5 w-3.5" />
              {isPinned ? t('actions.unpin_module') : t('actions.pin_module')}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isPinned ? t('actions.unpin_module') : t('actions.pin_module')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={onSendToTasks}
            >
              <Send className="h-3.5 w-3.5" />
              {t('actions.send_to_tasks')}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('actions.send_to_tasks')}</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
              onClick={onArchive}
            >
              <Archive className="h-3.5 w-3.5" />
              {t('actions.archive')}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('actions.archive')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
