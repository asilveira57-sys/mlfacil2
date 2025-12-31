import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
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
import { User, Package, ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AbcCustomerDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerNickname: string | null;
  buyerName: string;
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
  items_count: number;
}

interface ProductData {
  product_key: string;
  product_name: string;
  order_count: number;
  total_quantity: number;
  total_revenue: number;
}

export function AbcCustomerDetailDrawer({
  open,
  onOpenChange,
  buyerNickname,
  buyerName,
  classification,
  sellerId,
  dateFrom,
  dateTo,
}: AbcCustomerDetailDrawerProps) {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState({ orders: 0, products: 0, revenue: 0 });

  useEffect(() => {
    if (open && buyerNickname) {
      fetchCustomerDetails();
    }
  }, [open, buyerNickname, sellerId, dateFrom, dateTo]);

  const fetchCustomerDetails = async () => {
    if (!buyerNickname) return;
    setLoading(true);

    try {
      // Fetch orders from this customer
      let ordersQuery = supabase
        .from("meli_orders_cache")
        .select("order_id, created_at_meli, total_amount, order_status, items_count")
        .eq("seller_id", sellerId)
        .eq("buyer_nickname", buyerNickname)
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
        setOrders([]);
        setProducts([]);
        setTotals({ orders: 0, products: 0, revenue: 0 });
        setLoading(false);
        return;
      }

      // Sort orders by date desc
      const sortedOrders = ordersData.sort(
        (a, b) =>
          new Date(b.created_at_meli).getTime() -
          new Date(a.created_at_meli).getTime()
      );

      setOrders(sortedOrders.slice(0, 100));

      // Get order IDs for items query
      const orderIds = ordersData.map((o) => o.order_id);

      // Fetch items from these orders
      const { data: itemsData, error: itemsError } = await supabase
        .from("meli_order_items_cache")
        .select("product_key, title, title_short, sku, item_id, order_id, quantity, unit_price")
        .eq("seller_id", sellerId)
        .in("order_id", orderIds);

      if (itemsError) throw itemsError;

      // Aggregate by product
      const productMap = new Map<string, ProductData>();
      const orderSet = new Set<string>();

      for (const item of itemsData || []) {
        const key = item.product_key || item.item_id;
        const name = item.sku || item.title_short || item.title || item.item_id;
        orderSet.add(item.order_id);

        const existing = productMap.get(key);
        if (existing) {
          if (!existing.product_name.includes(item.order_id)) {
            existing.order_count += 1;
          }
          existing.total_quantity += item.quantity;
          existing.total_revenue += item.quantity * item.unit_price;
        } else {
          productMap.set(key, {
            product_key: key,
            product_name: name,
            order_count: 1,
            total_quantity: item.quantity,
            total_revenue: item.quantity * item.unit_price,
          });
        }
      }

      // Recalculate order_count properly
      const itemsByProduct = new Map<string, Set<string>>();
      for (const item of itemsData || []) {
        const key = item.product_key || item.item_id;
        if (!itemsByProduct.has(key)) {
          itemsByProduct.set(key, new Set());
        }
        itemsByProduct.get(key)!.add(item.order_id);
      }

      for (const [key, product] of productMap) {
        product.order_count = itemsByProduct.get(key)?.size || 1;
      }

      // Sort products by revenue desc
      const productList = Array.from(productMap.values()).sort(
        (a, b) => b.total_revenue - a.total_revenue
      );

      setProducts(productList.slice(0, 50));
      setTotals({
        orders: ordersData.length,
        products: productList.length,
        revenue: ordersData.reduce((sum, o) => sum + (o.total_amount || 0), 0),
      });
    } catch (error) {
      console.error("Error fetching customer details:", error);
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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="border-b">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <DrawerTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {buyerName}
              </DrawerTitle>
              <DrawerDescription className="flex items-center gap-4">
                {getClassBadge(classification)}
                <span>{totals.orders} pedidos</span>
                <span>{totals.products} produtos</span>
                <span className="font-medium">{formatCurrency(totals.revenue)}</span>
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-6">
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
                      <TableHead className="text-right">Itens</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.order_id}>
                        <TableCell className="text-sm">
                          {format(new Date(order.created_at_meli), "dd/MM/yy", {
                            locale: ptBR,
                          })}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {order.order_id}
                        </TableCell>
                        <TableCell className="text-right">
                          {order.items_count}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(order.total_amount || 0)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {order.order_status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Products Section */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Package className="h-4 w-4" />
                Produtos Comprados ({products.length})
              </h3>

              {loading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
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
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.product_key}>
                        <TableCell className="max-w-[200px] truncate">
                          {product.product_name}
                        </TableCell>
                        <TableCell className="text-right">
                          {product.order_count}
                        </TableCell>
                        <TableCell className="text-right">
                          {product.total_quantity}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(product.total_revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
