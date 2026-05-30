import { useState, useCallback, useRef, useEffect } from "react";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { supabase } from "@/integrations/supabase/client";
import { useUserContext } from "@/hooks/useUserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Search, ArrowRight, ArrowLeft, ChevronsRight, ChevronsLeft, Eye, Play, Loader2, CheckCircle2, XCircle, AlertTriangle, CalendarIcon, Bell } from "lucide-react";
import { EconomyModeBanner } from "@/components/shared/EconomyModeBanner";

interface MlItem {
  id: string;
  title: string;
  price: number;
  status: string;
  variations?: { id: number; price: number; attribute_combinations?: any[] }[];
  sale_terms?: any[];
  seller_custom_field?: string;
  category_id?: string;
  thumbnail?: string;
  available_quantity?: number;
  sold_quantity?: number;
}

interface PreviewRow {
  item: MlItem;
  oldPrice: number;
  newPrice: number;
  percent: number;
  hasVariations: boolean;
  hasPxQ: boolean;
  variations?: { id: number; price: number; newPrice: number }[];
}

interface LogEntry {
  itemId: string;
  title: string;
  success: boolean;
  message: string;
  responseBody?: any;
}

interface SellerCategory {
  id: string;
  name: string;
  results: number;
}

export default function AjustePreco() {
  const { sellerId } = useActiveAccount();
  const { activeCompanyId } = useUserContext();

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [filterCategory, setFilterCategory] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [foundItems, setFoundItems] = useState<MlItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<MlItem[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchOffset, setSearchOffset] = useState(0);

  // Categories
  const [sellerCategories, setSellerCategories] = useState<SellerCategory[]>([]);
  const [isFetchingCategories, setIsFetchingCategories] = useState(false);

  // Adjustment config
  const [tipoAjuste, setTipoAjuste] = useState<"aumentar" | "diminuir">("aumentar");
  const [percentual, setPercentual] = useState(3);
  const [arredondamento, setArredondamento] = useState<"90" | "99" | "nenhum">("nenhum");

  // Preview & execution
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0);
  const [applyLogs, setApplyLogs] = useState<LogEntry[]>([]);
  const [applyMode, setApplyMode] = useState<"teste" | "definitivo" | null>(null);
  const cancelRef = useRef(false);

  // Reminder dialog
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderDate, setReminderDate] = useState<Date | undefined>(addDays(new Date(), 15));
  const [isSavingReminder, setIsSavingReminder] = useState(false);

  // ── Reset on seller change ──
  useEffect(() => {
    setSearchQuery("");
    setFilterStatus("active");
    setFilterCategory("");
    setFoundItems([]);
    setSelectedItems([]);
    setPreviewRows([]);
    setShowPreview(false);
    setApplyLogs([]);
    setSearchTotal(0);
    setSearchOffset(0);
  }, [sellerId]);

  // ── Fetch categories on seller change ──
  useEffect(() => {
    if (!sellerId) { setSellerCategories([]); return; }
    const fetchCategories = async () => {
      setIsFetchingCategories(true);
      try {
        const { data, error } = await supabase.functions.invoke("ml-price-adjustment", {
          body: { action: "get_seller_categories", sellerId },
        });
        if (!error && data?.categories) {
          setSellerCategories(data.categories);
        }
      } catch {
        // silent
      } finally {
        setIsFetchingCategories(false);
      }
    };
    fetchCategories();
  }, [sellerId]);

  // ── Search ──
  const handleSearch = useCallback(async (offset = 0) => {
    if (!sellerId) { toast.error("Nenhuma conta ML conectada"); return; }
    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("ml-price-adjustment", {
        body: {
          action: "search_items",
          sellerId,
          query: searchQuery || undefined,
          categoryId: (filterCategory && filterCategory !== "todas") ? filterCategory : undefined,
          status: filterStatus === "todos" ? undefined : (filterStatus || undefined),
          offset,
          limit: 50,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      setFoundItems(data.items || []);
      setSearchTotal(data.total || 0);
      setSearchOffset(offset);
    } catch (e: any) {
      toast.error(e.message || "Erro na busca");
    } finally {
      setIsSearching(false);
    }
  }, [sellerId, searchQuery, filterStatus, filterCategory]);

  // ── Selector helpers ──
  const addItem = (item: MlItem) => {
    if (!selectedItems.find((s) => s.id === item.id)) {
      setSelectedItems((prev) => [...prev, item]);
    }
  };
  const removeItem = (item: MlItem) => setSelectedItems((prev) => prev.filter((s) => s.id !== item.id));
  const addAll = () => {
    const newItems = foundItems.filter((f) => !selectedItems.find((s) => s.id === f.id));
    setSelectedItems((prev) => [...prev, ...newItems]);
  };
  const removeAll = () => setSelectedItems([]);

  // ── Price calc ──
  const calcNewPrice = (price: number): number => {
    const factor = tipoAjuste === "aumentar" ? 1 + percentual / 100 : 1 - percentual / 100;
    let newP = price * factor;
    if (arredondamento === "90") {
      newP = Math.floor(newP) + 0.9;
    } else if (arredondamento === "99") {
      newP = Math.floor(newP) + 0.99;
    }
    return Math.round(newP * 100) / 100;
  };

  // ── Preview ──
  const generatePreview = () => {
    if (selectedItems.length === 0) { toast.error("Selecione pelo menos um item"); return; }
    const rows: PreviewRow[] = selectedItems.map((item) => {
      const hasVariations = !!item.variations && item.variations.length > 0;
      const hasPxQ = !!item.sale_terms?.some((st: any) => st.id === "PURCHASE_MAX_QUANTITY");
      const oldPrice = item.price;
      const newPrice = calcNewPrice(oldPrice);
      let variationPreviews: { id: number; price: number; newPrice: number }[] | undefined;
      if (hasVariations) {
        variationPreviews = item.variations!.map((v) => ({
          id: v.id,
          price: v.price,
          newPrice: calcNewPrice(v.price),
        }));
      }
      return { item, oldPrice, newPrice, percent: percentual, hasVariations, hasPxQ, variations: variationPreviews };
    });
    setPreviewRows(rows);
    setShowPreview(true);
    setApplyLogs([]);
  };

  // ── Apply ──
  const applyPrices = async (mode: "teste" | "definitivo") => {
    if (previewRows.length === 0) return;
    setApplyMode(mode);
    setIsApplying(true);
    setApplyProgress(0);
    setApplyLogs([]);
    cancelRef.current = false;

    const itemsToProcess = mode === "teste" ? [previewRows[0]] : previewRows;
    const total = itemsToProcess.length;
    const logs: LogEntry[] = [];

    for (let i = 0; i < total; i++) {
      if (cancelRef.current) {
        logs.push({ itemId: "—", title: "Cancelado pelo usuário", success: false, message: "Execução cancelada" });
        break;
      }

      const row = itemsToProcess[i];
      try {
        const payload: any = {
          action: "apply_price",
          sellerId,
          itemId: row.item.id,
          newPrice: row.newPrice,
          oldPrice: row.oldPrice,
          percentual: row.percent,
          tipoAjuste,
          modo: mode,
          arredondamento,
          possuiVariacao: row.hasVariations,
          possuiPxq: row.hasPxQ,
          titulo: row.item.title,
          empresaId: activeCompanyId || undefined,
        };
        if (row.hasVariations && row.variations) {
          payload.variations = row.variations.map((v) => ({ id: v.id, price: v.newPrice }));
        }

        const { data, error } = await supabase.functions.invoke("ml-price-adjustment", { body: payload });

        if (error) throw error;

        if (data?.success) {
          logs.push({ itemId: row.item.id, title: row.item.title, success: true, message: `R$ ${row.oldPrice} → R$ ${row.newPrice}`, responseBody: data.responseBody });
        } else {
          if (data?.status === 429) {
            const retryAfter = 2000 * (i + 1);
            logs.push({ itemId: row.item.id, title: row.item.title, success: false, message: `Rate limit (429). Aguardando ${retryAfter / 1000}s...` });
            await new Promise((r) => setTimeout(r, retryAfter));
            const { data: retryData } = await supabase.functions.invoke("ml-price-adjustment", { body: payload });
            if (retryData?.success) {
              logs[logs.length - 1] = { itemId: row.item.id, title: row.item.title, success: true, message: `R$ ${row.oldPrice} → R$ ${row.newPrice} (retry)` };
            } else {
              logs[logs.length - 1].message += ` — Retry falhou: ${retryData?.error || 'unknown'}`;
            }
          } else {
            logs.push({ itemId: row.item.id, title: row.item.title, success: false, message: data?.error || "Erro desconhecido", responseBody: data?.responseBody });
          }
        }
      } catch (e: any) {
        logs.push({ itemId: row.item.id, title: row.item.title, success: false, message: e.message || "Erro" });
      }

      setApplyProgress(Math.round(((i + 1) / total) * 100));
      setApplyLogs([...logs]);

      if (mode === "definitivo" && i < total - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    setIsApplying(false);
    const successes = logs.filter((l) => l.success).length;
    const failures = logs.filter((l) => !l.success).length;
    toast.success(`Concluído: ${successes} sucesso, ${failures} erro(s)`);

    // Show reminder dialog after definitivo execution with successes
    if (mode === "definitivo" && successes > 0) {
      setShowReminderDialog(true);
    }
  };

  // ── Save reminder ──
  const saveReminder = async () => {
    if (!reminderDate) return;
    setIsSavingReminder(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      
      await supabase.from("app_notifications").insert({
        user_id: user.id,
        title: "Lembrete: Ajuste de Preço",
        category: "task_assigned",
        body: `Lembrete: fazer novo ajuste de preço em lote (último ajuste: ${tipoAjuste === "aumentar" ? "+" : "-"}${percentual}%)`,
        action_url: "/ajuste-preco",
        priority: "normal",
        origin_module: "ajuste_preco",
        created_at: reminderDate.toISOString(),
      });
      toast.success(`Lembrete agendado para ${format(reminderDate, "dd/MM/yyyy", { locale: ptBR })}`);
      setShowReminderDialog(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar lembrete");
    } finally {
      setIsSavingReminder(false);
    }
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Ajuste de Preço em Lote</h1>
        <p className="text-muted-foreground text-sm mt-1">Ajuste percentual de preços dos seus anúncios no Mercado Livre</p>
      </div>

      <EconomyModeBanner moduleName="Ajuste de Preço" />


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT: Filters ── */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Buscar Itens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Input placeholder="Título, SKU ou MLB..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
              
              {/* Category dropdown */}
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger>
                  <SelectValue placeholder={isFetchingCategories ? "Carregando..." : "Todas as categorias"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as categorias</SelectItem>
                  {sellerCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name} ({cat.results})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status filter with Todos */}
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                </SelectContent>
              </Select>

              <Button onClick={() => handleSearch()} disabled={isSearching}>
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                Buscar
              </Button>
            </div>

            {/* ── Dual list ── */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-start">
              {/* Found */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-3 py-2 text-xs font-medium flex justify-between">
                  <span>Encontrados ({foundItems.length} de {searchTotal})</span>
                </div>
                <div className="max-h-[300px] overflow-auto">
                  {foundItems.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">Nenhum item encontrado</p>
                  ) : (
                    foundItems.map((item) => {
                      const isSelected = !!selectedItems.find((s) => s.id === item.id);
                      return (
                        <div key={item.id} className={`flex items-center gap-2 px-3 py-2 border-b text-xs cursor-pointer hover:bg-muted/50 ${isSelected ? "opacity-50" : ""}`} onClick={() => !isSelected && addItem(item)}>
                          {item.thumbnail && <img src={item.thumbnail} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-medium">{item.title}</p>
                            <p className="text-muted-foreground">{item.id} · {formatCurrency(item.price)}</p>
                          </div>
                          {item.variations && item.variations.length > 0 && <Badge variant="outline" className="text-[10px] shrink-0">Var</Badge>}
                        </div>
                      );
                    })
                  )}
                </div>
                {searchTotal > 50 && (
                  <div className="flex justify-between items-center px-3 py-2 border-t bg-muted/50">
                    <Button variant="ghost" size="sm" disabled={searchOffset === 0} onClick={() => handleSearch(Math.max(0, searchOffset - 50))}>Anterior</Button>
                    <span className="text-xs text-muted-foreground">{searchOffset + 1}–{Math.min(searchOffset + 50, searchTotal)}</span>
                    <Button variant="ghost" size="sm" disabled={searchOffset + 50 >= searchTotal} onClick={() => handleSearch(searchOffset + 50)}>Próximo</Button>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex md:flex-col gap-2 items-center justify-center py-4">
                <Button variant="outline" size="icon" onClick={() => { const first = foundItems.find(f => !selectedItems.find(s => s.id === f.id)); if (first) addItem(first); }} title="Adicionar"><ArrowRight className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={() => { if (selectedItems.length > 0) removeItem(selectedItems[selectedItems.length - 1]); }} title="Remover"><ArrowLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={addAll} title="Adicionar todos"><ChevronsRight className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" onClick={removeAll} title="Remover todos"><ChevronsLeft className="h-4 w-4" /></Button>
              </div>

              {/* Selected */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-3 py-2 text-xs font-medium">
                  Selecionados ({selectedItems.length})
                </div>
                <div className="max-h-[300px] overflow-auto">
                  {selectedItems.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">Nenhum item selecionado</p>
                  ) : (
                    selectedItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 px-3 py-2 border-b text-xs cursor-pointer hover:bg-destructive/10" onClick={() => removeItem(item)}>
                        {item.thumbnail && <img src={item.thumbnail} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{item.title}</p>
                          <p className="text-muted-foreground">{item.id} · {formatCurrency(item.price)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── RIGHT: Adjustment config ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Regra de Ajuste</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de ajuste</label>
              <Select value={tipoAjuste} onValueChange={(v) => setTipoAjuste(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aumentar">▲ Aumentar</SelectItem>
                  <SelectItem value="diminuir">▼ Diminuir</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Percentual: {percentual}%</label>
              <Slider value={[percentual]} onValueChange={([v]) => setPercentual(v)} min={0.5} max={50} step={0.5} />
              <Input type="number" className="mt-2" value={percentual} onChange={(e) => setPercentual(Number(e.target.value))} min={0.1} max={100} step={0.1} />
            </div>

            {/* ── 3% warning ── */}
            {percentual > 3 && (
              <Alert className="border-amber-500/50 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                  Recomendamos reajuste máximo de 3% por vez, a cada 15 dias, para evitar impacto negativo no posicionamento dos anúncios.
                </AlertDescription>
              </Alert>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Arredondamento</label>
              <Select value={arredondamento} onValueChange={(v) => setArredondamento(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem arredondamento</SelectItem>
                  <SelectItem value="90">Arredondar para ,90</SelectItem>
                  <SelectItem value="99">Arredondar para ,99</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full" onClick={generatePreview} disabled={selectedItems.length === 0}>
              <Eye className="h-4 w-4 mr-2" />
              Gerar Prévia ({selectedItems.length} itens)
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Preview table ── */}
      {showPreview && previewRows.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Prévia de Ajuste</CardTitle>
              {percentual > 3 && (
                <p className="text-xs text-amber-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Percentual acima de 3% — Atenção ao posicionamento
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => applyPrices("teste")} disabled={isApplying}>
                <AlertTriangle className="h-4 w-4 mr-1 text-accent-foreground" />
                Aplicar Modo Teste (1 item)
              </Button>
              <Button size="sm" onClick={() => applyPrices("definitivo")} disabled={isApplying}>
                <Play className="h-4 w-4 mr-1" />
                Aplicar Definitivo ({previewRows.length} itens)
              </Button>
              {isApplying && (
                <Button variant="destructive" size="sm" onClick={() => { cancelRef.current = true; }}>
                  Cancelar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isApplying && (
              <div className="mb-4 space-y-1">
                <Progress value={applyProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-right">{applyProgress}%</p>
              </div>
            )}
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Item</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead className="text-right">Preço Atual</TableHead>
                    <TableHead className="text-right">Novo Preço</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-center">Variação</TableHead>
                    <TableHead className="text-center">PxQ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row) => (
                    <TableRow key={row.item.id}>
                      <TableCell className="text-xs font-mono">{row.item.id.replace("MLB", "")}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{row.item.title}</TableCell>
                      <TableCell className="text-right text-xs">{formatCurrency(row.oldPrice)}</TableCell>
                      <TableCell className="text-right text-xs font-medium">{formatCurrency(row.newPrice)}</TableCell>
                      <TableCell className="text-right text-xs">{tipoAjuste === "aumentar" ? "+" : "-"}{row.percent}%</TableCell>
                      <TableCell className="text-center">{row.hasVariations ? <Badge variant="secondary" className="text-[10px]">Sim</Badge> : "—"}</TableCell>
                      <TableCell className="text-center">{row.hasPxQ ? <Badge variant="secondary" className="text-[10px]">Sim</Badge> : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Logs ── */}
      {applyLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Log de Execução
              <Badge variant="outline">{applyMode === "teste" ? "Modo Teste" : "Definitivo"}</Badge>
              <span className="text-xs text-muted-foreground ml-auto">
                {applyLogs.filter((l) => l.success).length} ✓ / {applyLogs.filter((l) => !l.success).length} ✗
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[300px] overflow-auto space-y-1">
              {applyLogs.map((log, idx) => (
                <div key={idx} className={`flex items-start gap-2 px-3 py-2 rounded text-xs ${log.success ? "bg-primary/10" : "bg-destructive/10"}`}>
                  {log.success ? <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{log.itemId} — {log.title}</p>
                    <p className="text-muted-foreground">{log.message}</p>
                    {log.responseBody && applyMode === "teste" && (
                      <pre className="mt-1 text-[10px] bg-muted p-2 rounded overflow-auto max-h-[120px]">{JSON.stringify(log.responseBody, null, 2)}</pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Reminder Dialog ── */}
      <Dialog open={showReminderDialog} onOpenChange={setShowReminderDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Agendar Lembrete
            </DialogTitle>
            <DialogDescription>
              Agende um lembrete para o próximo ajuste de preço. Recomendamos aguardar ao menos 15 dias.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !reminderDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {reminderDate ? format(reminderDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={reminderDate}
                  onSelect={setReminderDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowReminderDialog(false)}>Pular</Button>
            <Button onClick={saveReminder} disabled={!reminderDate || isSavingReminder}>
              {isSavingReminder ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Bell className="h-4 w-4 mr-2" />}
              Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
