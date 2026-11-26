import { useEffect, useMemo, useState, KeyboardEvent } from "react";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  Clock, Search, X, Plus, Loader2, ArrowRight, ArrowLeft, ChevronsRight, ChevronsLeft,
  CheckCircle2, XCircle, MinusCircle, Eye, RefreshCw, Undo2, History, Eraser,
} from "lucide-react";

interface Candidato {
  itemId: string;
  title: string;
  logisticType: string | null;
  prazoAtual: string | null;
  thumbnail?: string | null;
  catalogo?: boolean;
  vinculado?: boolean;
  outrosTermos: string[];
}

interface Resultado {
  itemId: string;
  title: string;
  status: "ok" | "pulado" | "erro" | "simulado";
  message: string;
}

interface Aplicado {
  itemId: string;
  titulo: string;
  valorAntes: string | null;
  valorDepois: string | null;
  quando: string;
}

type FiltroPrazo = "todos" | "com" | "sem";
type Modo = "definir" | "remover";

const TERMOS_SUGERIDOS = ["couché", "lacre", "frágil"];
const EXCLUIR_SUGERIDOS = ["tag", "gôndola", "não adesiv", "sem adesiv", "sem cola"];
const VERSAO_MINIMA = 4; // availability-time-v4: remover prazo, catálogo, Usado/Full

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();

/** O termo precisa começar uma palavra do título: "tag" acha "Tag"/"Tags",
 *  mas não "montagem"; "não adesiv" acha "Não Adesiva". */
const contem = (titulo: string, termo: string) => {
  const t = norm(termo);
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}`).test(" " + norm(titulo));
};

const lerLista = (chave: string, padrao: string[]) => {
  try {
    const v = JSON.parse(localStorage.getItem(chave) || "null");
    return Array.isArray(v) ? v : padrao;
  } catch { return padrao; }
};
const salvarLista = (chave: string, v: string[]) => {
  try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* ignora */ }
};

const prazoTxt = (v: string | null | undefined) => v || "sem prazo";

export default function TempoDisponibilidade() {
  const { sellerId } = useActiveAccount();

  // Versão publicada da função (remover prazo exige v4)
  const [versaoFuncao, setVersaoFuncao] = useState<number | null>(null);
  useEffect(() => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ml-price-adjustment?version`;
    fetch(url).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const m = String(d?.version || "").match(/v(\d+)$/);
      setVersaoFuncao(m ? Number(m[1]) : 0);
    }).catch(() => setVersaoFuncao(0));
  }, []);
  const funcaoAtualizada = (versaoFuncao ?? 0) >= VERSAO_MINIMA;

  const [carregando, setCarregando] = useState(false);
  const [anuncios, setAnuncios] = useState<Candidato[] | null>(null);
  const [ignorados, setIgnorados] = useState<{ full: number; usado?: number; inativo: number; sem_titulo: number } | null>(null);

  const [termos, setTermosState] = useState<string[]>(() => lerLista("tempoDisp.termos", TERMOS_SUGERIDOS));
  const [novoTermo, setNovoTermo] = useState("");
  const [excluir, setExcluirState] = useState<string[]>(() => lerLista("tempoDisp.excluir", EXCLUIR_SUGERIDOS));
  const [novoExcluir, setNovoExcluir] = useState("");
  const setTermos = (v: string[]) => { setTermosState(v); salvarLista("tempoDisp.termos", v); };
  const setExcluir = (v: string[]) => { setExcluirState(v); salvarLista("tempoDisp.excluir", v); };
  const [verRemovidos, setVerRemovidos] = useState(false);
  const [filtroPrazo, setFiltroPrazo] = useState<FiltroPrazo>("todos");

  // Coluna da direita — ordem de inclusão
  const [selecionadosIds, setSelecionadosIds] = useState<string[]>([]);

  const [modo, setModo] = useState<Modo>("definir");
  const [dias, setDias] = useState(6);

  const [confirmarAberto, setConfirmarAberto] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultados, setResultados] = useState<Resultado[]>([]);

  // Desfazer
  const [aplicados, setAplicados] = useState<Aplicado[] | null>(null);
  const [carregandoAplicados, setCarregandoAplicados] = useState(false);
  const [marcadosDesfazer, setMarcadosDesfazer] = useState<Set<string>>(new Set());
  const [desfazendo, setDesfazendo] = useState(false);
  const [resultadoDesfazer, setResultadoDesfazer] = useState<Resultado[]>([]);

  // ── Carregar todos os anúncios elegíveis ──
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
      setSelecionadosIds([]);
      toast.success(`${lista.length} anúncios elegíveis carregados.`);
    } catch (e: any) {
      toast.error(`Não consegui carregar os anúncios: ${e?.message || e}`);
    } finally {
      setCarregando(false);
    }
  };

  const filtrar = (lista: Candidato[], inc: string[], exc: string[], fp: FiltroPrazo) =>
    lista.filter((a) => {
      if (fp === "com" && !a.prazoAtual) return false;
      if (fp === "sem" && a.prazoAtual) return false;
      if (inc.length && !inc.some((k) => contem(a.title, k))) return false;
      if (exc.some((k) => contem(a.title, k))) return false;
      return true;
    });

  const filtrados = useMemo(
    () => (anuncios ? filtrar(anuncios, termos, excluir, filtroPrazo) : []),
    [anuncios, termos, excluir, filtroPrazo],
  );

  const porId = useMemo(() => new Map((anuncios || []).map((a) => [a.itemId, a])), [anuncios]);
  const selSet = useMemo(() => new Set(selecionadosIds), [selecionadosIds]);
  const disponiveis = filtrados.filter((a) => !selSet.has(a.itemId));
  const selecionados = selecionadosIds.map((id) => porId.get(id)).filter(Boolean) as Candidato[];

  const contagemPorTermo = useMemo(() => {
    const m: Record<string, number> = {};
    if (!anuncios) return m;
    for (const t of termos) m[t] = anuncios.filter((a) => contem(a.title, t)).length;
    return m;
  }, [anuncios, termos]);

  // Bateram com um termo de entrada mas foram barrados pelo filtro negativo
  const removidos = useMemo(() => {
    if (!anuncios || excluir.length === 0) return [];
    return filtrar(anuncios, termos, [], filtroPrazo).filter((a) => excluir.some((k) => contem(a.title, k)));
  }, [anuncios, termos, excluir, filtroPrazo]);

  const valorAlvo: string | null = modo === "remover" ? null : `${dias} dias`;
  const jaNoValor = selecionados.filter((a) => (a.prazoAtual ?? null) === valorAlvo).length;

  // ── Mover entre colunas ──
  const adicionar = (id: string) => setSelecionadosIds((s) => (s.includes(id) ? s : [...s, id]));
  const tirar = (id: string) => setSelecionadosIds((s) => s.filter((x) => x !== id));
  const enviarTodos = () => setSelecionadosIds((s) => [...s, ...disponiveis.map((a) => a.itemId)]);
  const tirarTodos = () => setSelecionadosIds([]);

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

  // ── Aplicar ──
  const motivoPulo = (data: any, a: Candidato) => {
    if (data.reason === "ja_estava") {
      return (a.catalogo || a.vinculado) && valorAlvo
        ? `recebeu pelo anúncio original (já está em ${data.prazoAntes})`
        : `já estava em ${prazoTxt(data.prazoAntes)}`;
    }
    if (data.reason === "fulfillment") return "anúncio no Full";
    if (data.reason === "usado") return "anúncio cadastrado como Usado";
    return data.reason;
  };

  const executar = async (dryRun: boolean) => {
    const alvo = selecionados;
    if (!alvo.length) return;
    if (modo === "remover" && !funcaoAtualizada) {
      toast.error("Remover prazo ainda não está publicado no servidor.");
      return;
    }
    setConfirmarAberto(false);
    setAplicando(true);
    setProgresso(0);
    const out: Resultado[] = [];

    for (let i = 0; i < alvo.length; i++) {
      const a = alvo[i];
      try {
        const { data, error } = await supabase.functions.invoke("ml-price-adjustment", {
          body: {
            action: "apply_manufacturing_time", sellerId, itemId: a.itemId,
            days: modo === "remover" ? null : dias, dryRun,
          },
        });
        if (error) throw error;
        if (data?.dryRun) {
          out.push({ itemId: a.itemId, title: a.title, status: "simulado",
            message: `${prazoTxt(data.prazoAntes)} → ${prazoTxt(data.prazoDepois)} (mantém ${data.termosPreservados} outro(s) termo(s))` });
        } else if (data?.skipped) {
          out.push({ itemId: a.itemId, title: a.title, status: "pulado", message: motivoPulo(data, a) });
        } else if (data?.success) {
          out.push({ itemId: a.itemId, title: a.title, status: "ok",
            message: `${prazoTxt(data.prazoAntes)} → ${prazoTxt(data.prazoDepois)}${data.conferido409 ? " (conferido após conflito)" : ""}` });
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
    else toast[erro ? "warning" : "success"](`${ok} alterado(s), ${erro} com erro.`);

    if (!dryRun && anuncios) {
      const feitos = new Set(out.filter((r) => r.status === "ok").map((r) => r.itemId));
      setAnuncios(anuncios.map((a) => (feitos.has(a.itemId) ? { ...a, prazoAtual: valorAlvo } : a)));
      setSelecionadosIds((s) => s.filter((id) => !feitos.has(id)));
    }
  };

  // ── Desfazer: anúncios cujo último registro é uma alteração bem-sucedida ──
  const carregarAplicados = async () => {
    if (!sellerId) { toast.error("Selecione uma conta do Mercado Livre no topo da página."); return; }
    setCarregandoAplicados(true);
    try {
      const { data, error } = await (supabase as any)
        .from("sale_term_adjustment_logs")
        .select("item_id, titulo, valor_antes, valor_depois, acao, response_status, created_at")
        .eq("seller_id", String(sellerId))
        .eq("term_id", "MANUFACTURING_TIME")
        .order("created_at", { ascending: false })
        .limit(3000);
      if (error) throw error;
      const visto = new Set<string>();
      const lista: Aplicado[] = [];
      for (const r of data || []) {
        if (visto.has(r.item_id)) continue;
        visto.add(r.item_id);
        if (r.acao === "apply" && r.response_status === 200) {
          lista.push({ itemId: r.item_id, titulo: r.titulo || r.item_id, valorAntes: r.valor_antes,
            valorDepois: r.valor_depois, quando: r.created_at });
        }
      }
      setAplicados(lista);
      setMarcadosDesfazer(new Set(lista.filter((a) => excluir.some((k) => contem(a.titulo, k))).map((a) => a.itemId)));
    } catch (e: any) {
      toast.error(`Não consegui ler o histórico: ${e?.message || e}`);
    } finally {
      setCarregandoAplicados(false);
    }
  };

  const desfazer = async () => {
    if (!aplicados) return;
    const alvo = aplicados.filter((a) => marcadosDesfazer.has(a.itemId));
    if (!alvo.length) return;
    setDesfazendo(true);
    const out: Resultado[] = [];
    for (const a of alvo) {
      try {
        const { data, error } = await supabase.functions.invoke("ml-price-adjustment", {
          body: { action: "revert_manufacturing_time", sellerId, itemId: a.itemId },
        });
        if (error) throw error;
        if (data?.success) out.push({ itemId: a.itemId, title: a.titulo, status: "ok",
          message: `voltou para ${prazoTxt(data.prazoDepois)}` });
        else if (data?.skipped) out.push({ itemId: a.itemId, title: a.titulo, status: "pulado", message: "nada a desfazer" });
        else out.push({ itemId: a.itemId, title: a.titulo, status: "erro", message: data?.error || "falhou" });
      } catch (e: any) {
        out.push({ itemId: a.itemId, title: a.titulo, status: "erro", message: e?.message || String(e) });
      }
      setResultadoDesfazer([...out]);
      await new Promise((r) => setTimeout(r, 250));
    }
    setDesfazendo(false);
    const ok = out.filter((r) => r.status === "ok").length;
    toast[ok === out.length ? "success" : "warning"](`${ok} de ${out.length} desfeito(s).`);
    await carregarAplicados();
  };

  const iconeStatus = (s: Resultado["status"]) =>
    s === "ok" ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
    : s === "erro" ? <XCircle className="h-4 w-4 text-destructive shrink-0" />
    : s === "simulado" ? <Eye className="h-4 w-4 text-primary shrink-0" />
    : <MinusCircle className="h-4 w-4 text-muted-foreground shrink-0" />;

  const linhaAnuncio = (a: Candidato, lado: "esq" | "dir", onClick: () => void) => (
    <div
      key={a.itemId}
      className={cn(
        "flex items-center gap-2 px-3 py-2 border-b text-xs cursor-pointer",
        lado === "esq" ? "hover:bg-muted/50" : "hover:bg-destructive/10",
      )}
      onClick={onClick}
      title={lado === "esq" ? "Clique para selecionar" : "Clique para tirar"}
    >
      {a.thumbnail && <img src={a.thumbnail} alt="" className="w-8 h-8 rounded object-cover shrink-0" loading="lazy" />}
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium">{a.title}</p>
        <p className="text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span>{a.itemId}</span>
          <span>·</span>
          <span className={a.prazoAtual ? "text-foreground" : ""}>{prazoTxt(a.prazoAtual)}</span>
        </p>
      </div>
      {(a.catalogo || a.vinculado) && (
        <Badge variant="outline" className="text-[10px] shrink-0" title="Anúncio de catálogo: espelha o anúncio original">
          Catálogo
        </Badge>
      )}
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" /> Tempo de Disponibilidade
        </h1>
        <p className="text-muted-foreground mt-1">
          Filtre anúncios pelo título e defina ou remova o prazo de disponibilidade de estoque em lote.
          Só entram anúncios ativos, novos e fora do Full. A garantia e os demais termos do anúncio são mantidos.
        </p>
      </header>

      {/* 1. Carregar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Carregar anúncios da conta</CardTitle>
          <CardDescription>
            Busca no Mercado Livre todos os anúncios elegíveis da conta selecionada no topo.
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
              {ignorados && ` · ignorados: ${ignorados.full} no Full`}
              {ignorados?.usado ? `, ${ignorados.usado} cadastrados como Usado` : ""}
            </span>
          )}
        </CardContent>
      </Card>

      {/* 2. Filtrar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">2. Filtrar</CardTitle>
          <CardDescription>
            Entra o anúncio que tiver <strong>qualquer um</strong> dos termos no título e{" "}
            <strong>nenhum</strong> dos termos que não entram. Não diferencia maiúsculas nem acentos, e o
            termo precisa começar uma palavra ("tag" pega "Tag", mas não "montagem"). Os termos ficam salvos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
            <p className="text-sm font-medium mb-2">Não entra (filtro negativo)</p>
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
              <Input placeholder="Ex.: sem cola" value={novoExcluir}
                onChange={(e) => setNovoExcluir(e.target.value)}
                onKeyDown={onEnter(() => addTermo(excluir, setExcluir, novoExcluir, () => setNovoExcluir("")))} />
              <Button variant="outline" onClick={() => addTermo(excluir, setExcluir, novoExcluir, () => setNovoExcluir(""))}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {anuncios && removidos.length > 0 && (
              <div className="mt-3 text-sm">
                <button className="text-primary underline" onClick={() => setVerRemovidos(!verRemovidos)}>
                  {removidos.length} anúncio(s) barrado(s) pelo filtro negativo — {verRemovidos ? "esconder" : "ver quais"}
                </button>
                {verRemovidos && (
                  <ul className="mt-2 border rounded-md divide-y max-h-56 overflow-auto">
                    {removidos.map((a) => (
                      <li key={a.itemId} className="p-2">
                        <span className="font-medium">{a.title}</span>
                        <span className="text-xs text-muted-foreground"> · {a.itemId}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Prazo atual</p>
            <div className="flex flex-wrap gap-2">
              {([
                ["todos", "Todos"],
                ["com", "Só com prazo"],
                ["sem", "Só sem prazo"],
              ] as [FiltroPrazo, string][]).map(([v, label]) => (
                <Button key={v} size="sm" variant={filtroPrazo === v ? "default" : "outline"} onClick={() => setFiltroPrazo(v)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Selecionar — duas colunas */}
      {anuncios && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">3. Selecionar</CardTitle>
            <CardDescription>
              Clique num anúncio para passar de um lado para o outro, ou use as setas. Só os da direita recebem a alteração.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-start">
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-3 py-2 text-xs font-medium">Para selecionar ({disponiveis.length})</div>
                <div className="max-h-[420px] overflow-auto">
                  {disponiveis.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">
                      {filtrados.length === 0 ? "Nenhum anúncio com esses filtros." : "Todos já estão selecionados."}
                    </p>
                  ) : disponiveis.map((a) => (
                    linhaAnuncio(a, "esq", () => adicionar(a.itemId))
                  ))}
                </div>
              </div>

              <div className="flex md:flex-col gap-2 items-center justify-center py-4">
                <Button variant="outline" size="icon" title="Selecionar o primeiro"
                  onClick={() => disponiveis[0] && adicionar(disponiveis[0].itemId)}><ArrowRight className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" title="Tirar o último"
                  onClick={() => selecionadosIds.length && tirar(selecionadosIds[selecionadosIds.length - 1])}><ArrowLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" title="Enviar todos" onClick={enviarTodos}><ChevronsRight className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" title="Tirar todos" onClick={tirarTodos}><ChevronsLeft className="h-4 w-4" /></Button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-3 py-2 text-xs font-medium">Selecionados ({selecionados.length})</div>
                <div className="max-h-[420px] overflow-auto">
                  {selecionados.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">Nenhum anúncio selecionado</p>
                  ) : selecionados.map((a) => (
                    linhaAnuncio(a, "dir", () => tirar(a.itemId))
                  ))}
                </div>
              </div>
            </div>
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
            <div className="flex flex-wrap gap-2">
              <Button variant={modo === "definir" ? "default" : "outline"} onClick={() => setModo("definir")}>
                <Clock className="h-4 w-4 mr-2" /> Definir dias
              </Button>
              <Button variant={modo === "remover" ? "default" : "outline"} onClick={() => setModo("remover")}
                disabled={!funcaoAtualizada}>
                <Eraser className="h-4 w-4 mr-2" /> Deixar vazio (remover prazo)
              </Button>
            </div>
            {!funcaoAtualizada && versaoFuncao !== null && (
              <p className="text-xs text-muted-foreground">
                "Deixar vazio" fica disponível assim que a atualização do servidor for publicada.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-4">
              {modo === "definir" && (
                <div>
                  <label htmlFor="dias" className="text-sm font-medium block mb-1">Dias</label>
                  <Input id="dias" type="number" min={1} max={45} value={dias} className="w-28"
                    onChange={(e) => setDias(Math.max(1, Math.min(45, Number(e.target.value) || 1)))} />
                </div>
              )}
              <Button size="lg" disabled={aplicando || selecionados.length === 0} onClick={() => setConfirmarAberto(true)}>
                Avançar com {selecionados.length} anúncio(s) <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
            <Alert>
              <AlertDescription>
                {modo === "definir"
                  ? <>O Mercado Livre conta em <strong>dias corridos</strong>, não úteis. 6 dias corridos cobrem cerca de 4 dias úteis.</>
                  : <>O prazo é apagado e o anúncio volta a <strong>pronta entrega</strong> (sem prazo). Não existe "0 dias" no Mercado Livre.</>}
              </AlertDescription>
            </Alert>

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

      {/* Desfazer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Undo2 className="h-5 w-5" /> Desfazer</CardTitle>
          <CardDescription>
            Volta cada anúncio ao prazo que tinha antes da última alteração feita por esta tela. Os anúncios que o
            filtro negativo atual barraria já vêm marcados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={carregarAplicados} disabled={carregandoAplicados || desfazendo}>
            {carregandoAplicados ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <History className="h-4 w-4 mr-2" />}
            Ver anúncios alterados por esta tela
          </Button>
          {aplicados && (aplicados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada alterado nesta conta.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 text-sm">
                <span>{aplicados.length} alterado(s) · {marcadosDesfazer.size} marcado(s)</span>
                <button className="text-primary underline" onClick={() => setMarcadosDesfazer(new Set(aplicados.map((a) => a.itemId)))}>marcar todos</button>
                <button className="text-primary underline" onClick={() => setMarcadosDesfazer(new Set())}>desmarcar todos</button>
              </div>
              <div className="border rounded-md max-h-72 overflow-auto divide-y">
                {aplicados.map((a) => (
                  <label key={a.itemId} className="flex items-start gap-2 p-2 text-sm cursor-pointer">
                    <Checkbox className="mt-0.5" checked={marcadosDesfazer.has(a.itemId)} onCheckedChange={() => {
                      const n = new Set(marcadosDesfazer);
                      n.has(a.itemId) ? n.delete(a.itemId) : n.add(a.itemId);
                      setMarcadosDesfazer(n);
                    }} />
                    <span>
                      <span className="font-medium">{a.titulo}</span>
                      <span className="block text-xs text-muted-foreground">
                        {a.itemId} · {prazoTxt(a.valorAntes)} → {prazoTxt(a.valorDepois)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <Button variant="destructive" disabled={desfazendo || marcadosDesfazer.size === 0} onClick={desfazer}>
                {desfazendo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Undo2 className="h-4 w-4 mr-2" />}
                Desfazer {marcadosDesfazer.size} anúncio(s)
              </Button>
            </>
          ))}
          {resultadoDesfazer.length > 0 && (
            <div className="border rounded-md max-h-56 overflow-auto divide-y">
              {resultadoDesfazer.map((r) => (
                <div key={r.itemId} className="flex items-start gap-2 p-2 text-sm">
                  {iconeStatus(r.status)}
                  <div>
                    <div className="font-medium leading-tight">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{r.itemId} · {r.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmarAberto} onOpenChange={setConfirmarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modo === "remover" ? "Remover o prazo (deixar vazio)?" : `Aplicar ${dias} dias de disponibilidade?`}
            </DialogTitle>
            <DialogDescription>
              {selecionados.length} anúncio(s) selecionado(s)
              {jaNoValor > 0 && ` — ${jaNoValor} já está(ão) ${modo === "remover" ? "sem prazo" : `em ${valorAlvo}`} e será(ão) pulado(s)`}.
              A garantia e os outros termos de cada anúncio são mantidos, e o valor anterior fica
              registrado para poder desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => executar(true)}>
              <Eye className="h-4 w-4 mr-2" /> Simular (não altera)
            </Button>
            <Button onClick={() => executar(false)} variant={modo === "remover" ? "destructive" : "default"}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> {modo === "remover" ? "Remover agora" : "Aplicar agora"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
