import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import type { Note } from '@/types/notes';
import { NoteEditorToolbar } from './NoteEditorToolbar';
import { NoteEditorActions } from './NoteEditorActions';

interface NoteEditorProps {
  note: Note;
  isPinned?: boolean;
  isSaving?: boolean;
  currentModuleKey: string;
  onBack: () => void;
  onUpdate: (updates: Partial<Note>) => void;
  onPin?: (moduleKey: string, companyId?: string) => void;
  onUnpin?: () => void;
  onSendToTasks?: () => void;
  onArchive?: () => void;
  onPasteImage?: (data: DataTransfer) => Promise<string | null>;
  onUploadImage?: (file: File) => Promise<string>;
}

export function NoteEditor({
  note,
  isPinned,
  isSaving,
  currentModuleKey,
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
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSavedContent = useRef(note.content_plain);

  // Initialize content
  useEffect(() => {
    if (editorRef.current) {
      if (note.content_rich && typeof note.content_rich === 'object' && (note.content_rich as any).html) {
        editorRef.current.innerHTML = (note.content_rich as any).html;
      } else if (note.content_plain) {
        editorRef.current.innerText = note.content_plain;
      }
    }
  }, [note.id]);

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

  // Insert image into editor at cursor
  const insertImageInEditor = useCallback((imageUrl: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const imgHtml = `<img src="${imageUrl}" class="max-w-full rounded my-2" style="max-width:100%;border-radius:4px;" />`;
    document.execCommand('insertHTML', false, imgHtml);
    // Trigger content save
    handleContentChange();
  }, [handleContentChange]);

  // Paste handler for images
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const hasImage = items.some((item) => item.type.startsWith('image/'));
      if (hasImage && onPasteImage) {
        e.preventDefault();
        const url = await onPasteImage(e.clipboardData);
        if (url) {
          insertImageInEditor(url);
        }
      }
    },
    [onPasteImage, insertImageInEditor]
  );

  // Format commands
  const execCommand = useCallback((command: string) => {
    document.execCommand(command, false);
    editorRef.current?.focus();
  }, []);

  // File upload
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && onUploadImage) {
        const url = await onUploadImage(file);
        if (url) {
          insertImageInEditor(url);
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [onUploadImage, insertImageInEditor]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <NoteEditorToolbar
        colorHex={note.color_hex}
        isSaving={isSaving}
        onBack={onBack}
        onExecCommand={execCommand}
        onColorChange={(hex) => onUpdate({ color_hex: hex })}
        onUploadImage={() => fileInputRef.current?.click()}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

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
        className="flex-1 px-4 py-2 text-sm text-foreground outline-none overflow-y-auto prose prose-sm max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-4 [&_ol]:pl-4 [&_img]:max-w-full [&_img]:rounded"
        onInput={handleContentChange}
        onPaste={handlePaste}
        data-placeholder={t('no_notes_hint')}
      />

      {/* Action bar */}
      <NoteEditorActions
        isPinned={isPinned}
        currentModuleKey={currentModuleKey}
        onPin={(moduleKey, companyId) => onPin?.(moduleKey, companyId)}
        onUnpin={onUnpin}
        onSendToTasks={onSendToTasks}
        onArchive={onArchive}
      />
    </div>
  );
}
