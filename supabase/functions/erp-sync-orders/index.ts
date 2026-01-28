import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { integration_id } = await req.json();

    if (!integration_id) {
      return new Response(
        JSON.stringify({ success: false, message: "integration_id required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Fetch integration
    const { data: integration, error: fetchError } = await supabase
      .from("erp_integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (fetchError || !integration) {
      return new Response(
        JSON.stringify({ success: false, message: "Integration not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Create sync run record
    const { data: syncRun, error: runError } = await supabase
      .from("integration_sync_runs")
      .insert({
        integration_id: integration.id,
        company_id: integration.company_id,
        status: "running",
      })
      .select()
      .single();

    if (runError) {
      console.error("Error creating sync run:", runError);
      throw runError;
    }

    let result: SyncResult;

    try {
      if (integration.provider === "tiny") {
        result = await syncTinyOrders(supabase, integration);
      } else if (integration.provider === "olist") {
        result = await syncOlistOrders(supabase, integration);
      } else {
        result = { fetched: 0, created: 0, updated: 0, failed: 0, error: "Unknown provider" };
      }

      // Update sync run
      await supabase
        .from("integration_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: result.error ? "failed" : result.failed > 0 ? "partial" : "success",
          orders_fetched: result.fetched,
          orders_created: result.created,
          orders_updated: result.updated,
          orders_failed: result.failed,
          error_message: result.error || null,
        })
        .eq("id", syncRun.id);

      // Update integration last sync
      await supabase
        .from("erp_integrations")
        .update({
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);

      return new Response(
        JSON.stringify({ success: !result.error, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      // Update sync run with error
      await supabase
        .from("integration_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "failed",
          error_message: errorMsg,
        })
        .eq("id", syncRun.id);

      throw error;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error syncing orders:", error);
    return new Response(
      JSON.stringify({ success: false, message: errorMsg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

interface SyncResult {
  fetched: number;
  created: number;
  updated: number;
  failed: number;
  error?: string;
}

async function syncTinyOrders(supabase: any, integration: any): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, created: 0, updated: 0, failed: 0 };

  try {
    // Fetch orders from Tiny
    const statusFilter = integration.order_status_filter || ["confirmed"];
    const dateFrom = integration.capture_from_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const response = await fetch(
      `https://api.tiny.com.br/api2/pedidos.pesquisa.php?token=${integration.api_key}&formato=json&dataInicial=${dateFrom}`,
      { method: "GET" }
    );

    const data = await response.json();

    if (data.retorno?.status !== "OK") {
      result.error = data.retorno?.erros?.[0]?.erro || "Failed to fetch orders";
      return result;
    }

    const orders = data.retorno?.pedidos || [];
    result.fetched = orders.length;

    for (const orderWrapper of orders) {
      const order = orderWrapper.pedido;
      try {
        // Check if order already exists
        const { data: existing } = await supabase
          .from("service_orders")
          .select("id")
          .eq("company_id", integration.company_id)
          .eq("provider", "tiny")
          .eq("external_order_id", order.id.toString())
          .single();

        // Upsert customer
        const customer = order.cliente || {};
        const missingFields: string[] = [];
        const requiredFields = ["nome", "documento", "endereco_rua", "endereco_numero", "endereco_bairro", "endereco_cidade", "endereco_uf", "endereco_cep"];
        
        const customerData: Record<string, any> = {
          company_id: integration.company_id,
          external_customer_id: customer.id?.toString(),
          provider: "tiny",
          nome: customer.nome,
          documento: customer.cpf_cnpj,
          documento_tipo: customer.cpf_cnpj?.length > 11 ? "cnpj" : "cpf",
          email: customer.email,
          telefone: customer.fone,
          endereco_rua: customer.endereco,
          endereco_numero: customer.numero,
          endereco_complemento: customer.complemento,
          endereco_bairro: customer.bairro,
          endereco_cidade: customer.cidade,
          endereco_uf: customer.uf,
          endereco_cep: customer.cep,
          raw_data: customer,
        };

        // Check completeness
        for (const field of requiredFields) {
          if (!customerData[field]) {
            missingFields.push(field);
          }
        }
        customerData.is_complete = missingFields.length === 0;
        customerData.missing_fields = missingFields;

        const { data: upsertedCustomer } = await supabase
          .from("service_order_customers")
          .upsert(customerData, { onConflict: "company_id,documento" })
          .select()
          .single();

        // Upsert order
        const orderData = {
          company_id: integration.company_id,
          integration_id: integration.id,
          provider: "tiny",
          external_order_id: order.id.toString(),
          external_order_number: order.numero?.toString(),
          order_date: order.data_pedido ? new Date(order.data_pedido).toISOString() : null,
          order_status: order.situacao,
          total_value: parseFloat(order.totalPedido) || 0,
          raw_data: order,
          customer_id: upsertedCustomer?.id,
          nfse_status: missingFields.length === 0 ? "ready" : "pending",
        };

        await supabase
          .from("service_orders")
          .upsert(orderData, { onConflict: "company_id,provider,external_order_id" });

        if (existing) {
          result.updated++;
        } else {
          result.created++;

          // Create invoice queue entry for new orders
          await supabase
            .from("service_invoice_queue")
            .insert({
              company_id: integration.company_id,
              service_order_id: (await supabase
                .from("service_orders")
                .select("id")
                .eq("company_id", integration.company_id)
                .eq("provider", "tiny")
                .eq("external_order_id", order.id.toString())
                .single()).data?.id,
              customer_id: upsertedCustomer?.id,
              status: missingFields.length === 0 ? "ready" : "pending",
              valor_servico: parseFloat(order.totalPedido) || 0,
            });
        }
      } catch (err) {
        console.error("Error processing order:", order.id, err);
        result.failed++;
      }
    }

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    result.error = errorMsg;
    return result;
  }
}

async function syncOlistOrders(supabase: any, integration: any): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, created: 0, updated: 0, failed: 0 };

  try {
    // Fetch orders from Olist
    const dateFrom = integration.capture_from_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const response = await fetch(
      `https://api.olist.com/v1/orders?created_at_min=${dateFrom}`,
      {
        headers: {
          "Authorization": `Bearer ${integration.api_key}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const data = await response.json();
    const orders = data.orders || data.data || [];
    result.fetched = orders.length;

    for (const order of orders) {
      try {
        const customer = order.customer || {};
        const shipping = order.shipping_address || {};

        // Upsert customer
        const missingFields: string[] = [];
        const requiredFields = ["nome", "documento", "endereco_rua", "endereco_numero", "endereco_bairro", "endereco_cidade", "endereco_uf", "endereco_cep"];
        
        const customerData: Record<string, any> = {
          company_id: integration.company_id,
          external_customer_id: customer.id?.toString(),
          provider: "olist",
          nome: customer.name,
          documento: customer.document,
          documento_tipo: customer.document?.length > 11 ? "cnpj" : "cpf",
          email: customer.email,
          telefone: customer.phone,
          endereco_rua: shipping.street,
          endereco_numero: shipping.number,
          endereco_complemento: shipping.complement,
          endereco_bairro: shipping.neighborhood,
          endereco_cidade: shipping.city,
          endereco_uf: shipping.state,
          endereco_cep: shipping.zip_code,
          raw_data: customer,
        };

        for (const field of requiredFields) {
          if (!customerData[field]) {
            missingFields.push(field);
          }
        }
        customerData.is_complete = missingFields.length === 0;
        customerData.missing_fields = missingFields;

        const { data: upsertedCustomer } = await supabase
          .from("service_order_customers")
          .upsert(customerData, { onConflict: "company_id,documento" })
          .select()
          .single();

        // Check if order exists
        const { data: existing } = await supabase
          .from("service_orders")
          .select("id")
          .eq("company_id", integration.company_id)
          .eq("provider", "olist")
          .eq("external_order_id", order.id.toString())
          .single();

        // Upsert order
        const orderData = {
          company_id: integration.company_id,
          integration_id: integration.id,
          provider: "olist",
          external_order_id: order.id.toString(),
          external_order_number: order.order_number?.toString(),
          order_date: order.created_at ? new Date(order.created_at).toISOString() : null,
          order_status: order.status,
          channel: order.channel,
          total_value: parseFloat(order.total) || 0,
          raw_data: order,
          customer_id: upsertedCustomer?.id,
          nfse_status: missingFields.length === 0 ? "ready" : "pending",
        };

        await supabase
          .from("service_orders")
          .upsert(orderData, { onConflict: "company_id,provider,external_order_id" });

        if (existing) {
          result.updated++;
        } else {
          result.created++;

          // Create invoice queue entry
          const { data: savedOrder } = await supabase
            .from("service_orders")
            .select("id")
            .eq("company_id", integration.company_id)
            .eq("provider", "olist")
            .eq("external_order_id", order.id.toString())
            .single();

          await supabase
            .from("service_invoice_queue")
            .insert({
              company_id: integration.company_id,
              service_order_id: savedOrder?.id,
              customer_id: upsertedCustomer?.id,
              status: missingFields.length === 0 ? "ready" : "pending",
              valor_servico: parseFloat(order.total) || 0,
            });
        }
      } catch (err) {
        console.error("Error processing Olist order:", order.id, err);
        result.failed++;
      }
    }

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    result.error = errorMsg;
    return result;
  }
}
