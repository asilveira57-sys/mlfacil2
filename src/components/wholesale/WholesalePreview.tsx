import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle2, Eye, Loader2, Play, Search, XCircle } from "lucide-react";
import { useWholesalePreview, PreviewRow } from "@/hooks/useWholesalePreview";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    override: { label: "Avulso", variant: "default" },
    category: { label: "Categoria", variant: "secondary" },
    default: { label: "Padrão", variant: "outline" },
  };
  const s = map[source] || { label: source, variant: "outline" as const };
  return <Badge variant={s.variant} className="text-xs">{s.label}</Badge>;
}

export function WholesalePreview() {
  const { loading, applying, previewData, applyResults, loadPreview, applyToItems, clearPreview } = useWholesalePreview();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [confirmApply, setConfirmApply] = useState(false);
  const [viewTab, setViewTab] = useState("items");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const uniqueCategories = useMemo(() => {
    if (!previewData) return [];
    const map = new Map<string, string>();
    previewData.rows.forEach((r) => {
      if (r.category_id && !map.has(r.category_id)) {
        map.set(r.category_id, r.category_name || r.category_id);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [previewData]);

  const filteredRows = useMemo(() => {
    if (!previewData) return [];
    const q = search.toLowerCase();
    return previewData.rows.filter(
      (r) => (!q || r.title.toLowerCase().includes(q) || r.item_id.toLowerCase().includes(q)) &&
        (categoryFilter === "all" || r.category_id === categoryFilter)
    );
  }, [previewData, search, categoryFilter]);

  const applicableRows = filteredRows.filter((r) => !r.is_excluded && r.tiers.length > 0);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === applicableRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(applicableRows.map((r) => r.item_id)));
    }
  };

  const handleApply = () => {
    if (selectedIds.size === 0) return;
    setConfirmApply(true);
  };

  const doApply = () => {
    setConfirmApply(false);
    applyToItems(Array.from(selectedIds));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Preview de Preços de Atacado</h2>
          <p className="text-sm text-muted-foreground">
            Simule e aplique preços de atacado nos anúncios do Mercado Livre.
          </p>
        </div>
        <div className="flex gap-2">
          {previewData && (
            <Button variant="outline" onClick={clearPreview} size="sm">
              Limpar
            </Button>
          )}
          <Button onClick={loadPreview} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            {previewData ? "Recarregar" : "Gerar Preview"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {previewData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{previewData.total_items}</p>
              <p className="text-xs text-muted-foreground">Total anúncios</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{previewData.items_with_profile}</p>
              <p className="text-xs text-muted-foreground">Com perfil</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{previewData.items_excluded}</p>
              <p className="text-xs text-muted-foreground">Excluídos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-muted-foreground">{previewData.items_without_profile}</p>
              <p className="text-xs text-muted-foreground">Sem perfil</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs: Items + Category Summary */}
      {previewData && previewData.rows.length > 0 && (
        <Tabs value={viewTab} onValueChange={setViewTab}>
          <TabsList>
            <TabsTrigger value="items">Itens ({previewData.rows.length})</TabsTrigger>
            <TabsTrigger value="categories">Por Categoria ({previewData.summary.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="mt-3 space-y-3">
            {/* Search + Apply */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título ou MLB..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Todas categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {uniqueCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleApply}
                disabled={applying || selectedIds.size === 0}
                className="gap-2"
                variant="default"
              >
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Aplicar ({selectedIds.size})
              </Button>
            </div>

            {/* Items table */}
            <div className="rounded-md border overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={applicableRows.length > 0 && selectedIds.size === applicableRows.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>Anúncio</TableHead>
                    <TableHead className="text-right">Preço atual</TableHead>
                    <TableHead>Camadas</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <ItemRow
                      key={row.item_id}
                      row={row}
                      selected={selectedIds.has(row.item_id)}
                      onToggle={() => toggleSelect(row.item_id)}
                      applyResult={applyResults?.results.find((r) => r.item_id === row.item_id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="categories" className="mt-3">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Itens</TableHead>
                    <TableHead className="text-right">Desc. máx. médio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.summary.map((s) => (
                    <TableRow key={s.category_id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setCategoryFilter(s.category_id); setViewTab("items"); }}>
                      <TableCell className="font-medium">{s.category_name}</TableCell>
                      <TableCell className="text-right">{s.items_count}</TableCell>
                      <TableCell className="text-right">{s.avg_max_discount.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Apply results */}
      {applyResults && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {applyResults.failed === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-accent-foreground" />
              )}
              Resultado da aplicação
            </CardTitle>
            <CardDescription>
              {applyResults.success} sucesso · {applyResults.failed} erro(s) · {applyResults.total} total
            </CardDescription>
          </CardHeader>
          {applyResults.failed > 0 && (
            <CardContent className="pt-0">
              <div className="space-y-1 max-h-40 overflow-auto">
                {applyResults.results
                  .filter((r) => !r.success)
                  .map((r) => (
                    <div key={r.item_id} className="text-xs flex items-center gap-2">
                      <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                      <span className="font-mono">{r.item_id}</span>
                      <span className="text-muted-foreground truncate">{r.error}</span>
                    </div>
                  ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Confirm dialog */}
      <AlertDialog open={confirmApply} onOpenChange={setConfirmApply}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar preços de atacado?</AlertDialogTitle>
            <AlertDialogDescription>
              Serão atualizados <strong>{selectedIds.size}</strong> anúncios no Mercado Livre com as camadas de desconto dos perfis configurados. Essa ação altera os preços dos anúncios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doApply}>Aplicar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ItemRow({
  row,
  selected,
  onToggle,
  applyResult,
}: {
  row: PreviewRow;
  selected: boolean;
  onToggle: () => void;
  applyResult?: { success: boolean; error?: string };
}) {
  const isApplicable = !row.is_excluded && row.tiers.length > 0;

  return (
    <TableRow className={row.is_excluded ? "opacity-50" : ""}>
      <TableCell>
        {isApplicable && <Checkbox checked={selected} onCheckedChange={onToggle} />}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 min-w-0">
          {row.thumbnail && (
            <img src={row.thumbnail} alt="" className="h-8 w-8 rounded object-cover flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-[250px]">{row.title}</p>
            <p className="text-xs text-muted-foreground font-mono">{row.item_id}</p>
          </div>
          {applyResult && (
            applyResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            )
          )}
        </div>
      </TableCell>
      <TableCell className="text-right font-medium">{formatBRL(row.current_price)}</TableCell>
      <TableCell>
        {row.is_excluded ? (
          <span className="text-xs text-muted-foreground italic">Excluído</span>
        ) : row.tiers.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="space-y-0.5">
            {row.tiers.map((t) => (
              <div key={t.tier_index} className="text-xs flex items-center gap-1.5">
                <span className="text-muted-foreground">{t.min_quantity}+ un:</span>
                <span className="font-medium">{formatBRL(t.unit_price)}</span>
                <span className="text-muted-foreground">(-{t.discount_pct}%)</span>
              </div>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="text-sm">{row.profile_name}</TableCell>
      <TableCell>
        {row.is_excluded ? (
          <Badge variant="destructive" className="text-xs">Excluído</Badge>
        ) : (
          <SourceBadge source={row.source} />
        )}
      </TableCell>
    </TableRow>
  );
}
