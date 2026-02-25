import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, RefreshCw, Pencil, Trash2, Eye, BookOpen, FolderOpen } from "lucide-react";

export default function AdminCentralDeAjuda() {
  const [tab, setTab] = useState<"articles" | "categories">("articles");

  // Categories
  const { data: categories = [], refetch: refetchCats } = useQuery({
    queryKey: ["admin-help-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("help_categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Articles
  const { data: articles = [], isLoading, refetch: refetchArticles } = useQuery({
    queryKey: ["admin-help-articles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_articles")
        .select("*, help_categories(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Category Dialog
  const [catDialog, setCatDialog] = useState(false);
  const [catForm, setCatForm] = useState({ id: "", name: "", slug: "", sort_order: 0 });
  const isEditCat = !!catForm.id;

  const saveCat = async () => {
    if (!catForm.name || !catForm.slug) return toast.error("Preencha nome e slug.");
    if (isEditCat) {
      const { error } = await supabase.from("help_categories").update({ name: catForm.name, slug: catForm.slug, sort_order: catForm.sort_order }).eq("id", catForm.id);
      if (error) return toast.error("Erro ao atualizar.");
    } else {
      const { error } = await supabase.from("help_categories").insert({ name: catForm.name, slug: catForm.slug, sort_order: catForm.sort_order });
      if (error) return toast.error("Erro ao criar.");
    }
    toast.success("Categoria salva.");
    setCatDialog(false);
    refetchCats();
  };

  const deleteCat = async (id: string) => {
    const { error } = await supabase.from("help_categories").delete().eq("id", id);
    if (error) return toast.error("Erro ao excluir.");
    toast.success("Categoria excluída.");
    refetchCats();
  };

  // Article Dialog
  const [artDialog, setArtDialog] = useState(false);
  const [artForm, setArtForm] = useState({ id: "", category_id: "", title: "", slug: "", summary: "", content: "", published: false });
  const isEditArt = !!artForm.id;

  const saveArt = async () => {
    if (!artForm.title || !artForm.slug || !artForm.category_id || !artForm.content) return toast.error("Preencha todos os campos obrigatórios.");
    const payload = { category_id: artForm.category_id, title: artForm.title, slug: artForm.slug, summary: artForm.summary || null, content: artForm.content, published: artForm.published };
    if (isEditArt) {
      const { error } = await supabase.from("help_articles").update(payload).eq("id", artForm.id);
      if (error) return toast.error("Erro ao atualizar.");
    } else {
      const { error } = await supabase.from("help_articles").insert(payload);
      if (error) return toast.error("Erro ao criar.");
    }
    toast.success("Artigo salvo.");
    setArtDialog(false);
    refetchArticles();
  };

  const togglePublished = async (id: string, published: boolean) => {
    await supabase.from("help_articles").update({ published }).eq("id", id);
    refetchArticles();
  };

  const deleteArt = async (id: string) => {
    const { error } = await supabase.from("help_articles").delete().eq("id", id);
    if (error) return toast.error("Erro ao excluir.");
    toast.success("Artigo excluído.");
    refetchArticles();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Central de Ajuda</h2>
          <p className="text-sm text-muted-foreground">{articles.length} artigos · {categories.length} categorias</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchCats(); refetchArticles(); }} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2">
        <Button variant={tab === "articles" ? "default" : "outline"} size="sm" onClick={() => setTab("articles")} className="gap-2">
          <BookOpen className="h-4 w-4" /> Artigos
        </Button>
        <Button variant={tab === "categories" ? "default" : "outline"} size="sm" onClick={() => setTab("categories")} className="gap-2">
          <FolderOpen className="h-4 w-4" /> Categorias
        </Button>
      </div>

      {tab === "categories" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Categorias</CardTitle>
            <Button size="sm" onClick={() => { setCatForm({ id: "", name: "", slug: "", sort_order: 0 }); setCatDialog(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Nova
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Ordem</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-sm">{c.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.slug}</TableCell>
                    <TableCell className="text-xs">{c.sort_order}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setCatForm({ id: c.id, name: c.name, slug: c.slug, sort_order: c.sort_order }); setCatDialog(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteCat(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {tab === "articles" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Artigos</CardTitle>
            <Button size="sm" onClick={() => { setArtForm({ id: "", category_id: "", title: "", slug: "", summary: "", content: "", published: false }); setArtDialog(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-sm max-w-[200px] truncate">{a.title}</TableCell>
                    <TableCell className="text-xs">{(a as any).help_categories?.name || "—"}</TableCell>
                    <TableCell className="text-xs flex items-center gap-1"><Eye className="h-3 w-3" /> {a.views}</TableCell>
                    <TableCell>
                      <Switch checked={a.published} onCheckedChange={(v) => togglePublished(a.id, v)} />
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(a.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setArtForm({ id: a.id, category_id: a.category_id, title: a.title, slug: a.slug, summary: a.summary || "", content: a.content, published: a.published }); setArtDialog(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteArt(a.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Category Dialog */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isEditCat ? "Editar" : "Nova"} Categoria</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome</Label><Input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} maxLength={100} /></div>
            <div className="space-y-1"><Label>Slug</Label><Input value={catForm.slug} onChange={e => setCatForm(p => ({ ...p, slug: e.target.value }))} maxLength={100} /></div>
            <div className="space-y-1"><Label>Ordem</Label><Input type="number" value={catForm.sort_order} onChange={e => setCatForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} /></div>
          </div>
          <DialogFooter><Button onClick={saveCat}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Article Dialog */}
      <Dialog open={artDialog} onOpenChange={setArtDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{isEditArt ? "Editar" : "Novo"} Artigo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Título *</Label><Input value={artForm.title} onChange={e => setArtForm(p => ({ ...p, title: e.target.value }))} maxLength={200} /></div>
            <div className="space-y-1"><Label>Slug *</Label><Input value={artForm.slug} onChange={e => setArtForm(p => ({ ...p, slug: e.target.value }))} maxLength={200} /></div>
            <div className="space-y-1">
              <Label>Categoria *</Label>
              <Select value={artForm.category_id} onValueChange={v => setArtForm(p => ({ ...p, category_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c: any) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Resumo</Label><Input value={artForm.summary} onChange={e => setArtForm(p => ({ ...p, summary: e.target.value }))} maxLength={300} /></div>
            <div className="space-y-1"><Label>Conteúdo (Markdown) *</Label><Textarea value={artForm.content} onChange={e => setArtForm(p => ({ ...p, content: e.target.value }))} rows={12} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={artForm.published} onCheckedChange={v => setArtForm(p => ({ ...p, published: v }))} />
              <Label>Publicado</Label>
            </div>
          </div>
          <DialogFooter><Button onClick={saveArt}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
