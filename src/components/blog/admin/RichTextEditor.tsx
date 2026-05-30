import { useCallback, useEffect, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Youtube from '@tiptap/extension-youtube';
import {
  Bold, Italic, Strikethrough, List, ListOrdered, Quote, Code,
  Heading1, Heading2, Heading3, Link as LinkIcon, Image as ImageIcon,
  Youtube as YoutubeIcon, Undo, Redo, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onGenerateAltForImage?: (url: string) => Promise<string>;
  placeholder?: string;
}

async function uploadImageToBucket(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'png';
  const path = `posts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('blog-media').upload(path, file, {
    cacheControl: '3600', upsert: false,
  });
  if (error) {
    toast.error(`Falha no upload: ${error.message}`);
    return null;
  }
  const { data } = supabase.storage.from('blog-media').getPublicUrl(path);
  return data.publicUrl;
}

function ToolbarButton({
  active, onClick, children, title,
}: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <Toggle pressed={active} onPressedChange={onClick} size="sm" title={title} aria-label={title}>
      {children}
    </Toggle>
  );
}

function Toolbar({ editor, onGenerateAltForImage }: { editor: Editor; onGenerateAltForImage?: (url: string) => Promise<string> }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const insertImageFromUrl = useCallback(async () => {
    const url = window.prompt('URL da imagem:');
    if (!url) return;
    let alt = window.prompt('Texto alternativo (obrigatório para SEO):') || '';
    if (!alt && onGenerateAltForImage) {
      try {
        const generated = await onGenerateAltForImage(url);
        if (generated) alt = generated;
      } catch { /* ignore */ }
    }
    if (!alt) {
      toast.error('Alt é obrigatório para acessibilidade e SEO.');
      return;
    }
    editor.chain().focus().setImage({ src: url, alt }).run();
  }, [editor, onGenerateAltForImage]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImageToBucket(file);
    e.target.value = '';
    if (!url) return;
    let alt = window.prompt('Texto alternativo (obrigatório para SEO):') || '';
    if (!alt && onGenerateAltForImage) {
      try {
        const generated = await onGenerateAltForImage(url);
        if (generated) alt = generated;
      } catch { /* ignore */ }
    }
    if (!alt) alt = 'Imagem do post';
    editor.chain().focus().setImage({ src: url, alt }).run();
  };

  const insertLink = useCallback(() => {
    const previous = editor.getAttributes('link').href;
    const url = window.prompt('URL do link:', previous || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url, target: '_blank' }).run();
  }, [editor]);

  const insertYoutube = useCallback(() => {
    const url = window.prompt('URL do vídeo (YouTube/Vimeo):');
    if (!url) return;
    editor.commands.setYoutubeVideo({ src: url, width: 640, height: 360 });
  }, [editor]);

  return (
    <div className="border border-input rounded-t-md bg-muted/30 p-2 flex flex-wrap items-center gap-1">
      <ToolbarButton title="Desfazer" onClick={() => editor.chain().focus().undo().run()}><Undo className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Refazer" onClick={() => editor.chain().focus().redo().run()}><Redo className="h-4 w-4" /></ToolbarButton>
      <Separator orientation="vertical" className="h-6 mx-1" />
      <ToolbarButton title="H1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="H2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="H3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></ToolbarButton>
      <Separator orientation="vertical" className="h-6 mx-1" />
      <ToolbarButton title="Negrito" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Itálico" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Tachado" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolbarButton>
      <Separator orientation="vertical" className="h-6 mx-1" />
      <ToolbarButton title="Lista" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Citação" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton title="Código" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code className="h-4 w-4" /></ToolbarButton>
      <Separator orientation="vertical" className="h-6 mx-1" />
      <Button type="button" size="sm" variant="ghost" onClick={insertLink} title="Inserir link"><LinkIcon className="h-4 w-4" /></Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} title="Upload de imagem"><ImageIcon className="h-4 w-4" /></Button>
      <Button type="button" size="sm" variant="ghost" onClick={insertImageFromUrl} title="Imagem por URL"><ImageIcon className="h-4 w-4 opacity-60" /></Button>
      <Button type="button" size="sm" variant="ghost" onClick={insertYoutube} title="YouTube"><YoutubeIcon className="h-4 w-4" /></Button>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

export function RichTextEditor({ value, onChange, onGenerateAltForImage, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ HTMLAttributes: { class: 'rounded-lg max-w-full h-auto' } }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Youtube.configure({ controls: true, nocookie: true, HTMLAttributes: { class: 'aspect-video w-full rounded-lg' } }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[400px] p-4 border border-input rounded-b-md bg-background',
        'data-placeholder': placeholder || 'Comece a escrever…',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value && value !== current) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return <div className="border border-input rounded-md p-4 text-muted-foreground">Carregando editor…</div>;
  }

  return (
    <div className="rich-text-editor">
      <Toolbar editor={editor} onGenerateAltForImage={onGenerateAltForImage} />
      <EditorContent editor={editor} />
      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
        <Sparkles className="h-3 w-3" /> Cole conteúdo do Word/Google Docs/WordPress — formatação é limpa automaticamente.
      </p>
    </div>
  );
}
