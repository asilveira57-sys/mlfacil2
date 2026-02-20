import { useState, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThumbsUp, Download, Image as ImageIcon, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DailyMessagePreferences } from './DailyMessagePreferences';
import { DailyMessageCardGenerator } from './DailyMessageCardGenerator';

interface DailyMessageCardProps {
  message: { id: string; tema: string; texto: string; referencia: string | null } | null | undefined;
  likeCount: number;
  userLiked: boolean;
  onToggleLike: () => void;
  isLiking?: boolean;
  signature: string;
  preferences: any;
  onUpdatePreferences: (prefs: any) => void;
  showMessage: boolean;
}

const TEMA_LABELS: Record<string, string> = {
  empreendedorismo: 'Empreendedorismo',
  raul_inspirado: 'Raul Inspirado',
  biblica: 'Bíblica',
  crista: 'Cristã',
  atitude: 'Atitude',
  geral: 'Geral',
};

export function DailyMessageCard({
  message,
  likeCount,
  userLiked,
  onToggleLike,
  isLiking,
  signature,
  preferences,
  onUpdatePreferences,
  showMessage,
}: DailyMessageCardProps) {
  const [showPrefs, setShowPrefs] = useState(false);
  const [showCardGen, setShowCardGen] = useState(false);

  if (!showMessage || !message) return null;

  return (
    <>
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">💬</span>
              <span className="text-sm font-semibold text-primary">Mensagem do Dia</span>
              <Badge variant="outline" className="text-xs">
                {TEMA_LABELS[message.tema] || message.tema}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowPrefs(true)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>

          <blockquote className="text-base md:text-lg font-medium italic text-foreground leading-relaxed mb-2">
            "{message.texto}"
          </blockquote>

          {message.referencia && (
            <p className="text-xs text-muted-foreground mb-3">— {message.referencia}</p>
          )}

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-3">
              <Button
                variant={userLiked ? 'default' : 'outline'}
                size="sm"
                onClick={onToggleLike}
                disabled={isLiking}
                className={cn('gap-1.5', userLiked && 'bg-primary')}
              >
                <ThumbsUp className={cn('h-4 w-4', userLiked && 'fill-current')} />
                Gostei
              </Button>
              <span className="text-sm text-muted-foreground">
                {likeCount} {likeCount === 1 ? 'curtida' : 'curtidas'}
              </span>
            </div>

            {preferences?.permitir_gerar_card !== false && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowCardGen(true)}
              >
                <ImageIcon className="h-4 w-4" />
                Gerar Card
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <DailyMessagePreferences
        open={showPrefs}
        onOpenChange={setShowPrefs}
        preferences={preferences}
        onSave={onUpdatePreferences}
      />

      {showCardGen && (
        <DailyMessageCardGenerator
          open={showCardGen}
          onOpenChange={setShowCardGen}
          message={message}
          signature={signature}
        />
      )}
    </>
  );
}
