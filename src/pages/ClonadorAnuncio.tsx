import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Copy, Search, Loader2, ArrowRight, CheckCircle2, XCircle, ShieldCheck, ExternalLink, AlertTriangle, History,
} from "lucide-react";

interface Preview {
  id: string; titulo: string; familyName: string | null; userProductId: string | null;
  preco: number; moeda: string; estoque: number; categoria: string; tipo: string; condicao: string;
  status: string; permalink: string; fotos: string[]; atributos: number; temVariacoes: boolean;
  freteGratis: boolean; garantia: string | null; temDescricao: boolean;
}

interface LogClone {
  created_at: string; source_item_id: string; new_item_id: string | null; status: string;
  origin_seller_id: string; dest_seller_id: string;
}

const TIPOS: Record<string, string> = { gold_special: "Clássico", gold_pro: "Premium" };
const brl = (v: number) => v?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ClonadorAnuncio() {
  const { accounts, sellerId } = useActiveAccount();
  const contas = (accounts || []).filter((a) => a.isActive !== false);
  const nomeConta = (id: string) => contas.find((c) => String(c.sellerId) === String(id))?.nickname || id;

  const [origem, setOrigem] = useState<string>("");
  const [destinoEscolhido, setDestino] = useState<string>("");
  // recadastro = mesma conta: cria o novo e finaliza o antigo
  const [modoRecadastro, setModoRecadastro] = useState(false);
  const destino = modoRecadastro ? origem : destinoEscolhido;
  const [confirmarRecadastro, setConfirmarRecadastro] = useState(false);
  const [codigo, setCodigo] = useState("");

  const [carregando, setCarregando] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [destinoUP, setDestinoUP] = useState<boolean | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  const [titulo, setTitulo] = useState("");
  const [preco, setPreco] = useState<string>("");
  const [estoque, setEstoque] = useState<string>("");
  const [tipo, setTipo] = useState<string>("");

  const [enviando, setEnviando] = useState<"validar" | "clonar" | null>(null);
  const [resultado, setResultado] = useState<any>(null);
  const [historico, setHistorico] = useState<LogClone[]>([]);

  useEffect(() => { if (!origem && sellerId) setOrigem(String(sellerId)); }, [sellerId, origem]);

  // Vindo da Radiografia/Linha do Tempo (?mlb=): preenche o código; origem = conta ativa
  const [params] = useSearchParams();
  useEffect(() => {
    const mlb = params.get("mlb");
    if (mlb && !codigo) setCodigo(mlb);
    if (params.get("modo") === "recadastro") setModoRecadastro(true);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const carregarHistorico = async () => {
    const { data } = await (supabase as any).from("ml_clone_logs")
      .select("created_at, source_item_id, new_item_id, status, origin_seller_id, dest_seller_id")
      .order("created_at", { ascending: false }).limit(10);
    setHistorico(data || []);
  };
  useEffect(() => { carregarHistorico(); }, []);

  const carregar = async () => {
    if (!origem || !codigo.trim()) { toast.error("Escolha a conta de origem e informe o MLB ou MLBU."); return; }
    setCarregando(true); setPreview(null); setResultado(null); setAvisos([]);
    try {
      const { data, error } = await supabase.functions.invoke("ml-item-clone", {
        body: { action: "load", originSellerId: origem, destSellerId: destino || undefined, codigo },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha ao carregar");
      const p: Preview = data.preview;
      setPreview(p); setDestinoUP(data.destinoUP ?? null); setAvisos(data.avisos || []);
      setTitulo(p.familyName || p.titulo); setPreco(String(p.preco)); setEstoque(String(p.estoque || 1));
      setTipo(p.tipo);
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setCarregando(false);
    }
  };

  const enviar = async (validar: boolean) => {
    if (!preview) return;
    if (!destino) { toast.error("Escolha a conta de destino."); return; }
    if (!modoRecadastro && destino === origem) { toast.error("Origem e destino precisam ser contas diferentes."); return; }
    setEnviando(validar ? "validar" : "clonar"); setResultado(null);
    try {
      const { data, error } = await supabase.functions.invoke("ml-item-clone", {
        body: {
          action: "clone", originSellerId: origem, destSellerId: destino, codigo: preview.id, validar,
          recadastrar: modoRecadastro,
          overrides: { titulo, preco: Number(preco.replace(",", ".")), estoque: Number(estoque), tipo },
        },
      });
      if (error) throw error;
      setResultado({ ...data, validar });
      if (data?.ok) toast.success(validar ? "Validado: o Mercado Livre aceitaria este anúncio."
        : modoRecadastro ? "Anúncio recadastrado!" : "Anúncio clonado!");
      else toast.error(data?.error || "O Mercado Livre recusou.");
      if (!validar) carregarHistorico();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Copy className="h-6 w-6 text-primary" /> {modoRecadastro ? "Recadastrar anúncio" : "Clonar anúncio entre contas"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {modoRecadastro
            ? "Cria o mesmo anúncio de novo na mesma conta, com MLB novo, e finaliza o antigo. Para anúncio parado que precisa recomeçar do zero."
            : "Copia um anúncio seu (fotos, atributos, ficha técnica, descrição, garantia) de uma conta para outra. Um por vez."}
        </p>
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant={!modoRecadastro ? "default" : "outline"} onClick={() => { setModoRecadastro(false); setResultado(null); }}>
            Clonar para outra conta
          </Button>
          <Button size="sm" variant={modoRecadastro ? "default" : "outline"} onClick={() => { setModoRecadastro(true); setResultado(null); }}>
            Recadastrar nesta conta
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Origem, destino e anúncio</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium block mb-1">Conta de origem</label>
            <Select value={origem} onValueChange={(v) => { setOrigem(v); setPreview(null); }}>
              <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>
                {contas.map((c) => <SelectItem key={c.sellerId} value={String(c.sellerId)}>{c.nickname || c.sellerId}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className={modoRecadastro ? "hidden" : ""}>
            <label className="text-sm font-medium block mb-1">Conta de destino</label>
            <Select value={destinoEscolhido} onValueChange={(v) => { setDestino(v); setResultado(null); }}>
              <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>
                {contas.filter((c) => String(c.sellerId) !== origem).map((c) =>
                  <SelectItem key={c.sellerId} value={String(c.sellerId)}>{c.nickname || c.sellerId}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">MLB ou MLBU</label>
            <div className="flex gap-2">
              <Input placeholder="MLB1234567890" value={codigo} onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") carregar(); }} />
              <Button onClick={carregar} disabled={carregando}>
                {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">2. Conferir e ajustar</CardTitle>
            <CardDescription>
              {preview.id}{preview.userProductId ? ` · ${preview.userProductId}` : ""} · {nomeConta(origem)} ·{" "}
              <a href={preview.permalink} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                ver original <ExternalLink className="h-3 w-3" />
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {preview.fotos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {preview.fotos.map((f) => <img key={f} src={f} alt="" className="h-20 w-20 rounded border object-cover shrink-0" loading="lazy" />)}
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{preview.atributos} atributos</Badge>
              <Badge variant="secondary">{preview.fotos.length} fotos</Badge>
              <Badge variant="secondary">{preview.temDescricao ? "com descrição" : "sem descrição"}</Badge>
              {preview.garantia && <Badge variant="secondary">garantia {preview.garantia}</Badge>}
              {preview.freteGratis && <Badge variant="secondary">frete grátis</Badge>}
              <Badge variant="outline">{preview.condicao === "new" ? "Novo" : preview.condicao}</Badge>
            </div>

            {avisos.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription><ul className="list-disc pl-4">{avisos.map((a) => <li key={a}>{a}</li>)}</ul></AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-[1fr_140px_120px_160px]">
              <div>
                <label className="text-sm font-medium block mb-1">
                  {destinoUP ? "Nome do produto (o ML monta o título)" : "Título"}
                </label>
                <Input value={titulo} maxLength={60} onChange={(e) => setTitulo(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">{titulo.length}/60</p>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Preço</label>
                <Input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" />
                <p className="text-xs text-muted-foreground mt-1">origem: {brl(preview.preco)}</p>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Estoque</label>
                <Input value={estoque} onChange={(e) => setEstoque(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Tipo</label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPOS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    {!TIPOS[tipo] && tipo && <SelectItem value={tipo}>{tipo}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {destinoUP && (
              <p className="text-xs text-muted-foreground">
                A conta de destino está no modelo novo do Mercado Livre: ele monta o título final a partir do nome do
                produto e dos atributos copiados.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => enviar(true)} disabled={!!enviando || preview.temVariacoes || !destino}>
                {enviando === "validar" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                Validar (não publica)
              </Button>
              <Button onClick={() => (modoRecadastro ? setConfirmarRecadastro(true) : enviar(false))}
                disabled={!!enviando || preview.temVariacoes || !destino}
                variant={modoRecadastro ? "destructive" : "default"}>
                {enviando === "clonar" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                {modoRecadastro ? "Recadastrar (cria o novo e finaliza o antigo)" : <>Clonar para {destino ? nomeConta(destino) : "…"}</>}
              </Button>
            </div>

            {modoRecadastro && (
              <p className="text-xs text-muted-foreground">
                O novo anúncio não herda vendas, avaliações, perguntas nem visitas do antigo. O antigo só é finalizado depois
                que o novo existir. Se o Mercado Livre recusar por duplicado, o antigo é pausado, o novo é criado e, se mesmo
                assim falhar, o antigo volta a ficar ativo.
              </p>
            )}

            <AlertDialog open={confirmarRecadastro} onOpenChange={setConfirmarRecadastro}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Recadastrar {preview.id}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Vai criar um anúncio novo na conta {nomeConta(origem)} e <strong>finalizar o {preview.id}</strong>.
                    O anúncio finalizado sai do ar e o novo começa do zero (sem vendas, avaliações e perguntas).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => { setConfirmarRecadastro(false); enviar(false); }}>Recadastrar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {resultado && (
              <Alert variant={resultado.ok ? "default" : "destructive"}>
                {resultado.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                <AlertDescription className="space-y-1">
                  {resultado.ok && resultado.validar && <p><strong>Validado.</strong> O Mercado Livre aceitaria este anúncio. Nada foi publicado.</p>}
                  {resultado.ok && !resultado.validar && resultado.recadastro && (
                    <div className="space-y-1">
                      <p><strong>Novo anúncio: {resultado.novoId}</strong>
                        {resultado.permalink && <> · <a className="underline" href={resultado.permalink} target="_blank" rel="noreferrer">abrir</a></>}</p>
                      <p>Antigo {resultado.antigoId}: {resultado.antigoFinalizado ? "finalizado ✔" : <strong>NÃO foi finalizado — finalize manualmente no Mercado Livre para não ficar duplicado</strong>}</p>
                      <p>MLBU: {resultado.upAntigo || "—"} → {resultado.upNovo || "—"}
                        {resultado.mesmoMLBU ? <strong> · atenção: o Mercado Livre manteve o MESMO MLBU</strong> : resultado.upNovo ? " · MLBU novo ✔" : ""}</p>
                      {resultado.descricaoOk === false && <p>A descrição não foi copiada.</p>}
                    </div>
                  )}
                  {resultado.ok && !resultado.validar && !resultado.recadastro && (
                    <p>
                      <strong>Clonado: {resultado.novoId}</strong>
                      {resultado.permalink && <> · <a className="underline" href={resultado.permalink} target="_blank" rel="noreferrer">abrir anúncio</a></>}
                      {resultado.descricaoOk === false && " · a descrição não foi copiada"}
                    </p>
                  )}
                  {!resultado.ok && <p><strong>Recusado:</strong> {resultado.error}</p>}
                  {resultado.avisos?.length > 0 && (
                    <p className="text-xs opacity-80">Avisos do ML: {resultado.avisos.join(" · ")}</p>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5" /> Últimas clonagens</CardTitle>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma clonagem ainda.</p>
          ) : (
            <div className="divide-y border rounded-md text-sm">
              {historico.map((h) => (
                <div key={h.created_at + h.source_item_id} className="flex items-center gap-2 p-2">
                  {h.status === "ok" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  <span>{h.source_item_id} ({nomeConta(h.origin_seller_id)}) → {h.new_item_id || "—"} ({nomeConta(h.dest_seller_id)})</span>
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
