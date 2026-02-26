import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Loader2, FolderTree, Search } from "lucide-react";
import { useWholesaleCategoryBindings } from "@/hooks/useWholesaleCategoryBindings";
import { useWholesaleProfiles } from "@/hooks/useWholesaleProfiles";
import { useSellerCategories } from "@/hooks/useSellerCategories";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";

export function WholesaleCategoryBindings() {
  const { activeAccount } = useActiveAccount();
  const { bindings, isLoading, addBinding, removeBinding, updateBindingProfile } = useWholesaleCategoryBindings();
  const { profiles } = useWholesaleProfiles();
  const { data: sellerCategories } = useSellerCategories(activeAccount?.sellerId || null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Dialog state
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [manualCategoryId, setManualCategoryId] = useState("");
  const [manualCategoryName, setManualCategoryName] = useState("");

  const activeProfiles = profiles.filter((p) => p.is_active);
  const boundCategoryIds = new Set(bindings.map((b) => b.category_id));

  // Categories available (from seller's catalog, excluding already bound)
  const availableCategories = (sellerCategories || []).filter(
    (c) => !boundCategoryIds.has(c.category_id)
  );

  const filteredBindings = bindings.filter((b) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (b.category_name || "").toLowerCase().includes(term) ||
      b.category_id.toLowerCase().includes(term) ||
      (b.profile_name || "").toLowerCase().includes(term)
    );
  });

  const handleAdd = () => {
    if (selectedCategoryId && selectedProfileId) {
      const cat = availableCategories.find((c) => c.category_id === selectedCategoryId);
      addBinding.mutate({
        profile_id: selectedProfileId,
        category_id: selectedCategoryId,
        category_name: cat?.category_name || selectedCategoryId,
        category_path: cat?.category_path || [],
      });
    } else if (manualCategoryId && selectedProfileId) {
      addBinding.mutate({
        profile_id: selectedProfileId,
        category_id: manualCategoryId,
        category_name: manualCategoryName || manualCategoryId,
      });
    }
    setDialogOpen(false);
    resetDialog();
  };

  const resetDialog = () => {
    setSelectedCategoryId("");
    setSelectedProfileId("");
    setManualCategoryId("");
    setManualCategoryName("");
  };

  const handleDelete = () => {
    if (deleteId) {
      removeBinding.mutate(deleteId);
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
          <h2 className="text-lg font-semibold">Categorias Vinculadas</h2>
          <p className="text-sm text-muted-foreground">
            Associe perfis de atacado a categorias do catálogo. Cada categoria pode ter apenas um perfil.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Vincular categoria
        </Button>
      </div>

      {/* Search */}
      {bindings.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por categoria ou perfil..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {bindings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FolderTree className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Nenhuma categoria vinculada ainda.</p>
            <p className="text-xs mt-1">Vincule categorias a perfis de atacado para aplicar preços em lote.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead className="w-[80px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBindings.map((binding) => (
                <TableRow key={binding.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">
                        {binding.category_name || binding.category_id}
                      </span>
                    </div>
                    {binding.category_path && binding.category_path.length > 1 && (
                      <p className="text-xs text-muted-foreground mt-0.5 pl-6">
                        {binding.category_path.slice(0, -1).join(" › ")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {binding.category_id}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={binding.profile_id}
                      onValueChange={(v) =>
                        updateBindingProfile.mutate({ id: binding.id, profile_id: v })
                      }
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {activeProfiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteId(binding.id)}
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
            <DialogTitle>Vincular Categoria a Perfil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Profile select */}
            <div className="space-y-1.5">
              <Label>Perfil de atacado</Label>
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
              {activeProfiles.length === 0 && (
                <p className="text-xs text-destructive">Crie um perfil ativo antes de vincular.</p>
              )}
            </div>

            {/* Category from seller's catalog */}
            {availableCategories.length > 0 && (
              <div className="space-y-1.5">
                <Label>Categoria do catálogo</Label>
                <Select value={selectedCategoryId} onValueChange={(v) => { setSelectedCategoryId(v); setManualCategoryId(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategories.map((c) => (
                      <SelectItem key={c.category_id} value={c.category_id}>
                        {c.category_name} ({c.orders_count_90d} pedidos)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Manual category ID */}
            <div className="space-y-1.5">
              <Label>{availableCategories.length > 0 ? "Ou insira o ID manualmente" : "ID da Categoria"}</Label>
              <Input
                placeholder="Ex: MLB1234"
                value={manualCategoryId}
                onChange={(e) => { setManualCategoryId(e.target.value); setSelectedCategoryId(""); }}
              />
            </div>

            {manualCategoryId && (
              <div className="space-y-1.5">
                <Label>Nome da categoria (opcional)</Label>
                <Input
                  placeholder="Ex: Acessórios para Veículos"
                  value={manualCategoryName}
                  onChange={(e) => setManualCategoryName(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetDialog(); setDialogOpen(false); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleAdd}
              disabled={
                !selectedProfileId ||
                (!selectedCategoryId && !manualCategoryId) ||
                addBinding.isPending
              }
            >
              {addBinding.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover vínculo</AlertDialogTitle>
            <AlertDialogDescription>
              Os itens dessa categoria perderão o perfil de atacado vinculado. Deseja continuar?
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
