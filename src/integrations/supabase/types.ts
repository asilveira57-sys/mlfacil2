export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      abc_config: {
        Row: {
          created_at: string
          id: string
          percent_a: number
          percent_b: number
          percent_c: number
          seller_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          percent_a?: number
          percent_b?: number
          percent_c?: number
          seller_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          percent_a?: number
          percent_b?: number
          percent_c?: number
          seller_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      abc_profit_cache: {
        Row: {
          class: string
          created_at: string
          cumulative_percent: number
          display_name: string | null
          id: string
          metric: string
          percent: number
          period_key: string
          product_key: string
          rank: number
          seller_id: string
          updated_at: string
          user_id: string
          value_total: number
        }
        Insert: {
          class?: string
          created_at?: string
          cumulative_percent?: number
          display_name?: string | null
          id?: string
          metric: string
          percent?: number
          period_key: string
          product_key: string
          rank?: number
          seller_id: string
          updated_at?: string
          user_id: string
          value_total?: number
        }
        Update: {
          class?: string
          created_at?: string
          cumulative_percent?: number
          display_name?: string | null
          id?: string
          metric?: string
          percent?: number
          period_key?: string
          product_key?: string
          rank?: number
          seller_id?: string
          updated_at?: string
          user_id?: string
          value_total?: number
        }
        Relationships: []
      }
      analyzed_items: {
        Row: {
          analyzed_at: string
          available_quantity: number | null
          category_id: string | null
          created_at: string
          id: string
          item_id: string
          ml_account_id: string | null
          permalink: string | null
          price: number | null
          raw_data: Json | null
          sold_quantity: number | null
          status: string | null
          thumbnail: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          analyzed_at?: string
          available_quantity?: number | null
          category_id?: string | null
          created_at?: string
          id?: string
          item_id: string
          ml_account_id?: string | null
          permalink?: string | null
          price?: number | null
          raw_data?: Json | null
          sold_quantity?: number | null
          status?: string | null
          thumbnail?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          analyzed_at?: string
          available_quantity?: number | null
          category_id?: string | null
          created_at?: string
          id?: string
          item_id?: string
          ml_account_id?: string | null
          permalink?: string | null
          price?: number | null
          raw_data?: Json | null
          sold_quantity?: number | null
          status?: string | null
          thumbnail?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyzed_items_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cep_cache: {
        Row: {
          city: string | null
          created_at: string
          id: string
          neighborhood: string | null
          state_uf: string | null
          street: string | null
          updated_at: string
          zipcode: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          neighborhood?: string | null
          state_uf?: string | null
          street?: string | null
          updated_at?: string
          zipcode: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          neighborhood?: string | null
          state_uf?: string | null
          street?: string | null
          updated_at?: string
          zipcode?: string
        }
        Relationships: []
      }
      highlights_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          permalink: string | null
          price: number | null
          rank: number
          snapshot_id: string
          sold_quantity: number | null
          thumbnail: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          permalink?: string | null
          price?: number | null
          rank: number
          snapshot_id: string
          sold_quantity?: number | null
          thumbnail?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          permalink?: string | null
          price?: number | null
          rank?: number
          snapshot_id?: string
          sold_quantity?: number | null
          thumbnail?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "highlights_items_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "highlights_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      highlights_snapshots: {
        Row: {
          category_id: string
          created_at: string
          id: string
          site_id: string
          snapshot_date: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          site_id?: string
          snapshot_date: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          site_id?: string
          snapshot_date?: string
        }
        Relationships: []
      }
      item_metrics: {
        Row: {
          analyzed_item_id: string
          collected_at: string
          conversion_rate: number | null
          description_length: number | null
          has_clips: boolean | null
          has_video: boolean | null
          id: string
          listing_type: string | null
          photo_count: number | null
          shipping_type: string | null
          sold_quantity_30d: number | null
          sold_quantity_7d: number | null
          title_length: number | null
          visits_30d: number | null
          visits_7d: number | null
          visits_total: number | null
        }
        Insert: {
          analyzed_item_id: string
          collected_at?: string
          conversion_rate?: number | null
          description_length?: number | null
          has_clips?: boolean | null
          has_video?: boolean | null
          id?: string
          listing_type?: string | null
          photo_count?: number | null
          shipping_type?: string | null
          sold_quantity_30d?: number | null
          sold_quantity_7d?: number | null
          title_length?: number | null
          visits_30d?: number | null
          visits_7d?: number | null
          visits_total?: number | null
        }
        Update: {
          analyzed_item_id?: string
          collected_at?: string
          conversion_rate?: number | null
          description_length?: number | null
          has_clips?: boolean | null
          has_video?: boolean | null
          id?: string
          listing_type?: string | null
          photo_count?: number | null
          shipping_type?: string | null
          sold_quantity_30d?: number | null
          sold_quantity_7d?: number | null
          title_length?: number | null
          visits_30d?: number | null
          visits_7d?: number | null
          visits_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_metrics_analyzed_item_id_fkey"
            columns: ["analyzed_item_id"]
            isOneToOne: false
            referencedRelation: "analyzed_items"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords_tracking: {
        Row: {
          analyzed_item_id: string
          checked_at: string
          id: string
          in_ads: boolean | null
          keyword: string
          search_page: number | null
          search_position: number | null
        }
        Insert: {
          analyzed_item_id: string
          checked_at?: string
          id?: string
          in_ads?: boolean | null
          keyword: string
          search_page?: number | null
          search_position?: number | null
        }
        Update: {
          analyzed_item_id?: string
          checked_at?: string
          id?: string
          in_ads?: boolean | null
          keyword?: string
          search_page?: number | null
          search_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "keywords_tracking_analyzed_item_id_fkey"
            columns: ["analyzed_item_id"]
            isOneToOne: false
            referencedRelation: "analyzed_items"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_fee_rules: {
        Row: {
          channel: string
          created_at: string
          fee_fixed_default: number
          fee_mode: string
          fee_percent_default: number
          id: string
          seller_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          fee_fixed_default?: number
          fee_mode?: string
          fee_percent_default?: number
          id?: string
          seller_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          fee_fixed_default?: number
          fee_mode?: string
          fee_percent_default?: number
          id?: string
          seller_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meli_invoices_cache: {
        Row: {
          error_message: string | null
          id: string
          invoice_key: string | null
          invoice_number: string | null
          invoice_status: string
          issued_at: string | null
          last_sync_at: string
          order_id: string
          seller_id: string
          user_id: string
        }
        Insert: {
          error_message?: string | null
          id?: string
          invoice_key?: string | null
          invoice_number?: string | null
          invoice_status?: string
          issued_at?: string | null
          last_sync_at?: string
          order_id: string
          seller_id: string
          user_id: string
        }
        Update: {
          error_message?: string | null
          id?: string
          invoice_key?: string | null
          invoice_number?: string | null
          invoice_status?: string
          issued_at?: string | null
          last_sync_at?: string
          order_id?: string
          seller_id?: string
          user_id?: string
        }
        Relationships: []
      }
      meli_label_header_preferences: {
        Row: {
          created_at: string
          font_size: number
          id: string
          line_order: string[]
          max_product_lines: number
          max_total_lines: number
          seller_id: string
          show_comment: boolean
          show_customer: boolean
          show_order_id: boolean
          show_products: boolean
          show_shipment_id: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          font_size?: number
          id?: string
          line_order?: string[]
          max_product_lines?: number
          max_total_lines?: number
          seller_id: string
          show_comment?: boolean
          show_customer?: boolean
          show_order_id?: boolean
          show_products?: boolean
          show_shipment_id?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          font_size?: number
          id?: string
          line_order?: string[]
          max_product_lines?: number
          max_total_lines?: number
          seller_id?: string
          show_comment?: boolean
          show_customer?: boolean
          show_order_id?: boolean
          show_products?: boolean
          show_shipment_id?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meli_order_items_cache: {
        Row: {
          catalog_product_id: string | null
          created_at_meli: string | null
          currency_id: string | null
          id: string
          item_id: string
          last_sync_at: string | null
          order_id: string
          permalink: string | null
          product_key: string
          quantity: number
          seller_id: string
          shipment_id: string | null
          sku: string | null
          thumbnail: string | null
          title: string | null
          title_short: string | null
          unit_price: number
          user_id: string
          variation_id: string | null
        }
        Insert: {
          catalog_product_id?: string | null
          created_at_meli?: string | null
          currency_id?: string | null
          id?: string
          item_id: string
          last_sync_at?: string | null
          order_id: string
          permalink?: string | null
          product_key?: string
          quantity?: number
          seller_id: string
          shipment_id?: string | null
          sku?: string | null
          thumbnail?: string | null
          title?: string | null
          title_short?: string | null
          unit_price?: number
          user_id: string
          variation_id?: string | null
        }
        Update: {
          catalog_product_id?: string | null
          created_at_meli?: string | null
          currency_id?: string | null
          id?: string
          item_id?: string
          last_sync_at?: string | null
          order_id?: string
          permalink?: string | null
          product_key?: string
          quantity?: number
          seller_id?: string
          shipment_id?: string | null
          sku?: string | null
          thumbnail?: string | null
          title?: string | null
          title_short?: string | null
          unit_price?: number
          user_id?: string
          variation_id?: string | null
        }
        Relationships: []
      }
      meli_orders_cache: {
        Row: {
          buyer_name: string | null
          buyer_nickname: string | null
          created_at_meli: string | null
          id: string
          internal_header: string | null
          items_count: number
          items_synced_at: string | null
          last_sync_at: string
          order_comment: string | null
          order_id: string
          order_status: string | null
          seller_id: string
          shipment_id: string | null
          total_amount: number | null
          user_id: string
        }
        Insert: {
          buyer_name?: string | null
          buyer_nickname?: string | null
          created_at_meli?: string | null
          id?: string
          internal_header?: string | null
          items_count?: number
          items_synced_at?: string | null
          last_sync_at?: string
          order_comment?: string | null
          order_id: string
          order_status?: string | null
          seller_id: string
          shipment_id?: string | null
          total_amount?: number | null
          user_id: string
        }
        Update: {
          buyer_name?: string | null
          buyer_nickname?: string | null
          created_at_meli?: string | null
          id?: string
          internal_header?: string | null
          items_count?: number
          items_synced_at?: string | null
          last_sync_at?: string
          order_comment?: string | null
          order_id?: string
          order_status?: string | null
          seller_id?: string
          shipment_id?: string | null
          total_amount?: number | null
          user_id?: string
        }
        Relationships: []
      }
      meli_print_queue: {
        Row: {
          batches: Json | null
          created_at: string
          error_log: string | null
          file_url: string | null
          format: string
          id: string
          job_completed_at: string | null
          job_started_at: string | null
          layout: string
          processed_labels: number
          seller_id: string
          shipment_ids: Json
          status: string
          total_labels: number
          user_id: string
          zpl_content: string | null
        }
        Insert: {
          batches?: Json | null
          created_at?: string
          error_log?: string | null
          file_url?: string | null
          format: string
          id?: string
          job_completed_at?: string | null
          job_started_at?: string | null
          layout?: string
          processed_labels?: number
          seller_id: string
          shipment_ids: Json
          status?: string
          total_labels?: number
          user_id: string
          zpl_content?: string | null
        }
        Update: {
          batches?: Json | null
          created_at?: string
          error_log?: string | null
          file_url?: string | null
          format?: string
          id?: string
          job_completed_at?: string | null
          job_started_at?: string | null
          layout?: string
          processed_labels?: number
          seller_id?: string
          shipment_ids?: Json
          status?: string
          total_labels?: number
          user_id?: string
          zpl_content?: string | null
        }
        Relationships: []
      }
      meli_shipments_cache: {
        Row: {
          id: string
          label_available: boolean
          last_sync_at: string
          logistic_type: string | null
          order_id: string
          receiver_address: string | null
          receiver_name: string | null
          seller_id: string
          shipment_id: string
          shipment_status: string | null
          shipment_substatus: string | null
          shipping_city: string | null
          shipping_neighborhood: string | null
          shipping_state_uf: string | null
          shipping_zipcode: string | null
          tracking_number: string | null
          user_id: string
        }
        Insert: {
          id?: string
          label_available?: boolean
          last_sync_at?: string
          logistic_type?: string | null
          order_id: string
          receiver_address?: string | null
          receiver_name?: string | null
          seller_id: string
          shipment_id: string
          shipment_status?: string | null
          shipment_substatus?: string | null
          shipping_city?: string | null
          shipping_neighborhood?: string | null
          shipping_state_uf?: string | null
          shipping_zipcode?: string | null
          tracking_number?: string | null
          user_id: string
        }
        Update: {
          id?: string
          label_available?: boolean
          last_sync_at?: string
          logistic_type?: string | null
          order_id?: string
          receiver_address?: string | null
          receiver_name?: string | null
          seller_id?: string
          shipment_id?: string
          shipment_status?: string | null
          shipment_substatus?: string | null
          shipping_city?: string | null
          shipping_neighborhood?: string | null
          shipping_state_uf?: string | null
          shipping_zipcode?: string | null
          tracking_number?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ml_accounts: {
        Row: {
          access_token: string
          country_id: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          ml_user_id: string
          nickname: string | null
          refresh_token: string
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          country_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          ml_user_id: string
          nickname?: string | null
          refresh_token: string
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          country_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          ml_user_id?: string
          nickname?: string | null
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      modules_registry: {
        Row: {
          created_at: string
          default_visible: boolean | null
          icon: string | null
          id: string
          module_key: string
          name: string
          order_default: number | null
          route: string | null
          show_in_panel: boolean | null
        }
        Insert: {
          created_at?: string
          default_visible?: boolean | null
          icon?: string | null
          id?: string
          module_key: string
          name: string
          order_default?: number | null
          route?: string | null
          show_in_panel?: boolean | null
        }
        Update: {
          created_at?: string
          default_visible?: boolean | null
          icon?: string | null
          id?: string
          module_key?: string
          name?: string
          order_default?: number | null
          route?: string | null
          show_in_panel?: boolean | null
        }
        Relationships: []
      }
      monthly_rankings: {
        Row: {
          created_at: string
          id: string
          ranking_month: string
          ranking_type: string
          rankings: Json
          seller_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ranking_month: string
          ranking_type: string
          rankings?: Json
          seller_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ranking_month?: string
          ranking_type?: string
          rankings?: Json
          seller_id?: string
          user_id?: string
        }
        Relationships: []
      }
      order_cost_breakdown_cache: {
        Row: {
          calculated_at: string
          cost_fees: number
          cost_items_total: number
          cost_other: number
          cost_packaging: number
          cost_shipping: number
          cost_total: number
          id: string
          margin_percent: number
          missing_cost_items_count: number
          notes: string | null
          order_id: string
          profit_total: number
          revenue_total: number
          seller_id: string
          shipment_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          calculated_at?: string
          cost_fees?: number
          cost_items_total?: number
          cost_other?: number
          cost_packaging?: number
          cost_shipping?: number
          cost_total?: number
          id?: string
          margin_percent?: number
          missing_cost_items_count?: number
          notes?: string | null
          order_id: string
          profit_total?: number
          revenue_total?: number
          seller_id: string
          shipment_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          calculated_at?: string
          cost_fees?: number
          cost_items_total?: number
          cost_other?: number
          cost_packaging?: number
          cost_shipping?: number
          cost_total?: number
          id?: string
          margin_percent?: number
          missing_cost_items_count?: number
          notes?: string | null
          order_id?: string
          profit_total?: number
          revenue_total?: number
          seller_id?: string
          shipment_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      packaging_cost_settings: {
        Row: {
          created_at: string
          default_packaging_cost: number
          id: string
          packaging_cost_mode: string
          seller_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_packaging_cost?: number
          id?: string
          packaging_cost_mode?: string
          seller_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_packaging_cost?: number
          id?: string
          packaging_cost_mode?: string
          seller_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_cost_catalog: {
        Row: {
          cost_currency: string
          cost_source: string
          cost_value: number
          created_at: string
          display_name: string | null
          id: string
          product_key: string
          seller_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cost_currency?: string
          cost_source?: string
          cost_value?: number
          created_at?: string
          display_name?: string | null
          id?: string
          product_key: string
          seller_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cost_currency?: string
          cost_source?: string
          cost_value?: number
          created_at?: string
          display_name?: string | null
          id?: string
          product_key?: string
          seller_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_profit_aggregate_cache: {
        Row: {
          cost_total: number
          created_at: string
          id: string
          margin_percent: number
          period_end: string
          period_key: string
          period_start: string
          product_key: string
          profit_total: number
          quantity_total: number
          revenue_total: number
          seller_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cost_total?: number
          created_at?: string
          id?: string
          margin_percent?: number
          period_end: string
          period_key: string
          period_start: string
          product_key: string
          profit_total?: number
          quantity_total?: number
          revenue_total?: number
          seller_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cost_total?: number
          created_at?: string
          id?: string
          margin_percent?: number
          period_end?: string
          period_key?: string
          period_start?: string
          product_key?: string
          profit_total?: number
          quantity_total?: number
          revenue_total?: number
          seller_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      seller_item_sales_daily: {
        Row: {
          created_at: string
          id: string
          item_id: string
          quantity_sold: number
          revenue: number
          sale_date: string
          seller_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          quantity_sold?: number
          revenue?: number
          sale_date: string
          seller_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          quantity_sold?: number
          revenue?: number
          sale_date?: string
          seller_id?: string
          user_id?: string
        }
        Relationships: []
      }
      seller_item_sales_monthly: {
        Row: {
          created_at: string
          id: string
          item_id: string
          quantity_sold: number
          revenue: number
          sale_month: string
          seller_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          quantity_sold?: number
          revenue?: number
          sale_month: string
          seller_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          quantity_sold?: number
          revenue?: number
          sale_month?: string
          seller_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seller_item_visits: {
        Row: {
          created_at: string
          id: string
          item_id: string
          seller_id: string
          user_id: string
          visit_date: string
          visits_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          seller_id: string
          user_id: string
          visit_date: string
          visits_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          seller_id?: string
          user_id?: string
          visit_date?: string
          visits_count?: number
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_type: string
          processed_records: number | null
          seller_id: string
          status: string
          total_records: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          processed_records?: number | null
          seller_id: string
          status?: string
          total_records?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          processed_records?: number | null
          seller_id?: string
          status?: string
          total_records?: number | null
          user_id?: string
        }
        Relationships: []
      }
      trend_alerts: {
        Row: {
          alert_data: Json | null
          alert_type: string
          created_at: string
          id: string
          is_dismissed: boolean
          is_read: boolean
          item_id: string | null
          message: string | null
          seller_id: string
          severity: string
          title: string
          triggered_at: string
          user_id: string
        }
        Insert: {
          alert_data?: Json | null
          alert_type: string
          created_at?: string
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          item_id?: string | null
          message?: string | null
          seller_id: string
          severity?: string
          title: string
          triggered_at?: string
          user_id: string
        }
        Update: {
          alert_data?: Json | null
          alert_type?: string
          created_at?: string
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          item_id?: string | null
          message?: string | null
          seller_id?: string
          severity?: string
          title?: string
          triggered_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trend_module_settings: {
        Row: {
          alerts_enabled: boolean
          created_at: string
          favorite_categories: string[] | null
          id: string
          sales_spike_threshold: number
          seller_id: string
          updated_at: string
          user_id: string
          visits_spike_threshold: number
        }
        Insert: {
          alerts_enabled?: boolean
          created_at?: string
          favorite_categories?: string[] | null
          id?: string
          sales_spike_threshold?: number
          seller_id: string
          updated_at?: string
          user_id: string
          visits_spike_threshold?: number
        }
        Update: {
          alerts_enabled?: boolean
          created_at?: string
          favorite_categories?: string[] | null
          id?: string
          sales_spike_threshold?: number
          seller_id?: string
          updated_at?: string
          user_id?: string
          visits_spike_threshold?: number
        }
        Relationships: []
      }
      trend_snapshots: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          keywords_data: Json | null
          site_id: string
          snapshot_date: string
          trends_data: Json | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          keywords_data?: Json | null
          site_id?: string
          snapshot_date: string
          trends_data?: Json | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          keywords_data?: Json | null
          site_id?: string
          snapshot_date?: string
          trends_data?: Json | null
        }
        Relationships: []
      }
      user_feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      zpl_conversion_history: {
        Row: {
          created_at: string | null
          duration_seconds: number
          height_mm: number
          id: string
          label_count: number
          label_subtype: string | null
          label_type: string
          time_per_label: number | null
          user_id: string
          width_mm: number
        }
        Insert: {
          created_at?: string | null
          duration_seconds: number
          height_mm: number
          id?: string
          label_count: number
          label_subtype?: string | null
          label_type: string
          time_per_label?: number | null
          user_id: string
          width_mm: number
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number
          height_mm?: number
          id?: string
          label_count?: number
          label_subtype?: string | null
          label_type?: string
          time_per_label?: number | null
          user_id?: string
          width_mm?: number
        }
        Relationships: []
      }
    }
    Views: {
      meli_orders_ready_view: {
        Row: {
          buyer_nickname: string | null
          created_at_meli: string | null
          final_status: string | null
          id: string | null
          invoice_key: string | null
          invoice_number: string | null
          invoice_status: string | null
          invoice_sync_at: string | null
          issued_at: string | null
          label_available: boolean | null
          order_id: string | null
          order_status: string | null
          order_sync_at: string | null
          receiver_name: string | null
          selectable: boolean | null
          seller_id: string | null
          shipment_id: string | null
          shipment_status: string | null
          shipment_substatus: string | null
          shipment_sync_at: string | null
          total_amount: number | null
          tracking_number: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_sales_metrics: {
        Args: { p_date_from?: string; p_date_to?: string; p_seller_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
