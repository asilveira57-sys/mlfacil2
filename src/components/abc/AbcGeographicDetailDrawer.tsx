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
import { MapPin, Package, Users, ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OrderDetailsDrawer } from "@/components/shipping/OrderDetailsDrawer";
import { useOrderDetails } from "@/hooks/useOrderDetails";

interface AbcGeographicDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: {
    uf?: string;
    city?: string;
    neighborhood?: string;
  } | null;
  locationName: string;
  classification: "A" | "B" | "C";
  sellerId: string;
  dateFrom?: string;
  dateTo?: string;
}

interface ProductData {
  product_key: string;
  product_name: string;
  quantity: number;
  revenue: number;
}

interface CustomerData {
  buyer_nickname: string;
  buyer_name: string;
  order_count: number;
  revenue: number;
}

interface OrderData {
  order_id: string;
  created_at_meli: string;
  total_amount: number;
  buyer_name: string;
  items_count: number;
}

export function AbcGeographicDetailDrawer({
  open,
  onOpenChange,
  location,
  locationName,
  classification,
  sellerId,
  dateFrom,
  dateTo,
}: AbcGeographicDetailDrawerProps) {
  const [products, setProducts] = useState<ProductData[]>([]);
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState({ orders: 0, revenue: 0, customers: 0 });
  
  // Order details drawer state
  const [orderDrawerOpen, setOrderDrawerOpen] = useState(false);
  const { loading: orderLoading, orderDetails, fetchOrderDetails, clearOrderDetails } = useOrderDetails(sellerId);

  useEffect(() => {
    if (open && location) {
      fetchGeographicDetails();
    }
  }, [open, location, sellerId, dateFrom, dateTo]);

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

  const fetchGeographicDetails = async () => {
    if (!location) return;
    setLoading(true);

    try {
      let shipmentsQuery = supabase
        .from("meli_shipments_cache")
        .select("order_id, shipment_id")
        .eq("seller_id", sellerId);

      if (location.uf) {
        shipmentsQuery = shipmentsQuery.eq("shipping_state_uf", location.uf);
      }
      if (location.city) {
        shipmentsQuery = shipmentsQuery.eq("shipping_city", location.city);
      }
      if (location.neighborhood) {
        shipmentsQuery = shipmentsQuery.eq("shipping_neighborhood", location.neighborhood);
      }

      const { data: shipments, error: shipmentsError } = await shipmentsQuery;

      if (shipmentsError) throw shipmentsError;

      if (!shipments || shipments.length === 0) {
        setProducts([]);
        setCustomers([]);
        setOrders([]);
        setTotals({ orders: 0, revenue: 0, customers: 0 });
        setLoading(false);
        return;
      }

      const orderIds = [...new Set(shipments.map((s) => s.order_id))];

      let ordersQuery = supabase
        .from("meli_orders_cache")
        .select("order_id, created_at_meli, total_amount, buyer_nickname, buyer_name, items_count, order_status")
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

      if (!ordersData || ordersData.length === 0) {
        setProducts([]);
        setCustomers([]);
        setOrders([]);
        setTotals({ orders: 0, revenue: 0, customers: 0 });
        setLoading(false);
        return;
      }

      const validOrderIds = ordersData.map((o) => o.order_id);

      const { data: itemsData, error: itemsError } = await supabase
        .from("meli_order_items_cache")
        .select("product_key, title, title_short, sku, item_id, quantity, unit_price")
        .eq("seller_id", sellerId)
        .in("order_id", validOrderIds);

      if (itemsError) throw itemsError;

      const productMap = new Map<string, ProductData>();
      for (const item of itemsData || []) {
        const key = item.product_key || item.item_id;
        const name = item.sku || item.title_short || item.title || item.item_id;
        const existing = productMap.get(key);
        if (existing) {
          existing.quantity += item.quantity;
          existing.revenue += item.quantity * item.unit_price;
        } else {
          productMap.set(key, {
            product_key: key,
            product_name: name,
            quantity: item.quantity,
            revenue: item.quantity * item.unit_price,
          });
        }
      }

      const customerMap = new Map<string, CustomerData>();
      for (const order of ordersData) {
        const key = order.buyer_nickname || "anonimo";
        const existing = customerMap.get(key);
        if (existing) {
          existing.order_count += 1;
          existing.revenue += order.total_amount || 0;
        } else {
          customerMap.set(key, {
            buyer_nickname: order.buyer_nickname || "Anônimo",
            buyer_name: order.buyer_name || order.buyer_nickname || "Anônimo",
            order_count: 1,
            revenue: order.total_amount || 0,
          });
        }
      }

      const productList = Array.from(productMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const customerList = Array.from(customerMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const recentOrders = ordersData
        .sort(
          (a, b) =>
            new Date(b.created_at_meli).getTime() -
            new Date(a.created_at_meli).getTime()
        )
        .slice(0, 20)
        .map((o) => ({
          order_id: o.order_id,
          created_at_meli: o.created_at_meli,
          total_amount: o.total_amount || 0,
          buyer_name: o.buyer_name || o.buyer_nickname || "Anônimo",
          items_count: o.items_count,
        }));

      setProducts(productList);
      setCustomers(customerList);
      setOrders(recentOrders);
      setTotals({
        orders: ordersData.length,
        revenue: ordersData.reduce((sum, o) => sum + (o.total_amount || 0), 0),
        customers: customerMap.size,
      });
    } catch (error) {
      console.error("Error fetching geographic details:", error);
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
                  <MapPin className="h-5 w-5" />
                  {locationName}
                </DialogTitle>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {getClassBadge(classification)}
                  <span>{totals.orders} pedidos</span>
                  <span>{totals.customers} clientes</span>
                  <span className="font-medium">{formatCurrency(totals.revenue)}</span>
                </div>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="h-[calc(90vh-140px)]">
            <div className="space-y-6 p-1">
              {/* Top Products */}
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Package className="h-4 w-4" />
                  Top 10 Produtos
                </h3>

                {loading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum produto encontrado.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((product, idx) => (
                        <TableRow key={product.product_key}>
                          <TableCell className="font-medium">{idx + 1}</TableCell>
                          <TableCell className="max-w-[180px] truncate">
                            {product.product_name}
                          </TableCell>
                          <TableCell className="text-right">
                            {product.quantity}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(product.revenue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Top Customers */}
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4" />
                  Top 10 Clientes
                </h3>

                {loading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
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
                        <TableHead>#</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Pedidos</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map((customer, idx) => (
                        <TableRow key={customer.buyer_nickname}>
                          <TableCell className="font-medium">{idx + 1}</TableCell>
                          <TableCell className="max-w-[180px] truncate">
                            {customer.buyer_name}
                          </TableCell>
                          <TableCell className="text-right">
                            {customer.order_count}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(customer.revenue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Recent Orders */}
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <ShoppingCart className="h-4 w-4" />
                  Pedidos Recentes ({orders.length})
                </h3>

                {loading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum pedido encontrado.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Pedido</TableHead>
                        <TableHead>Cliente</TableHead>
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
                          <TableCell className="max-w-[120px] truncate text-sm">
                            {order.buyer_name}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(order.total_amount)}
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
