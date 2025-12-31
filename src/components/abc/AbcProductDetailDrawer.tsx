import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, Users, ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OrderDetailsDrawer } from "@/components/shipping/OrderDetailsDrawer";
import { useOrderDetails } from "@/hooks/useOrderDetails";

interface AbcProductDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productKey: string | null;
  productName: string;
  classification: "A" | "B" | "C";
  sellerId: string;
  dateFrom?: string;
  dateTo?: string;
}

interface OrderData {
  order_id: string;
  created_at_meli: string;
  total_amount: number;
  order_status: string;
  buyer_nickname: string;
  buyer_name: string;
  quantity: number;
  unit_price: number;
}

interface CustomerData {
  buyer_nickname: string;
  buyer_name: string;
  order_count: number;
  total_quantity: number;
  total_revenue: number;
}

export function AbcProductDetailDrawer({
  open,
  onOpenChange,
  productKey,
  productName,
  classification,
  sellerId,
  dateFrom,
  dateTo,
}: AbcProductDetailDrawerProps) {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState({ orders: 0, units: 0, revenue: 0 });
  
  // Order details drawer state
  const [orderDrawerOpen, setOrderDrawerOpen] = useState(false);
  const { loading: orderLoading, orderDetails, fetchOrderDetails, clearOrderDetails } = useOrderDetails(sellerId);

  useEffect(() => {
    if (open && productKey) {
      fetchProductDetails();
    }
  }, [open, productKey, sellerId, dateFrom, dateTo]);

  const handleOrderClick = async (orderId: string) => {
    await fetchOrderDetails(orderId);
    setOrderDrawerOpen(true);
  };

  const handleOrderDrawerClose = (isOpen: boolean) => {
    setOrderDrawerOpen(isOpen);
    if (!isOpen) {
      clearOrderDetails();
    }
  };

  const fetchProductDetails = async () => {
    if (!productKey) return;
    setLoading(true);

    try {
      const isLikelyTitle = productKey.includes(" ") || productKey.length > 20;
      
      let query;
      if (isLikelyTitle) {
        query = supabase
          .from("meli_order_items_cache")
          .select(`order_id, quantity, unit_price, created_at_meli`)
          .eq("seller_id", sellerId)
          .eq("title_short", productKey);
      } else {
        query = supabase
          .from("meli_order_items_cache")
          .select(`order_id, quantity, unit_price, created_at_meli`)
          .eq("seller_id", sellerId)
          .eq("product_key", productKey);
      }

      let { data: items, error: itemsError } = await query;

      if (itemsError) throw itemsError;

      if ((!items || items.length === 0) && !isLikelyTitle) {
        const { data: fallbackItems, error: fallbackError } = await supabase
          .from("meli_order_items_cache")
          .select(`order_id, quantity, unit_price, created_at_meli`)
          .eq("seller_id", sellerId)
          .eq("title_short", productKey);
        
        if (!fallbackError) {
          items = fallbackItems;
        }
      }

      if (!items || items.length === 0) {
        setOrders([]);
        setCustomers([]);
        setTotals({ orders: 0, units: 0, revenue: 0 });
        setLoading(false);
        return;
      }

      const orderIds = [...new Set(items.map((i) => i.order_id))] as string[];

      let ordersQuery = supabase
        .from("meli_orders_cache")
        .select("order_id, created_at_meli, total_amount, order_status, buyer_nickname, buyer_name")
        .eq("seller_id", sellerId)
        .in("order_id", orderIds)
        .neq("order_status", "cancelled");

      if (dateFrom) {
        ordersQuery = ordersQuery.gte("created_at_meli", dateFrom);
      }
      if (dateTo) {
        ordersQuery = ordersQuery.lte("created_at_meli", dateTo + "T23:59:59");
      }

      const { data: ordersData, error: ordersError } = await ordersQuery;

      if (ordersError) throw ordersError;

      const orderMap = new Map(ordersData?.map((o) => [o.order_id, o]) || []);
      const validOrders: OrderData[] = [];
      const customerMap = new Map<string, CustomerData>();

      for (const item of items) {
        const order = orderMap.get(item.order_id);
        if (!order) continue;

        validOrders.push({
          order_id: item.order_id,
          created_at_meli: order.created_at_meli,
          total_amount: order.total_amount,
          order_status: order.order_status,
          buyer_nickname: order.buyer_nickname || "Anônimo",
          buyer_name: order.buyer_name || order.buyer_nickname || "Anônimo",
          quantity: item.quantity,
          unit_price: item.unit_price,
        });

        const key = order.buyer_nickname || "anonimo";
        const existing = customerMap.get(key);
        if (existing) {
          existing.order_count += 1;
          existing.total_quantity += item.quantity;
          existing.total_revenue += item.quantity * item.unit_price;
        } else {
          customerMap.set(key, {
            buyer_nickname: order.buyer_nickname || "Anônimo",
            buyer_name: order.buyer_name || order.buyer_nickname || "Anônimo",
            order_count: 1,
            total_quantity: item.quantity,
            total_revenue: item.quantity * item.unit_price,
          });
        }
      }

      validOrders.sort(
        (a, b) =>
          new Date(b.created_at_meli).getTime() -
          new Date(a.created_at_meli).getTime()
      );

      const customerList = Array.from(customerMap.values()).sort(
        (a, b) => b.total_revenue - a.total_revenue
      );

      setOrders(validOrders.slice(0, 100));
      setCustomers(customerList.slice(0, 50));
      setTotals({
        orders: validOrders.length,
        units: validOrders.reduce((sum, o) => sum + o.quantity, 0),
        revenue: validOrders.reduce((sum, o) => sum + o.quantity * o.unit_price, 0),
      });
    } catch (error) {
      console.error("Error fetching product details:", error);
    } finally {
      setLoading(false);
    }
  };

  const getClassBadge = (cls: "A" | "B" | "C") => {
    const colors = {
      A: "bg-success/20 text-success border-success/30",
      B: "bg-warning/20 text-warning border-warning/30",
      C: "bg-destructive/20 text-destructive border-destructive/30",
    };
    return (
      <Badge variant="outline" className={colors[cls]}>
        Classe {cls}
      </Badge>
    );
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[800px] w-full max-h-[90vh] overflow-hidden">
          <DialogHeader className="border-b pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <DialogTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  {productName}
                </DialogTitle>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {getClassBadge(classification)}
                  <span>{totals.orders} pedidos</span>
                  <span>{totals.units} unidades</span>
                  <span className="font-medium">{formatCurrency(totals.revenue)}</span>
                </div>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="h-[calc(90vh-140px)]">
            <div className="space-y-6 p-1">
              {/* Orders Section */}
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <ShoppingCart className="h-4 w-4" />
                  Pedidos ({orders.length})
                </h3>

                {loading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum pedido encontrado no período.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Pedido</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => (
                        <TableRow 
                          key={order.order_id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleOrderClick(order.order_id)}
                        >
                          <TableCell className="text-sm">
                            {format(new Date(order.created_at_meli), "dd/MM/yy", {
                              locale: ptBR,
                            })}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {order.order_id}
                          </TableCell>
                          <TableCell className="text-sm">
                            {order.buyer_name}
                          </TableCell>
                          <TableCell className="text-right">
                            {order.quantity}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(order.quantity * order.unit_price)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Customers Section */}
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4" />
                  Clientes ({customers.length})
                </h3>

                {loading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : customers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum cliente encontrado.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Pedidos</TableHead>
                        <TableHead className="text-right">Unidades</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map((customer) => (
                        <TableRow key={customer.buyer_nickname}>
                          <TableCell>{customer.buyer_name}</TableCell>
                          <TableCell className="text-right">
                            {customer.order_count}
                          </TableCell>
                          <TableCell className="text-right">
                            {customer.total_quantity}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(customer.total_revenue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Order Details Drawer */}
      <OrderDetailsDrawer
        order={orderDetails?.order ?? null}
        open={orderDrawerOpen}
        onOpenChange={handleOrderDrawerClose}
        orderItems={orderDetails?.items ?? []}
      />
    </>
  );
}
