import { useMemo, useState, KeyboardEvent } from "react";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Layers, Search, X, Plus, Loader2, ArrowRight, ArrowLeft, ChevronsRight, ChevronsLeft,
  CheckCircle2, XCircle, MinusCircle, Eye, RefreshCw, PauseCircle, PlayCircle, PackageX, Package,
} from "lucide-react";

interface Anuncio {
  itemId: string; title: string; thumbnail?: string | null; status: string; subStatus?: string[];
  estoque: number | null; variacoes?: number; catalogo?: boolean;
}
interface Resultado { itemId: string; title: string; status: "ok" | "pulado" | "erro" | "simulado"; message: string; }
type Acao = "zerar_pausar" | "pausar" | "definir_estoque" | "ativar";
type FiltroStatus = "todos" | "active" | "paused";

const ACOES: Record<Acao, { label: string; icon: any; descricao: string }> = {
  zerar_pausar:    { label: "Zerar estoque e pausar", icon: PackageX,   descricao: "Estoque vai a 0 e o anúncio é pausado no Mercado Livre." },
  pausar:          { label: "Só pausar",              icon: PauseCircle, descricao: "Pausa o anúncio e mantém o estoque como está." },
  definir_estoque: { label: "Definir estoque",        icon: Package,    descricao: "Troca o estoque pelo número informado (em anúncio com variações, vale para todas)." },
  ativar:          { label: "Ativar",                 icon: PlayCircle, descricao: "Reativa o anúncio. Se informar estoque, ele é gravado antes de ativar." },
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
const contem = (titulo: string, termo: string) => {
  const t = norm(termo);
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}`).test(" " + norm(titulo));
};
const lerLista = (k: string) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return Array.isArray(v) ? v : []; } catch { return []; } };
const salvarLista = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignora */ } };
const statusTxt = (s: string) => (s === "active" ? "Ativo" : s === "paused" ? "Pausado" : s);

export default function AcoesEmLote() {
  const { sellerId } = useActiveAccount();

  const [carregando, setCarregando] = useState(false);
  const [anuncios, setAnuncios] = useState<Anuncio[] | null>(null);
  const [ignoradosFull, setIgnoradosFull] = useState(0);

  const [termos, setTermosS] = useState<string[]>(() => lerLista("acoesLote.termos"));
  const [excluir, setExcluirS] = useState<string[]>(() => lerLista("acoesLote.excluir"));
  const setTermos = (v: string[]) => { setTermosS(v); salvarLista("acoesLote.termos", v); };
  const setExcluir = (v: string[]) => { setExcluirS(v); salvarLista("acoesLote.excluir", v); };
  const [novoTermo, setNovoTermo] = useState("");
  const [novoExcluir, setNovoExcluir] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");

  const [selecionadosIds, setSelecionadosIds] = useState<string[]>([]);
  const [acao, setAcao] = useState<Acao>("zerar_pausar");
  const [estoque, setEstoque] = useState<string>("");

  const [confirmar, setConfirmar] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultados, setResultados] = useState<Resultado[]>([]);

  const carregar = async () => {
    if (!sellerId) { toast.error("Selecione uma conta do Mercado Livre no topo da página."); return; }
    setCarregando(true); setResultados([]);
    try {
      const { data, error } = await supabase.functions.invoke("ml-price-adjustment", {
        body: { action: "scan_manufacturing_candidates", sellerId, terms: [], statuses: ["active", "paused"], excludeUsed: false },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const lista: Anuncio[] = (data?.candidatos || []).map((c: any) => ({
        itemId: c.itemId, title: c.title, thumbnail: c.thumbnail, status: c.status, subStatus: c.subStatus,
        estoque: c.estoque, variacoes: c.variacoes, catalogo: c.catalogo || c.vinculado,
      }));
      setAnuncios(lista); setIgnoradosFull(data?.ignorados?.full || 0); setSelecionadosIds([]);
      toast.success(`${lista.length} anúncios ativos e pausados carregados.`);
    } catch (e: any) {
      toast.error(`Não consegui carregar os anúncios: ${e?.message || e}`);
    } finally {
      setCarregando(false);
    }
  };

  const filtrados = useMemo(() => (anuncios || []).filter((a) => {
    if (filtroStatus !== "todos" && a.status !== filtroStatus) return false;
    if (termos.length && !termos.some((k) => contem(a.title, k))) return false;
    if (excluir.some((k) => contem(a.title, k))) return false;
    return true;
  }), [anuncios, termos, excluir, filtroStatus]);

  const porId = useMemo(() => new Map((anuncios || []).map((a) => [a.itemId, a])), [anuncios]);
  const selSet = useMemo(() => new Set(selecionadosIds), [selecionadosIds]);
  const disponiveis = filtrados.filter((a) => !selSet.has(a.itemId));
  const selecionados = selecionadosIds.map((id) => porId.get(id)).filter(Boolean) as Anuncio[];

  const addTermo = (lista: string[], set: (v: string[]) => void, valor: string, limpar: () => void) => {
    const v = valor.trim(); if (!v) return;
    if (!lista.some((t) => norm(t) === norm(v))) set([...lista, v]);
    limpar();
  };
  const onEnter = (fn: () => void) => (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { e.preventDefault(); fn(); } };

  const corpoAcao = (): { quantity?: number; status?: string } | null => {
    const n = estoque.trim() === "" ? undefined : Number(estoque);
    if (n !== undefined && (!Number.isInteger(n) || n < 0)) return null;
    if (acao === "zerar_pausar") return { quantity: 0, status: "paused" };
    if (acao === "pausar") return { status: "paused" };
    if (acao === "definir_estoque") return n === undefined ? null : { quantity: n };
    return { status: "active", ...(n !== undefined ? { quantity: n } : {}) };
  };

  const executar = async (dryRun: boolean) => {
    const corpo = corpoAcao();
    if (!corpo) { toast.error("Informe um estoque válido."); return; }
    setConfirmar(false); setAplicando(true); setProgresso(0);
    const out: Resultado[] = [];
    for (let i = 0; i < selecionados.length; i++) {
      const a = selecionados[i];
      try {
        const { data, error } = await supabase.functions.invoke("ml-price-adjustment", {
          body: { action: "apply_stock_status", sellerId, itemId: a.itemId, ...corpo, dryRun },
        });
        if (error) throw error;
        const fmt = (x: any) => x ? `estoque ${x.estoque ?? "—"} · ${statusTxt(x.status)}` : "—";
        if (data?.dryRun) out.push({ itemId: a.itemId, title: a.title, status: "simulado", message: `${fmt(data.antes)} → ${fmt(data.depois)}` });
        else if (data?.skipped) out.push({ itemId: a.itemId, title: a.title, status: "pulado",
          message: data.reason === "ja_estava" ? `já estava assim (${fmt(data.antes)})` : data.reason === "fulfillment" ? "anúncio no Full" : data.reason });
        else if (data?.success) out.push({ itemId: a.itemId, title: a.title, status: "ok", message: `${fmt(data.antes)} → ${fmt(data.depois)}` });
        else out.push({ itemId: a.itemId, title: a.title, status: "erro", message: data?.error || "falhou" });
      } catch (e: any) {
        out.push({ itemId: a.itemId, title: a.title, status: "erro", message: e?.message || String(e) });
      }
      setResultados([...out]);
      setProgresso(Math.round(((i + 1) / selecionados.length) * 100));
      if (!dryRun) await new Promise((r) => setTimeout(r, 250));
    }
    setAplicando(false);
    const ok = out.filter((r) => r.status === "ok").length;
    const erro = out.filter((r) => r.status === "erro").length;
    if (dryRun) toast.success(`Simulação pronta: ${out.length} anúncio(s). Nada foi alterado.`);
    else toast[erro ? "warning" : "success"](`${ok} alterado(s), ${erro} com erro.`);
    if (!dryRun && ok) carregar();
  };

  const iconeStatus = (s: Resultado["status"]) =>
    s === "ok" ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
    : s === "erro" ? <XCircle className="h-4 w-4 text-destructive shrink-0" />
    : s === "simulado" ? <Eye className="h-4 w-4 text-primary shrink-0" />
    : <MinusCircle className="h-4 w-4 text-muted-foreground shrink-0" />;

  const linha = (a: Anuncio, lado: "esq" | "dir", onClick: () => void) => (
    <div key={a.itemId} onClick={onClick}
      className={cn("flex items-center gap-2 px-3 py-2 border-b text-xs cursor-pointer", lado === "esq" ? "hover:bg-muted/50" : "hover:bg-destructive/10")}>
      {a.thumbnail && <img src={a.thumbnail} alt="" className="w-8 h-8 rounded object-cover shrink-0" loading="lazy" />}
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium">{a.title}</p>
        <p className="text-muted-foreground">{a.itemId} · estoque {a.estoque ?? "—"}{a.variacoes ? ` · ${a.variacoes} variações` : ""}</p>
      </div>
      <Badge variant={a.status === "active" ? "default" : "secondary"} className="text-[10px] shrink-0">{statusTxt(a.status)}</Badge>
    </div>
  );

  const AcaoIcon = ACOES[acao].icon;

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Layers className="h-6 w-6 text-primary" /> Ações em lote</h1>
        <p className="text-muted-foreground mt-1">
          Filtre anúncios pelo título e aplique em lote: zerar estoque e pausar, só pausar, definir estoque ou ativar.
          Anúncios no Full ficam de fora (o estoque é do Mercado Livre).
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-lg">1. Carregar anúncios da conta</CardTitle>
          <CardDescription>Busca no Mercado Livre os anúncios ativos e pausados da conta selecionada no topo.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={carregar} disabled={carregando || aplicando}>
            {carregando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : anuncios ? <RefreshCw className="h-4 w-4 mr-2" /> : <Search className="h-4 w-4 mr-2" />}
            {carregando ? "Carregando..." : anuncios ? "Recarregar" : "Carregar anúncios"}
          </Button>
          {anuncios && <span className="text-sm text-muted-foreground">{anuncios.length} anúncios · {ignoradosFull} no Full ignorados</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">2. Filtrar</CardTitle>
          <CardDescription>Entra o anúncio que tiver qualquer um dos termos no título e nenhum dos que não entram. Sem acento e sem maiúscula; o termo começa uma palavra.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {[
            { titulo: "Termos que entram", lista: termos, set: setTermos, valor: novoTermo, setValor: setNovoTermo, ph: "Ex.: misto dourado", variant: "secondary" as const },
            { titulo: "Não entra (filtro negativo)", lista: excluir, set: setExcluir, valor: novoExcluir, setValor: setNovoExcluir, ph: "Ex.: resina", variant: "outline" as const },
          ].map((b) => (
            <div key={b.titulo}>
              <p className="text-sm font-medium mb-2">{b.titulo}</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {b.lista.map((t) => (
                  <Badge key={t} variant={b.variant} className="gap-1 pr-1 text-sm">{t}
                    <button aria-label={`Remover ${t}`} onClick={() => b.set(b.lista.filter((x) => x !== t))} className="ml-1 rounded hover:bg-muted p-0.5"><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
                {b.lista.length === 0 && <span className="text-sm text-muted-foreground">Nenhum.</span>}
              </div>
              <div className="flex gap-2 max-w-md">
                <Input placeholder={b.ph} value={b.valor} onChange={(e) => b.setValor(e.target.value)}
                  onKeyDown={onEnter(() => addTermo(b.lista, b.set, b.valor, () => b.setValor("")))} />
                <Button variant="outline" onClick={() => addTermo(b.lista, b.set, b.valor, () => b.setValor(""))}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          <div>
            <p className="text-sm font-medium mb-2">Status</p>
            <div className="flex gap-2">
              {([["todos", "Todos"], ["active", "Só ativos"], ["paused", "Só pausados"]] as [FiltroStatus, string][]).map(([v, l]) => (
                <Button key={v} size="sm" variant={filtroStatus === v ? "default" : "outline"} onClick={() => setFiltroStatus(v)}>{l}</Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {anuncios && (
        <Card>
          <CardHeader><CardTitle className="text-lg">3. Selecionar</CardTitle>
            <CardDescription>Clique no anúncio ou use as setas. Só os da direita recebem a ação.</CardDescription></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-start">
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-3 py-2 text-xs font-medium">Para selecionar ({disponiveis.length})</div>
                <div className="max-h-[420px] overflow-auto">
                  {disponiveis.length === 0
                    ? <p className="p-4 text-sm text-muted-foreground text-center">{filtrados.length === 0 ? "Nenhum anúncio com esses filtros." : "Todos já estão selecionados."}</p>
                    : disponiveis.map((a) => linha(a, "esq", () => setSelecionadosIds((s) => [...s, a.itemId])))}
                </div>
              </div>
              <div className="flex md:flex-col gap-2 items-center justify-center py-4">
                <Button variant="outline" size="icon" title="Selecionar o primeiro" onClick={() => disponiveis[0] && setSelecionadosIds((s) => [...s, disponiveis[0].itemId])}><ArrowRight className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" title="Tirar o último" onClick={() => setSelecionadosIds((s) => s.slice(0, -1))}><ArrowLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" title="Enviar todos" onClick={() => setSelecionadosIds((s) => [...s, ...disponiveis.map((a) => a.itemId)])}><ChevronsRight className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" title="Tirar todos" onClick={() => setSelecionadosIds([])}><ChevronsLeft className="h-4 w-4" /></Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-3 py-2 text-xs font-medium">Selecionados ({selecionados.length})</div>
                <div className="max-h-[420px] overflow-auto">
                  {selecionados.length === 0
                    ? <p className="p-4 text-sm text-muted-foreground text-center">Nenhum anúncio selecionado</p>
                    : selecionados.map((a) => linha(a, "dir", () => setSelecionadosIds((s) => s.filter((x) => x !== a.itemId))))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {anuncios && (
        <Card>
          <CardHeader><CardTitle className="text-lg">4. Ação</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ACOES) as Acao[]).map((k) => {
                const I = ACOES[k].icon;
                return (
                  <Button key={k} variant={acao === k ? "default" : "outline"} onClick={() => setAcao(k)}>
                    <I className="h-4 w-4 mr-2" /> {ACOES[k].label}
                  </Button>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground">{ACOES[acao].descricao}</p>
            <div className="flex flex-wrap items-end gap-4">
              {(acao === "definir_estoque" || acao === "ativar") && (
                <div>
                  <label className="text-sm font-medium block mb-1">Estoque{acao === "ativar" ? " (opcional)" : ""}</label>
                  <Input className="w-32" inputMode="numeric" value={estoque} onChange={(e) => setEstoque(e.target.value.replace(/\D/g, ""))} />
                </div>
              )}
              <Button size="lg" disabled={aplicando || selecionados.length === 0} onClick={() => setConfirmar(true)}>
                Avançar com {selecionados.length} anúncio(s) <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>

            {(aplicando || resultados.length > 0) && (
              <div className="space-y-3">
                {aplicando && <Progress value={progresso} />}
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>✅ {resultados.filter((r) => r.status === "ok").length} alterados</span>
                  <span>👁 {resultados.filter((r) => r.status === "simulado").length} simulados</span>
                  <span>➖ {resultados.filter((r) => r.status === "pulado").length} pulados</span>
                  <span>❌ {resultados.filter((r) => r.status === "erro").length} com erro</span>
                </div>
                <div className="border rounded-md max-h-72 overflow-auto divide-y">
                  {resultados.map((r) => (
                    <div key={r.itemId} className="flex items-start gap-2 p-2 text-sm">
                      {iconeStatus(r.status)}
                      <div><div className="font-medium leading-tight">{r.title}</div>
                        <div className="text-xs text-muted-foreground">{r.itemId} · {r.message}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AcaoIcon className="h-5 w-5" /> {ACOES[acao].label}: {selecionados.length} anúncio(s)?</DialogTitle>
            <DialogDescription>
              {ACOES[acao].descricao}
              {(acao === "definir_estoque" || (acao === "ativar" && estoque)) && ` Estoque: ${estoque || "—"}.`}
              {" "}O antes e depois de cada anúncio fica registrado.
            </DialogDescription>
          </DialogHeader>
          <Alert><AlertDescription className="text-xs max-h-32 overflow-auto">
            {selecionados.map((a) => <div key={a.itemId}>{a.itemId} — {a.title}</div>)}
          </AlertDescription></Alert>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => executar(true)}><Eye className="h-4 w-4 mr-2" /> Simular (não altera)</Button>
            <Button onClick={() => executar(false)} variant={acao === "ativar" ? "default" : "destructive"}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Aplicar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
