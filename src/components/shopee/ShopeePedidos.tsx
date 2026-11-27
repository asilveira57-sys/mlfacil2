import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, RefreshCw, Printer, Truck } from "lucide-react";
import { toast } from "sonner";

/**
 * Pedidos Shopee (27/nov/2026, beta). Lê shopee_orders (sem dados pessoais do comprador) e chama a função
 * shopee-orders para sincronizar, programar envio e gerar etiquetas. A etiqueta vem em PDF e é aberta
 * direto no navegador — não fica gravada no sistema (política de dados da Shopee).
 */
type Loja = { id: string; shop_id: number; shop_name: string | null; status: string };
type Pedido = {
  id: string; order_sn: string; order_status: string; create_time: string; total_amount: number | null;
  shipping_carrier: string | null; tracking_number: string | null; etiqueta_baixada_em: string | null;
  itens: { nome: string; sku: string | null; variacao: string | null; quantidade: number }[];
};

const STATUS: Record<string, { label: string; cls?: string }> = {
  UNPAID: { label: "Aguardando pagamento" },
  READY_TO_SHIP: { label: "Pronto para enviar", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  PROCESSED: { label: "Envio programado", cls: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  RETRY_SHIP: { label: "Reenviar", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  SHIPPED: { label: "Enviado", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  TO_CONFIRM_RECEIVE: { label: "Entregue (a confirmar)" },
  COMPLETED: { label: "Concluído" },
  IN_CANCEL: { label: "Em cancelamento" },
  CANCELLED: { label: "Cancelado" },
  TO_RETURN: { label: "Devolução" },
};
const IMPRIMIVEL = ["PROCESSED", "SHIPPED", "RETRY_SHIP"];
const BRL = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

export function ShopeePedidos({ lojas }: { lojas: Loja[] }) {
  const conectadas = lojas.filter((l) => l.status === "conectada");
  const [conta, setConta] = useState<string>("");
  const [filtro, setFiltro] = useState("abertos");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [sincronizando, setSincronizando] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);
  const [envio, setEnvio] = useState<{ order_sn: string; params: any } | null>(null);
  const [programando, setProgramando] = useState(false);
  const [pickup, setPickup] = useState<{ address_id?: string; pickup_time_id?: string }>({});

  useEffect(() => { if (!conta && conectadas[0]) setConta(conectadas[0].id); }, [conectadas, conta]);

  const carregar = async () => {
    if (!conta) return;
    const { data } = await (supabase as any).from("shopee_orders")
      .select("id, order_sn, order_status, create_time, total_amount, shipping_carrier, tracking_number, etiqueta_baixada_em, itens")
      .eq("shopee_account_id", conta).order("create_time", { ascending: false }).limit(500);
    setPedidos(data || []);
    setSel(new Set());
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [conta]);

  const chamar = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("shopee-orders", { body: { account_id: conta, ...body } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.details || data.error);
    return data;
  };

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const r = await chamar({ action: "sync", days: 15 });
      toast.success(`${r.gravados} pedido(s) atualizados (últimos ${r.dias} dias).`);
      await carregar();
    } catch (e: any) { toast.error(e.message); } finally { setSincronizando(false); }
  };

  const abrirEnvio = async (order_sn: string) => {
    try {
      const r = await chamar({ action: "ship_params", order_sn });
      setPickup({});
      setEnvio({ order_sn, params: r.parametros });
    } catch (e: any) { toast.error(e.message); }
  };

  const programar = async (modo: "dropoff" | "pickup") => {
    if (!envio) return;
    setProgramando(true);
    try {
      const r = await chamar({ action: "ship", order_sn: envio.order_sn, modo, ...pickup });
      toast.success(r.tracking_number ? `Envio programado. Rastreio ${r.tracking_number}.` : "Envio programado.");
      setEnvio(null);
      await carregar();
    } catch (e: any) { toast.error(e.message); } finally { setProgramando(false); }
  };

  const imprimir = async () => {
    setImprimindo(true);
    try {
      const r = await chamar({ action: "labels", order_sns: [...sel] });
      const bin = Uint8Array.from(atob(r.pdf_base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bin], { type: "application/pdf" }));
      window.open(url, "_blank");
      if (r.falhas?.length) toast.warning(`${r.falhas.length} etiqueta(s) com problema na Shopee.`);
      await carregar();
    } catch (e: any) { toast.error(e.message); } finally { setImprimindo(false); }
  };

  const visiveis = useMemo(() => pedidos.filter((p) => {
    if (filtro === "abertos") return ["READY_TO_SHIP", "PROCESSED", "RETRY_SHIP"].includes(p.order_status);
    if (filtro === "todos") return true;
    return p.order_status === filtro;
  }), [pedidos, filtro]);
  const imprimiveisSel = [...sel].filter((sn) => IMPRIMIVEL.includes(pedidos.find((p) => p.order_sn === sn)?.order_status || ""));
  const toggle = (sn: string) => setSel((s) => { const n = new Set(s); n.has(sn) ? n.delete(sn) : n.add(sn); return n; });

  if (!conectadas.length) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Conecte uma loja Shopee para ver os pedidos.</CardContent></Card>;
  }

  const p = envio?.params;
  const temDropoff = !!p && (p.info_needed?.dropoff !== undefined || p.dropoff);
  const temPickup = !!p && (p.info_needed?.pickup !== undefined || p.pickup);
  const enderecos: any[] = p?.pickup?.address_list || [];
  const horarios: any[] = enderecos.find((a) => String(a.address_id) === pickup.address_id)?.time_slot_list || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pedidos Shopee</CardTitle>
        <CardDescription>
          Sincronize, programe o envio e imprima as etiquetas. Os dados do comprador não ficam gravados no sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={conta} onValueChange={setConta}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Loja" /></SelectTrigger>
            <SelectContent>{conectadas.map((l) => <SelectItem key={l.id} value={l.id}>{l.shop_name || l.shop_id}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="abertos">A enviar / imprimir</SelectItem>
              <SelectItem value="READY_TO_SHIP">Pronto para enviar</SelectItem>
              <SelectItem value="PROCESSED">Envio programado</SelectItem>
              <SelectItem value="SHIPPED">Enviados</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={sincronizar} disabled={sincronizando}>
            {sincronizando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}Sincronizar
          </Button>
          <Button onClick={imprimir} disabled={imprimindo || !imprimiveisSel.length}>
            {imprimindo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
            Imprimir etiquetas ({imprimiveisSel.length})
          </Button>
        </div>

        {visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido neste filtro. Clique em Sincronizar para buscar na Shopee.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {visiveis.map((ped) => {
              const st = STATUS[ped.order_status] || { label: ped.order_status };
              return (
                <div key={ped.id} className="flex flex-wrap items-center gap-3 p-3">
                  <Checkbox checked={sel.has(ped.order_sn)} onCheckedChange={() => toggle(ped.order_sn)} />
                  <div className="flex-1 min-w-[220px]">
                    <p className="font-medium text-sm">{ped.order_sn}
                      <span className="text-xs text-muted-foreground"> · {new Date(ped.create_time).toLocaleString("pt-BR")}</span></p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ped.itens.map((i) => `${i.quantidade}x ${i.nome}${i.variacao ? ` (${i.variacao})` : ""}`).join(" · ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {BRL(ped.total_amount)}{ped.shipping_carrier ? ` · ${ped.shipping_carrier}` : ""}{ped.tracking_number ? ` · rastreio ${ped.tracking_number}` : ""}
                      {ped.etiqueta_baixada_em ? " · etiqueta impressa" : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                  {ped.order_status === "READY_TO_SHIP" && (
                    <Button size="sm" variant="outline" onClick={() => abrirEnvio(ped.order_sn)}><Truck className="h-4 w-4 mr-1" />Programar envio</Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!envio} onOpenChange={(o) => !o && setEnvio(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Programar envio · {envio?.order_sn}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Isso avisa a Shopee que o pedido vai ser enviado e libera o rastreio e a etiqueta.</p>
            {temPickup && enderecos.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium">Coleta</p>
                <Select value={pickup.address_id} onValueChange={(v) => setPickup({ address_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Endereço de coleta" /></SelectTrigger>
                  <SelectContent>{enderecos.map((a) => <SelectItem key={a.address_id} value={String(a.address_id)}>{a.address || a.address_id}</SelectItem>)}</SelectContent>
                </Select>
                {horarios.length > 0 && (
                  <Select value={pickup.pickup_time_id} onValueChange={(v) => setPickup((s) => ({ ...s, pickup_time_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Horário" /></SelectTrigger>
                    <SelectContent>{horarios.map((h) => <SelectItem key={h.pickup_time_id} value={String(h.pickup_time_id)}>
                      {h.time_text || new Date(h.date * 1000).toLocaleDateString("pt-BR")}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            )}
            {!temDropoff && !temPickup && <p>A Shopee não informou opções de envio para este pedido.</p>}
          </div>
          <DialogFooter className="gap-2">
            {temPickup && (
              <Button variant="outline" disabled={programando || !pickup.address_id || (horarios.length > 0 && !pickup.pickup_time_id)} onClick={() => programar("pickup")}>
                Agendar coleta
              </Button>
            )}
            {temDropoff && (
              <Button disabled={programando} onClick={() => programar("dropoff")}>
                {programando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Vou levar à agência (drop-off)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
