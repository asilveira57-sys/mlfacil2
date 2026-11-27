import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip as RTooltip, ReferenceLine, CartesianGrid,
} from "recharts";
import {
  Activity, RefreshCw, Loader2, Search, ExternalLink, TrendingUp, TrendingDown, Minus, Stethoscope, Pill,
  ClipboardList, ArrowRight, Plus,
} from "lucide-react";

// ── Catálogo de doenças e remédios ─────────────────────────────────────────────
type Doenca =
  | "sem_dados" | "sem_estoque" | "pausado" | "reclamacoes" | "parado" | "sem_exposicao"
  | "nao_converte" | "conteudo_fraco" | "novo" | "saudavel";

const DOENCAS: Record<Doenca, { label: string; cor: string; remedios: string[] }> = {
  reclamacoes:    { label: "Reclamações",      cor: "bg-red-600 text-white",       remedios: ["revisar_produto", "conteudo"] },
  sem_estoque:    { label: "Sem estoque",      cor: "bg-red-500 text-white",       remedios: ["repor_estoque", "tempo_disponibilidade"] },
  parado:         { label: "Parado 60+ dias",  cor: "bg-orange-600 text-white",    remedios: ["recadastrar", "ajuste_preco", "promocao"] },
  nao_converte:   { label: "Não converte",     cor: "bg-orange-500 text-white",    remedios: ["ajuste_preco", "promocao", "conteudo"] },
  sem_exposicao:  { label: "Sem exposição",    cor: "bg-amber-500 text-white",     remedios: ["publicidade", "promocao", "conteudo"] },
  conteudo_fraco: { label: "Conteúdo fraco",   cor: "bg-yellow-400 text-black",    remedios: ["conteudo"] },
  pausado:        { label: "Pausado",          cor: "bg-slate-500 text-white",     remedios: ["reativar"] },
  novo:           { label: "Novo",             cor: "bg-sky-500 text-white",       remedios: [] },
  saudavel:       { label: "Saudável",         cor: "bg-green-600 text-white",     remedios: [] },
  sem_dados:      { label: "Sem exame",        cor: "bg-muted text-muted-foreground", remedios: [] },
};
const ORDEM: Doenca[] = ["reclamacoes", "sem_estoque", "parado", "nao_converte", "sem_exposicao", "conteudo_fraco", "pausado", "novo", "saudavel", "sem_dados"];

const REMEDIOS: Record<string, { label: string; rota?: (itemId: string) => string }> = {
  ajuste_preco:          { label: "Ajustar preço",                 rota: () => "/ajuste-preco" },
  promocao:              { label: "Entrar em promoção",            rota: () => "/promocoes" },
  publicidade:           { label: "Colocar em publicidade",        rota: () => "/publicidade" },
  conteudo:              { label: "Melhorar título, fotos e ficha", rota: () => "/radiografia/classica" },
  tempo_disponibilidade: { label: "Ajustar disponibilidade",       rota: () => "/tempo-disponibilidade" },
  recadastrar:           { label: "Recadastrar (novo MLB)",        rota: (id) => `/anuncios/clonar?mlb=${id}&modo=recadastro` },
  repor_estoque:         { label: "Repor estoque" },
  reativar:              { label: "Reativar anúncio" },
  revisar_produto:       { label: "Revisar produto, embalagem e descrição" },
  outro:                 { label: "Outro" },
};

const RESULTADO: Record<string, { label: string; cor: string }> = {
  aguardando: { label: "Aguardando 14 dias", cor: "bg-muted text-muted-foreground" },
  melhorou:   { label: "Melhorou",           cor: "bg-green-600 text-white" },
  sem_efeito: { label: "Sem efeito",         cor: "bg-slate-500 text-white" },
  piorou:     { label: "Piorou",             cor: "bg-red-600 text-white" },
};

interface Paciente {
  item_id: string; title: string | null; thumbnail: string | null; permalink: string | null; status: string;
  price: number | null; original_price: number | null; em_promocao: boolean; available_quantity: number | null;
  health: number | null; logistic_type: string | null; catalog_listing: boolean; idade_dias: number;
  visitas_7d: number; visitas_30d: number; visitas_30d_anterior: number; dias_com_visita_30d: number;
  vendas_7d: number; vendas_30d: number; unidades_30d: number; faturamento_30d: number; conversao_30d: number | null;
  ultima_venda: string | null; dias_sem_venda: number | null; reclamacoes_90d: number; vendas_90d: number;
  doenca: Doenca; motivo: string; tratamentos: number; exame_em: string;
}
interface Tratamento {
  id: string; item_id: string; titulo: string | null; doenca: string | null; remedio: string; nota: string | null;
  aplicado_em: string; dias_desde: number;
  antes_visitas_dia: number | null; antes_vendas_dia: number | null; antes_conversao: number | null;
  depois14_visitas_dia: number | null; depois14_vendas_dia: number | null; depois14_conversao: number | null;
  depois30_visitas_dia: number | null; depois30_vendas_dia: number | null; depois30_conversao: number | null;
  resultado: string; variacao_pct: number | null;
}

const num = (v: number | null | undefined, casas = 0) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas });
const brl = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: string | null) => (d ? new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR") : "—");

function Tendencia({ atual, anterior }: { atual: number; anterior: number }) {
  if (!anterior && !atual) return <Minus className="h-3 w-3 text-muted-foreground inline" />;
  const delta = anterior ? (atual / anterior - 1) * 100 : 100;
  if (delta >= 15) return <span className="text-green-600 text-xs inline-flex items-center"><TrendingUp className="h-3 w-3" />{Math.round(delta)}%</span>;
  if (delta <= -15) return <span className="text-red-600 text-xs inline-flex items-center"><TrendingDown className="h-3 w-3" />{Math.round(delta)}%</span>;
  return <Minus className="h-3 w-3 text-muted-foreground inline" />;
}

export default function RadiografiaV2() {
  const { sellerId } = useActiveAccount();
  const seller = sellerId ? String(sellerId) : "";

  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [ultimoExame, setUltimoExame] = useState<{ finished_at: string | null; started_at: string; total: number; last_cursor: number; claims_at: string | null; claims_error: string | null } | null>(null);
  const [coletando, setColetando] = useState(false);
  const [lidoPara, setLidoPara] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  const pararRef = useRef(false);

  const [filtro, setFiltro] = useState<Doenca | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState("pacientes");

  const [aberto, setAberto] = useState<Paciente | null>(null);
  const [tratamentos, setTratamentos] = useState<Tratamento[]>([]);

  // ── Leitura ──
  const carregar = useCallback(async () => {
    if (!seller) return;
    setCarregando(true);
    try {
      const [d, r, t] = await Promise.all([
        (supabase as any).rpc("radiografia_diagnostico", { p_seller: seller }),
        (supabase as any).from("listing_exam_runs").select("finished_at, started_at, total, last_cursor, claims_at, claims_error").eq("seller_id", seller).maybeSingle(),
        (supabase as any).rpc("radiografia_tratamentos", { p_seller: seller, p_item: null }),
      ]);
      if (d.error) throw d.error;
      setPacientes(d.data || []);
      setUltimoExame(r.data || null);
      setTratamentos(t.data || []);
    } catch (e: any) {
      toast.error(`Não consegui carregar a radiografia: ${e?.message || e}`);
    } finally {
      setCarregando(false);
      setLidoPara(seller);
    }
  }, [seller]);

  useEffect(() => { setPacientes([]); setUltimoExame(null); carregar(); }, [carregar]);

  // ── Coleta dos exames (em lotes) ──
  const coletar = useCallback(async (retomar = false) => {
    if (!seller || coletando) return;
    setColetando(true); pararRef.current = false;
    let cursor: number | null = retomar && ultimoExame && !ultimoExame.finished_at ? ultimoExame.last_cursor : 0;
    try {
      while (cursor !== null && !pararRef.current) {
        const { data, error } = await supabase.functions.invoke("listing-exams", { body: { action: "collect", sellerId: seller, cursor } });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Falha na coleta");
        setProgresso({ feito: data.processed, total: data.total });
        cursor = data.next_cursor;
      }
      if (!pararRef.current) {
        const { data: c } = await supabase.functions.invoke("listing-exams", { body: { action: "claims", sellerId: seller } });
        if (c && !c.ok && c.error) toast.warning(`Reclamações: o Mercado Livre não respondeu (${c.error}).`);
        toast.success("Exames atualizados.");
      }
    } catch (e: any) {
      toast.error(`Coleta interrompida: ${e?.message || e}`);
    } finally {
      setColetando(false); setProgresso(null);
      carregar();
    }
  }, [seller, coletando, ultimoExame, carregar]);

  // Automático: ao abrir, se o último exame tem mais de 20 h (ou ficou pela metade), coleta
  const autoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seller || carregando || coletando || autoRef.current === seller) return;
    if (lidoPara !== seller) return; // espera saber quando foi o último exame
    autoRef.current = seller;
    const fim = ultimoExame?.finished_at ? Date.parse(ultimoExame.finished_at) : 0;
    const inicio = ultimoExame?.started_at ? Date.parse(ultimoExame.started_at) : 0;
    const pelaMetade = !!ultimoExame && !ultimoExame.finished_at && Date.now() - inicio < 24 * 3600e3;
    if (pelaMetade) coletar(true);
    else if (!fim || Date.now() - fim > 20 * 3600e3) coletar(false);
  }, [seller, carregando, lidoPara, ultimoExame]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Contagens e lista ──
  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of pacientes) c[p.doenca] = (c[p.doenca] || 0) + 1;
    return c;
  }, [pacientes]);

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return pacientes
      .filter((p) => filtro === "todos" || p.doenca === filtro)
      .filter((p) => !b || p.item_id.toLowerCase().includes(b) || (p.title || "").toLowerCase().includes(b))
      .sort((a, b2) => ORDEM.indexOf(a.doenca) - ORDEM.indexOf(b2.doenca) || b2.visitas_30d - a.visitas_30d);
  }, [pacientes, filtro, busca]);

  const exameTxt = ultimoExame?.finished_at
    ? `Último exame: ${new Date(ultimoExame.finished_at).toLocaleString("pt-BR")}`
    : ultimoExame ? "Exame em andamento ou interrompido" : "Ainda sem exames nesta conta";

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Stethoscope className="h-6 w-6 text-primary" /> Radiografia do anúncio</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Exames diários de cada anúncio, uma doença por vez, o remédio e o acompanhamento da cura.
          </p>
          <p className="text-xs text-muted-foreground mt-1">{exameTxt}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/radiografia/classica">Títulos e SEO (clássica)</Link></Button>
          {coletando ? (
            <Button variant="outline" onClick={() => { pararRef.current = true; }}>Parar</Button>
          ) : (
            <Button onClick={() => coletar(false)} disabled={!seller}><RefreshCw className="h-4 w-4 mr-2" /> Atualizar exames</Button>
          )}
        </div>
      </header>

      {coletando && (
        <Card><CardContent className="py-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {progresso ? `Examinando anúncios: ${progresso.feito} de ${progresso.total}` : "Listando os anúncios da conta..."}
            <span className="text-muted-foreground">— na primeira vez busca 150 dias de visitas; pode levar alguns minutos.</span>
          </div>
          {progresso && <Progress value={progresso.total ? (progresso.feito / progresso.total) * 100 : 0} />}
        </CardContent></Card>
      )}

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="pacientes"><Activity className="h-4 w-4 mr-1" /> Pacientes ({pacientes.length})</TabsTrigger>
          <TabsTrigger value="tratamentos"><ClipboardList className="h-4 w-4 mr-1" /> Tratamentos ({tratamentos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pacientes" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
            {ORDEM.map((d) => (
              <button key={d} onClick={() => setFiltro(filtro === d ? "todos" : d)}
                className={cn("rounded-lg border p-2 text-left transition", filtro === d ? "ring-2 ring-primary" : "hover:bg-muted/50")}>
                <div className="text-xl font-bold">{contagem[d] || 0}</div>
                <div className="text-[11px] leading-tight text-muted-foreground">{DOENCAS[d].label}</div>
              </button>
            ))}
          </div>

          <div className="flex gap-2 items-center">
            <div className="relative max-w-sm flex-1">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por MLB ou título" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            {filtro !== "todos" && <Button variant="ghost" size="sm" onClick={() => setFiltro("todos")}>Limpar filtro</Button>}
            <span className="text-sm text-muted-foreground ml-auto">{lista.length} anúncio(s)</span>
          </div>

          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Anúncio</TableHead>
                  <TableHead>Diagnóstico</TableHead>
                  <TableHead className="text-right">Visitas 30d</TableHead>
                  <TableHead className="text-right">Vendas 30d</TableHead>
                  <TableHead className="text-right">Conversão</TableHead>
                  <TableHead className="text-right">Sem venda</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead className="text-right">Qualidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando && pacientes.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
                ) : lista.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {pacientes.length === 0 ? "Sem exames ainda. Clique em Atualizar exames." : "Nenhum anúncio neste filtro."}
                  </TableCell></TableRow>
                ) : lista.slice(0, 500).map((p) => (
                  <TableRow key={p.item_id} className="cursor-pointer" onClick={() => setAberto(p)}>
                    <TableCell>
                      <div className="flex items-center gap-2 max-w-[340px]">
                        {p.thumbnail && <img src={p.thumbnail} alt="" className="h-9 w-9 rounded object-cover shrink-0" loading="lazy" />}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.item_id}{p.em_promocao && " · em promoção"}{p.tratamentos > 0 && ` · ${p.tratamentos} tratamento(s)`}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <Badge className={cn("mb-1", DOENCAS[p.doenca]?.cor)}>{DOENCAS[p.doenca]?.label || p.doenca}</Badge>
                      <p className="text-xs text-muted-foreground leading-tight">{p.motivo}</p>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{num(p.visitas_30d)} <Tendencia atual={p.visitas_30d} anterior={p.visitas_30d_anterior} /></TableCell>
                    <TableCell className="text-right">{num(p.vendas_30d)}</TableCell>
                    <TableCell className="text-right">{p.conversao_30d === null ? "—" : `${num(p.conversao_30d, 2)}%`}</TableCell>
                    <TableCell className="text-right">{p.dias_sem_venda === null ? "nunca" : `${p.dias_sem_venda}d`}</TableCell>
                    <TableCell className="text-right">{num(p.available_quantity)}</TableCell>
                    <TableCell className="text-right">{p.health === null ? "—" : `${Math.round(p.health * 100)}%`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {lista.length > 500 && <p className="text-xs text-muted-foreground">Mostrando 500 de {lista.length}. Use os filtros ou a busca.</p>}
        </TabsContent>

        <TabsContent value="tratamentos">
          <ListaTratamentos tratamentos={tratamentos} onAbrir={(id) => { const p = pacientes.find((x) => x.item_id === id); if (p) setAberto(p); }} />
        </TabsContent>
      </Tabs>

      <Prontuario paciente={aberto} seller={seller} onClose={() => setAberto(null)} onMudou={carregar} />
    </div>
  );
}

// ── Lista de tratamentos (prontuário geral) ───────────────────────────────────
function ListaTratamentos({ tratamentos, onAbrir }: { tratamentos: Tratamento[]; onAbrir: (itemId: string) => void }) {
  if (tratamentos.length === 0) {
    return (
      <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
        Nenhum tratamento registrado. Abra um anúncio, aplique um remédio e clique em "Registrar tratamento" para começar a medir.
      </CardContent></Card>
    );
  }
  return (
    <div className="border rounded-lg overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Anúncio</TableHead><TableHead>Remédio</TableHead><TableHead>Aplicado</TableHead>
            <TableHead className="text-right">Antes (14d)</TableHead><TableHead className="text-right">Depois 14d</TableHead>
            <TableHead className="text-right">Depois 30d</TableHead><TableHead>Resultado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tratamentos.map((t) => (
            <TableRow key={t.id} className="cursor-pointer" onClick={() => onAbrir(t.item_id)}>
              <TableCell className="max-w-[260px]"><p className="truncate text-sm">{t.titulo || t.item_id}</p><p className="text-xs text-muted-foreground">{t.item_id}</p></TableCell>
              <TableCell className="text-sm">{REMEDIOS[t.remedio]?.label || t.remedio}</TableCell>
              <TableCell className="text-sm whitespace-nowrap">{dataBR(t.aplicado_em)}<span className="block text-xs text-muted-foreground">há {t.dias_desde}d</span></TableCell>
              <TableCell className="text-right text-xs">{num(t.antes_visitas_dia, 1)} vis/dia<br />{num(t.antes_vendas_dia, 2)} vend/dia</TableCell>
              <TableCell className="text-right text-xs">{num(t.depois14_visitas_dia, 1)} vis/dia<br />{num(t.depois14_vendas_dia, 2)} vend/dia</TableCell>
              <TableCell className="text-right text-xs">{t.dias_desde >= 30 ? <>{num(t.depois30_visitas_dia, 1)} vis/dia<br />{num(t.depois30_vendas_dia, 2)} vend/dia</> : "—"}</TableCell>
              <TableCell>
                <Badge className={RESULTADO[t.resultado]?.cor}>{RESULTADO[t.resultado]?.label || t.resultado}</Badge>
                {t.variacao_pct !== null && <span className="text-xs ml-1">{t.variacao_pct > 0 ? "+" : ""}{t.variacao_pct}%</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Prontuário de um anúncio ───────────────────────────────────────────────────
function Prontuario({ paciente: p, seller, onClose, onMudou }: {
  paciente: Paciente | null; seller: string; onClose: () => void; onMudou: () => void;
}) {
  const [serie, setSerie] = useState<{ dia: string; visitas: number; vendas: number }[]>([]);
  const [trats, setTrats] = useState<Tratamento[]>([]);
  const [remedio, setRemedio] = useState<string>("");
  const [data, setData] = useState<string>(new Date().toISOString().slice(0, 10));
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!p || !seller) return;
    const [s, t] = await Promise.all([
      (supabase as any).rpc("radiografia_serie", { p_seller: seller, p_item: p.item_id, p_dias: 120 }),
      (supabase as any).rpc("radiografia_tratamentos", { p_seller: seller, p_item: p.item_id }),
    ]);
    setSerie((s.data || []).map((r: any) => ({ ...r, dia: String(r.dia).slice(0, 10) })));
    setTrats(t.data || []);
  }, [p, seller]);

  useEffect(() => {
    setSerie([]); setTrats([]); setNota(""); setData(new Date().toISOString().slice(0, 10));
    setRemedio(p ? (DOENCAS[p.doenca]?.remedios[0] || "outro") : "");
    carregar();
  }, [p, carregar]);

  const registrar = async () => {
    if (!p || !remedio) return;
    setSalvando(true);
    const { error } = await (supabase as any).from("listing_treatments").insert({
      seller_id: seller, item_id: p.item_id, disease: p.doenca, remedy: remedio, note: nota || null, applied_at: data,
    });
    setSalvando(false);
    if (error) { toast.error(`Não consegui registrar: ${error.message}`); return; }
    toast.success("Tratamento registrado. O resultado aparece em 14 dias.");
    setNota("");
    carregar(); onMudou();
  };

  const remediosDaDoenca = p ? DOENCAS[p.doenca]?.remedios || [] : [];
  const marcas = trats.map((t) => String(t.aplicado_em).slice(0, 10));

  return (
    <Sheet open={!!p} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {p && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6 leading-tight">{p.title}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <span>{p.item_id}</span>
                {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">ver no ML <ExternalLink className="h-3 w-3" /></a>}
                <span>· {p.idade_dias} dias no ar</span>
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-5">
              <Card className="border-l-4" style={{ borderLeftColor: "hsl(var(--primary))" }}>
                <CardContent className="py-3">
                  <Badge className={cn("mb-1", DOENCAS[p.doenca]?.cor)}>{DOENCAS[p.doenca]?.label}</Badge>
                  <p className="text-sm">{p.motivo}</p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Visitas 7d / 30d", `${num(p.visitas_7d)} / ${num(p.visitas_30d)}`],
                  ["Vendas 7d / 30d", `${num(p.vendas_7d)} / ${num(p.vendas_30d)}`],
                  ["Conversão 30d", p.conversao_30d === null ? "—" : `${num(p.conversao_30d, 2)}%`],
                  ["Faturamento 30d", brl(p.faturamento_30d)],
                  ["Preço", p.em_promocao ? `${brl(p.price)} (de ${brl(p.original_price)})` : brl(p.price)],
                  ["Estoque", num(p.available_quantity)],
                  ["Última venda", p.ultima_venda ? `${dataBR(p.ultima_venda)} (${p.dias_sem_venda}d)` : "nunca"],
                  ["Qualidade ML", p.health === null ? "—" : `${Math.round(p.health * 100)}%`],
                  ["Reclamações 90d", `${p.reclamacoes_90d} em ${p.vendas_90d} vendas`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border p-2">
                    <div className="text-[11px] text-muted-foreground">{k}</div>
                    <div className="text-sm font-semibold">{v}</div>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Visitas e vendas por dia (120 dias)</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={serie} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="dia" tickFormatter={(d) => d.slice(8, 10) + "/" + d.slice(5, 7)} fontSize={10} minTickGap={20} />
                      <YAxis yAxisId="v" fontSize={10} allowDecimals={false} />
                      <YAxis yAxisId="s" orientation="right" fontSize={10} allowDecimals={false} />
                      <RTooltip labelFormatter={(d) => dataBR(String(d))} />
                      <Bar yAxisId="v" dataKey="visitas" name="Visitas" fill="hsl(var(--primary) / 0.35)" />
                      <Line yAxisId="s" dataKey="vendas" name="Vendas" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                      {marcas.map((m) => <ReferenceLine key={m} yAxisId="v" x={m} stroke="#16a34a" strokeDasharray="4 2" label={{ value: "💊", position: "top", fontSize: 12 }} />)}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-muted-foreground">Linha verde tracejada = tratamento aplicado.</p>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><Pill className="h-4 w-4" /> Remédio</CardTitle>
                  <CardDescription>Aplique no módulo indicado e registre aqui para medir o antes e depois.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {remediosDaDoenca.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {remediosDaDoenca.map((r) => {
                        const rota = REMEDIOS[r]?.rota?.(p.item_id);
                        return rota ? (
                          <Button key={r} size="sm" variant="outline" asChild>
                            <Link to={rota} target="_blank">{REMEDIOS[r].label} <ArrowRight className="h-3 w-3 ml-1" /></Link>
                          </Button>
                        ) : (
                          <Badge key={r} variant="secondary" className="py-1">{REMEDIOS[r]?.label}</Badge>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem remédio indicado para este diagnóstico.</p>
                  )}

                  <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                    <Select value={remedio} onValueChange={setRemedio}>
                      <SelectTrigger><SelectValue placeholder="O que foi feito" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(REMEDIOS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="date" value={data} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setData(e.target.value)} />
                  </div>
                  <Textarea rows={2} placeholder="Detalhe (ex.: baixei de R$ 39,90 para R$ 34,90)" value={nota} onChange={(e) => setNota(e.target.value)} />
                  <Button onClick={registrar} disabled={salvando || !remedio}>
                    {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Registrar tratamento
                  </Button>
                </CardContent>
              </Card>

              <div>
                <p className="text-sm font-medium mb-2">Histórico de tratamentos</p>
                {trats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum tratamento neste anúncio.</p>
                ) : (
                  <div className="space-y-2">
                    {trats.map((t) => (
                      <div key={t.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{REMEDIOS[t.remedio]?.label || t.remedio}</span>
                          <span className="flex items-center gap-1">
                            <Badge className={RESULTADO[t.resultado]?.cor}>{RESULTADO[t.resultado]?.label}</Badge>
                            {t.variacao_pct !== null && <span className="text-xs">{t.variacao_pct > 0 ? "+" : ""}{t.variacao_pct}%</span>}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{dataBR(t.aplicado_em)} · há {t.dias_desde} dias{t.nota ? ` · ${t.nota}` : ""}</p>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                          <div><span className="text-muted-foreground">Antes 14d</span><br />{num(t.antes_visitas_dia, 1)} vis/dia · {num(t.antes_vendas_dia, 2)} vend/dia</div>
                          <div><span className="text-muted-foreground">Depois 14d</span><br />{t.dias_desde > 0 ? `${num(t.depois14_visitas_dia, 1)} vis/dia · ${num(t.depois14_vendas_dia, 2)} vend/dia` : "—"}</div>
                          <div><span className="text-muted-foreground">Depois 30d</span><br />{t.dias_desde >= 30 ? `${num(t.depois30_visitas_dia, 1)} vis/dia · ${num(t.depois30_vendas_dia, 2)} vend/dia` : "—"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
