import { useMemo, useState, KeyboardEvent } from "react";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Clock, Search, X, Plus, Loader2, ArrowRight, CheckCircle2, XCircle, MinusCircle, Eye, RefreshCw,
} from "lucide-react";

interface Candidato {
  itemId: string;
  title: string;
  logisticType: string | null;
  prazoAtual: string | null;
  thumbnail?: string | null;
  outrosTermos: string[];
}

interface Resultado {
  itemId: string;
  title: string;
  status: "ok" | "pulado" | "erro" | "simulado";
  message: string;
}

const TERMOS_SUGERIDOS = ["couché", "lacre", "frágil"];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export default function TempoDisponibilidade() {
  const { sellerId } = useActiveAccount();

  const [carregando, setCarregando] = useState(false);
  const [anuncios, setAnuncios] = useState<Candidato[] | null>(null);
  const [ignorados, setIgnorados] = useState<{ full: number; inativo: number; sem_titulo: number } | null>(null);

  const [termos, setTermos] = useState<string[]>(TERMOS_SUGERIDOS);
  const [novoTermo, setNovoTermo] = useState("");
  const [excluir, setExcluir] = useState<string[]>([]);
  const [novoExcluir, setNovoExcluir] = useState("");

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [dias, setDias] = useState(6);

  const [confirmarAberto, setConfirmarAberto] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultados, setResultados] = useState<Resultado[]>([]);

  // ── Carregar todos os anúncios elegíveis (ativos e fora do Full) ──
  const carregar = async () => {
    if (!sellerId) {
      toast.error("Selecione uma conta do Mercado Livre no topo da página.");
      return;
    }
    setCarregando(true);
    setResultados([]);
    try {
      const { data, error } = await supabase.functions.invoke("ml-price-adjustment", {
        body: { action: "scan_manufacturing_candidates", sellerId, terms: [] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const lista: Candidato[] = data?.candidatos || [];
      setAnuncios(lista);
      setIgnorados(data?.ignorados || null);
      // Pré-seleciona tudo que bate com os termos atuais
      setSelecionados(new Set(filtrar(lista, termos, excluir).map((a) => a.itemId)));
      toast.success(`${lista.length} anúncios ativos fora do Full carregados.`);
    } catch (e: any) {
      toast.error(`Não consegui carregar os anúncios: ${e?.message || e}`);
    } finally {
      setCarregando(false);
    }
  };

  const filtrar = (lista: Candidato[], inc: string[], exc: string[]) => {
    const i = inc.map(norm).filter(Boolean);
    const x = exc.map(norm).filter(Boolean);
    return lista.filter((a) => {
      const t = norm(a.title);
      if (i.length && !i.some((k) => t.includes(k))) return false;
      if (x.some((k) => t.includes(k))) return false;
      return true;
    });
  };

  const filtrados = useMemo(
    () => (anuncios ? filtrar(anuncios, termos, excluir) : []),
    [anuncios, termos, excluir],
  );

  const contagemPorTermo = useMemo(() => {
    const m: Record<string, number> = {};
    if (!anuncios) return m;
    for (const t of termos) {
      const k = norm(t);
      m[t] = anuncios.filter((a) => norm(a.title).includes(k)).length;
    }
    return m;
  }, [anuncios, termos]);

  const selecionadosVisiveis = filtrados.filter((a) => selecionados.has(a.itemId));
  const valorAlvo = `${dias} dias`;
  const jaNoValor = selecionadosVisiveis.filter((a) => a.prazoAtual === valorAlvo).length;

  // ── Termos ──
  const addTermo = (lista: string[], set: (v: string[]) => void, valor: string, limpar: () => void) => {
    const v = valor.trim();
    if (!v) return;
    if (!lista.some((t) => norm(t) === norm(v))) set([...lista, v]);
    limpar();
  };
  const onEnter = (fn: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); fn(); }
  };

  // ── Seleção ──
  const toggle = (id: string) => {
    const n = new Set(selecionados);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelecionados(n);
  };
  const todosMarcados = filtrados.length > 0 && filtrados.every((a) => selecionados.has(a.itemId));
  const toggleTodos = () => {
    const n = new Set(selecionados);
    if (todosMarcados) filtrados.forEach((a) => n.delete(a.itemId));
    else filtrados.forEach((a) => n.add(a.itemId));
    setSelecionados(n);
  };

  // ── Aplicar ──
  const executar = async (dryRun: boolean) => {
    const alvo = selecionadosVisiveis;
    if (!alvo.length) return;
    setConfirmarAberto(false);
    setAplicando(true);
    setProgresso(0);
    const out: Resultado[] = [];

    for (let i = 0; i < alvo.length; i++) {
      const a = alvo[i];
      try {
        const { data, error } = await supabase.functions.invoke("ml-price-adjustment", {
          body: { action: "apply_manufacturing_time", sellerId, itemId: a.itemId, days: dias, dryRun },
        });
        if (error) throw error;
        if (data?.dryRun) {
          out.push({ itemId: a.itemId, title: a.title, status: "simulado",
            message: `${data.prazoAntes ?? "sem prazo"} → ${data.prazoDepois} (mantém ${data.termosPreservados} outro(s) termo(s))` });
        } else if (data?.skipped) {
          const motivo = data.reason === "ja_estava" ? `já estava em ${data.prazoAntes}`
            : data.reason === "fulfillment" ? "anúncio no Full" : data.reason;
          out.push({ itemId: a.itemId, title: a.title, status: "pulado", message: motivo });
        } else if (data?.success) {
          out.push({ itemId: a.itemId, title: a.title, status: "ok",
            message: `${data.prazoAntes ?? "sem prazo"} → ${data.prazoDepois}` });
        } else {
          out.push({ itemId: a.itemId, title: a.title, status: "erro", message: data?.error || "falhou" });
        }
      } catch (e: any) {
        out.push({ itemId: a.itemId, title: a.title, status: "erro", message: e?.message || String(e) });
      }
      setResultados([...out]);
      setProgresso(Math.round(((i + 1) / alvo.length) * 100));
      if (!dryRun) await new Promise((r) => setTimeout(r, 250)); // respeita o limite do ML
    }

    setAplicando(false);
    const ok = out.filter((r) => r.status === "ok").length;
    const erro = out.filter((r) => r.status === "erro").length;
    if (dryRun) toast.success(`Simulação pronta: ${out.length} anúncio(s). Nada foi alterado.`);
    else toast[erro ? "warning" : "success"](`${ok} aplicado(s), ${erro} com erro.`);

    // Atualiza o prazo exibido na tabela sem recarregar do ML
    if (!dryRun && anuncios) {
      const aplicados = new Set(out.filter((r) => r.status === "ok").map((r) => r.itemId));
      setAnuncios(anuncios.map((a) => (aplicados.has(a.itemId) ? { ...a, prazoAtual: valorAlvo } : a)));
    }
  };

  const iconeStatus = (s: Resultado["status"]) =>
    s === "ok" ? <CheckCircle2 className="h-4 w-4 text-green-600" />
    : s === "erro" ? <XCircle className="h-4 w-4 text-destructive" />
    : s === "simulado" ? <Eye className="h-4 w-4 text-primary" />
    : <MinusCircle className="h-4 w-4 text-muted-foreground" />;

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" /> Tempo de Disponibilidade
        </h1>
        <p className="text-muted-foreground mt-1">
          Filtre anúncios pelo título e aplique o prazo de disponibilidade de estoque em lote.
          Só entram anúncios ativos e fora do Full. A garantia e os demais termos do anúncio são mantidos.
        </p>
      </header>

      {/* 1. Carregar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Carregar anúncios da conta</CardTitle>
          <CardDescription>
            Busca no Mercado Livre todos os anúncios ativos fora do Full da conta selecionada no topo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={carregar} disabled={carregando || aplicando}>
            {carregando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : anuncios ? <RefreshCw className="h-4 w-4 mr-2" /> : <Search className="h-4 w-4 mr-2" />}
            {carregando ? "Carregando..." : anuncios ? "Recarregar" : "Carregar anúncios"}
          </Button>
          {anuncios && (
            <span className="text-sm text-muted-foreground">
              {anuncios.length} anúncios elegíveis
              {ignorados && ` · ${ignorados.full} no Full ignorados`}
            </span>
          )}
        </CardContent>
      </Card>

      {/* 2. Filtrar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">2. Filtrar pelo título</CardTitle>
          <CardDescription>
            Entra o anúncio que tiver <strong>qualquer um</strong> dos termos no título. Não diferencia
            maiúsculas nem acentos (frágil = fragil).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Termos que entram</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {termos.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1 pr-1 text-sm">
                  {t}
                  {anuncios && <span className="text-muted-foreground">({contagemPorTermo[t] ?? 0})</span>}
                  <button aria-label={`Remover ${t}`} onClick={() => setTermos(termos.filter((x) => x !== t))}
                    className="ml-1 rounded hover:bg-muted p-0.5"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              {termos.length === 0 && <span className="text-sm text-muted-foreground">Sem termo: mostra todos.</span>}
            </div>
            <div className="flex gap-2 max-w-md">
              <Input placeholder="Ex.: etiqueta frágil" value={novoTermo}
                onChange={(e) => setNovoTermo(e.target.value)}
                onKeyDown={onEnter(() => addTermo(termos, setTermos, novoTermo, () => setNovoTermo("")))} />
              <Button variant="outline" onClick={() => addTermo(termos, setTermos, novoTermo, () => setNovoTermo(""))}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Termos que saem (opcional)</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {excluir.map((t) => (
                <Badge key={t} variant="outline" className="gap-1 pr-1 text-sm">
                  {t}
                  <button aria-label={`Remover ${t}`} onClick={() => setExcluir(excluir.filter((x) => x !== t))}
                    className="ml-1 rounded hover:bg-muted p-0.5"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2 max-w-md">
              <Input placeholder="Ex.: kit" value={novoExcluir}
                onChange={(e) => setNovoExcluir(e.target.value)}
                onKeyDown={onEnter(() => addTermo(excluir, setExcluir, novoExcluir, () => setNovoExcluir("")))} />
              <Button variant="outline" onClick={() => addTermo(excluir, setExcluir, novoExcluir, () => setNovoExcluir(""))}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Revisar */}
      {anuncios && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">3. Revisar e marcar</CardTitle>
              <CardDescription>
                {filtrados.length} encontrado(s) · {selecionadosVisiveis.length} marcado(s)
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {filtrados.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum anúncio com esses termos. Ajuste os filtros acima.
              </p>
            ) : (
              <div className="border rounded-md max-h-[480px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox checked={todosMarcados} onCheckedChange={toggleTodos} aria-label="Marcar todos" />
                      </TableHead>
                      <TableHead>Anúncio</TableHead>
                      <TableHead className="w-36">Prazo atual</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrados.map((a) => (
                      <TableRow key={a.itemId} className="cursor-pointer" onClick={() => toggle(a.itemId)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selecionados.has(a.itemId)} onCheckedChange={() => toggle(a.itemId)} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {a.thumbnail && <img src={a.thumbnail} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" />}
                            <div>
                              <div className="font-medium leading-tight">{a.title}</div>
                              <div className="text-xs text-muted-foreground">{a.itemId}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {a.prazoAtual
                            ? <Badge variant={a.prazoAtual === valorAlvo ? "default" : "secondary"}>{a.prazoAtual}</Badge>
                            : <span className="text-xs text-muted-foreground">sem prazo</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 4. Aplicar */}
      {anuncios && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">4. Tempo de disponibilidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="dias" className="text-sm font-medium block mb-1">Dias</label>
                <Input id="dias" type="number" min={1} max={45} value={dias} className="w-28"
                  onChange={(e) => setDias(Math.max(1, Math.min(45, Number(e.target.value) || 1)))} />
              </div>
              <Button size="lg" disabled={aplicando || selecionadosVisiveis.length === 0}
                onClick={() => setConfirmarAberto(true)}>
                Avançar <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
            <Alert>
              <AlertDescription>
                O Mercado Livre conta em <strong>dias corridos</strong>, não úteis. 6 dias corridos cobrem
                cerca de 4 dias úteis.
              </AlertDescription>
            </Alert>

            {(aplicando || resultados.length > 0) && (
              <div className="space-y-3">
                {aplicando && <Progress value={progresso} />}
                <div className="flex gap-4 text-sm">
                  <span>✅ {resultados.filter((r) => r.status === "ok").length} aplicados</span>
                  <span>👁 {resultados.filter((r) => r.status === "simulado").length} simulados</span>
                  <span>➖ {resultados.filter((r) => r.status === "pulado").length} pulados</span>
                  <span>❌ {resultados.filter((r) => r.status === "erro").length} com erro</span>
                </div>
                <div className="border rounded-md max-h-72 overflow-auto divide-y">
                  {resultados.map((r) => (
                    <div key={r.itemId} className="flex items-start gap-2 p-2 text-sm">
                      {iconeStatus(r.status)}
                      <div>
                        <div className="font-medium leading-tight">{r.title}</div>
                        <div className="text-xs text-muted-foreground">{r.itemId} · {r.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmarAberto} onOpenChange={setConfirmarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar {dias} dias de disponibilidade?</DialogTitle>
            <DialogDescription>
              {selecionadosVisiveis.length} anúncio(s) marcado(s)
              {jaNoValor > 0 && ` — ${jaNoValor} já está(ão) em ${valorAlvo} e será(ão) pulado(s)`}.
              A garantia e os outros termos de cada anúncio são mantidos, e o valor anterior fica
              registrado para poder desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => executar(true)}>
              <Eye className="h-4 w-4 mr-2" /> Simular (não altera)
            </Button>
            <Button onClick={() => executar(false)}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Aplicar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
