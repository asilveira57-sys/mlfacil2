import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ShippingOrder, OrderItemSummary } from './useShippingLabels';

export interface OrderDetailsResult {
  order: ShippingOrder | null;
  items: OrderItemSummary[];
}

export function useOrderDetails(sellerId: string | null) {
  const [loading, setLoading] = useState(false);
  const [orderDetails, setOrderDetails] = useState<OrderDetailsResult | null>(null);

  const fetchOrderDetails = useCallback(async (orderId: string): Promise<OrderDetailsResult | null> => {
    if (!sellerId || !orderId) return null;
    
    setLoading(true);
    
    try {
      // Fetch order
      const { data: orderData, error: orderError } = await supabase
        .from('meli_orders_cache')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('order_id', orderId)
        .single();

      if (orderError || !orderData) {
        console.error('Error fetching order:', orderError);
        return null;
      }

      // Fetch shipment if exists
      let shipmentData = null;
      if (orderData.shipment_id) {
        const { data: shipment } = await supabase
          .from('meli_shipments_cache')
          .select('*')
          .eq('seller_id', sellerId)
          .eq('shipment_id', orderData.shipment_id)
          .single();
        shipmentData = shipment;
      }

      // Fetch invoice
      const { data: invoiceData } = await supabase
        .from('meli_invoices_cache')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('order_id', orderId)
        .maybeSingle();

      // Fetch items
      const { data: itemsData, error: itemsError } = await supabase
        .from('meli_order_items_cache')
        .select('item_id, variation_id, sku, title_short, title, quantity, unit_price, permalink, catalog_product_id, thumbnail')
        .eq('seller_id', sellerId)
        .eq('order_id', orderId);

      if (itemsError) {
        console.error('Error fetching order items:', itemsError);
      }

      // Build ShippingOrder object
      const labelAvailable = shipmentData?.label_available ?? false;
      const substatus = shipmentData?.shipment_substatus;
      const shipmentStatus = shipmentData?.shipment_status;
      const logisticType = shipmentData?.logistic_type;

      // Calculate final_status
      let finalStatus: string = 'outros';
      const FULL_LOGISTIC_TYPES = ['fulfillment', 'cross_docking'];
      const COMPLETED_SHIPMENT_STATUSES = ['delivered', 'shipped', 'not_delivered'];

      if (logisticType && FULL_LOGISTIC_TYPES.includes(logisticType)) {
        finalStatus = 'full';
      } else if (shipmentStatus && COMPLETED_SHIPMENT_STATUSES.includes(shipmentStatus)) {
        finalStatus = 'enviado';
      } else if (substatus === 'printed') {
        finalStatus = 'reimprimir';
      } else if (substatus === 'invoice_pending') {
        finalStatus = 'aguardando_nf';
      } else if (substatus === 'ready_to_print' && labelAvailable) {
        finalStatus = 'pronta';
      }

      const selectable = finalStatus === 'pronta' || finalStatus === 'reimprimir';

      const order: ShippingOrder = {
        id: orderData.id,
        user_id: orderData.user_id,
        seller_id: orderData.seller_id,
        order_id: orderData.order_id,
        created_at_meli: orderData.created_at_meli,
        order_status: orderData.order_status,
        shipment_id: orderData.shipment_id,
        buyer_nickname: orderData.buyer_nickname,
        total_amount: orderData.total_amount,
        order_sync_at: orderData.last_sync_at,
        shipment_status: shipmentData?.shipment_status ?? null,
        shipment_substatus: shipmentData?.shipment_substatus ?? null,
        tracking_number: shipmentData?.tracking_number ?? null,
        label_available: labelAvailable,
        receiver_name: shipmentData?.receiver_name ?? null,
        shipment_sync_at: shipmentData?.last_sync_at ?? null,
        invoice_status: invoiceData?.invoice_status ?? 'pendente',
        invoice_number: invoiceData?.invoice_number ?? null,
        invoice_key: invoiceData?.invoice_key ?? null,
        issued_at: invoiceData?.issued_at ?? null,
        invoice_sync_at: invoiceData?.last_sync_at ?? null,
        final_status: finalStatus,
        selectable,
        logistic_type: logisticType ?? null,
      };

      const items: OrderItemSummary[] = (itemsData || []).map(item => ({
        item_id: item.item_id,
        variation_id: item.variation_id,
        sku: item.sku,
        title_short: item.title_short,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        permalink: item.permalink,
        catalog_product_id: item.catalog_product_id,
        thumbnail: item.thumbnail,
      }));

      const result = { order, items };
      setOrderDetails(result);
      return result;
    } catch (error) {
      console.error('Error fetching order details:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  const clearOrderDetails = useCallback(() => {
    setOrderDetails(null);
  }, []);

  return {
    loading,
    orderDetails,
    fetchOrderDetails,
    clearOrderDetails,
  };
}
