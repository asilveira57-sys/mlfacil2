import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Copy, Power, PowerOff } from "lucide-react";
import { useWholesaleProfiles, WholesaleProfile, ProfileFormData } from "@/hooks/useWholesaleProfiles";
import { WholesaleProfileDialog } from "./WholesaleProfileDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

export function WholesaleProfiles() {
  const { profiles, isLoading, createProfile, updateProfile, deleteProfile, toggleActive, getDefaultTiers } = useWholesaleProfiles();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<WholesaleProfile | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = () => {
    setEditingProfile(null);
    setDialogOpen(true);
  };

  const handleEdit = (profile: WholesaleProfile) => {
    setEditingProfile(profile);
    setDialogOpen(true);
  };

  const handleDuplicate = (profile: WholesaleProfile) => {
    const duplicated: WholesaleProfile = {
      ...profile,
      id: "",
      name: `${profile.name} (cópia)`,
      tiers: (profile.tiers || []).map((t) => ({ ...t, id: undefined, profile_id: undefined })),
    };
    setEditingProfile(duplicated);
    setDialogOpen(true);
  };

  const handleSave = (formData: ProfileFormData) => {
    if (editingProfile?.id) {
      updateProfile.mutate({ id: editingProfile.id, formData });
    } else {
      createProfile.mutate(formData);
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteProfile.mutate(deleteId);
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
          <h2 className="text-lg font-semibold">Perfis de Camadas (5 níveis)</h2>
          <p className="text-sm text-muted-foreground">
            Crie perfis e reutilize nas categorias, no padrão do catálogo ou em aplicações avulsas.
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo perfil
        </Button>
      </div>

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum perfil criado ainda. Clique em &quot;Novo perfil&quot; para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => {
            const enabledTiers = (profile.tiers || []).filter((t) => t.is_enabled);
            return (
              <Card key={profile.id} className={!profile.is_active ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{profile.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {enabledTiers.length} camada{enabledTiers.length !== 1 ? "s" : ""} ativa{enabledTiers.length !== 1 ? "s" : ""}
                        {" · "}
                        {profile.rounding_mode === "2_decimals" ? "2 casas" : profile.rounding_mode === "end_90" ? "Final .90" : "Final .99"}
                      </CardDescription>
                    </div>
                    <Badge variant={profile.is_active ? "default" : "secondary"}>
                      {profile.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {enabledTiers.length > 0 && (
                    <div className="space-y-1">
                      {enabledTiers.map((tier) => (
                        <div key={tier.tier_index} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            A partir de {tier.min_quantity} un.
                          </span>
                          <span className="font-medium">
                            {tier.value_type === "PERCENT_DISCOUNT"
                              ? `-${tier.value}%`
                              : `R$ ${tier.value.toFixed(2)}/un`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-1 pt-2 border-t">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(profile)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDuplicate(profile)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActive.mutate({ id: profile.id, is_active: !profile.is_active })}
                    >
                      {profile.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(profile.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <WholesaleProfileDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        profile={editingProfile}
        isNew={!editingProfile?.id}
        getDefaultTiers={getDefaultTiers}
        isSaving={createProfile.isPending || updateProfile.isPending}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir perfil</AlertDialogTitle>
            <AlertDialogDescription>
              Esse perfil pode estar vinculado a categorias ou itens. Excluir remove os vínculos e cria pendências de atualização.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
