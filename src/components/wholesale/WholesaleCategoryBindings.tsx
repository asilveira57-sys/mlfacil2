import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Loader2, FolderTree, Search, Building2, AlertCircle } from "lucide-react";
import { useWholesaleCategoryBindings } from "@/hooks/useWholesaleCategoryBindings";
import { useWholesaleProfiles } from "@/hooks/useWholesaleProfiles";

import { useWorkspaceCompanies } from "@/hooks/useWorkspaceCompanies";
import { supabase } from "@/integrations/supabase/client";

export function WholesaleCategoryBindings() {
  const { bindings, isLoading, addBinding, removeBinding, updateBindingProfile } = useWholesaleCategoryBindings();
  const { profiles } = useWholesaleProfiles();
  const { companies, isLoading: companiesLoading } = useWorkspaceCompanies();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Dialog state
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [manualCategoryId, setManualCategoryId] = useState("");
  const [manualCategoryName, setManualCategoryName] = useState("");

  // Resolve sellerId from selected company's ML account
  const { data: companyAccount, isLoading: accountLoading } = useQuery({
    queryKey: ["ml-account-by-company", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return null;
      const { data, error } = await supabase
        .from("ml_accounts")
        .select("id, ml_user_id, nickname")
        .eq("company_id", selectedCompanyId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; ml_user_id: string | null; nickname: string | null } | null;
    },
    enabled: !!selectedCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  const resolvedSellerId = companyAccount?.ml_user_id || null;

  // Fetch categories in real-time from ML API via edge function
  const { data: sellerCategories, isLoading: categoriesLoading } = useQuery({
    queryKey: ["ml-seller-categories-live", resolvedSellerId],
    queryFn: async () => {
      if (!resolvedSellerId) return [];
      const { data, error } = await supabase.functions.invoke("ml-price-adjustment", {
        body: { action: "get_seller_categories", sellerId: resolvedSellerId },
      });
      if (error) throw error;
      return (data?.categories || []) as Array<{ id: string; name: string; results: number }>;
    },
    enabled: !!resolvedSellerId,
    staleTime: 5 * 60 * 1000,
  });

  const activeProfiles = profiles.filter((p) => p.is_active);
  const boundCategoryIds = new Set(bindings.map((b) => b.category_id));

  // Categories available (from seller's catalog, excluding already bound)
  const availableCategories = (sellerCategories || []).filter(
    (c) => !boundCategoryIds.has(c.id)
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
      const cat = availableCategories.find((c) => c.id === selectedCategoryId);
      addBinding.mutate({
        profile_id: selectedProfileId,
        category_id: selectedCategoryId,
        category_name: cat?.name || selectedCategoryId,
        category_path: [],
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
    setSelectedCompanyId("");
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

  const showCategorySection = !!selectedCompanyId && !accountLoading;
  const hasNoAccount = showCategorySection && !companyAccount;
  const hasNoSellerId = showCategorySection && companyAccount && !companyAccount.ml_user_id;

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
            {/* Step 1: Company select */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Empresa
              </Label>
              <Select value={selectedCompanyId} onValueChange={(v) => { setSelectedCompanyId(v); setSelectedCategoryId(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder={companiesLoading ? "Carregando..." : "Selecione a empresa"} />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Loading account */}
            {selectedCompanyId && accountLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando conta vinculada...
              </div>
            )}

            {/* No marketplace account */}
            {hasNoAccount && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Esta empresa não possui conta de marketplace vinculada.</span>
              </div>
            )}

            {/* No seller ID */}
            {hasNoSellerId && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>A conta vinculada não possui ID de vendedor configurado.</span>
              </div>
            )}

            {/* Step 2: Profile select */}
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

            {/* Step 3: Category from seller's catalog */}
            {resolvedSellerId && (
              <>
                {categoriesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando categorias...
                  </div>
                ) : availableCategories.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label>Categoria do catálogo</Label>
                    <Select value={selectedCategoryId} onValueChange={(v) => { setSelectedCategoryId(v); setManualCategoryId(""); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} ({c.results} anúncios)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </>
            )}

            {/* Manual category ID */}
            {(resolvedSellerId || hasNoAccount || hasNoSellerId || !selectedCompanyId) && (
              <div className="space-y-1.5">
                <Label>{availableCategories.length > 0 ? "Ou insira o ID manualmente" : "ID da Categoria"}</Label>
                <Input
                  placeholder="Ex: MLB1234"
                  value={manualCategoryId}
                  onChange={(e) => { setManualCategoryId(e.target.value); setSelectedCategoryId(""); }}
                />
              </div>
            )}

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
