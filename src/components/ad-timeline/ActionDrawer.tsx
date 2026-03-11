import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Loader2, XCircle, Copy, RefreshCcw, AlertTriangle } from "lucide-react";
import type { ActionType, CloneChecklist } from "@/types/ad-timeline";

interface ActionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionType: ActionType;
  itemId: string;
  itemTitle?: string;
  itemStatus?: string;
  onConfirm: (reason: string, checklist: CloneChecklist) => Promise<void>;
  isLoading?: boolean;
}

const actionLabels: Record<ActionType, { title: string; description: string; icon: React.ReactNode }> = {
  END: { 
    title: "Encerrar Anúncio", 
    description: "O anúncio será encerrado e não poderá mais receber vendas.",
    icon: <XCircle className="h-5 w-5 text-destructive" />,
  },
  CLONE: { 
    title: "Clonar Anúncio", 
    description: "Um novo anúncio será criado com os dados selecionados.",
    icon: <Copy className="h-5 w-5 text-green-500" />,
  },
};

const defaultChecklist: CloneChecklist = {
  title: true,
  description: true,
  pictures: true,
  attributes: true,
  price: true,
  quantity: true,
  shipping: true,
  warranty: true,
};

export function ActionDrawer({
  open,
  onOpenChange,
  actionType,
  itemId,
  itemTitle,
  itemStatus,
  onConfirm,
  isLoading,
}: ActionDrawerProps) {
  const [reason, setReason] = useState("");
  const [checklist, setChecklist] = useState<CloneChecklist>(defaultChecklist);

  const config = actionLabels[actionType];
  const isClone = actionType === "CLONE";
  const showActiveWarning = isClone && itemStatus === "active";

  const handleConfirm = async () => {
    await onConfirm(reason, checklist);
  };

  const toggleChecklistItem = (key: keyof CloneChecklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              {config.icon}
              {config.title}
            </DrawerTitle>
            <DrawerDescription>{config.description}</DrawerDescription>
          </DrawerHeader>

          <div className="p-4 space-y-4">
            {/* Item info */}
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-xs text-muted-foreground">Anúncio</div>
              <div className="font-medium text-sm truncate">{itemTitle || itemId}</div>
              <div className="text-xs text-muted-foreground mt-1">{itemId}</div>
            </div>

            {/* Active warning for clone */}
            {showActiveWarning && (
              <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium text-yellow-700">Anúncio ainda ativo</div>
                  <div className="text-xs text-yellow-600">
                    Clonar um anúncio ativo pode criar duplicidade. Considere encerrar o original primeiro.
                  </div>
                </div>
              </div>
            )}

            {/* Clone checklist */}
            {isClone && (
              <div className="space-y-3">
                <div className="text-sm font-medium">O que copiar:</div>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(checklist).map(([key, value]) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={key}
                        checked={value}
                        onCheckedChange={() => toggleChecklistItem(key as keyof CloneChecklist)}
                      />
                      <Label htmlFor={key} className="text-sm capitalize">
                        {key === "pictures" ? "Fotos" : 
                         key === "description" ? "Descrição" :
                         key === "attributes" ? "Atributos" :
                         key === "price" ? "Preço" :
                         key === "quantity" ? "Quantidade" :
                         key === "shipping" ? "Frete" :
                         key === "warranty" ? "Garantia" :
                         key === "title" ? "Título" : key}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">Motivo (opcional)</Label>
              <Textarea
                id="reason"
                placeholder="Ex: Sem vendas há 60 dias, troca de estratégia..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DrawerFooter>
            <Button onClick={handleConfirm} disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Criar Rascunho
            </Button>
            <DrawerClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
