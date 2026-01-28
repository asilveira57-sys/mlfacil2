import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Search, 
  Globe, 
  FileCode, 
  Bot,
  Pencil,
  Plus,
  ExternalLink,
  Eye,
  EyeOff,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  FileText,
  Trash2,
  Calendar,
  Tag,
  Target,
  Map,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSeoSettings, usePlatformSettings } from '@/hooks/useAdmin';
import { validateSeoPage, type SeoPageSetting, type SeoPageType, type SeoValidationIssue } from '@/types/admin';
import { clearSeoCache } from '@/hooks/useSeoMeta';

const pageTypeLabels: Record<SeoPageType, string> = {
  external_page: 'Página Externa',
  nlog_post: 'Nlog Post',
};

function CharacterCounter({ current, max, label }: { current: number; max: number; label: string }) {
  const percentage = (current / max) * 100;
  const isOver = current > max;
  const isOptimal = current > 0 && current <= max;
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={isOver ? 'text-destructive font-medium' : isOptimal ? 'text-green-600' : 'text-muted-foreground'}>
          {current}/{max}
        </span>
      </div>
      <Progress 
        value={Math.min(percentage, 100)} 
        className={`h-1 ${isOver ? '[&>div]:bg-destructive' : isOptimal ? '[&>div]:bg-green-500' : ''}`}
      />
    </div>
  );
}

function ValidationAlerts({ issues }: { issues: SeoValidationIssue[] }) {
  if (issues.length === 0) return null;
  
  const errors = issues.filter(i => i.type === 'error');
  const warnings = issues.filter(i => i.type === 'warning');
  
  return (
    <div className="space-y-2">
      {errors.map((issue, idx) => (
        <div key={`error-${idx}`} className="flex items-start gap-2 p-2 bg-destructive/10 text-destructive rounded text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{issue.message}</span>
        </div>
      ))}
      {warnings.map((issue, idx) => (
        <div key={`warn-${idx}`} className="flex items-start gap-2 p-2 bg-warning/10 text-warning rounded text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}

function SeoStatusBadge({ page }: { page: SeoPageSetting }) {
  const issues = validateSeoPage(page);
  const hasErrors = issues.some(i => i.type === 'error');
  const hasWarnings = issues.some(i => i.type === 'warning');
  
  if (hasErrors) {
    return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Pendente</Badge>;
  }
  if (hasWarnings) {
    return <Badge variant="outline" className="gap-1 border-warning text-warning"><AlertTriangle className="h-3 w-3" />Atenção</Badge>;
  }
  return <Badge variant="outline" className="gap-1 border-primary text-primary"><CheckCircle className="h-3 w-3" />OK</Badge>;
}

export function AdminSeo() {
  const { data: seoSettings, isLoading: seoLoading, upsertSeoSetting, deleteSeoSetting } = useSeoSettings();
  const { data: platformSettings, isLoading: platformLoading, updateSetting } = usePlatformSettings();

  const [editDialog, setEditDialog] = useState<{ open: boolean; page: SeoPageSetting | null }>({
    open: false,
    page: null,
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; page: SeoPageSetting | null }>({
    open: false,
    page: null,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<SeoPageType | 'all'>('all');

  const [formData, setFormData] = useState<Partial<SeoPageSetting>>({
    page_path: '',
    page_type: 'external_page',
    meta_title: '',
    meta_description: '',
    meta_keywords: '',
    canonical_url: '',
    og_title: '',
    og_description: '',
    og_image: '',
    robots_index: true,
    robots_follow: true,
    seo_roadmap: '',
    primary_keyword: '',
    secondary_keywords: '',
    seo_cluster: '',
    evergreen_content: false,
    suggested_update_date: null,
  });

  // Get SEO-related platform settings
  const seoGlobalSettings = platformSettings?.filter(s => s.category === 'seo') || [];
  const analyticsSettings = platformSettings?.filter(s => 
    s.key.startsWith('analytics_')
  ) || [];

  // Filter SEO pages
  const filteredPages = useMemo(() => {
    if (!seoSettings) return [];
    return seoSettings.filter(page => {
      const matchesSearch = searchTerm === '' || 
        page.page_path.toLowerCase().includes(searchTerm.toLowerCase()) ||
        page.meta_title?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === 'all' || page.page_type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [seoSettings, searchTerm, typeFilter]);

  // Stats
  const stats = useMemo(() => {
    if (!seoSettings) return { total: 0, external: 0, nlog: 0, withIssues: 0 };
    const withIssues = seoSettings.filter(p => validateSeoPage(p).length > 0).length;
    return {
      total: seoSettings.length,
      external: seoSettings.filter(p => p.page_type === 'external_page').length,
      nlog: seoSettings.filter(p => p.page_type === 'nlog_post').length,
      withIssues,
    };
  }, [seoSettings]);

  const openEditDialog = (page: SeoPageSetting | null) => {
    if (page) {
      setFormData({
        page_path: page.page_path,
        page_type: page.page_type,
        meta_title: page.meta_title || '',
        meta_description: page.meta_description || '',
        meta_keywords: page.meta_keywords || '',
        canonical_url: page.canonical_url || '',
        og_title: page.og_title || '',
        og_description: page.og_description || '',
        og_image: page.og_image || '',
        robots_index: page.robots_index,
        robots_follow: page.robots_follow,
        seo_roadmap: page.seo_roadmap || '',
        primary_keyword: page.primary_keyword || '',
        secondary_keywords: page.secondary_keywords || '',
        seo_cluster: page.seo_cluster || '',
        evergreen_content: page.evergreen_content || false,
        suggested_update_date: page.suggested_update_date,
      });
    } else {
      setFormData({
        page_path: '',
        page_type: 'external_page',
        meta_title: '',
        meta_description: '',
        meta_keywords: '',
        canonical_url: '',
        og_title: '',
        og_description: '',
        og_image: '',
        robots_index: true,
        robots_follow: true,
        seo_roadmap: '',
        primary_keyword: '',
        secondary_keywords: '',
        seo_cluster: '',
        evergreen_content: false,
        suggested_update_date: null,
      });
    }
    setEditDialog({ open: true, page });
  };

  const handleSaveSeo = async () => {
    if (!formData.page_path) return;
    await upsertSeoSetting.mutateAsync(formData as SeoPageSetting);
    clearSeoCache(); // Clear frontend cache
    setEditDialog({ open: false, page: null });
  };

  const handleDeleteSeo = async () => {
    if (!deleteDialog.page) return;
    await deleteSeoSetting.mutateAsync(deleteDialog.page.id);
    clearSeoCache();
    setDeleteDialog({ open: false, page: null });
  };

  const handleUpdateGlobalSetting = async (key: string, value: string) => {
    await updateSetting.mutateAsync({ key, value: JSON.stringify(value) });
  };

  const formValidation = useMemo(() => validateSeoPage(formData), [formData]);
  const isNlogPost = formData.page_type === 'nlog_post';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">SEO Manager</h1>
        <p className="text-muted-foreground">
          Gestão completa de SEO para páginas externas e Nlog
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total de Páginas</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <FileCode className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.external}</div>
                <div className="text-xs text-muted-foreground">Páginas Externas</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.nlog}</div>
                <div className="text-xs text-muted-foreground">Nlog Posts</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.withIssues}</div>
                <div className="text-xs text-muted-foreground">Com Pendências</div>
              </div>
            </div>
          </CardContent>
        </Card>
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
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle>SEO por Página</CardTitle>
                <CardDescription>
                  Configure meta tags, indexação e roadmap para cada página
                </CardDescription>
              </div>
              <Button onClick={() => openEditDialog(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Página
              </Button>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por slug ou título..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as SeoPageType | 'all')}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filtrar por tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="external_page">Páginas Externas</SelectItem>
                    <SelectItem value="nlog_post">Nlog Posts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {seoLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : filteredPages.length === 0 ? (
                <div className="text-center py-12">
                  <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhuma configuração encontrada</p>
                  <Button variant="outline" className="mt-4" onClick={() => openEditDialog(null)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar primeira página
                  </Button>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Slug / Rota</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Meta Title</TableHead>
                        <TableHead className="text-center">Index</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead>Atualizado</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPages.map((page) => (
                        <TableRow key={page.id}>
                          <TableCell className="font-mono text-sm">
                            <div className="flex items-center gap-2">
                              {page.page_path}
                              <a
                                href={page.page_path}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {pageTypeLabels[page.page_type]}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {page.meta_title || <span className="text-muted-foreground italic">Não definido</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {page.robots_index ? (
                              <Eye className="h-4 w-4 text-green-600 mx-auto" />
                            ) : (
                              <EyeOff className="h-4 w-4 text-muted-foreground mx-auto" />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <SeoStatusBadge page={page} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(page.updated_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(page)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleteDialog({ open: true, page })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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
                Configurações SEO padrão da plataforma (fallback quando não há configuração específica)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {platformLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : seoGlobalSettings.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhuma configuração global definida
                </p>
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
            ) : analyticsSettings.length === 0 ? (
              <Card className="md:col-span-2">
                <CardContent className="py-12 text-center">
                  <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhuma configuração de analytics</p>
                </CardContent>
              </Card>
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
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {editDialog.page ? 'Editar SEO da Página' : 'Nova Configuração de Página'}
            </DialogTitle>
            <DialogDescription>
              Configure meta tags, indexação e roadmap estratégico
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6 py-4">
              {/* Validation Alerts */}
              <ValidationAlerts issues={formValidation} />

              {/* Identification */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Identificação da Página
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Rota / Slug *</Label>
                    <Input
                      value={formData.page_path}
                      onChange={(e) => setFormData(prev => ({ ...prev, page_path: e.target.value }))}
                      placeholder="/exemplo ou /nlog/titulo-do-post"
                      disabled={!!editDialog.page}
                    />
                    <p className="text-xs text-muted-foreground">
                      Exemplos: /, /planos, /nlog/seo-para-marketplace
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de Página</Label>
                    <Select 
                      value={formData.page_type} 
                      onValueChange={(v) => setFormData(prev => ({ ...prev, page_type: v as SeoPageType }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="external_page">Página Externa</SelectItem>
                        <SelectItem value="nlog_post">Nlog Post</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Meta Tags */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Meta Tags
                </h4>
                
                <div className="space-y-2">
                  <Label>Meta Title</Label>
                  <Input
                    value={formData.meta_title || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, meta_title: e.target.value }))}
                    placeholder="Título da página (até 60 caracteres)"
                  />
                  <CharacterCounter current={formData.meta_title?.length || 0} max={60} label="Recomendado" />
                </div>

                <div className="space-y-2">
                  <Label>Meta Description</Label>
                  <Textarea
                    value={formData.meta_description || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
                    placeholder="Descrição da página (até 160 caracteres)"
                    rows={2}
                  />
                  <CharacterCounter current={formData.meta_description?.length || 0} max={160} label="Recomendado" />
                </div>

                <div className="space-y-2">
                  <Label>Meta Keywords</Label>
                  <Input
                    value={formData.meta_keywords || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, meta_keywords: e.target.value }))}
                    placeholder="palavra1, palavra2, palavra3"
                  />
                  <p className="text-xs text-muted-foreground">
                    Separadas por vírgula. Uso interno para organização editorial.
                  </p>
                </div>
              </div>

              <Separator />

              {/* Open Graph */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Open Graph (Redes Sociais)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>OG Title</Label>
                    <Input
                      value={formData.og_title || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, og_title: e.target.value }))}
                      placeholder="Título para redes sociais"
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
                <div className="space-y-2">
                  <Label>OG Description</Label>
                  <Textarea
                    value={formData.og_description || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, og_description: e.target.value }))}
                    placeholder="Descrição para redes sociais"
                    rows={2}
                  />
                </div>
              </div>

              <Separator />

              {/* Indexação */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Indexação e Crawling
                </h4>
                <div className="flex flex-wrap gap-6">
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
                <div className="space-y-2">
                  <Label>Canonical URL</Label>
                  <Input
                    value={formData.canonical_url || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, canonical_url: e.target.value }))}
                    placeholder="Deixe vazio para gerar automaticamente"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se vazio, será gerado automaticamente pela rota
                  </p>
                </div>
              </div>

              <Separator />

              {/* Roadmap */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Map className="h-4 w-4" />
                  Roadmap de SEO (Interno)
                </h4>
                <div className="space-y-2">
                  <Label>Planejamento Estratégico</Label>
                  <Textarea
                    value={formData.seo_roadmap || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, seo_roadmap: e.target.value }))}
                    placeholder="Notas internas sobre otimizações futuras, checklist editorial, estratégia de crescimento..."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Campo interno, não exibido no frontend
                  </p>
                </div>
              </div>

              {/* Nlog-specific fields */}
              {isNlogPost && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Campos Específicos do Nlog
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Palavra-chave Principal *</Label>
                        <Input
                          value={formData.primary_keyword || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, primary_keyword: e.target.value }))}
                          placeholder="Ex: vender no mercado livre"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Cluster SEO</Label>
                        <Input
                          value={formData.seo_cluster || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, seo_cluster: e.target.value }))}
                          placeholder="Ex: vendas-marketplace"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Palavras-chave Secundárias</Label>
                      <Input
                        value={formData.secondary_keywords || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, secondary_keywords: e.target.value }))}
                        placeholder="palavra1, palavra2, palavra3"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={formData.evergreen_content}
                          onCheckedChange={(checked) => setFormData(prev => ({ 
                            ...prev, 
                            evergreen_content: checked 
                          }))}
                        />
                        <Label>Conteúdo Evergreen</Label>
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Data Sugerida de Atualização
                        </Label>
                        <Input
                          type="date"
                          value={formData.suggested_update_date || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, suggested_update_date: e.target.value || null }))}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

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
              {upsertSeoSetting.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, page: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir configuração de SEO?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A página <strong>{deleteDialog.page?.page_path}</strong> voltará a usar as configurações padrão do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSeo} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
