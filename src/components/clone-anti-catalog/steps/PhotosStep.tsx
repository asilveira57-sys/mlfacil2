// Aba de Fotos - Gerenciar fotos do anúncio
// Fluxo Anti-Catálogo v3 - ISOLADO

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { EditablePayload, SnapshotPicture } from '../types';
import { Image, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PhotosStepProps {
  payload: EditablePayload;
  onPayloadChange: (updates: Partial<EditablePayload>) => void;
}

export function PhotosStep({ payload, onPayloadChange }: PhotosStepProps) {
  const pictures = payload.pictures;

  const removePicture = (index: number) => {
    const newPictures = pictures.filter((_, i) => i !== index);
    onPayloadChange({ pictures: newPictures });
  };

  const movePicture = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= pictures.length) return;

    const newPictures = [...pictures];
    [newPictures[index], newPictures[newIndex]] = [newPictures[newIndex], newPictures[index]];
    onPayloadChange({ pictures: newPictures });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Image className="h-5 w-5 text-primary" />
        <Label className="text-base font-medium">Fotos do anúncio</Label>
      </div>

      <p className="text-sm text-muted-foreground">
        A primeira foto será a foto principal. Você pode reordenar ou remover fotos.
      </p>

      {pictures.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            É necessário pelo menos 1 foto para criar o anúncio.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {pictures.map((pic, index) => (
          <div
            key={pic.id || index}
            className={`relative border rounded-lg overflow-hidden group ${
              index === 0 ? 'ring-2 ring-primary' : ''
            }`}
          >
            <img
              src={pic.secure_url || pic.url}
              alt={`Foto ${index + 1}`}
              className="w-full h-32 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder.svg';
              }}
            />

            {index === 0 && (
              <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded">
                Principal
              </div>
            )}

            {/* Controles */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-white hover:bg-white/20"
                onClick={() => movePicture(index, 'up')}
                disabled={index === 0}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-white hover:bg-white/20"
                onClick={() => movePicture(index, 'down')}
                disabled={index === pictures.length - 1}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-white hover:bg-destructive/80"
                onClick={() => removePicture(index)}
                disabled={pictures.length <= 1}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {pictures.length} foto(s) selecionada(s)
      </p>
    </div>
  );
}
