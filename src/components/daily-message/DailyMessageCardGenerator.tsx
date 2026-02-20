import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logCardGenerated, logCardDownloaded } from '@/utils/dailyMessageLogger';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: { id?: string; texto: string; referencia: string | null };
  signature: string;
  userId?: string;
}

type Template = 'white' | 'blue' | 'gradient';

const TEMPLATES: { id: Template; label: string }[] = [
  { id: 'white', label: 'Branco' },
  { id: 'blue', label: 'Azul' },
  { id: 'gradient', label: 'Degradê' },
];

const CARD_W = 1080;
const CARD_H = 1620;

export function DailyMessageCardGenerator({ open, onOpenChange, message, signature, userId }: Props) {
  const [template, setTemplate] = useState<Template>('white');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = CARD_W;
    canvas.height = CARD_H;

    // Background
    if (template === 'white') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, CARD_W, CARD_H);
    } else if (template === 'blue') {
      ctx.fillStyle = '#1e3a5f';
      ctx.fillRect(0, 0, CARD_W, CARD_H);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
      grad.addColorStop(0, '#1e3a5f');
      grad.addColorStop(1, '#2d5f8a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CARD_W, CARD_H);
    }

    const isDark = template !== 'white';
    const textColor = isDark ? '#FFFFFF' : '#1a1a1a';
    const mutedColor = isDark ? 'rgba(255,255,255,0.6)' : '#666666';

    // Header: "Marketplace Fácil"
    ctx.fillStyle = mutedColor;
    ctx.font = '500 36px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Marketplace Fácil', CARD_W / 2, 120);

    // Center: phrase with word wrap
    ctx.fillStyle = textColor;
    const fontSize = message.texto.length > 120 ? 48 : message.texto.length > 60 ? 56 : 64;
    ctx.font = `600 ${fontSize}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';

    const maxWidth = CARD_W - 160;
    const lines = wrapText(ctx, `"${message.texto}"`, maxWidth);
    const lineHeight = fontSize * 1.4;
    const totalTextHeight = lines.length * lineHeight;
    const startY = (CARD_H / 2) - (totalTextHeight / 2) + fontSize / 2;

    lines.forEach((line, i) => {
      ctx.fillText(line, CARD_W / 2, startY + i * lineHeight);
    });

    // Reference below phrase
    if (message.referencia) {
      ctx.fillStyle = mutedColor;
      ctx.font = `italic 32px "Inter", system-ui, sans-serif`;
      ctx.fillText(`— ${message.referencia}`, CARD_W / 2, startY + totalTextHeight + 40);
    }

    // Footer: @ signature
    if (signature) {
      ctx.fillStyle = mutedColor;
      ctx.font = '400 34px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(signature, CARD_W / 2, CARD_H - 80);
    }
  }, [template, message, signature]);

  const handleDownload = () => {
    drawCard();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'mensagem-do-dia.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    if (userId && message.id) {
      logCardDownloaded(userId, message.id);
    }
  };

  // Draw on template change
  const handleOpen = () => {
    setTimeout(drawCard, 100);
    if (userId && message.id) {
      logCardGenerated(userId, message.id, template, !!signature);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onOpenAutoFocus={handleOpen}>
        <DialogHeader>
          <DialogTitle>Card para Redes Sociais (2:3)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template selector */}
          <div className="flex gap-2">
            {TEMPLATES.map((t) => (
              <Button
                key={t.id}
                variant={template === t.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setTemplate(t.id);
                  setTimeout(drawCard, 50);
                }}
              >
                {t.label}
              </Button>
            ))}
          </div>

          {/* Preview */}
          <div className="flex justify-center">
            <canvas
              ref={canvasRef}
              className="border rounded-lg shadow-sm"
              style={{ width: 270, height: 405 }}
            />
          </div>

          <Button onClick={handleDownload} className="w-full gap-2">
            <Download className="h-4 w-4" />
            Baixar PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}
