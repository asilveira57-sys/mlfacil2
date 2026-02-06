import { useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ImagePlus,
  Check,
  Loader2,
  Bold,
  Italic,
  List,
  ListOrdered,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { NOTE_COLORS } from '@/types/notes';
import { useState } from 'react';

interface NoteEditorToolbarProps {
  colorHex: string;
  isSaving?: boolean;
  onBack: () => void;
  onExecCommand: (command: string) => void;
  onColorChange: (hex: string) => void;
  onUploadImage: () => void;
}

export function NoteEditorToolbar({
  colorHex,
  isSaving,
  onBack,
  onExecCommand,
  onColorChange,
  onUploadImage,
}: NoteEditorToolbarProps) {
  const { t } = useTranslation('notes');
  const [showColorPicker, setShowColorPicker] = useState(false);

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onExecCommand('bold')}>
            <Bold className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('actions.bold', 'Negrito')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onExecCommand('italic')}>
            <Italic className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('actions.italic', 'Itálico')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onExecCommand('insertUnorderedList')}>
            <List className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('actions.unordered_list', 'Lista')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onExecCommand('insertOrderedList')}>
            <ListOrdered className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('actions.ordered_list', 'Lista numerada')}</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onUploadImage}
          >
            <ImagePlus className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('actions.upload_image')}</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      {/* Color picker */}
      <div className="relative">
        <button
          className="h-5 w-5 rounded-full border-2 border-background shadow-sm"
          style={{ backgroundColor: colorHex }}
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
                  onColorChange(color.hex);
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
  );
}
