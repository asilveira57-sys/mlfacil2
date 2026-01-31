// Aba de Revisão - Confirmar e criar anúncio
// Fluxo Anti-Catálogo v3 - ISOLADO

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { EditablePayload, SourceSnapshot } from '../types';
import { 
  ShieldCheck, 
  FileText, 
  DollarSign, 
  Package, 
  Image, 
  Tags, 
  Loader2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

interface ReviewStepProps {
  payload: EditablePayload;
  snapshot: SourceSnapshot;
  isCreating: boolean;
  onConfirm: () => void;
}

export function ReviewStep({ payload, snapshot, isCreating, onConfirm }: ReviewStepProps) {
  const dimensionsValid = 
    payload.package_height > 0 &&
    payload.package_width > 0 &&
    payload.package_length > 0 &&
    payload.package_weight > 0;

  const isValid = 
    payload.title.length > 0 &&
    payload.price > 0 &&
    payload.available_quantity > 0 &&
    payload.pictures.length > 0 &&
    dimensionsValid;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  return (
    <div className="space-y-6">
      {/* Aviso Anti-Catálogo */}
      <Alert className="border-primary/50 bg-primary/5">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <AlertDescription>
          <strong>Modo Anti-Catálogo ativo.</strong> Este anúncio será criado como <strong>anúncio normal</strong>, fora de catálogo, com título e fotos editáveis.
        </AlertDescription>
      </Alert>

      {/* Resumo */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Resumo do anúncio</h3>

        {/* Imagem principal + Info básica */}
        <div className="flex gap-4 p-4 border rounded-lg bg-muted/30">
          {payload.pictures[0] && (
            <img
              src={payload.pictures[0].secure_url}
              alt="Produto"
              className="w-24 h-24 object-cover rounded-lg"
            />
          )}
          <div className="flex-1 space-y-1">
            <p className="font-medium line-clamp-2">{payload.title}</p>
            <p className="text-lg font-bold text-primary">{formatPrice(payload.price)}</p>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary">{payload.condition === 'new' ? 'Novo' : 'Usado'}</Badge>
              <Badge variant="outline">{payload.available_quantity} unidade(s)</Badge>
              <Badge variant="outline">
                {payload.listing_type_id === 'gold_pro' ? 'Premium' : 'Clássico'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-2">
          <CheckItem 
            icon={<FileText className="h-4 w-4" />}
            label="Título"
            value={payload.title.length > 0}
            detail={`${payload.title.length} caracteres`}
          />
          <CheckItem 
            icon={<DollarSign className="h-4 w-4" />}
            label="Preço"
            value={payload.price > 0}
            detail={formatPrice(payload.price)}
          />
          <CheckItem 
            icon={<Image className="h-4 w-4" />}
            label="Fotos"
            value={payload.pictures.length > 0}
            detail={`${payload.pictures.length} foto(s)`}
          />
          <CheckItem 
            icon={<Tags className="h-4 w-4" />}
            label="Atributos"
            value={true}
            detail={`${payload.attributes.length} atributo(s)`}
          />
          <CheckItem 
            icon={<Package className="h-4 w-4" />}
            label="Dimensões"
            value={dimensionsValid}
            detail={dimensionsValid 
              ? `${payload.package_height}×${payload.package_width}×${payload.package_length}cm, ${payload.package_weight}g`
              : 'Incompleto'
            }
          />
        </div>

        {/* Info categoria */}
        <div className="p-3 border rounded-lg bg-muted/20">
          <p className="text-sm">
            <span className="text-muted-foreground">Categoria: </span>
            <span className="font-medium">{snapshot.category_name || snapshot.category_id}</span>
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Baseado em: </span>
            <span className="font-medium">{snapshot.item_id}</span>
          </p>
        </div>
      </div>

      {/* Validação */}
      {!isValid && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Preencha todos os campos obrigatórios antes de criar o anúncio.
          </AlertDescription>
        </Alert>
      )}

      {/* Botão de criação */}
      <Button
        size="lg"
        className="w-full"
        disabled={!isValid || isCreating}
        onClick={onConfirm}
      >
        {isCreating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Criando anúncio...
          </>
        ) : (
          <>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Criar Anúncio Normal
          </>
        )}
      </Button>
    </div>
  );
}

function CheckItem({ 
  icon, 
  label, 
  value, 
  detail 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: boolean; 
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 p-2 rounded">
      <div className={value ? 'text-primary' : 'text-destructive'}>
        {icon}
      </div>
      <span className="flex-1 text-sm">{label}</span>
      <span className={`text-sm ${value ? 'text-muted-foreground' : 'text-destructive'}`}>
        {detail}
      </span>
      {value ? (
        <CheckCircle2 className="h-4 w-4 text-primary" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-destructive" />
      )}
    </div>
  );
}
