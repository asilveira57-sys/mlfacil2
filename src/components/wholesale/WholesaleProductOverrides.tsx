import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Loader2, Package, Search, Ban } from "lucide-react";
import { useWholesaleProductOverrides } from "@/hooks/useWholesaleProductOverrides";
import { useWholesaleProfiles } from "@/hooks/useWholesaleProfiles";

export function WholesaleProductOverrides() {
  const { overrides, isLoading, addOverride, removeOverride } = useWholesaleProductOverrides();
  const { profiles } = useWholesaleProfiles();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Dialog state
  const [itemId, setItemId] = useState("");
  const [productKey, setProductKey] = useState("");
  const [title, setTitle] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [isExcluded, setIsExcluded] = useState(false);

  const activeProfiles = profiles.filter((p) => p.is_active);

  const filteredOverrides = overrides.filter((o) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      o.item_id.toLowerCase().includes(term) ||
      (o.title || "").toLowerCase().includes(term) ||
      (o.product_key || "").toLowerCase().includes(term) ||
      (o.profile_name || "").toLowerCase().includes(term)
    );
  });

  const resetDialog = () => {
    setItemId("");
    setProductKey("");
    setTitle("");
    setSelectedProfileId("");
    setIsExcluded(false);
  };

  const handleAdd = () => {
    if (!itemId.trim()) return;
    addOverride.mutate({
      item_id: itemId.trim(),
      product_key: productKey.trim() || undefined,
      title: title.trim() || undefined,
      profile_id: isExcluded ? null : selectedProfileId || null,
      is_excluded: isExcluded,
    });
    setDialogOpen(false);
    resetDialog();
  };

  const handleDelete = () => {
    if (deleteId) {
      removeOverride.mutate(deleteId);
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Aplicação Avulsa por SKU</h2>
          <p className="text-sm text-muted-foreground">
            Sobrescreva o perfil de atacado em produtos específicos, ou exclua-os do atacado.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Adicionar override
        </Button>
      </div>

      {/* Search */}
      {overrides.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por MLB, SKU ou título..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {overrides.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Nenhum override cadastrado.</p>
            <p className="text-xs mt-1">Use overrides para aplicar perfis específicos ou excluir itens do atacado.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead className="w-[80px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOverrides.map((override) => (
                <TableRow key={override.id}>
                  <TableCell>
                    <div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {override.item_id}
                      </Badge>
                      {override.title && (
                        <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">
                          {override.title}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {override.product_key || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {override.is_excluded ? (
                      <Badge variant="destructive" className="gap-1">
                        <Ban className="h-3 w-3" />
                        Excluído
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Perfil específico</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {override.is_excluded ? "—" : override.profile_name || "Nenhum"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteId(override.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetDialog(); setDialogOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Override de Produto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>ID do anúncio (MLB)</Label>
              <Input
                placeholder="Ex: MLB1234567890"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>SKU (opcional)</Label>
                <Input
                  placeholder="Ex: PROD-001"
                  value={productKey}
                  onChange={(e) => setProductKey(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Título (opcional)</Label>
                <Input
                  placeholder="Nome do produto"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 p-3 rounded-lg border">
              <div>
                <Label>Excluir do atacado</Label>
                <p className="text-xs text-muted-foreground">
                  Este item não terá preço de atacado, mesmo que sua categoria tenha perfil vinculado.
                </p>
              </div>
              <Switch checked={isExcluded} onCheckedChange={setIsExcluded} />
            </div>

            {!isExcluded && (
              <div className="space-y-1.5">
                <Label>Perfil de atacado específico</Label>
                <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetDialog(); setDialogOpen(false); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!itemId.trim() || (!isExcluded && !selectedProfileId) || addOverride.isPending}
            >
              {addOverride.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover override</AlertDialogTitle>
            <AlertDialogDescription>
              O item voltará a seguir a regra de categoria ou o perfil padrão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
