import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, 
  Globe, 
  FileCode, 
  Bot,
  Pencil,
  Plus,
  ExternalLink,
  Eye,
  EyeOff
} from 'lucide-react';
import { useSeoSettings, usePlatformSettings } from '@/hooks/useAdmin';
import type { SeoPageSetting } from '@/types/admin';

export function AdminSeo() {
  const { data: seoSettings, isLoading: seoLoading, upsertSeoSetting } = useSeoSettings();
  const { data: platformSettings, isLoading: platformLoading, updateSetting } = usePlatformSettings();

  const [editDialog, setEditDialog] = useState<{ open: boolean; page: SeoPageSetting | null }>({
    open: false,
    page: null,
  });

  const [formData, setFormData] = useState<Partial<SeoPageSetting>>({
    page_path: '',
    meta_title: '',
    meta_description: '',
    canonical_url: '',
    og_title: '',
    og_description: '',
    og_image: '',
    robots_index: true,
    robots_follow: true,
  });

  // Get SEO-related platform settings
  const seoGlobalSettings = platformSettings?.filter(s => s.category === 'seo') || [];
  const analyticsSettings = platformSettings?.filter(s => 
    s.key.startsWith('analytics_')
  ) || [];

  const openEditDialog = (page: SeoPageSetting | null) => {
    if (page) {
      setFormData({
        page_path: page.page_path,
        meta_title: page.meta_title || '',
        meta_description: page.meta_description || '',
        canonical_url: page.canonical_url || '',
        og_title: page.og_title || '',
        og_description: page.og_description || '',
        og_image: page.og_image || '',
        robots_index: page.robots_index,
        robots_follow: page.robots_follow,
      });
    } else {
      setFormData({
        page_path: '',
        meta_title: '',
        meta_description: '',
        canonical_url: '',
        og_title: '',
        og_description: '',
        og_image: '',
        robots_index: true,
        robots_follow: true,
      });
    }
    setEditDialog({ open: true, page });
  };

  const handleSaveSeo = async () => {
    if (!formData.page_path) return;
    await upsertSeoSetting.mutateAsync(formData as SeoPageSetting);
    setEditDialog({ open: false, page: null });
  };

  const handleUpdateGlobalSetting = async (key: string, value: string) => {
    await updateSetting.mutateAsync({ key, value: JSON.stringify(value) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">SEO da Plataforma</h1>
        <p className="text-muted-foreground">
          Gerencie SEO global, por página e integrações de analytics
        </p>
      </div>

      <Tabs defaultValue="pages">
        <TabsList>
          <TabsTrigger value="pages" className="gap-2">
            <Globe className="h-4 w-4" />
            Páginas
          </TabsTrigger>
          <TabsTrigger value="global" className="gap-2">
            <FileCode className="h-4 w-4" />
            Metas Globais
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <Bot className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Per-Page SEO */}
        <TabsContent value="pages" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>SEO por Página</CardTitle>
                <CardDescription>
                  Configure meta tags individuais para cada página
                </CardDescription>
              </div>
              <Button onClick={() => openEditDialog(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Página
              </Button>
            </CardHeader>
            <CardContent>
              {seoLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : seoSettings?.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Nenhuma configuração de página</p>
                  <Button variant="outline" className="mt-4" onClick={() => openEditDialog(null)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar primeira página
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Caminho</TableHead>
                      <TableHead>Meta Title</TableHead>
                      <TableHead>Index</TableHead>
                      <TableHead>Follow</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {seoSettings?.map((page) => (
                      <TableRow key={page.id}>
                        <TableCell className="font-mono text-sm">
                          {page.page_path}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {page.meta_title || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          {page.robots_index ? (
                            <Eye className="h-4 w-4 text-green-600" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          {page.robots_follow ? (
                            <Eye className="h-4 w-4 text-green-600" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(page)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Global SEO */}
        <TabsContent value="global" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Metas Globais</CardTitle>
              <CardDescription>
                Configurações SEO padrão da plataforma
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {platformLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                seoGlobalSettings.map((setting) => (
                  <div key={setting.key} className="space-y-2">
                    <Label>{setting.description || setting.key}</Label>
                    <div className="flex gap-2">
                      <Input
                        defaultValue={typeof setting.value === 'string' 
                          ? setting.value.replace(/^"|"$/g, '') 
                          : ''}
                        onBlur={(e) => handleUpdateGlobalSetting(setting.key, e.target.value)}
                        placeholder={`Digite ${setting.description?.toLowerCase() || setting.key}`}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Robots.txt */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Robots.txt</CardTitle>
              <CardDescription>
                O arquivo robots.txt está em /public/robots.txt
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <a href="/robots.txt" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver robots.txt
                </a>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics */}
        <TabsContent value="analytics" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2">
            {platformLoading ? (
              <>
                <Skeleton className="h-48" />
                <Skeleton className="h-48" />
              </>
            ) : (
              analyticsSettings.map((setting) => (
                <Card key={setting.key}>
                  <CardHeader>
                    <CardTitle className="text-lg">{setting.description}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>ID</Label>
                      <Input
                        defaultValue={typeof setting.value === 'string' 
                          ? setting.value.replace(/^"|"$/g, '') 
                          : ''}
                        onBlur={(e) => handleUpdateGlobalSetting(setting.key, e.target.value)}
                        placeholder={`Ex: ${setting.key.includes('ga4') ? 'G-XXXXXXXXXX' : 
                          setting.key.includes('gtm') ? 'GTM-XXXXXXX' : 'Pixel ID'}`}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge variant={
                        (typeof setting.value === 'string' && setting.value.replace(/^"|"$/g, '')) 
                          ? 'default' 
                          : 'outline'
                      }>
                        {(typeof setting.value === 'string' && setting.value.replace(/^"|"$/g, '')) 
                          ? 'Configurado' 
                          : 'Não configurado'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit SEO Dialog */}
      <Dialog 
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog({ open, page: null })}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editDialog.page ? 'Editar SEO da Página' : 'Nova Configuração de Página'}
            </DialogTitle>
            <DialogDescription>
              Configure as meta tags para esta página
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Caminho da Página *</Label>
              <Input
                value={formData.page_path}
                onChange={(e) => setFormData(prev => ({ ...prev, page_path: e.target.value }))}
                placeholder="/exemplo"
                disabled={!!editDialog.page}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Meta Title</Label>
                <Input
                  value={formData.meta_title || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, meta_title: e.target.value }))}
                  placeholder="Título da página"
                />
                <p className="text-xs text-muted-foreground">
                  {formData.meta_title?.length || 0}/60 caracteres
                </p>
              </div>

              <div className="space-y-2">
                <Label>OG Title</Label>
                <Input
                  value={formData.og_title || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, og_title: e.target.value }))}
                  placeholder="Título para redes sociais"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Meta Description</Label>
              <Textarea
                value={formData.meta_description || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
                placeholder="Descrição da página"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                {formData.meta_description?.length || 0}/160 caracteres
              </p>
            </div>

            <div className="space-y-2">
              <Label>OG Description</Label>
              <Textarea
                value={formData.og_description || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, og_description: e.target.value }))}
                placeholder="Descrição para redes sociais"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Canonical URL</Label>
                <Input
                  value={formData.canonical_url || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, canonical_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-2">
                <Label>OG Image URL</Label>
                <Input
                  value={formData.og_image || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, og_image: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.robots_index}
                  onCheckedChange={(checked) => setFormData(prev => ({ 
                    ...prev, 
                    robots_index: checked 
                  }))}
                />
                <Label>Indexar (index)</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.robots_follow}
                  onCheckedChange={(checked) => setFormData(prev => ({ 
                    ...prev, 
                    robots_follow: checked 
                  }))}
                />
                <Label>Seguir links (follow)</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline"
              onClick={() => setEditDialog({ open: false, page: null })}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveSeo}
              disabled={!formData.page_path || upsertSeoSetting.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
