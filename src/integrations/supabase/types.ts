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
      access_profiles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_protected: boolean
          is_system: boolean
          key: string
          level: number
          name: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_protected?: boolean
          is_system?: boolean
          key: string
          level?: number
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_protected?: boolean
          is_system?: boolean
          key?: string
          level?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      account_category_activity: {
        Row: {
          account_id: string
          category_id: string
          category_name: string | null
          category_path: string[] | null
          computed_at: string
          created_at: string
          first_order_at: string | null
          gmv_30d: number | null
          gmv_90d: number | null
          id: string
          is_active: boolean | null
          is_pinned_auto: boolean | null
          last_order_at: string | null
          level1_category_id: string | null
          level1_category_name: string | null
          orders_count_30d: number | null
          orders_count_90d: number | null
          pinned_rank: number | null
          pinned_reason: string | null
          units_sold_30d: number | null
          units_sold_90d: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          category_id: string
          category_name?: string | null
          category_path?: string[] | null
          computed_at?: string
          created_at?: string
          first_order_at?: string | null
          gmv_30d?: number | null
          gmv_90d?: number | null
          id?: string
          is_active?: boolean | null
          is_pinned_auto?: boolean | null
          last_order_at?: string | null
          level1_category_id?: string | null
          level1_category_name?: string | null
          orders_count_30d?: number | null
          orders_count_90d?: number | null
          pinned_rank?: number | null
          pinned_reason?: string | null
          units_sold_30d?: number | null
          units_sold_90d?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          category_id?: string
          category_name?: string | null
          category_path?: string[] | null
          computed_at?: string
          created_at?: string
          first_order_at?: string | null
          gmv_30d?: number | null
          gmv_90d?: number | null
          id?: string
          is_active?: boolean | null
          is_pinned_auto?: boolean | null
          last_order_at?: string | null
          level1_category_id?: string | null
          level1_category_name?: string | null
          orders_count_30d?: number | null
          orders_count_90d?: number | null
          pinned_rank?: number | null
          pinned_reason?: string | null
          units_sold_30d?: number | null
          units_sold_90d?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      account_category_sync_state: {
        Row: {
          account_id: string
          categories_found: number | null
          categories_pinned: number | null
          created_at: string
          error_message: string | null
          id: string
          last_sync_at: string | null
          last_sync_duration_ms: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          categories_found?: number | null
          categories_pinned?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_duration_ms?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          categories_found?: number | null
          categories_pinned?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_duration_ms?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ad_lifecycle_actions: {
        Row: {
          action_status: string
          action_type: string
          checklist: Json | null
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          ml_account_id: string
          reason: string | null
          result: Json | null
          source_snapshot: Json | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action_status?: string
          action_type: string
          checklist?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          ml_account_id: string
          reason?: string | null
          result?: Json | null
          source_snapshot?: Json | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action_status?: string
          action_type?: string
          checklist?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          ml_account_id?: string
          reason?: string | null
          result?: Json | null
          source_snapshot?: Json | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      ad_lifecycle_experiments: {
        Row: {
          after_14d: Json | null
          after_30d: Json | null
          after_7d: Json | null
          baseline: Json | null
          created_at: string
          id: string
          method: string
          ml_account_id: string
          new_item_id: string | null
          source_item_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          after_14d?: Json | null
          after_30d?: Json | null
          after_7d?: Json | null
          baseline?: Json | null
          created_at?: string
          id?: string
          method: string
          ml_account_id: string
          new_item_id?: string | null
          source_item_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          after_14d?: Json | null
          after_30d?: Json | null
          after_7d?: Json | null
          baseline?: Json | null
          created_at?: string
          id?: string
          method?: string
          ml_account_id?: string
          new_item_id?: string | null
          source_item_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      ad_timeline_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          item_id: string
          ml_account_id: string
          occurred_at: string
          payload: Json | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          item_id: string
          ml_account_id: string
          occurred_at: string
          payload?: Json | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          item_id?: string
          ml_account_id?: string
          occurred_at?: string
          payload?: Json | null
          workspace_id?: string
        }
        Relationships: []
      }
      ad_timeline_settings: {
        Row: {
          action_safety: Json | null
          created_at: string
          id: string
          ml_account_id: string | null
          no_sales_policy: string | null
          recalc_frequency_hours: number | null
          thresholds_days: Json | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action_safety?: Json | null
          created_at?: string
          id?: string
          ml_account_id?: string | null
          no_sales_policy?: string | null
          recalc_frequency_hours?: number | null
          thresholds_days?: Json | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action_safety?: Json | null
          created_at?: string
          id?: string
          ml_account_id?: string | null
          no_sales_policy?: string | null
          recalc_frequency_hours?: number | null
          thresholds_days?: Json | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      ad_timeline_stats: {
        Row: {
          avg_gap_hours: number | null
          created_at: string
          days_since_last_sale: number | null
          first_sale_at: string | null
          id: string
          item_id: string
          last_sale_at: string | null
          max_gap_hours: number | null
          median_gap_hours: number | null
          ml_account_id: string
          sales_count_120d: number | null
          sales_count_30d: number | null
          sales_count_60d: number | null
          sales_count_90d: number | null
          status_bucket: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          avg_gap_hours?: number | null
          created_at?: string
          days_since_last_sale?: number | null
          first_sale_at?: string | null
          id?: string
          item_id: string
          last_sale_at?: string | null
          max_gap_hours?: number | null
          median_gap_hours?: number | null
          ml_account_id: string
          sales_count_120d?: number | null
          sales_count_30d?: number | null
          sales_count_60d?: number | null
          sales_count_90d?: number | null
          status_bucket?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          avg_gap_hours?: number | null
          created_at?: string
          days_since_last_sale?: number | null
          first_sale_at?: string | null
          id?: string
          item_id?: string
          last_sale_at?: string | null
          max_gap_hours?: number | null
          median_gap_hours?: number | null
          ml_account_id?: string
          sales_count_120d?: number | null
          sales_count_30d?: number | null
          sales_count_60d?: number | null
          sales_count_90d?: number | null
          status_bucket?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      admin_action_log: {
        Row: {
          action_type: string
          admin_user_id: string
          created_at: string
          description: string | null
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action_type: string
          admin_user_id: string
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action_type?: string
          admin_user_id?: string
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      ads_ad_groups: {
        Row: {
          campaign_id: string | null
          clicks: number | null
          conversions: number | null
          created_at: string
          default_bid: number | null
          id: string
          impressions: number | null
          ml_ad_group_id: string
          name: string
          raw_data: Json | null
          seller_id: string
          spent: number | null
          status: string
          synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          default_bid?: number | null
          id?: string
          impressions?: number | null
          ml_ad_group_id: string
          name: string
          raw_data?: Json | null
          seller_id: string
          spent?: number | null
          status?: string
          synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          default_bid?: number | null
          id?: string
          impressions?: number | null
          ml_ad_group_id?: string
          name?: string
          raw_data?: Json | null
          seller_id?: string
          spent?: number | null
          status?: string
          synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_ad_groups_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ads_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_ai_analyses: {
        Row: {
          analysis_json: Json
          analysis_type: string
          created_at: string
          focus_area: string | null
          health_score: number | null
          health_status: string | null
          id: string
          input_summary: Json | null
          seller_id: string
          user_id: string
        }
        Insert: {
          analysis_json: Json
          analysis_type?: string
          created_at?: string
          focus_area?: string | null
          health_score?: number | null
          health_status?: string | null
          id?: string
          input_summary?: Json | null
          seller_id: string
          user_id: string
        }
        Update: {
          analysis_json?: Json
          analysis_type?: string
          created_at?: string
          focus_area?: string | null
          health_score?: number | null
          health_status?: string | null
          id?: string
          input_summary?: Json | null
          seller_id?: string
          user_id?: string
        }
        Relationships: []
      }
      ads_alerts: {
        Row: {
          alert_type: string
          campaign_id: string | null
          created_at: string
          data_json: Json | null
          id: string
          is_dismissed: boolean | null
          is_read: boolean | null
          item_id: string | null
          message_pt: string
          resolved_at: string | null
          seller_id: string
          severity: string
          title: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          alert_type: string
          campaign_id?: string | null
          created_at?: string
          data_json?: Json | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          item_id?: string | null
          message_pt: string
          resolved_at?: string | null
          seller_id: string
          severity?: string
          title: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          alert_type?: string
          campaign_id?: string | null
          created_at?: string
          data_json?: Json | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          item_id?: string | null
          message_pt?: string
          resolved_at?: string | null
          seller_id?: string
          severity?: string
          title?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_alerts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ads_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_alerts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_automation_rules: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean | null
          last_triggered_at: string | null
          name: string
          rule_type: string
          seller_id: string
          trigger_count: number | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          last_triggered_at?: string | null
          name: string
          rule_type: string
          seller_id: string
          trigger_count?: number | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          last_triggered_at?: string | null
          name?: string
          rule_type?: string
          seller_id?: string
          trigger_count?: number | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_automation_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_campaigns: {
        Row: {
          campaign_type: string | null
          created_at: string
          daily_budget: number | null
          end_date: string | null
          id: string
          ml_campaign_id: string
          name: string
          raw_data: Json | null
          seller_id: string
          spent_total: number | null
          start_date: string | null
          status: string
          synced_at: string | null
          total_budget: number | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          campaign_type?: string | null
          created_at?: string
          daily_budget?: number | null
          end_date?: string | null
          id?: string
          ml_campaign_id: string
          name: string
          raw_data?: Json | null
          seller_id: string
          spent_total?: number | null
          start_date?: string | null
          status?: string
          synced_at?: string | null
          total_budget?: number | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          campaign_type?: string | null
          created_at?: string
          daily_budget?: number | null
          end_date?: string | null
          id?: string
          ml_campaign_id?: string
          name?: string
          raw_data?: Json | null
          seller_id?: string
          spent_total?: number | null
          start_date?: string | null
          status?: string
          synced_at?: string | null
          total_budget?: number | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_connections: {
        Row: {
          auto_sync_enabled: boolean
          connected_at: string | null
          created_at: string
          disconnected_at: string | null
          id: string
          last_sync_at: string | null
          last_sync_message: string | null
          last_sync_status: string | null
          ml_account_email: string | null
          ml_account_name: string | null
          next_scheduled_sync_at: string | null
          seller_id: string
          status: string
          status_message: string | null
          sync_interval_hours: number
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          auto_sync_enabled?: boolean
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          ml_account_email?: string | null
          ml_account_name?: string | null
          next_scheduled_sync_at?: string | null
          seller_id: string
          status?: string
          status_message?: string | null
          sync_interval_hours?: number
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          auto_sync_enabled?: boolean
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          ml_account_email?: string | null
          ml_account_name?: string | null
          next_scheduled_sync_at?: string | null
          seller_id?: string
          status?: string
          status_message?: string | null
          sync_interval_hours?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_credentials: {
        Row: {
          access_token_expires_at: string | null
          access_token_hash: string | null
          connection_id: string
          created_at: string
          id: string
          is_valid: boolean
          last_refresh_at: string | null
          last_refresh_error: string | null
          refresh_failure_count: number
          refresh_token_expires_at: string | null
          refresh_token_hash: string | null
          scopes: string[] | null
          updated_at: string
        }
        Insert: {
          access_token_expires_at?: string | null
          access_token_hash?: string | null
          connection_id: string
          created_at?: string
          id?: string
          is_valid?: boolean
          last_refresh_at?: string | null
          last_refresh_error?: string | null
          refresh_failure_count?: number
          refresh_token_expires_at?: string | null
          refresh_token_hash?: string | null
          scopes?: string[] | null
          updated_at?: string
        }
        Update: {
          access_token_expires_at?: string | null
          access_token_hash?: string | null
          connection_id?: string
          created_at?: string
          id?: string
          is_valid?: boolean
          last_refresh_at?: string | null
          last_refresh_error?: string | null
          refresh_failure_count?: number
          refresh_token_expires_at?: string | null
          refresh_token_hash?: string | null
          scopes?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_credentials_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "ads_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_credentials_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["ads_connection_id"]
          },
        ]
      }
      ads_daily_metrics: {
        Row: {
          acos: number | null
          ad_group_id: string | null
          campaign_id: string
          clicks: number | null
          conversions: number | null
          created_at: string
          id: string
          impressions: number | null
          item_id: string | null
          metric_date: string
          revenue: number | null
          roas: number | null
          seller_id: string
          spent: number | null
          user_id: string
        }
        Insert: {
          acos?: number | null
          ad_group_id?: string | null
          campaign_id: string
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          id?: string
          impressions?: number | null
          item_id?: string | null
          metric_date: string
          revenue?: number | null
          roas?: number | null
          seller_id: string
          spent?: number | null
          user_id: string
        }
        Update: {
          acos?: number | null
          ad_group_id?: string | null
          campaign_id?: string
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          id?: string
          impressions?: number | null
          item_id?: string | null
          metric_date?: string
          revenue?: number | null
          roas?: number | null
          seller_id?: string
          spent?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_daily_metrics_ad_group_id_fkey"
            columns: ["ad_group_id"]
            isOneToOne: false
            referencedRelation: "ads_ad_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_daily_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ads_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_data_freshness: {
        Row: {
          cached_date_range_from: string | null
          cached_date_range_to: string | null
          cached_record_count: number | null
          connection_id: string
          consecutive_failures: number
          data_type: string
          id: string
          is_stale: boolean
          last_successful_sync_at: string | null
          last_sync_attempt_at: string | null
          seller_id: string
          stale_threshold_hours: number
          updated_at: string
        }
        Insert: {
          cached_date_range_from?: string | null
          cached_date_range_to?: string | null
          cached_record_count?: number | null
          connection_id: string
          consecutive_failures?: number
          data_type: string
          id?: string
          is_stale?: boolean
          last_successful_sync_at?: string | null
          last_sync_attempt_at?: string | null
          seller_id: string
          stale_threshold_hours?: number
          updated_at?: string
        }
        Update: {
          cached_date_range_from?: string | null
          cached_date_range_to?: string | null
          cached_record_count?: number | null
          connection_id?: string
          consecutive_failures?: number
          data_type?: string
          id?: string
          is_stale?: boolean
          last_successful_sync_at?: string | null
          last_sync_attempt_at?: string | null
          seller_id?: string
          stale_threshold_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_data_freshness_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "ads_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_data_freshness_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["ads_connection_id"]
          },
        ]
      }
      ads_items: {
        Row: {
          acos: number | null
          ad_group_id: string | null
          bid: number | null
          category_id: string | null
          clicks: number | null
          conversions: number | null
          created_at: string
          current_price: number | null
          id: string
          impressions: number | null
          item_id: string
          product_key: string | null
          raw_data: Json | null
          revenue_from_ads: number | null
          roas: number | null
          seller_id: string
          spent: number | null
          status: string
          synced_at: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          acos?: number | null
          ad_group_id?: string | null
          bid?: number | null
          category_id?: string | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          current_price?: number | null
          id?: string
          impressions?: number | null
          item_id: string
          product_key?: string | null
          raw_data?: Json | null
          revenue_from_ads?: number | null
          roas?: number | null
          seller_id: string
          spent?: number | null
          status?: string
          synced_at?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          acos?: number | null
          ad_group_id?: string | null
          bid?: number | null
          category_id?: string | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string
          current_price?: number | null
          id?: string
          impressions?: number | null
          item_id?: string
          product_key?: string | null
          raw_data?: Json | null
          revenue_from_ads?: number | null
          roas?: number | null
          seller_id?: string
          spent?: number | null
          status?: string
          synced_at?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_items_ad_group_id_fkey"
            columns: ["ad_group_id"]
            isOneToOne: false
            referencedRelation: "ads_ad_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_period_cache: {
        Row: {
          campaigns_data: Json | null
          created_at: string
          fetched_at: string
          id: string
          items_data: Json | null
          metric_date: string
          range_key: string | null
          seller_id: string
          total_clicks: number
          total_conversions: number
          total_impressions: number
          total_revenue: number
          total_spent: number
          user_id: string
        }
        Insert: {
          campaigns_data?: Json | null
          created_at?: string
          fetched_at?: string
          id?: string
          items_data?: Json | null
          metric_date: string
          range_key?: string | null
          seller_id: string
          total_clicks?: number
          total_conversions?: number
          total_impressions?: number
          total_revenue?: number
          total_spent?: number
          user_id: string
        }
        Update: {
          campaigns_data?: Json | null
          created_at?: string
          fetched_at?: string
          id?: string
          items_data?: Json | null
          metric_date?: string
          range_key?: string | null
          seller_id?: string
          total_clicks?: number
          total_conversions?: number
          total_impressions?: number
          total_revenue?: number
          total_spent?: number
          user_id?: string
        }
        Relationships: []
      }
      ads_snapshots: {
        Row: {
          connection_id: string
          created_at: string
          data_json: Json
          id: string
          is_valid: boolean
          job_id: string | null
          record_count: number
          seller_id: string
          snapshot_date: string
          snapshot_hour: number | null
          snapshot_type: string
          superseded_by: string | null
        }
        Insert: {
          connection_id: string
          created_at?: string
          data_json: Json
          id?: string
          is_valid?: boolean
          job_id?: string | null
          record_count?: number
          seller_id: string
          snapshot_date: string
          snapshot_hour?: number | null
          snapshot_type: string
          superseded_by?: string | null
        }
        Update: {
          connection_id?: string
          created_at?: string
          data_json?: Json
          id?: string
          is_valid?: boolean
          job_id?: string | null
          record_count?: number
          seller_id?: string
          snapshot_date?: string
          snapshot_hour?: number | null
          snapshot_type?: string
          superseded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_snapshots_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "ads_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_snapshots_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["ads_connection_id"]
          },
          {
            foreignKeyName: "ads_snapshots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ads_sync_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_snapshots_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "ads_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_staging_ad_groups: {
        Row: {
          connection_id: string
          default_bid: number | null
          fetched_at: string
          id: string
          is_processed: boolean
          job_id: string
          ml_ad_group_id: string
          ml_campaign_id: string
          name: string | null
          processed_at: string | null
          processing_error: string | null
          raw_data: Json
          seller_id: string
          status: string | null
        }
        Insert: {
          connection_id: string
          default_bid?: number | null
          fetched_at?: string
          id?: string
          is_processed?: boolean
          job_id: string
          ml_ad_group_id: string
          ml_campaign_id: string
          name?: string | null
          processed_at?: string | null
          processing_error?: string | null
          raw_data: Json
          seller_id: string
          status?: string | null
        }
        Update: {
          connection_id?: string
          default_bid?: number | null
          fetched_at?: string
          id?: string
          is_processed?: boolean
          job_id?: string
          ml_ad_group_id?: string
          ml_campaign_id?: string
          name?: string | null
          processed_at?: string | null
          processing_error?: string | null
          raw_data?: Json
          seller_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_staging_ad_groups_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "ads_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_staging_ad_groups_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["ads_connection_id"]
          },
          {
            foreignKeyName: "ads_staging_ad_groups_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ads_sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_staging_campaigns: {
        Row: {
          campaign_type: string | null
          connection_id: string
          daily_budget: number | null
          end_date: string | null
          fetched_at: string
          id: string
          is_processed: boolean
          job_id: string
          ml_campaign_id: string
          name: string | null
          processed_at: string | null
          processing_error: string | null
          raw_data: Json
          seller_id: string
          start_date: string | null
          status: string | null
          total_budget: number | null
        }
        Insert: {
          campaign_type?: string | null
          connection_id: string
          daily_budget?: number | null
          end_date?: string | null
          fetched_at?: string
          id?: string
          is_processed?: boolean
          job_id: string
          ml_campaign_id: string
          name?: string | null
          processed_at?: string | null
          processing_error?: string | null
          raw_data: Json
          seller_id: string
          start_date?: string | null
          status?: string | null
          total_budget?: number | null
        }
        Update: {
          campaign_type?: string | null
          connection_id?: string
          daily_budget?: number | null
          end_date?: string | null
          fetched_at?: string
          id?: string
          is_processed?: boolean
          job_id?: string
          ml_campaign_id?: string
          name?: string | null
          processed_at?: string | null
          processing_error?: string | null
          raw_data?: Json
          seller_id?: string
          start_date?: string | null
          status?: string | null
          total_budget?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_staging_campaigns_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "ads_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_staging_campaigns_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["ads_connection_id"]
          },
          {
            foreignKeyName: "ads_staging_campaigns_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ads_sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_staging_items: {
        Row: {
          bid: number | null
          connection_id: string
          current_price: number | null
          fetched_at: string
          id: string
          is_processed: boolean
          item_id: string
          job_id: string
          ml_ad_group_id: string | null
          processed_at: string | null
          processing_error: string | null
          raw_data: Json
          seller_id: string
          status: string | null
          title: string | null
        }
        Insert: {
          bid?: number | null
          connection_id: string
          current_price?: number | null
          fetched_at?: string
          id?: string
          is_processed?: boolean
          item_id: string
          job_id: string
          ml_ad_group_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          raw_data: Json
          seller_id: string
          status?: string | null
          title?: string | null
        }
        Update: {
          bid?: number | null
          connection_id?: string
          current_price?: number | null
          fetched_at?: string
          id?: string
          is_processed?: boolean
          item_id?: string
          job_id?: string
          ml_ad_group_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          raw_data?: Json
          seller_id?: string
          status?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_staging_items_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "ads_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_staging_items_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["ads_connection_id"]
          },
          {
            foreignKeyName: "ads_staging_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ads_sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_staging_metrics: {
        Row: {
          clicks: number | null
          connection_id: string
          conversions: number | null
          entity_id: string
          entity_type: string
          fetched_at: string
          id: string
          impressions: number | null
          is_processed: boolean
          job_id: string
          metric_date: string
          processed_at: string | null
          processing_error: string | null
          raw_data: Json
          revenue: number | null
          seller_id: string
          spent: number | null
        }
        Insert: {
          clicks?: number | null
          connection_id: string
          conversions?: number | null
          entity_id: string
          entity_type: string
          fetched_at?: string
          id?: string
          impressions?: number | null
          is_processed?: boolean
          job_id: string
          metric_date: string
          processed_at?: string | null
          processing_error?: string | null
          raw_data: Json
          revenue?: number | null
          seller_id: string
          spent?: number | null
        }
        Update: {
          clicks?: number | null
          connection_id?: string
          conversions?: number | null
          entity_id?: string
          entity_type?: string
          fetched_at?: string
          id?: string
          impressions?: number | null
          is_processed?: boolean
          job_id?: string
          metric_date?: string
          processed_at?: string | null
          processing_error?: string | null
          raw_data?: Json
          revenue?: number | null
          seller_id?: string
          spent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_staging_metrics_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "ads_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_staging_metrics_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["ads_connection_id"]
          },
          {
            foreignKeyName: "ads_staging_metrics_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ads_sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_sync_jobs: {
        Row: {
          completed_at: string | null
          connection_id: string
          created_at: string
          date_from: string | null
          date_to: string | null
          error_details: Json | null
          error_message: string | null
          failed_records: number | null
          id: string
          job_type: string
          max_retries: number
          next_retry_at: string | null
          priority: number
          processed_records: number | null
          result_summary: Json | null
          retry_count: number
          started_at: string | null
          status: string
          total_records: number | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          connection_id: string
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          error_details?: Json | null
          error_message?: string | null
          failed_records?: number | null
          id?: string
          job_type: string
          max_retries?: number
          next_retry_at?: string | null
          priority?: number
          processed_records?: number | null
          result_summary?: Json | null
          retry_count?: number
          started_at?: string | null
          status?: string
          total_records?: number | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          connection_id?: string
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          error_details?: Json | null
          error_message?: string | null
          failed_records?: number | null
          id?: string
          job_type?: string
          max_retries?: number
          next_retry_at?: string | null
          priority?: number
          processed_records?: number | null
          result_summary?: Json | null
          retry_count?: number
          started_at?: string | null
          status?: string
          total_records?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_sync_jobs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "ads_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_sync_jobs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["ads_connection_id"]
          },
        ]
      }
      ads_sync_logs: {
        Row: {
          connection_id: string
          created_at: string
          details: Json | null
          duration_ms: number | null
          ended_at: string | null
          error_code: string | null
          error_message: string | null
          error_stack: string | null
          id: string
          job_id: string | null
          log_level: string
          log_type: string
          message: string | null
          rate_limit_remaining: number | null
          rate_limit_reset_at: string | null
          records_created: number | null
          records_failed: number | null
          records_fetched: number | null
          records_processed: number | null
          records_updated: number | null
          retry_after_seconds: number | null
          seller_id: string
          started_at: string
          success: boolean | null
        }
        Insert: {
          connection_id: string
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          ended_at?: string | null
          error_code?: string | null
          error_message?: string | null
          error_stack?: string | null
          id?: string
          job_id?: string | null
          log_level?: string
          log_type: string
          message?: string | null
          rate_limit_remaining?: number | null
          rate_limit_reset_at?: string | null
          records_created?: number | null
          records_failed?: number | null
          records_fetched?: number | null
          records_processed?: number | null
          records_updated?: number | null
          retry_after_seconds?: number | null
          seller_id: string
          started_at?: string
          success?: boolean | null
        }
        Update: {
          connection_id?: string
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          ended_at?: string | null
          error_code?: string | null
          error_message?: string | null
          error_stack?: string | null
          id?: string
          job_id?: string | null
          log_level?: string
          log_type?: string
          message?: string | null
          rate_limit_remaining?: number | null
          rate_limit_reset_at?: string | null
          records_created?: number | null
          records_failed?: number | null
          records_fetched?: number | null
          records_processed?: number | null
          records_updated?: number | null
          retry_after_seconds?: number | null
          seller_id?: string
          started_at?: string
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_sync_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "ads_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_sync_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["ads_connection_id"]
          },
          {
            foreignKeyName: "ads_sync_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ads_sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_sync_state: {
        Row: {
          campaigns_synced: number | null
          created_at: string
          id: string
          items_synced: number | null
          last_error: string | null
          last_sync_at: string | null
          next_sync_at: string | null
          seller_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaigns_synced?: number | null
          created_at?: string
          id?: string
          items_synced?: number | null
          last_error?: string | null
          last_sync_at?: string | null
          next_sync_at?: string | null
          seller_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaigns_synced?: number | null
          created_at?: string
          id?: string
          items_synced?: number | null
          last_error?: string | null
          last_sync_at?: string | null
          next_sync_at?: string | null
          seller_id?: string
          status?: string
          updated_at?: string
          user_id?: string
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
          {
            foreignKeyName: "analyzed_items_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      app_notifications: {
        Row: {
          action_url: string | null
          body: string | null
          category: Database["public"]["Enums"]["notification_category"]
          created_at: string
          expires_at: string | null
          group_key: string | null
          id: string
          is_actioned: boolean | null
          is_dismissed: boolean | null
          is_read: boolean | null
          is_snoozed: boolean | null
          metadata: Json | null
          origin_module: string | null
          priority: Database["public"]["Enums"]["notification_priority"] | null
          read_at: string | null
          reference_id: string | null
          reference_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          seller_id: string | null
          snooze_until: string | null
          snoozed_at: string | null
          title: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          category: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          expires_at?: string | null
          group_key?: string | null
          id?: string
          is_actioned?: boolean | null
          is_dismissed?: boolean | null
          is_read?: boolean | null
          is_snoozed?: boolean | null
          metadata?: Json | null
          origin_module?: string | null
          priority?: Database["public"]["Enums"]["notification_priority"] | null
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          seller_id?: string | null
          snooze_until?: string | null
          snoozed_at?: string | null
          title: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          action_url?: string | null
          body?: string | null
          category?: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          expires_at?: string | null
          group_key?: string | null
          id?: string
          is_actioned?: boolean | null
          is_dismissed?: boolean | null
          is_read?: boolean | null
          is_snoozed?: boolean | null
          metadata?: Json | null
          origin_module?: string | null
          priority?: Database["public"]["Enums"]["notification_priority"] | null
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          seller_id?: string | null
          snooze_until?: string | null
          snoozed_at?: string | null
          title?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string
          entity_type: string
          id: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          account_id: string | null
          actions: Json
          conditions: Json
          created_at: string
          id: string
          is_enabled: boolean
          name: string
          trigger_event_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          actions?: Json
          conditions?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          name: string
          trigger_event_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          actions?: Json
          conditions?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          name?: string
          trigger_event_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "workspace_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_info: {
        Row: {
          cnpj: string | null
          cpf: string | null
          created_at: string
          id: string
          inscricao_estadual: string | null
          is_ie_exempt: boolean | null
          is_preferred: boolean
          nome_fantasia: string | null
          person_type: string
          pf_cep: string | null
          pf_city: string | null
          pf_state: string | null
          pj_cep: string | null
          pj_city: string | null
          pj_state: string | null
          razao_social: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          id?: string
          inscricao_estadual?: string | null
          is_ie_exempt?: boolean | null
          is_preferred?: boolean
          nome_fantasia?: string | null
          person_type?: string
          pf_cep?: string | null
          pf_city?: string | null
          pf_state?: string | null
          pj_cep?: string | null
          pj_city?: string | null
          pj_state?: string | null
          razao_social?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          id?: string
          inscricao_estadual?: string | null
          is_ie_exempt?: boolean | null
          is_preferred?: boolean
          nome_fantasia?: string | null
          person_type?: string
          pf_cep?: string | null
          pf_city?: string | null
          pf_state?: string | null
          pj_cep?: string | null
          pj_city?: string | null
          pj_state?: string | null
          razao_social?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blog_categories: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          nome: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          autor: string | null
          canonical_url: string | null
          categoria_id: string | null
          conteudo_principal: string | null
          created_at: string
          data_agendada: string | null
          data_publicacao: string | null
          id: string
          imagem_capa: string | null
          meta_description: string | null
          meta_keywords: string | null
          meta_title: string | null
          modulo_referencia_id: string | null
          modulo_vinculado: string | null
          origem: string | null
          resumo: string | null
          slug: string
          status: string
          tags: string[] | null
          titulo: string
          updated_at: string
        }
        Insert: {
          autor?: string | null
          canonical_url?: string | null
          categoria_id?: string | null
          conteudo_principal?: string | null
          created_at?: string
          data_agendada?: string | null
          data_publicacao?: string | null
          id?: string
          imagem_capa?: string | null
          meta_description?: string | null
          meta_keywords?: string | null
          meta_title?: string | null
          modulo_referencia_id?: string | null
          modulo_vinculado?: string | null
          origem?: string | null
          resumo?: string | null
          slug: string
          status?: string
          tags?: string[] | null
          titulo: string
          updated_at?: string
        }
        Update: {
          autor?: string | null
          canonical_url?: string | null
          categoria_id?: string | null
          conteudo_principal?: string | null
          created_at?: string
          data_agendada?: string | null
          data_publicacao?: string | null
          id?: string
          imagem_capa?: string | null
          meta_description?: string | null
          meta_keywords?: string | null
          meta_title?: string | null
          modulo_referencia_id?: string | null
          modulo_vinculado?: string | null
          origem?: string | null
          resumo?: string | null
          slug?: string
          status?: string
          tags?: string[] | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      br_estados: {
        Row: {
          codigo_uf: number
          created_at: string
          nome: string
          regiao: string | null
          uf: string
        }
        Insert: {
          codigo_uf: number
          created_at?: string
          nome: string
          regiao?: string | null
          uf: string
        }
        Update: {
          codigo_uf?: number
          created_at?: string
          nome?: string
          regiao?: string | null
          uf?: string
        }
        Relationships: []
      }
      br_feriados: {
        Row: {
          ano: number
          codigo_ibge: number | null
          created_at: string
          data: string
          descricao: string | null
          id: string
          nome: string
          tipo: string
          uf: string | null
        }
        Insert: {
          ano: number
          codigo_ibge?: number | null
          created_at?: string
          data: string
          descricao?: string | null
          id?: string
          nome: string
          tipo: string
          uf?: string | null
        }
        Update: {
          ano?: number
          codigo_ibge?: number | null
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          nome?: string
          tipo?: string
          uf?: string | null
        }
        Relationships: []
      }
      br_municipios: {
        Row: {
          capital: boolean
          codigo_ibge: number
          created_at: string
          ddd: number | null
          fuso_horario: string | null
          nome: string
          uf: string
        }
        Insert: {
          capital?: boolean
          codigo_ibge: number
          created_at?: string
          ddd?: number | null
          fuso_horario?: string | null
          nome: string
          uf: string
        }
        Update: {
          capital?: boolean
          codigo_ibge?: number
          created_at?: string
          ddd?: number | null
          fuso_horario?: string | null
          nome?: string
          uf?: string
        }
        Relationships: [
          {
            foreignKeyName: "br_municipios_uf_fkey"
            columns: ["uf"]
            isOneToOne: false
            referencedRelation: "br_estados"
            referencedColumns: ["uf"]
          },
        ]
      }
      category_attribute_requirements: {
        Row: {
          allowed_units: Json | null
          attribute_id: string
          category_id: string
          default_unit: string | null
          fetched_at: string | null
          hierarchy: string | null
          id: string
          name: string | null
          relevance: number | null
          required_level: string | null
          site_id: string | null
          tags: Json | null
          tooltip: string | null
          value_type: string | null
          values: Json | null
        }
        Insert: {
          allowed_units?: Json | null
          attribute_id: string
          category_id: string
          default_unit?: string | null
          fetched_at?: string | null
          hierarchy?: string | null
          id?: string
          name?: string | null
          relevance?: number | null
          required_level?: string | null
          site_id?: string | null
          tags?: Json | null
          tooltip?: string | null
          value_type?: string | null
          values?: Json | null
        }
        Update: {
          allowed_units?: Json | null
          attribute_id?: string
          category_id?: string
          default_unit?: string | null
          fetched_at?: string | null
          hierarchy?: string | null
          id?: string
          name?: string | null
          relevance?: number | null
          required_level?: string | null
          site_id?: string | null
          tags?: Json | null
          tooltip?: string | null
          value_type?: string | null
          values?: Json | null
        }
        Relationships: []
      }
      category_tree_cache: {
        Row: {
          children_count: number | null
          created_at: string | null
          depth: number | null
          fetched_at: string | null
          id: string
          name: string
          parent_id: string | null
          path: string[] | null
          total_items_qty: number | null
        }
        Insert: {
          children_count?: number | null
          created_at?: string | null
          depth?: number | null
          fetched_at?: string | null
          id: string
          name: string
          parent_id?: string | null
          path?: string[] | null
          total_items_qty?: number | null
        }
        Update: {
          children_count?: number | null
          created_at?: string | null
          depth?: number | null
          fetched_at?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          path?: string[] | null
          total_items_qty?: number | null
        }
        Relationships: []
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
      checkout_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          plan_price_id: string | null
          provider: string
          provider_id: string | null
          provider_mode: string | null
          request_payload: Json | null
          response_payload: Json | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          plan_price_id?: string | null
          provider?: string
          provider_id?: string | null
          provider_mode?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          plan_price_id?: string | null
          provider?: string
          provider_id?: string | null
          provider_mode?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_logs_plan_price_id_fkey"
            columns: ["plan_price_id"]
            isOneToOne: false
            referencedRelation: "plan_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_logs_plan_price_id_fkey"
            columns: ["plan_price_id"]
            isOneToOne: false
            referencedRelation: "public_plans_v1"
            referencedColumns: ["price_id"]
          },
        ]
      }
      clone_drafts: {
        Row: {
          captured_at: string
          correlation_id: string | null
          created_at: string
          created_item_id: string | null
          draft_payload: Json
          error_details: Json | null
          error_message: string | null
          id: string
          ml_account_id: string | null
          raw_snapshot: Json
          source_item_id: string
          source_url: string | null
          status: string
          updated_at: string
          user_id: string
          validation_logs: Json | null
          workspace_id: string
        }
        Insert: {
          captured_at?: string
          correlation_id?: string | null
          created_at?: string
          created_item_id?: string | null
          draft_payload?: Json
          error_details?: Json | null
          error_message?: string | null
          id?: string
          ml_account_id?: string | null
          raw_snapshot?: Json
          source_item_id: string
          source_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
          validation_logs?: Json | null
          workspace_id: string
        }
        Update: {
          captured_at?: string
          correlation_id?: string | null
          created_at?: string
          created_item_id?: string | null
          draft_payload?: Json
          error_details?: Json | null
          error_message?: string | null
          id?: string
          ml_account_id?: string | null
          raw_snapshot?: Json
          source_item_id?: string
          source_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          validation_logs?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clone_drafts_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clone_drafts_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clone_drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborator_menu_permissions: {
        Row: {
          created_at: string
          id: string
          is_allowed: boolean
          permission_key: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_allowed?: boolean
          permission_key: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_allowed?: boolean
          permission_key?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_menu_permissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborator_module_access_legacy: {
        Row: {
          collaborator_id: string
          created_at: string
          enabled: boolean
          id: string
          module_key: string
          updated_at: string
        }
        Insert: {
          collaborator_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          module_key: string
          updated_at?: string
        }
        Update: {
          collaborator_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          module_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_module_access_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborators: {
        Row: {
          accepted_at: string | null
          auth_user_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          disabled_at: string | null
          email: string
          id: string
          invited_at: string | null
          name: string
          profile_id: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          disabled_at?: string | null
          email: string
          id?: string
          invited_at?: string | null
          name: string
          profile_id?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          disabled_at?: string | null
          email?: string
          id?: string
          invited_at?: string | null
          name?: string
          profile_id?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_blocked_patterns: {
        Row: {
          category: string
          channels: string[] | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          pattern: string
          pattern_type: string
        }
        Insert: {
          category: string
          channels?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          pattern: string
          pattern_type: string
        }
        Update: {
          category?: string
          channels?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          pattern?: string
          pattern_type?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          billing_type: string
          created_at: string | null
          display_name: string
          id: string
          is_active: boolean | null
          trial_ends_at: string | null
          trial_started_at: string | null
          trial_status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          billing_type?: string
          created_at?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          billing_type?: string
          created_at?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      company_billing: {
        Row: {
          billing_type: string
          cep: string | null
          city: string | null
          cnpj: string | null
          company_id: string
          complement: string | null
          cpf: string | null
          created_at: string | null
          district: string | null
          id: string
          is_complete: boolean | null
          legal_name: string | null
          number: string | null
          state: string | null
          state_registration: string | null
          state_registration_isento: boolean | null
          street: string | null
          trade_name: string | null
          updated_at: string | null
        }
        Insert: {
          billing_type?: string
          cep?: string | null
          city?: string | null
          cnpj?: string | null
          company_id: string
          complement?: string | null
          cpf?: string | null
          created_at?: string | null
          district?: string | null
          id?: string
          is_complete?: boolean | null
          legal_name?: string | null
          number?: string | null
          state?: string | null
          state_registration?: string | null
          state_registration_isento?: boolean | null
          street?: string | null
          trade_name?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_type?: string
          cep?: string | null
          city?: string | null
          cnpj?: string | null
          company_id?: string
          complement?: string | null
          cpf?: string | null
          created_at?: string | null
          district?: string | null
          id?: string
          is_complete?: boolean | null
          legal_name?: string | null
          number?: string | null
          state?: string | null
          state_registration?: string | null
          state_registration_isento?: boolean | null
          street?: string | null
          trade_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_billing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_customization: {
        Row: {
          color_key: string
          company_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color_key?: string
          company_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color_key?: string
          company_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      company_users: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_owner: boolean
          profile_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_owner?: boolean
          profile_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_owner?: boolean
          profile_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_users_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_alerts: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean | null
          seller_id: string
          severity: string
          title: string
          tracker_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          seller_id: string
          severity?: string
          title: string
          tracker_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          seller_id?: string
          severity?: string
          title?: string
          tracker_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_alerts_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "competitor_trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          message: string | null
          new_price: number | null
          prev_price: number | null
          tracker_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          new_price?: number | null
          prev_price?: number | null
          tracker_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          new_price?: number | null
          prev_price?: number | null
          tracker_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_events_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "competitor_trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_price_actions: {
        Row: {
          action_type: string
          applied_price: number | null
          competitor_price: number | null
          created_at: string
          id: string
          proposed_price: number | null
          reason: string | null
          seller_listing_id: string | null
          status: string | null
          tracker_id: string
          user_id: string
        }
        Insert: {
          action_type: string
          applied_price?: number | null
          competitor_price?: number | null
          created_at?: string
          id?: string
          proposed_price?: number | null
          reason?: string | null
          seller_listing_id?: string | null
          status?: string | null
          tracker_id: string
          user_id: string
        }
        Update: {
          action_type?: string
          applied_price?: number | null
          competitor_price?: number | null
          created_at?: string
          id?: string
          proposed_price?: number | null
          reason?: string | null
          seller_listing_id?: string | null
          status?: string | null
          tracker_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_price_actions_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "competitor_trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_rate_limits: {
        Row: {
          created_at: string
          daily_limit: number | null
          id: string
          last_request_at: string | null
          requests_today: number | null
          updated_at: string
          user_id: string
          window_start: string | null
        }
        Insert: {
          created_at?: string
          daily_limit?: number | null
          id?: string
          last_request_at?: string | null
          requests_today?: number | null
          updated_at?: string
          user_id: string
          window_start?: string | null
        }
        Update: {
          created_at?: string
          daily_limit?: number | null
          id?: string
          last_request_at?: string | null
          requests_today?: number | null
          updated_at?: string
          user_id?: string
          window_start?: string | null
        }
        Relationships: []
      }
      competitor_seller_item_snapshots: {
        Row: {
          available_qty_ref: number | null
          captured_at: string
          competitor_seller_id: string
          id: string
          item_id: string
          price: number | null
          sold_quantity_ref: number | null
          status: string | null
          user_id: string
        }
        Insert: {
          available_qty_ref?: number | null
          captured_at?: string
          competitor_seller_id: string
          id?: string
          item_id: string
          price?: number | null
          sold_quantity_ref?: number | null
          status?: string | null
          user_id: string
        }
        Update: {
          available_qty_ref?: number | null
          captured_at?: string
          competitor_seller_id?: string
          id?: string
          item_id?: string
          price?: number | null
          sold_quantity_ref?: number | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_seller_item_snapshots_competitor_seller_id_fkey"
            columns: ["competitor_seller_id"]
            isOneToOne: false
            referencedRelation: "competitor_sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_seller_items: {
        Row: {
          available_qty_ref: number | null
          catalog_listing: boolean | null
          category_id: string | null
          competitor_seller_id: string
          condition: string | null
          created_at: string
          currency_id: string | null
          free_shipping: boolean | null
          id: string
          item_id: string
          last_synced_at: string | null
          listing_type: string | null
          original_price: number | null
          permalink: string | null
          price: number | null
          sold_quantity_ref: number | null
          status: string | null
          thumbnail: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          available_qty_ref?: number | null
          catalog_listing?: boolean | null
          category_id?: string | null
          competitor_seller_id: string
          condition?: string | null
          created_at?: string
          currency_id?: string | null
          free_shipping?: boolean | null
          id?: string
          item_id: string
          last_synced_at?: string | null
          listing_type?: string | null
          original_price?: number | null
          permalink?: string | null
          price?: number | null
          sold_quantity_ref?: number | null
          status?: string | null
          thumbnail?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          available_qty_ref?: number | null
          catalog_listing?: boolean | null
          category_id?: string | null
          competitor_seller_id?: string
          condition?: string | null
          created_at?: string
          currency_id?: string | null
          free_shipping?: boolean | null
          id?: string
          item_id?: string
          last_synced_at?: string | null
          listing_type?: string | null
          original_price?: number | null
          permalink?: string | null
          price?: number | null
          sold_quantity_ref?: number | null
          status?: string | null
          thumbnail?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_seller_items_competitor_seller_id_fkey"
            columns: ["competitor_seller_id"]
            isOneToOne: false
            referencedRelation: "competitor_sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_sellers: {
        Row: {
          binding_date: string | null
          created_at: string
          id: string
          last_synced_at: string | null
          ml_nickname: string | null
          ml_seller_id: string
          next_sync_at: string | null
          seller_id: string
          seller_reputation: Json | null
          status: string | null
          sync_interval_hours: number | null
          total_items_tracked: number | null
          updated_at: string
          user_alias: string | null
          user_id: string
        }
        Insert: {
          binding_date?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          ml_nickname?: string | null
          ml_seller_id: string
          next_sync_at?: string | null
          seller_id: string
          seller_reputation?: Json | null
          status?: string | null
          sync_interval_hours?: number | null
          total_items_tracked?: number | null
          updated_at?: string
          user_alias?: string | null
          user_id: string
        }
        Update: {
          binding_date?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          ml_nickname?: string | null
          ml_seller_id?: string
          next_sync_at?: string | null
          seller_id?: string
          seller_reputation?: Json | null
          status?: string | null
          sync_interval_hours?: number | null
          total_items_tracked?: number | null
          updated_at?: string
          user_alias?: string | null
          user_id?: string
        }
        Relationships: []
      }
      competitor_snapshots: {
        Row: {
          captured_at: string
          id: string
          price: number | null
          raw_meta: Json | null
          source: string | null
          state: string | null
          tracker_id: string
        }
        Insert: {
          captured_at?: string
          id?: string
          price?: number | null
          raw_meta?: Json | null
          source?: string | null
          state?: string | null
          tracker_id: string
        }
        Update: {
          captured_at?: string
          id?: string
          price?: number | null
          raw_meta?: Json | null
          source?: string | null
          state?: string | null
          tracker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_snapshots_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "competitor_trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_trackers: {
        Row: {
          check_interval_minutes: number
          competitor_external_id: string | null
          competitor_label: string
          competitor_thumbnail: string | null
          competitor_title: string | null
          competitor_url: string
          consecutive_failures: number | null
          created_at: string
          follow_price_up: boolean | null
          id: string
          last_checked_at: string | null
          last_known_price: number | null
          last_known_state: string | null
          marketplace: string
          max_price: number | null
          min_price: number | null
          next_check_at: string | null
          reaction_mode: string
          seller_id: string
          seller_listing_id: string | null
          seller_listing_price: number | null
          seller_listing_ref_id: string | null
          seller_listing_ref_type: string | null
          seller_listing_sku: string | null
          seller_listing_title: string | null
          status: string
          undercut_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          check_interval_minutes?: number
          competitor_external_id?: string | null
          competitor_label: string
          competitor_thumbnail?: string | null
          competitor_title?: string | null
          competitor_url: string
          consecutive_failures?: number | null
          created_at?: string
          follow_price_up?: boolean | null
          id?: string
          last_checked_at?: string | null
          last_known_price?: number | null
          last_known_state?: string | null
          marketplace?: string
          max_price?: number | null
          min_price?: number | null
          next_check_at?: string | null
          reaction_mode?: string
          seller_id: string
          seller_listing_id?: string | null
          seller_listing_price?: number | null
          seller_listing_ref_id?: string | null
          seller_listing_ref_type?: string | null
          seller_listing_sku?: string | null
          seller_listing_title?: string | null
          status?: string
          undercut_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          check_interval_minutes?: number
          competitor_external_id?: string | null
          competitor_label?: string
          competitor_thumbnail?: string | null
          competitor_title?: string | null
          competitor_url?: string
          consecutive_failures?: number | null
          created_at?: string
          follow_price_up?: boolean | null
          id?: string
          last_checked_at?: string | null
          last_known_price?: number | null
          last_known_state?: string | null
          marketplace?: string
          max_price?: number | null
          min_price?: number | null
          next_check_at?: string | null
          reaction_mode?: string
          seller_id?: string
          seller_listing_id?: string | null
          seller_listing_price?: number | null
          seller_listing_ref_id?: string | null
          seller_listing_ref_type?: string | null
          seller_listing_sku?: string | null
          seller_listing_title?: string | null
          status?: string
          undercut_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      config_menu_groups: {
        Row: {
          active: boolean
          created_at: string
          display_order: number
          icon: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_order?: number
          icon?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_order?: number
          icon?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      config_menu_items: {
        Row: {
          active: boolean
          created_at: string
          display_order: number
          group_id: string
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          route: string | null
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_order?: number
          group_id: string
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          route?: string | null
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_order?: number
          group_id?: string
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          route?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "config_menu_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "config_menu_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "config_menu_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "config_menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_templates: {
        Row: {
          body: string
          id: string
          is_active: boolean | null
          key: string
          published_at: string | null
          title: string
          version: number
        }
        Insert: {
          body: string
          id?: string
          is_active?: boolean | null
          key: string
          published_at?: string | null
          title: string
          version?: number
        }
        Update: {
          body?: string
          id?: string
          is_active?: boolean | null
          key?: string
          published_at?: string | null
          title?: string
          version?: number
        }
        Relationships: []
      }
      consultant_tip_interactions: {
        Row: {
          created_at: string | null
          id: string
          tip_id: string
          tipo_interacao: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          tip_id: string
          tipo_interacao: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          tip_id?: string
          tipo_interacao?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultant_tip_interactions_tip_id_fkey"
            columns: ["tip_id"]
            isOneToOne: false
            referencedRelation: "consultant_tips"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_tip_views: {
        Row: {
          id: string
          tip_id: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          id?: string
          tip_id: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          id?: string
          tip_id?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_tip_views_tip_id_fkey"
            columns: ["tip_id"]
            isOneToOne: false
            referencedRelation: "consultant_tips"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_tips: {
        Row: {
          ativa: boolean | null
          categoria: string | null
          conteudo_json: Json
          created_at: string | null
          created_by: string | null
          fixada_dashboard: boolean | null
          id: string
          modulo_relacionado: string | null
          nivel: string | null
          slug: string
          tags: string[] | null
          tipo: string
          titulo: string
          updated_at: string | null
          versao: number | null
        }
        Insert: {
          ativa?: boolean | null
          categoria?: string | null
          conteudo_json?: Json
          created_at?: string | null
          created_by?: string | null
          fixada_dashboard?: boolean | null
          id?: string
          modulo_relacionado?: string | null
          nivel?: string | null
          slug: string
          tags?: string[] | null
          tipo: string
          titulo: string
          updated_at?: string | null
          versao?: number | null
        }
        Update: {
          ativa?: boolean | null
          categoria?: string | null
          conteudo_json?: Json
          created_at?: string | null
          created_by?: string | null
          fixada_dashboard?: boolean | null
          id?: string
          modulo_relacionado?: string | null
          nivel?: string | null
          slug?: string
          tags?: string[] | null
          tipo?: string
          titulo?: string
          updated_at?: string | null
          versao?: number | null
        }
        Relationships: []
      }
      contact_logs: {
        Row: {
          action: string
          contact_id: string
          created_at: string
          id: string
          performed_by: string | null
        }
        Insert: {
          action: string
          contact_id: string
          created_at?: string
          id?: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          contact_id?: string
          created_at?: string
          id?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          priority: string
          source: string
          status: string
          subject: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          priority?: string
          source?: string
          status?: string
          subject: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          priority?: string
          source?: string
          status?: string
          subject?: string
        }
        Relationships: []
      }
      cookie_consents: {
        Row: {
          accepted_at: string
          analytics: boolean
          consent_type: string
          created_at: string
          essential: boolean
          fingerprint: string | null
          id: string
          ip_address: string | null
          performance: boolean
          policy_version: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          accepted_at?: string
          analytics?: boolean
          consent_type: string
          created_at?: string
          essential?: boolean
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          performance?: boolean
          policy_version?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          accepted_at?: string
          analytics?: boolean
          consent_type?: string
          created_at?: string
          essential?: boolean
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          performance?: boolean
          policy_version?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cost_bulk_jobs: {
        Row: {
          chunk_size: number
          created_at: string
          current_offset: number
          error_count: number
          id: string
          job_type: string
          last_error: string | null
          order_ids: string[]
          processed_count: number
          seller_id: string
          status: string
          success_count: number
          total_orders: number
          updated_at: string
          user_id: string
        }
        Insert: {
          chunk_size?: number
          created_at?: string
          current_offset?: number
          error_count?: number
          id?: string
          job_type?: string
          last_error?: string | null
          order_ids?: string[]
          processed_count?: number
          seller_id: string
          status?: string
          success_count?: number
          total_orders?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          chunk_size?: number
          created_at?: string
          current_offset?: number
          error_count?: number
          id?: string
          job_type?: string
          last_error?: string | null
          order_ids?: string[]
          processed_count?: number
          seller_id?: string
          status?: string
          success_count?: number
          total_orders?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cost_calculation_logs: {
        Row: {
          company_id: string | null
          created_at: string | null
          custo_produto: number | null
          destination_state: string | null
          difal_applied: boolean | null
          difal_enabled: boolean | null
          embalagem: number | null
          id: string
          imposto_percent_total: number | null
          imposto_valor: number | null
          lucro_final: number | null
          margem_final: number | null
          order_id: string | null
          origin_state: string | null
          receita: number | null
          seller_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          custo_produto?: number | null
          destination_state?: string | null
          difal_applied?: boolean | null
          difal_enabled?: boolean | null
          embalagem?: number | null
          id?: string
          imposto_percent_total?: number | null
          imposto_valor?: number | null
          lucro_final?: number | null
          margem_final?: number | null
          order_id?: string | null
          origin_state?: string | null
          receita?: number | null
          seller_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          custo_produto?: number | null
          destination_state?: string | null
          difal_applied?: boolean | null
          difal_enabled?: boolean | null
          embalagem?: number | null
          id?: string
          imposto_percent_total?: number | null
          imposto_valor?: number | null
          lucro_final?: number | null
          margem_final?: number | null
          order_id?: string | null
          origin_state?: string | null
          receita?: number | null
          seller_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_calculation_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_messages: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          ordem_rotacao: number | null
          referencia: string | null
          tema: string
          texto: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          ordem_rotacao?: number | null
          referencia?: string | null
          tema: string
          texto: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          ordem_rotacao?: number | null
          referencia?: string | null
          tema?: string
          texto?: string
          updated_at?: string
        }
        Relationships: []
      }
      dynamic_feature_flags: {
        Row: {
          feature_key: string
          id: string
          is_enabled: boolean
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          feature_key: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          feature_key?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dynamic_feature_flags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_integrations: {
        Row: {
          api_key: string | null
          api_user: string | null
          capture_from_date: string | null
          channel_filter: string[] | null
          company_id: string
          created_at: string | null
          display_name: string | null
          environment: string | null
          id: string
          last_sync_at: string | null
          last_test_at: string | null
          last_test_message: string | null
          last_test_status: string | null
          order_status_filter: string[] | null
          provider: string
          status: string
          sync_costs: boolean | null
          sync_frequency_minutes: number | null
          sync_invoicing: boolean | null
          sync_orders: boolean | null
          updated_at: string | null
        }
        Insert: {
          api_key?: string | null
          api_user?: string | null
          capture_from_date?: string | null
          channel_filter?: string[] | null
          company_id: string
          created_at?: string | null
          display_name?: string | null
          environment?: string | null
          id?: string
          last_sync_at?: string | null
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_status?: string | null
          order_status_filter?: string[] | null
          provider: string
          status?: string
          sync_costs?: boolean | null
          sync_frequency_minutes?: number | null
          sync_invoicing?: boolean | null
          sync_orders?: boolean | null
          updated_at?: string | null
        }
        Update: {
          api_key?: string | null
          api_user?: string | null
          capture_from_date?: string | null
          channel_filter?: string[] | null
          company_id?: string
          created_at?: string | null
          display_name?: string | null
          environment?: string | null
          id?: string
          last_sync_at?: string | null
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_status?: string | null
          order_status_filter?: string[] | null
          provider?: string
          status?: string
          sync_costs?: boolean | null
          sync_frequency_minutes?: number | null
          sync_invoicing?: boolean | null
          sync_orders?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_display_rules: {
        Row: {
          cooldown_days: number
          created_at: string
          enabled: boolean
          id: string
          kind: string
          min_days_since_first_use: number
          min_events: number
          module_slug: string | null
          only_after_first_renewal: boolean
          only_after_paid: boolean
          updated_at: string
        }
        Insert: {
          cooldown_days?: number
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          min_days_since_first_use?: number
          min_events?: number
          module_slug?: string | null
          only_after_first_renewal?: boolean
          only_after_paid?: boolean
          updated_at?: string
        }
        Update: {
          cooldown_days?: number
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          min_days_since_first_use?: number
          min_events?: number
          module_slug?: string | null
          only_after_first_renewal?: boolean
          only_after_paid?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      finance_accounts: {
        Row: {
          access_token: string
          company_id: string | null
          connection_status: string
          consecutive_failures: number
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          last_api_error_at: string | null
          last_api_error_code: string | null
          last_api_ok_at: string | null
          last_token_refresh_at: string | null
          ml_account_id: string | null
          mp_user_id: string
          nickname: string | null
          refresh_token: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string
          company_id?: string | null
          connection_status?: string
          consecutive_failures?: number
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          last_api_error_at?: string | null
          last_api_error_code?: string | null
          last_api_ok_at?: string | null
          last_token_refresh_at?: string | null
          ml_account_id?: string | null
          mp_user_id: string
          nickname?: string | null
          refresh_token?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          company_id?: string | null
          connection_status?: string
          consecutive_failures?: number
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          last_api_error_at?: string | null
          last_api_error_code?: string | null
          last_api_ok_at?: string | null
          last_token_refresh_at?: string | null
          ml_account_id?: string | null
          mp_user_id?: string
          nickname?: string | null
          refresh_token?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_accounts_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_accounts_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_job_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          failed_records: number | null
          finance_account_id: string
          id: string
          job_type: string
          metrics: Json | null
          processed_records: number | null
          started_at: string
          status: string
          total_records: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_records?: number | null
          finance_account_id: string
          id?: string
          job_type: string
          metrics?: Json | null
          processed_records?: number | null
          started_at?: string
          status?: string
          total_records?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_records?: number | null
          finance_account_id?: string
          id?: string
          job_type?: string
          metrics?: Json | null
          processed_records?: number | null
          started_at?: string
          status?: string
          total_records?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_job_runs_finance_account_id_fkey"
            columns: ["finance_account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_reconciliation_items: {
        Row: {
          created_at: string
          difference: number | null
          id: string
          movement_amount: number | null
          movement_id: string | null
          notes: string | null
          order_amount: number | null
          order_id: string | null
          payment_amount: number | null
          payment_id: string | null
          reconciliation_status: string
          run_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          difference?: number | null
          id?: string
          movement_amount?: number | null
          movement_id?: string | null
          notes?: string | null
          order_amount?: number | null
          order_id?: string | null
          payment_amount?: number | null
          payment_id?: string | null
          reconciliation_status?: string
          run_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          difference?: number | null
          id?: string
          movement_amount?: number | null
          movement_id?: string | null
          notes?: string | null
          order_amount?: number | null
          order_id?: string | null
          payment_amount?: number | null
          payment_id?: string | null
          reconciliation_status?: string
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_reconciliation_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "finance_reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_reconciliation_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          divergent_count: number | null
          finance_account_id: string
          id: string
          missing_order_count: number | null
          missing_payment_count: number | null
          ok_count: number | null
          period_from: string | null
          period_to: string | null
          started_at: string
          status: string
          total_items: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          divergent_count?: number | null
          finance_account_id: string
          id?: string
          missing_order_count?: number | null
          missing_payment_count?: number | null
          ok_count?: number | null
          period_from?: string | null
          period_to?: string | null
          started_at?: string
          status?: string
          total_items?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          divergent_count?: number | null
          finance_account_id?: string
          id?: string
          missing_order_count?: number | null
          missing_payment_count?: number | null
          ok_count?: number | null
          period_from?: string | null
          period_to?: string | null
          started_at?: string
          status?: string
          total_items?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_reconciliation_runs_finance_account_id_fkey"
            columns: ["finance_account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_concept_map: {
        Row: {
          bucket: string
          concept: string
          created_at: string
          id: string
          notes_pt: string | null
          seller_id: string
          signal: string
          user_id: string
        }
        Insert: {
          bucket?: string
          concept: string
          created_at?: string
          id?: string
          notes_pt?: string | null
          seller_id: string
          signal?: string
          user_id: string
        }
        Update: {
          bucket?: string
          concept?: string
          created_at?: string
          id?: string
          notes_pt?: string | null
          seller_id?: string
          signal?: string
          user_id?: string
        }
        Relationships: []
      }
      freight_bulk_jobs: {
        Row: {
          completed_at: string | null
          context_config: Json | null
          created_at: string
          error_details: Json | null
          error_items: number | null
          filters: Json | null
          id: string
          job_type: string
          processed_items: number | null
          ruleset_id: string | null
          seller_id: string
          skipped_items: number | null
          started_at: string | null
          status: string
          total_items: number | null
          updated_items: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          context_config?: Json | null
          created_at?: string
          error_details?: Json | null
          error_items?: number | null
          filters?: Json | null
          id?: string
          job_type?: string
          processed_items?: number | null
          ruleset_id?: string | null
          seller_id: string
          skipped_items?: number | null
          started_at?: string | null
          status?: string
          total_items?: number | null
          updated_items?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          context_config?: Json | null
          created_at?: string
          error_details?: Json | null
          error_items?: number | null
          filters?: Json | null
          id?: string
          job_type?: string
          processed_items?: number | null
          ruleset_id?: string | null
          seller_id?: string
          skipped_items?: number | null
          started_at?: string | null
          status?: string
          total_items?: number | null
          updated_items?: number | null
          user_id?: string
        }
        Relationships: []
      }
      freight_divergence_log: {
        Row: {
          ad_type: string | null
          charged_shipping_value: number | null
          created_at: string
          divergence_reason: string | null
          expected_shipping_value: number | null
          id: string
          item_id: string
          logistic_mode: string | null
          order_date: string
          order_id: string
          paid_shipping_value: number | null
          product_price: number | null
          product_weight: number | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          ruleset_id: string | null
          seller_id: string
          shipping_diff_percent: number | null
          shipping_diff_value: number | null
          shipping_flag: string
          updated_at: string
          user_id: string
          variation_id: string | null
        }
        Insert: {
          ad_type?: string | null
          charged_shipping_value?: number | null
          created_at?: string
          divergence_reason?: string | null
          expected_shipping_value?: number | null
          id?: string
          item_id: string
          logistic_mode?: string | null
          order_date: string
          order_id: string
          paid_shipping_value?: number | null
          product_price?: number | null
          product_weight?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          ruleset_id?: string | null
          seller_id: string
          shipping_diff_percent?: number | null
          shipping_diff_value?: number | null
          shipping_flag?: string
          updated_at?: string
          user_id: string
          variation_id?: string | null
        }
        Update: {
          ad_type?: string | null
          charged_shipping_value?: number | null
          created_at?: string
          divergence_reason?: string | null
          expected_shipping_value?: number | null
          id?: string
          item_id?: string
          logistic_mode?: string | null
          order_date?: string
          order_id?: string
          paid_shipping_value?: number | null
          product_price?: number | null
          product_weight?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          ruleset_id?: string | null
          seller_id?: string
          shipping_diff_percent?: number | null
          shipping_diff_value?: number | null
          shipping_flag?: string
          updated_at?: string
          user_id?: string
          variation_id?: string | null
        }
        Relationships: []
      }
      freight_rule_lines: {
        Row: {
          ad_type: string
          created_at: string
          dimensions_limit_policy: string | null
          dimensions_limit_value: number | null
          id: string
          is_free_shipping: boolean | null
          logistic_mode: string
          notes: string | null
          price_band_max: number | null
          price_band_min: number
          ruleset_id: string
          seller_pays_formula: string | null
          seller_pays_value: number
          sort_order: number | null
          subsidy_type: string
          subsidy_value: number | null
          weight_max: number | null
          weight_min: number
        }
        Insert: {
          ad_type?: string
          created_at?: string
          dimensions_limit_policy?: string | null
          dimensions_limit_value?: number | null
          id?: string
          is_free_shipping?: boolean | null
          logistic_mode: string
          notes?: string | null
          price_band_max?: number | null
          price_band_min?: number
          ruleset_id: string
          seller_pays_formula?: string | null
          seller_pays_value?: number
          sort_order?: number | null
          subsidy_type?: string
          subsidy_value?: number | null
          weight_max?: number | null
          weight_min?: number
        }
        Update: {
          ad_type?: string
          created_at?: string
          dimensions_limit_policy?: string | null
          dimensions_limit_value?: number | null
          id?: string
          is_free_shipping?: boolean | null
          logistic_mode?: string
          notes?: string | null
          price_band_max?: number | null
          price_band_min?: number
          ruleset_id?: string
          seller_pays_formula?: string | null
          seller_pays_value?: number
          sort_order?: number | null
          subsidy_type?: string
          subsidy_value?: number | null
          weight_max?: number | null
          weight_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "freight_rule_lines_ruleset_id_fkey"
            columns: ["ruleset_id"]
            isOneToOne: false
            referencedRelation: "freight_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      freight_rulesets: {
        Row: {
          country: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          marketplace: string
          name: string
          status: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          country?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          marketplace?: string
          name: string
          status?: string
          updated_at?: string
          valid_from: string
          valid_until?: string | null
        }
        Update: {
          country?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          marketplace?: string
          name?: string
          status?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      freight_settings: {
        Row: {
          active_ruleset_id: string | null
          comparison_mode: string | null
          created_at: string
          id: string
          profile_a_dimensions_sum: number | null
          profile_a_weight_max: number | null
          profile_b_dimensions_sum: number | null
          profile_b_weight_max: number | null
          seller_id: string
          tolerance_percent: number | null
          tolerance_value: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_ruleset_id?: string | null
          comparison_mode?: string | null
          created_at?: string
          id?: string
          profile_a_dimensions_sum?: number | null
          profile_a_weight_max?: number | null
          profile_b_dimensions_sum?: number | null
          profile_b_weight_max?: number | null
          seller_id: string
          tolerance_percent?: number | null
          tolerance_value?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_ruleset_id?: string | null
          comparison_mode?: string | null
          created_at?: string
          id?: string
          profile_a_dimensions_sum?: number | null
          profile_a_weight_max?: number | null
          profile_b_dimensions_sum?: number | null
          profile_b_weight_max?: number | null
          seller_id?: string
          tolerance_percent?: number | null
          tolerance_value?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      global_metrics_aggregated: {
        Row: {
          acos_medio_global: number
          created_at: string
          id: string
          is_public_ready: boolean
          last_full_refresh_at: string | null
          last_incremental_at: string | null
          roas_medio_global: number
          total_ads_faturamento: number
          total_ads_spend: number
          total_anuncios_ativos: number
          total_etiquetas_impressas: number
          total_importacoes_vendas: number
          total_logs_sistema: number
          total_pedidos: number
          total_precificacoes_realizadas: number
          total_produtos_cadastrados: number
          total_sellers: number
          total_sugestoes_compra_geradas: number
          total_valor_vendido: number
          updated_at: string
        }
        Insert: {
          acos_medio_global?: number
          created_at?: string
          id?: string
          is_public_ready?: boolean
          last_full_refresh_at?: string | null
          last_incremental_at?: string | null
          roas_medio_global?: number
          total_ads_faturamento?: number
          total_ads_spend?: number
          total_anuncios_ativos?: number
          total_etiquetas_impressas?: number
          total_importacoes_vendas?: number
          total_logs_sistema?: number
          total_pedidos?: number
          total_precificacoes_realizadas?: number
          total_produtos_cadastrados?: number
          total_sellers?: number
          total_sugestoes_compra_geradas?: number
          total_valor_vendido?: number
          updated_at?: string
        }
        Update: {
          acos_medio_global?: number
          created_at?: string
          id?: string
          is_public_ready?: boolean
          last_full_refresh_at?: string | null
          last_incremental_at?: string | null
          roas_medio_global?: number
          total_ads_faturamento?: number
          total_ads_spend?: number
          total_anuncios_ativos?: number
          total_etiquetas_impressas?: number
          total_importacoes_vendas?: number
          total_logs_sistema?: number
          total_pedidos?: number
          total_precificacoes_realizadas?: number
          total_produtos_cadastrados?: number
          total_sellers?: number
          total_sugestoes_compra_geradas?: number
          total_valor_vendido?: number
          updated_at?: string
        }
        Relationships: []
      }
      global_metrics_monthly_snapshot: {
        Row: {
          ano: number
          created_at: string
          id: string
          mes: number
          total_ads_faturamento: number
          total_ads_spend: number
          total_anuncios: number
          total_etiquetas: number
          total_pedidos: number
          total_sellers: number
          total_valor_vendido: number
        }
        Insert: {
          ano: number
          created_at?: string
          id?: string
          mes: number
          total_ads_faturamento?: number
          total_ads_spend?: number
          total_anuncios?: number
          total_etiquetas?: number
          total_pedidos?: number
          total_sellers?: number
          total_valor_vendido?: number
        }
        Update: {
          ano?: number
          created_at?: string
          id?: string
          mes?: number
          total_ads_faturamento?: number
          total_ads_spend?: number
          total_anuncios?: number
          total_etiquetas?: number
          total_pedidos?: number
          total_sellers?: number
          total_valor_vendido?: number
        }
        Relationships: []
      }
      help_article_feedback: {
        Row: {
          article_id: string
          created_at: string
          id: string
          session_id: string | null
          user_id: string | null
          vote: boolean
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          session_id?: string | null
          user_id?: string | null
          vote: boolean
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          session_id?: string | null
          user_id?: string | null
          vote?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "help_article_feedback_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "help_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      help_article_modules: {
        Row: {
          article_id: string
          created_at: string
          id: string
          module_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          module_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          module_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_article_modules_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "help_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_article_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "system_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      help_articles: {
        Row: {
          auto_generated: boolean
          category_id: string
          content: string
          created_at: string
          helpful_count: number
          id: string
          not_helpful_count: number
          published: boolean
          slug: string
          summary: string | null
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          auto_generated?: boolean
          category_id: string
          content: string
          created_at?: string
          helpful_count?: number
          id?: string
          not_helpful_count?: number
          published?: boolean
          slug: string
          summary?: string | null
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          auto_generated?: boolean
          category_id?: string
          content?: string
          created_at?: string
          helpful_count?: number
          id?: string
          not_helpful_count?: number
          published?: boolean
          slug?: string
          summary?: string | null
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "help_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "help_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      help_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      help_feedback_logs: {
        Row: {
          article_id: string
          created_at: string
          id: string
          vote: boolean
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          vote: boolean
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          vote?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "help_feedback_logs_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "help_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      highlights_items: {
        Row: {
          created_at: string
          entity_type: string | null
          estimated_revenue: number | null
          id: string
          item_id: string
          permalink: string | null
          price: number | null
          product_id: string | null
          rank: number
          snapshot_id: string
          sold_quantity: number | null
          thumbnail: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          entity_type?: string | null
          estimated_revenue?: number | null
          id?: string
          item_id: string
          permalink?: string | null
          price?: number | null
          product_id?: string | null
          rank: number
          snapshot_id: string
          sold_quantity?: number | null
          thumbnail?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          entity_type?: string | null
          estimated_revenue?: number | null
          id?: string
          item_id?: string
          permalink?: string | null
          price?: number | null
          product_id?: string | null
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
      hot_orders_queue: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string
          id: string
          last_checked_at: string | null
          next_check_at: string
          order_id: string
          priority: number
          seller_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expires_at?: string
          id?: string
          last_checked_at?: string | null
          next_check_at?: string
          order_id: string
          priority?: number
          seller_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_checked_at?: string | null
          next_check_at?: string
          order_id?: string
          priority?: number
          seller_id?: string
          user_id?: string
        }
        Relationships: []
      }
      incidents_log: {
        Row: {
          created_at: string
          description: string
          id: string
          resolved_at: string | null
          service_id: string
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          resolved_at?: string | null
          service_id: string
          started_at?: string
          status?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          resolved_at?: string | null
          service_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_log_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "system_status_services"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_status: {
        Row: {
          config: Json
          created_at: string
          display_name: string
          error_count: number
          id: string
          integration_name: string
          last_error: string | null
          last_sync_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          display_name: string
          error_count?: number
          id?: string
          integration_name: string
          last_error?: string | null
          last_sync_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          display_name?: string
          error_count?: number
          id?: string
          integration_name?: string
          last_error?: string | null
          last_sync_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_sync_runs: {
        Row: {
          company_id: string
          error_details: Json | null
          error_message: string | null
          finished_at: string | null
          id: string
          integration_id: string
          orders_created: number | null
          orders_failed: number | null
          orders_fetched: number | null
          orders_updated: number | null
          started_at: string
          status: string
        }
        Insert: {
          company_id: string
          error_details?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          integration_id: string
          orders_created?: number | null
          orders_failed?: number | null
          orders_fetched?: number | null
          orders_updated?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          company_id?: string
          error_details?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          integration_id?: string
          orders_created?: number | null
          orders_failed?: number | null
          orders_fetched?: number | null
          orders_updated?: number | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_runs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "erp_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_queue: {
        Row: {
          company_id: string
          created_at: string | null
          error_message: string | null
          id: string
          payload: Json | null
          period_end: string
          period_start: string
          status: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          period_end: string
          period_start: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      job_locks: {
        Row: {
          created_at: string | null
          expires_at: string
          lock_key: string
          locked_at: string
          locked_by: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          lock_key: string
          locked_at?: string
          locked_by?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          lock_key?: string
          locked_at?: string
          locked_by?: string | null
        }
        Relationships: []
      }
      job_run_steps: {
        Row: {
          category_id: string
          created_at: string | null
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          items_count: number | null
          job_run_id: string | null
          retry_count: number | null
          started_at: string | null
          status: string
          step_type: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_count?: number | null
          job_run_id?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          step_type: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_count?: number | null
          job_run_id?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          step_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_run_steps_job_run_id_fkey"
            columns: ["job_run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          categories_failed: number | null
          categories_processed: number | null
          created_at: string | null
          error_message: string | null
          finished_at: string | null
          highlights_saved: number | null
          id: string
          items_enriched: number | null
          job_name: string
          keywords_saved: number | null
          started_at: string
          status: string
        }
        Insert: {
          categories_failed?: number | null
          categories_processed?: number | null
          created_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          highlights_saved?: number | null
          id?: string
          items_enriched?: number | null
          job_name: string
          keywords_saved?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          categories_failed?: number | null
          categories_processed?: number | null
          created_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          highlights_saved?: number | null
          id?: string
          items_enriched?: number | null
          job_name?: string
          keywords_saved?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
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
      knowledge_base_articles: {
        Row: {
          category: string
          content: string
          created_at: string
          helpful_count: number | null
          id: string
          is_published: boolean | null
          not_helpful_count: number | null
          slug: string
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string
          view_count: number | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          helpful_count?: number | null
          id?: string
          is_published?: boolean | null
          not_helpful_count?: number | null
          slug: string
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          view_count?: number | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          helpful_count?: number | null
          id?: string
          is_published?: boolean | null
          not_helpful_count?: number | null
          slug?: string
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          view_count?: number | null
        }
        Relationships: []
      }
      learned_listing_attributes: {
        Row: {
          attribute_id: string
          created_at: string | null
          id: string
          is_required: boolean | null
          is_valid: boolean | null
          learned_listing_id: string
          name: string | null
          notes: string | null
          scope: string | null
          unit: string | null
          value_id: string | null
          value_name: string | null
          value_struct: Json | null
          variation_id: string | null
        }
        Insert: {
          attribute_id: string
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          is_valid?: boolean | null
          learned_listing_id: string
          name?: string | null
          notes?: string | null
          scope?: string | null
          unit?: string | null
          value_id?: string | null
          value_name?: string | null
          value_struct?: Json | null
          variation_id?: string | null
        }
        Update: {
          attribute_id?: string
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          is_valid?: boolean | null
          learned_listing_id?: string
          name?: string | null
          notes?: string | null
          scope?: string | null
          unit?: string | null
          value_id?: string | null
          value_name?: string | null
          value_struct?: Json | null
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learned_listing_attributes_learned_listing_id_fkey"
            columns: ["learned_listing_id"]
            isOneToOne: false
            referencedRelation: "learned_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      learned_listing_pictures: {
        Row: {
          created_at: string | null
          id: string
          is_cover: boolean | null
          learned_listing_id: string
          max_size: string | null
          secure_url: string | null
          sort_order: number | null
          source_picture_id: string | null
          source_url: string
          storage_url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_cover?: boolean | null
          learned_listing_id: string
          max_size?: string | null
          secure_url?: string | null
          sort_order?: number | null
          source_picture_id?: string | null
          source_url: string
          storage_url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_cover?: boolean | null
          learned_listing_id?: string
          max_size?: string | null
          secure_url?: string | null
          sort_order?: number | null
          source_picture_id?: string | null
          source_url?: string
          storage_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learned_listing_pictures_learned_listing_id_fkey"
            columns: ["learned_listing_id"]
            isOneToOne: false
            referencedRelation: "learned_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      learned_listing_variations: {
        Row: {
          attributes: Json | null
          available_quantity: number | null
          catalog_product_id: string | null
          created_at: string | null
          id: string
          learned_listing_id: string
          picture_ids: Json | null
          price: number | null
          sold_quantity: number | null
          source_variation_id: string | null
        }
        Insert: {
          attributes?: Json | null
          available_quantity?: number | null
          catalog_product_id?: string | null
          created_at?: string | null
          id?: string
          learned_listing_id: string
          picture_ids?: Json | null
          price?: number | null
          sold_quantity?: number | null
          source_variation_id?: string | null
        }
        Update: {
          attributes?: Json | null
          available_quantity?: number | null
          catalog_product_id?: string | null
          created_at?: string | null
          id?: string
          learned_listing_id?: string
          picture_ids?: Json | null
          price?: number | null
          sold_quantity?: number | null
          source_variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learned_listing_variations_learned_listing_id_fkey"
            columns: ["learned_listing_id"]
            isOneToOne: false
            referencedRelation: "learned_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      learned_listings: {
        Row: {
          available_quantity: number | null
          catalog_product_id: string | null
          category_id: string | null
          category_name: string | null
          condition: string | null
          created_at: string | null
          currency_id: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          is_catalog_listing: boolean | null
          listing_type_id: string | null
          original_price: number | null
          permalink: string | null
          price: number | null
          raw_payload: Json | null
          seller_id: string | null
          seller_nickname: string | null
          shipping_free: boolean | null
          shipping_mode: string | null
          sold_quantity: number | null
          source: string
          source_item_id: string
          source_url: string | null
          status: string | null
          thumbnail: string | null
          title: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          available_quantity?: number | null
          catalog_product_id?: string | null
          category_id?: string | null
          category_name?: string | null
          condition?: string | null
          created_at?: string | null
          currency_id?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          is_catalog_listing?: boolean | null
          listing_type_id?: string | null
          original_price?: number | null
          permalink?: string | null
          price?: number | null
          raw_payload?: Json | null
          seller_id?: string | null
          seller_nickname?: string | null
          shipping_free?: boolean | null
          shipping_mode?: string | null
          sold_quantity?: number | null
          source?: string
          source_item_id: string
          source_url?: string | null
          status?: string | null
          thumbnail?: string | null
          title?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          available_quantity?: number | null
          catalog_product_id?: string | null
          category_id?: string | null
          category_name?: string | null
          condition?: string | null
          created_at?: string | null
          currency_id?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          is_catalog_listing?: boolean | null
          listing_type_id?: string | null
          original_price?: number | null
          permalink?: string | null
          price?: number | null
          raw_payload?: Json | null
          seller_id?: string | null
          seller_nickname?: string | null
          shipping_free?: boolean | null
          shipping_mode?: string | null
          sold_quantity?: number | null
          source?: string
          source_item_id?: string
          source_url?: string | null
          status?: string | null
          thumbnail?: string | null
          title?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learned_listings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          content: string
          content_hash: string
          created_at: string
          doc_type: string
          id: string
          is_active: boolean
          published_at: string
          version: string
        }
        Insert: {
          content: string
          content_hash: string
          created_at?: string
          doc_type: string
          id?: string
          is_active?: boolean
          published_at?: string
          version: string
        }
        Update: {
          content?: string
          content_hash?: string
          created_at?: string
          doc_type?: string
          id?: string
          is_active?: boolean
          published_at?: string
          version?: string
        }
        Relationships: []
      }
      listing_events: {
        Row: {
          blocks_affected: string[] | null
          created_at: string
          detected_at: string
          event_category: string
          event_type: string
          id: string
          impact_direction: string | null
          is_processed: boolean | null
          item_id: string
          observation_pt: string | null
          origin: string
          score_after: Json | null
          score_before: Json | null
          score_delta: Json | null
          seller_id: string
          severity: string | null
          snapshot_id: string | null
          state_after: Json | null
          state_before: Json | null
        }
        Insert: {
          blocks_affected?: string[] | null
          created_at?: string
          detected_at?: string
          event_category: string
          event_type: string
          id?: string
          impact_direction?: string | null
          is_processed?: boolean | null
          item_id: string
          observation_pt?: string | null
          origin: string
          score_after?: Json | null
          score_before?: Json | null
          score_delta?: Json | null
          seller_id: string
          severity?: string | null
          snapshot_id?: string | null
          state_after?: Json | null
          state_before?: Json | null
        }
        Update: {
          blocks_affected?: string[] | null
          created_at?: string
          detected_at?: string
          event_category?: string
          event_type?: string
          id?: string
          impact_direction?: string | null
          is_processed?: boolean | null
          item_id?: string
          observation_pt?: string | null
          origin?: string
          score_after?: Json | null
          score_before?: Json | null
          score_delta?: Json | null
          seller_id?: string
          severity?: string | null
          snapshot_id?: string | null
          state_after?: Json | null
          state_before?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_events_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "listing_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_monitor_config: {
        Row: {
          alert_on_critical: boolean | null
          auto_monitor_enabled: boolean | null
          created_at: string
          id: string
          last_snapshot_at: string | null
          min_sales_to_monitor: number | null
          monitor_active_only: boolean | null
          seller_id: string
          snapshot_frequency_hours: number | null
          total_items_monitored: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_on_critical?: boolean | null
          auto_monitor_enabled?: boolean | null
          created_at?: string
          id?: string
          last_snapshot_at?: string | null
          min_sales_to_monitor?: number | null
          monitor_active_only?: boolean | null
          seller_id: string
          snapshot_frequency_hours?: number | null
          total_items_monitored?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_on_critical?: boolean | null
          auto_monitor_enabled?: boolean | null
          created_at?: string
          id?: string
          last_snapshot_at?: string | null
          min_sales_to_monitor?: number | null
          monitor_active_only?: boolean | null
          seller_id?: string
          snapshot_frequency_hours?: number | null
          total_items_monitored?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      listing_radiography: {
        Row: {
          analysis_date: string
          cause_effect_insights: Json | null
          created_at: string
          event_timeline: Json | null
          id: string
          is_current: boolean | null
          item_id: string
          narrative_pt: string | null
          period_analyzed_days: number | null
          period_summary: string | null
          score_breakdown: Json | null
          seller_id: string
          suggested_actions: Json | null
          updated_at: string
        }
        Insert: {
          analysis_date?: string
          cause_effect_insights?: Json | null
          created_at?: string
          event_timeline?: Json | null
          id?: string
          is_current?: boolean | null
          item_id: string
          narrative_pt?: string | null
          period_analyzed_days?: number | null
          period_summary?: string | null
          score_breakdown?: Json | null
          seller_id: string
          suggested_actions?: Json | null
          updated_at?: string
        }
        Update: {
          analysis_date?: string
          cause_effect_insights?: Json | null
          created_at?: string
          event_timeline?: Json | null
          id?: string
          is_current?: boolean | null
          item_id?: string
          narrative_pt?: string | null
          period_analyzed_days?: number | null
          period_summary?: string | null
          score_breakdown?: Json | null
          seller_id?: string
          suggested_actions?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      listing_snapshots: {
        Row: {
          attributes_count: number | null
          available_quantity: number | null
          catalog_product_id: string | null
          conversion_rate_7d: number | null
          created_at: string
          description_length: number | null
          has_clip: boolean | null
          has_video: boolean | null
          health: number | null
          id: string
          item_id: string
          listing_type_id: string | null
          logistic_type: string | null
          original_price: number | null
          photo_count: number | null
          price: number | null
          raw_data: Json | null
          sales_7d: number | null
          score_clip: number | null
          score_competitividade: number | null
          score_logistica: number | null
          score_performance: number | null
          score_semantica: number | null
          score_total: number | null
          score_visual: number | null
          seller_id: string
          snapshot_date: string
          sold_quantity: number | null
          status: string | null
          title: string | null
          title_length: number | null
          visits_7d: number | null
        }
        Insert: {
          attributes_count?: number | null
          available_quantity?: number | null
          catalog_product_id?: string | null
          conversion_rate_7d?: number | null
          created_at?: string
          description_length?: number | null
          has_clip?: boolean | null
          has_video?: boolean | null
          health?: number | null
          id?: string
          item_id: string
          listing_type_id?: string | null
          logistic_type?: string | null
          original_price?: number | null
          photo_count?: number | null
          price?: number | null
          raw_data?: Json | null
          sales_7d?: number | null
          score_clip?: number | null
          score_competitividade?: number | null
          score_logistica?: number | null
          score_performance?: number | null
          score_semantica?: number | null
          score_total?: number | null
          score_visual?: number | null
          seller_id: string
          snapshot_date?: string
          sold_quantity?: number | null
          status?: string | null
          title?: string | null
          title_length?: number | null
          visits_7d?: number | null
        }
        Update: {
          attributes_count?: number | null
          available_quantity?: number | null
          catalog_product_id?: string | null
          conversion_rate_7d?: number | null
          created_at?: string
          description_length?: number | null
          has_clip?: boolean | null
          has_video?: boolean | null
          health?: number | null
          id?: string
          item_id?: string
          listing_type_id?: string | null
          logistic_type?: string | null
          original_price?: number | null
          photo_count?: number | null
          price?: number | null
          raw_data?: Json | null
          sales_7d?: number | null
          score_clip?: number | null
          score_competitividade?: number | null
          score_logistica?: number | null
          score_performance?: number | null
          score_semantica?: number | null
          score_total?: number | null
          score_visual?: number | null
          seller_id?: string
          snapshot_date?: string
          sold_quantity?: number | null
          status?: string | null
          title?: string | null
          title_length?: number | null
          visits_7d?: number | null
        }
        Relationships: []
      }
      marketplace_accounts: {
        Row: {
          access_token: string | null
          account_label: string
          company_id: string
          created_at: string | null
          external_user_id: string | null
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          provider: string
          refresh_token: string | null
          status: string
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          account_label: string
          company_id: string
          created_at?: string | null
          external_user_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          provider?: string
          refresh_token?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          account_label?: string
          company_id?: string
          created_at?: string | null
          external_user_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          provider?: string
          refresh_token?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meli_backfill_sync_state: {
        Row: {
          created_at: string | null
          cursor_offset: number | null
          finished_at: string | null
          id: string
          last_heartbeat_at: string | null
          processed_orders: number | null
          seller_id: string
          started_at: string | null
          status: string
          total_orders: number | null
          updated_at: string | null
          user_id: string
          with_billing: number | null
        }
        Insert: {
          created_at?: string | null
          cursor_offset?: number | null
          finished_at?: string | null
          id?: string
          last_heartbeat_at?: string | null
          processed_orders?: number | null
          seller_id: string
          started_at?: string | null
          status?: string
          total_orders?: number | null
          updated_at?: string | null
          user_id: string
          with_billing?: number | null
        }
        Update: {
          created_at?: string | null
          cursor_offset?: number | null
          finished_at?: string | null
          id?: string
          last_heartbeat_at?: string | null
          processed_orders?: number | null
          seller_id?: string
          started_at?: string | null
          status?: string
          total_orders?: number | null
          updated_at?: string | null
          user_id?: string
          with_billing?: number | null
        }
        Relationships: []
      }
      meli_billing_details_cache: {
        Row: {
          charge_description: string | null
          charge_type: string
          created_at_meli: string | null
          currency_id: string | null
          detail_id: string
          fetched_at: string
          gross_amount: number
          id: string
          net_amount: number
          order_id: number | null
          period_key: string
          raw_data: Json | null
          seller_id: string
          shipment_id: number | null
        }
        Insert: {
          charge_description?: string | null
          charge_type: string
          created_at_meli?: string | null
          currency_id?: string | null
          detail_id: string
          fetched_at?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          order_id?: number | null
          period_key: string
          raw_data?: Json | null
          seller_id: string
          shipment_id?: number | null
        }
        Update: {
          charge_description?: string | null
          charge_type?: string
          created_at_meli?: string | null
          currency_id?: string | null
          detail_id?: string
          fetched_at?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          order_id?: number | null
          period_key?: string
          raw_data?: Json | null
          seller_id?: string
          shipment_id?: number | null
        }
        Relationships: []
      }
      meli_billing_details_sync_state: {
        Row: {
          created_at: string
          details_offset: number | null
          finished_at: string | null
          id: string
          last_error: string | null
          last_heartbeat_at: string | null
          period_key_cursor: string | null
          periods_offset: number | null
          processed_details: number | null
          processed_periods: number | null
          scope: string | null
          seller_id: string
          started_at: string | null
          status: string
          total_details: number | null
          total_periods: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details_offset?: number | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          last_heartbeat_at?: string | null
          period_key_cursor?: string | null
          periods_offset?: number | null
          processed_details?: number | null
          processed_periods?: number | null
          scope?: string | null
          seller_id: string
          started_at?: string | null
          status?: string
          total_details?: number | null
          total_periods?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details_offset?: number | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          last_heartbeat_at?: string | null
          period_key_cursor?: string | null
          periods_offset?: number | null
          processed_details?: number | null
          processed_periods?: number | null
          scope?: string | null
          seller_id?: string
          started_at?: string | null
          status?: string
          total_details?: number | null
          total_periods?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meli_financial_movements_cache: {
        Row: {
          amount: number
          concept: string
          currency_id: string | null
          id: string
          last_sync_at: string
          movement_date: string
          movement_id: string
          order_id: string | null
          payment_id: string | null
          raw_json: Json | null
          seller_id: string
          shipment_id: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          concept: string
          currency_id?: string | null
          id?: string
          last_sync_at?: string
          movement_date: string
          movement_id: string
          order_id?: string | null
          payment_id?: string | null
          raw_json?: Json | null
          seller_id: string
          shipment_id?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          concept?: string
          currency_id?: string | null
          id?: string
          last_sync_at?: string
          movement_date?: string
          movement_id?: string
          order_id?: string | null
          payment_id?: string | null
          raw_json?: Json | null
          seller_id?: string
          shipment_id?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      meli_financial_sync_state: {
        Row: {
          created_at: string
          cursor_or_offset: string | null
          id: string
          last_error: string | null
          last_heartbeat_at: string | null
          last_offset: number | null
          last_page_size: number | null
          last_sync_finished_at: string | null
          last_sync_started_at: string | null
          last_synced_from: string | null
          last_synced_to: string | null
          movements_synced: number | null
          phase: string | null
          seller_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cursor_or_offset?: string | null
          id?: string
          last_error?: string | null
          last_heartbeat_at?: string | null
          last_offset?: number | null
          last_page_size?: number | null
          last_sync_finished_at?: string | null
          last_sync_started_at?: string | null
          last_synced_from?: string | null
          last_synced_to?: string | null
          movements_synced?: number | null
          phase?: string | null
          seller_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cursor_or_offset?: string | null
          id?: string
          last_error?: string | null
          last_heartbeat_at?: string | null
          last_offset?: number | null
          last_page_size?: number | null
          last_sync_finished_at?: string | null
          last_sync_started_at?: string | null
          last_synced_from?: string | null
          last_synced_to?: string | null
          movements_synced?: number | null
          phase?: string | null
          seller_id?: string
          status?: string
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
      meli_listing_fee_cache: {
        Row: {
          created_at: string
          fee_amount: number
          fee_percent: number | null
          id: string
          listing_type_id: string
          price_bucket: number
          raw_json: Json | null
          seller_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee_amount: number
          fee_percent?: number | null
          id?: string
          listing_type_id?: string
          price_bucket: number
          raw_json?: Json | null
          seller_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee_amount?: number
          fee_percent?: number | null
          id?: string
          listing_type_id?: string
          price_bucket?: number
          raw_json?: Json | null
          seller_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      meli_listings_cache: {
        Row: {
          available_quantity: number | null
          catalog_product_id: string | null
          category_id: string | null
          condition: string | null
          created_at: string
          currency_id: string | null
          dimensions_source: string | null
          expected_freight_cost: number | null
          expected_freight_ruleset_id: string | null
          expected_freight_updated_at: string | null
          freight_calculation_notes: string | null
          freight_profile: string | null
          health: number | null
          height_cm: number | null
          id: string
          item_id: string
          last_sync_at: string
          length_cm: number | null
          listing_type_id: string | null
          logistic_type: string | null
          original_price: number | null
          permalink: string | null
          price: number
          seller_id: string
          sku: string | null
          sold_quantity: number | null
          status: string | null
          thumbnail: string | null
          title: string | null
          title_short: string | null
          user_id: string
          variation_id: string
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          available_quantity?: number | null
          catalog_product_id?: string | null
          category_id?: string | null
          condition?: string | null
          created_at?: string
          currency_id?: string | null
          dimensions_source?: string | null
          expected_freight_cost?: number | null
          expected_freight_ruleset_id?: string | null
          expected_freight_updated_at?: string | null
          freight_calculation_notes?: string | null
          freight_profile?: string | null
          health?: number | null
          height_cm?: number | null
          id?: string
          item_id: string
          last_sync_at?: string
          length_cm?: number | null
          listing_type_id?: string | null
          logistic_type?: string | null
          original_price?: number | null
          permalink?: string | null
          price?: number
          seller_id: string
          sku?: string | null
          sold_quantity?: number | null
          status?: string | null
          thumbnail?: string | null
          title?: string | null
          title_short?: string | null
          user_id: string
          variation_id?: string
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          available_quantity?: number | null
          catalog_product_id?: string | null
          category_id?: string | null
          condition?: string | null
          created_at?: string
          currency_id?: string | null
          dimensions_source?: string | null
          expected_freight_cost?: number | null
          expected_freight_ruleset_id?: string | null
          expected_freight_updated_at?: string | null
          freight_calculation_notes?: string | null
          freight_profile?: string | null
          health?: number | null
          height_cm?: number | null
          id?: string
          item_id?: string
          last_sync_at?: string
          length_cm?: number | null
          listing_type_id?: string | null
          logistic_type?: string | null
          original_price?: number | null
          permalink?: string | null
          price?: number
          seller_id?: string
          sku?: string | null
          sold_quantity?: number | null
          status?: string | null
          thumbnail?: string | null
          title?: string | null
          title_short?: string | null
          user_id?: string
          variation_id?: string
          weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: []
      }
      meli_order_financials_cache: {
        Row: {
          billing_period_key: string | null
          cost_cancellations: number
          cost_installment_fee: number
          cost_sale_fee: number
          cost_shipping_fee: number
          created_at: string
          id: string
          order_id: string
          revenue_products: number
          revenue_shipping: number
          seller_id: string
          shipment_id: string | null
          synced_at: string
          user_id: string
        }
        Insert: {
          billing_period_key?: string | null
          cost_cancellations?: number
          cost_installment_fee?: number
          cost_sale_fee?: number
          cost_shipping_fee?: number
          created_at?: string
          id?: string
          order_id: string
          revenue_products?: number
          revenue_shipping?: number
          seller_id: string
          shipment_id?: string | null
          synced_at?: string
          user_id: string
        }
        Update: {
          billing_period_key?: string | null
          cost_cancellations?: number
          cost_installment_fee?: number
          cost_sale_fee?: number
          cost_shipping_fee?: number
          created_at?: string
          id?: string
          order_id?: string
          revenue_products?: number
          revenue_shipping?: number
          seller_id?: string
          shipment_id?: string | null
          synced_at?: string
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
          pack_id: string | null
          seller_id: string
          shipment_id: string | null
          shipping_state: string | null
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
          pack_id?: string | null
          seller_id: string
          shipment_id?: string | null
          shipping_state?: string | null
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
          pack_id?: string | null
          seller_id?: string
          shipment_id?: string | null
          shipping_state?: string | null
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
      meli_real_costs_sync_state: {
        Row: {
          created_at: string
          cursor_offset: number
          finished_at: string | null
          id: string
          last_error: string | null
          last_heartbeat_at: string | null
          last_page_size: number | null
          last_pending_count: number | null
          processed: number
          scope_days: number | null
          seller_id: string
          started_at: string | null
          stats_json: Json | null
          status: string
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cursor_offset?: number
          finished_at?: string | null
          id?: string
          last_error?: string | null
          last_heartbeat_at?: string | null
          last_page_size?: number | null
          last_pending_count?: number | null
          processed?: number
          scope_days?: number | null
          seller_id: string
          started_at?: string | null
          stats_json?: Json | null
          status?: string
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cursor_offset?: number
          finished_at?: string | null
          id?: string
          last_error?: string | null
          last_heartbeat_at?: string | null
          last_page_size?: number | null
          last_pending_count?: number | null
          processed?: number
          scope_days?: number | null
          seller_id?: string
          started_at?: string | null
          stats_json?: Json | null
          status?: string
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meli_shipment_costs_cache: {
        Row: {
          created_at: string
          discounts_json: Json | null
          gross_amount: number | null
          id: string
          order_id: string | null
          raw_json: Json | null
          receiver_cost: number | null
          seller_id: string
          sender_compensation: number | null
          sender_cost: number | null
          shipment_id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discounts_json?: Json | null
          gross_amount?: number | null
          id?: string
          order_id?: string | null
          raw_json?: Json | null
          receiver_cost?: number | null
          seller_id: string
          sender_compensation?: number | null
          sender_cost?: number | null
          shipment_id: string
          synced_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          discounts_json?: Json | null
          gross_amount?: number | null
          id?: string
          order_id?: string | null
          raw_json?: Json | null
          receiver_cost?: number | null
          seller_id?: string
          sender_compensation?: number | null
          sender_cost?: number | null
          shipment_id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meli_shipments_cache: {
        Row: {
          estimated_handling_limit: string | null
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
          estimated_handling_limit?: string | null
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
          estimated_handling_limit?: string | null
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
      menu_item_rules_legacy: {
        Row: {
          allowed_plans: string[] | null
          allowed_roles: string[] | null
          created_at: string
          id: string
          is_enabled: boolean
          menu_item_id: string
          min_plan_code: string | null
          required_feature_flags: string[] | null
          requires_marketplace_connected: boolean
          updated_at: string
        }
        Insert: {
          allowed_plans?: string[] | null
          allowed_roles?: string[] | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          menu_item_id: string
          min_plan_code?: string | null
          required_feature_flags?: string[] | null
          requires_marketplace_connected?: boolean
          updated_at?: string
        }
        Update: {
          allowed_plans?: string[] | null
          allowed_roles?: string[] | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          menu_item_id?: string
          min_plan_code?: string | null
          required_feature_flags?: string[] | null
          requires_marketplace_connected?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_rules_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: true
            referencedRelation: "menu_items_legacy"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items_legacy: {
        Row: {
          category_root: string
          created_at: string
          feature_key: string | null
          icon_key: string | null
          id: string
          label: string
          marketplace_code: string | null
          order_index: number
          parent_id: string | null
          permission_key: string | null
          route: string | null
          scope: string
          status: string
          updated_at: string
        }
        Insert: {
          category_root: string
          created_at?: string
          feature_key?: string | null
          icon_key?: string | null
          id?: string
          label: string
          marketplace_code?: string | null
          order_index?: number
          parent_id?: string | null
          permission_key?: string | null
          route?: string | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Update: {
          category_root?: string
          created_at?: string
          feature_key?: string | null
          icon_key?: string | null
          id?: string
          label?: string
          marketplace_code?: string | null
          order_index?: number
          parent_id?: string | null
          permission_key?: string | null
          route?: string | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "menu_items_legacy"
            referencedColumns: ["id"]
          },
        ]
      }
      message_ai_suggestions: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          created_at: string
          id: string
          referencia: string | null
          rejected_at: string | null
          status: string
          tema: string
          texto: string
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          created_at?: string
          id?: string
          referencia?: string | null
          rejected_at?: string | null
          status?: string
          tema: string
          texto: string
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          created_at?: string
          id?: string
          referencia?: string | null
          rejected_at?: string | null
          status?: string
          tema?: string
          texto?: string
        }
        Relationships: []
      }
      message_daily_log: {
        Row: {
          created_at: string
          data_exibicao: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_exibicao: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_exibicao?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_daily_log_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "daily_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_interactions: {
        Row: {
          created_at: string
          id: string
          liked: boolean
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          liked?: boolean
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          liked?: boolean
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_interactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "daily_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      mktpfacil_announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mktpfacil_announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "mktpfacil_announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      mktpfacil_announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          is_active: boolean
          link_url: string | null
          plan_target: string
          priority: number
          target_seller_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          plan_target?: string
          priority?: number
          target_seller_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          plan_target?: string
          priority?: number
          target_seller_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      mktpfacil_clone_job_units: {
        Row: {
          created_at: string
          destination_item_id: string | null
          destination_permalink: string | null
          error_code: string | null
          error_message: string | null
          id: string
          job_id: string
          retry_count: number
          source_variation_id: string | null
          status: string
          unit_index: number
          unit_snapshot_json: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination_item_id?: string | null
          destination_permalink?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_id: string
          retry_count?: number
          source_variation_id?: string | null
          status?: string
          unit_index?: number
          unit_snapshot_json?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination_item_id?: string | null
          destination_permalink?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_id?: string
          retry_count?: number
          source_variation_id?: string | null
          status?: string
          unit_index?: number
          unit_snapshot_json?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mktpfacil_clone_job_units_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "mktpfacil_clone_history"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "mktpfacil_clone_job_units_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "mktpfacil_clone_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      mktpfacil_clone_jobs: {
        Row: {
          created_at: string
          destination_account_id: string
          finished_at: string | null
          id: string
          settings_json: Json
          source_item_id: string
          source_snapshot_json: Json | null
          source_url: string | null
          started_at: string | null
          status: string
          summary_json: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination_account_id: string
          finished_at?: string | null
          id?: string
          settings_json?: Json
          source_item_id: string
          source_snapshot_json?: Json | null
          source_url?: string | null
          started_at?: string | null
          status?: string
          summary_json?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination_account_id?: string
          finished_at?: string | null
          id?: string
          settings_json?: Json
          source_item_id?: string
          source_snapshot_json?: Json | null
          source_url?: string | null
          started_at?: string | null
          status?: string
          summary_json?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mktpfacil_clone_jobs_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mktpfacil_clone_jobs_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mktpfacil_system_logs: {
        Row: {
          context_json: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_name: string
          id: string
          level: string
          message: string | null
          module: string
          user_id: string
        }
        Insert: {
          context_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_name: string
          id?: string
          level?: string
          message?: string | null
          module?: string
          user_id: string
        }
        Update: {
          context_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_name?: string
          id?: string
          level?: string
          message?: string | null
          module?: string
          user_id?: string
        }
        Relationships: []
      }
      ml_accounts: {
        Row: {
          access_token: string | null
          company_id: string | null
          connection_status: string | null
          consecutive_failures: number | null
          country_id: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          is_connected: boolean
          last_api_error_at: string | null
          last_api_error_code: string | null
          last_api_ok_at: string | null
          last_token_refresh_at: string | null
          ml_user_id: string
          nickname: string | null
          refresh_token: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          company_id?: string | null
          connection_status?: string | null
          consecutive_failures?: number | null
          country_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_connected?: boolean
          last_api_error_at?: string | null
          last_api_error_code?: string | null
          last_api_ok_at?: string | null
          last_token_refresh_at?: string | null
          ml_user_id: string
          nickname?: string | null
          refresh_token?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          company_id?: string | null
          connection_status?: string | null
          consecutive_failures?: number | null
          country_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_connected?: boolean
          last_api_error_at?: string | null
          last_api_error_code?: string | null
          last_api_ok_at?: string | null
          last_token_refresh_at?: string | null
          ml_user_id?: string
          nickname?: string | null
          refresh_token?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_integrations: {
        Row: {
          application_id: string | null
          created_at: string
          daily_events_count: number
          daily_events_reset_at: string | null
          feature_flags: Json
          id: string
          ml_user_id: string
          plan_id: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          daily_events_count?: number
          daily_events_reset_at?: string | null
          feature_flags?: Json
          id?: string
          ml_user_id: string
          plan_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          application_id?: string | null
          created_at?: string
          daily_events_count?: number
          daily_events_reset_at?: string | null
          feature_flags?: Json
          id?: string
          ml_user_id?: string
          plan_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_integrations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_integrations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "public_plans_v1"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "ml_integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_publication_jobs: {
        Row: {
          action: string
          created_at: string | null
          created_by: string | null
          error_code: string | null
          error_details: Json | null
          error_message: string | null
          finished_at: string | null
          id: string
          ml_account_id: string | null
          ml_item_id: string | null
          product_record_id: string
          request_summary: Json | null
          response_summary: Json | null
          retry_count: number | null
          started_at: string | null
          status: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          created_by?: string | null
          error_code?: string | null
          error_details?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          ml_account_id?: string | null
          ml_item_id?: string | null
          product_record_id: string
          request_summary?: Json | null
          response_summary?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          created_by?: string | null
          error_code?: string | null
          error_details?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          ml_account_id?: string | null
          ml_item_id?: string | null
          product_record_id?: string
          request_summary?: Json | null
          response_summary?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_publication_jobs_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_publication_jobs_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_publication_jobs_product_record_id_fkey"
            columns: ["product_record_id"]
            isOneToOne: false
            referencedRelation: "product_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_publication_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      module_explanatory_cards: {
        Row: {
          ativo: boolean
          conteudo: Json
          created_at: string
          id: string
          module_slug: string
          obrigatorio: boolean
          ordem: number
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          conteudo?: Json
          created_at?: string
          id?: string
          module_slug: string
          obrigatorio?: boolean
          ordem?: number
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          conteudo?: Json
          created_at?: string
          id?: string
          module_slug?: string
          obrigatorio?: boolean
          ordem?: number
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      module_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          module_slug: string
          rating: number
          seller_id: string
          status: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          module_slug: string
          rating: number
          seller_id: string
          status?: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          module_slug?: string
          rating?: number
          seller_id?: string
          status?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      module_rating_stats: {
        Row: {
          avg_stars: number | null
          last_rating_at: string | null
          module_id: string
          ratings_count: number | null
          stars_1: number | null
          stars_2: number | null
          stars_3: number | null
          stars_4: number | null
          stars_5: number | null
          updated_at: string | null
        }
        Insert: {
          avg_stars?: number | null
          last_rating_at?: string | null
          module_id: string
          ratings_count?: number | null
          stars_1?: number | null
          stars_2?: number | null
          stars_3?: number | null
          stars_4?: number | null
          stars_5?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_stars?: number | null
          last_rating_at?: string | null
          module_id?: string
          ratings_count?: number | null
          stars_1?: number | null
          stars_2?: number | null
          stars_3?: number | null
          stars_4?: number | null
          stars_5?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "module_rating_stats_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: true
            referencedRelation: "system_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      module_ratings: {
        Row: {
          comment: string | null
          created_at: string | null
          hidden_reason: string | null
          id: string
          is_hidden_by_admin: boolean | null
          is_public: boolean | null
          module_id: string
          stars: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden_by_admin?: boolean | null
          is_public?: boolean | null
          module_id: string
          stars: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden_by_admin?: boolean | null
          is_public?: boolean | null
          module_id?: string
          stars?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_ratings_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "system_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      module_tag_assignments: {
        Row: {
          created_at: string
          id: string
          module_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_tag_assignments_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "system_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "module_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      module_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          priority: number
          style: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          style?: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          style?: string
          updated_at?: string
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
      mp_movements_raw: {
        Row: {
          amount: number | null
          balance: number | null
          created_at: string
          date_created: string | null
          description: string | null
          finance_account_id: string
          id: string
          movement_type: string | null
          mp_movement_id: string
          payment_id: string | null
          raw_json: Json | null
          reference_id: string | null
          status: string | null
          synced_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          balance?: number | null
          created_at?: string
          date_created?: string | null
          description?: string | null
          finance_account_id: string
          id?: string
          movement_type?: string | null
          mp_movement_id: string
          payment_id?: string | null
          raw_json?: Json | null
          reference_id?: string | null
          status?: string | null
          synced_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          balance?: number | null
          created_at?: string
          date_created?: string | null
          description?: string | null
          finance_account_id?: string
          id?: string
          movement_type?: string | null
          mp_movement_id?: string
          payment_id?: string | null
          raw_json?: Json | null
          reference_id?: string | null
          status?: string | null
          synced_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_movements_raw_finance_account_id_fkey"
            columns: ["finance_account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_payments_raw: {
        Row: {
          created_at: string
          date_approved: string | null
          date_created: string | null
          description: string | null
          external_reference: string | null
          fee_amount: number | null
          finance_account_id: string
          id: string
          installments: number | null
          money_release_date: string | null
          mp_order_id: string | null
          mp_payment_id: string
          net_received_amount: number | null
          payer_email: string | null
          payment_method_id: string | null
          payment_type: string | null
          raw_json: Json | null
          status: string | null
          status_detail: string | null
          synced_at: string
          total_paid_amount: number | null
          transaction_amount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_approved?: string | null
          date_created?: string | null
          description?: string | null
          external_reference?: string | null
          fee_amount?: number | null
          finance_account_id: string
          id?: string
          installments?: number | null
          money_release_date?: string | null
          mp_order_id?: string | null
          mp_payment_id: string
          net_received_amount?: number | null
          payer_email?: string | null
          payment_method_id?: string | null
          payment_type?: string | null
          raw_json?: Json | null
          status?: string | null
          status_detail?: string | null
          synced_at?: string
          total_paid_amount?: number | null
          transaction_amount?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_approved?: string | null
          date_created?: string | null
          description?: string | null
          external_reference?: string | null
          fee_amount?: number | null
          finance_account_id?: string
          id?: string
          installments?: number | null
          money_release_date?: string | null
          mp_order_id?: string | null
          mp_payment_id?: string
          net_received_amount?: number | null
          payer_email?: string | null
          payment_method_id?: string | null
          payment_type?: string | null
          raw_json?: Json | null
          status?: string | null
          status_detail?: string | null
          synced_at?: string
          total_paid_amount?: number | null
          transaction_amount?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_payments_raw_finance_account_id_fkey"
            columns: ["finance_account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_field_mappings: {
        Row: {
          company_id: string
          created_at: string
          fallback_value: string | null
          id: string
          provider: string
          source_path: string
          target_field: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          fallback_value?: string | null
          id?: string
          provider: string
          source_path: string
          target_field: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          fallback_value?: string | null
          id?: string
          provider?: string
          source_path?: string
          target_field?: string
          updated_at?: string
        }
        Relationships: []
      }
      nfse_settings: {
        Row: {
          aliquota_iss: number | null
          cnae: string | null
          company_id: string
          created_at: string
          id: string
          natureza_operacao: string | null
          observacoes: string | null
          service_code: string | null
          service_description: string | null
          updated_at: string
        }
        Insert: {
          aliquota_iss?: number | null
          cnae?: string | null
          company_id: string
          created_at?: string
          id?: string
          natureza_operacao?: string | null
          observacoes?: string | null
          service_code?: string | null
          service_description?: string | null
          updated_at?: string
        }
        Update: {
          aliquota_iss?: number | null
          cnae?: string | null
          company_id?: string
          created_at?: string
          id?: string
          natureza_operacao?: string | null
          observacoes?: string | null
          service_code?: string | null
          service_description?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      note_attachments: {
        Row: {
          created_at: string
          file_name: string | null
          file_size: number | null
          height: number | null
          id: string
          mime_type: string | null
          note_id: string
          storage_path: string
          width: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          height?: number | null
          id?: string
          mime_type?: string | null
          note_id: string
          storage_path: string
          width?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          height?: number | null
          id?: string
          mime_type?: string | null
          note_id?: string
          storage_path?: string
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_attachments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      note_events: {
        Row: {
          created_at: string
          created_by_user_id: string
          event_type: string
          id: string
          note_id: string
          payload_json: Json | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          event_type: string
          id?: string
          note_id: string
          payload_json?: Json | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          event_type?: string
          id?: string
          note_id?: string
          payload_json?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_events_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      note_pins: {
        Row: {
          company_id: string | null
          created_at: string
          created_by_user_id: string
          entity_id: string | null
          entity_type: string | null
          id: string
          module_key: string
          note_id: string
          route_path: string | null
          workspace_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by_user_id: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key: string
          note_id: string
          route_path?: string | null
          workspace_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by_user_id?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module_key?: string
          note_id?: string
          route_path?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_pins_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_pins_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          color_hex: string | null
          company_id: string | null
          content_plain: string | null
          content_rich: Json | null
          created_at: string
          created_by_user_id: string
          id: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color_hex?: string | null
          company_id?: string | null
          content_plain?: string | null
          content_rich?: Json | null
          created_at?: string
          created_by_user_id: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color_hex?: string | null
          company_id?: string | null
          content_plain?: string | null
          content_rich?: Json | null
          created_at?: string
          created_by_user_id?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_audit_log: {
        Row: {
          action: string
          action_details: Json | null
          created_at: string
          id: string
          ip_address: string | null
          notification_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          action_details?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          notification_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          action_details?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          notification_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_audit_log_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "app_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_audit_log_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "priority_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          id: string
          post_sale_blocked_enabled: boolean | null
          post_sale_error_enabled: boolean | null
          qa_blocked_enabled: boolean | null
          qa_pending_enabled: boolean | null
          qa_send_error_enabled: boolean | null
          qa_sla_breached_enabled: boolean | null
          qa_sla_warning_enabled: boolean | null
          quiet_hours_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          show_in_bell: boolean | null
          show_in_dashboard: boolean | null
          system_alert_enabled: boolean | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          post_sale_blocked_enabled?: boolean | null
          post_sale_error_enabled?: boolean | null
          qa_blocked_enabled?: boolean | null
          qa_pending_enabled?: boolean | null
          qa_send_error_enabled?: boolean | null
          qa_sla_breached_enabled?: boolean | null
          qa_sla_warning_enabled?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          show_in_bell?: boolean | null
          show_in_dashboard?: boolean | null
          system_alert_enabled?: boolean | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          post_sale_blocked_enabled?: boolean | null
          post_sale_error_enabled?: boolean | null
          qa_blocked_enabled?: boolean | null
          qa_pending_enabled?: boolean | null
          qa_send_error_enabled?: boolean | null
          qa_sla_breached_enabled?: boolean | null
          qa_sla_warning_enabled?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          show_in_bell?: boolean | null
          show_in_dashboard?: boolean | null
          system_alert_enabled?: boolean | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          type: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          type: string
          user_id: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          type?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_cards: {
        Row: {
          created_at: string
          description: string | null
          display_condition: string | null
          icon_name: string | null
          id: string
          is_active: boolean
          link_url: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_condition?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          link_url?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_condition?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          link_url?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      onboarding_flows: {
        Row: {
          aplicacao_perfis: string[] | null
          aplicacao_planos: string[] | null
          ativo: boolean
          created_at: string
          descricao: string | null
          exigir_conclusao: boolean
          id: string
          nome: string
          prioridade: number
          slug: string
          updated_at: string
          versao: number
        }
        Insert: {
          aplicacao_perfis?: string[] | null
          aplicacao_planos?: string[] | null
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          exigir_conclusao?: boolean
          id?: string
          nome: string
          prioridade?: number
          slug: string
          updated_at?: string
          versao?: number
        }
        Update: {
          aplicacao_perfis?: string[] | null
          aplicacao_planos?: string[] | null
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          exigir_conclusao?: boolean
          id?: string
          nome?: string
          prioridade?: number
          slug?: string
          updated_at?: string
          versao?: number
        }
        Relationships: []
      }
      onboarding_step_events: {
        Row: {
          company_id: string
          created_at: string
          details: Json
          evento: string
          flow_id: string
          flow_versao: number
          id: string
          ip: string | null
          seller_id: string
          step_id: string
          step_ordem: number
          user_agent: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          details?: Json
          evento: string
          flow_id: string
          flow_versao: number
          id?: string
          ip?: string | null
          seller_id: string
          step_id: string
          step_ordem: number
          user_agent?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          details?: Json
          evento?: string
          flow_id?: string
          flow_versao?: number
          id?: string
          ip?: string | null
          seller_id?: string
          step_id?: string
          step_ordem?: number
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_step_events_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "onboarding_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_steps: {
        Row: {
          conteudo: string | null
          created_at: string
          cta_label: string | null
          cta_route: string | null
          flow_id: string
          id: string
          media_url: string | null
          obrigatoria: boolean
          ordem: number
          tipo: string
          titulo: string
          updated_at: string
          validacao_schema: Json | null
          video_url: string | null
        }
        Insert: {
          conteudo?: string | null
          created_at?: string
          cta_label?: string | null
          cta_route?: string | null
          flow_id: string
          id?: string
          media_url?: string | null
          obrigatoria?: boolean
          ordem: number
          tipo: string
          titulo: string
          updated_at?: string
          validacao_schema?: Json | null
          video_url?: string | null
        }
        Update: {
          conteudo?: string | null
          created_at?: string
          cta_label?: string | null
          cta_route?: string | null
          flow_id?: string
          id?: string
          media_url?: string | null
          obrigatoria?: boolean
          ordem?: number
          tipo?: string
          titulo?: string
          updated_at?: string
          validacao_schema?: Json | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "onboarding_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_user_progress: {
        Row: {
          company_id: string
          completed_at: string | null
          consent_hash: string | null
          created_at: string
          flow_id: string
          flow_versao: number
          id: string
          ip_fim: string | null
          ip_inicio: string | null
          origem: string | null
          payload_respostas: Json
          seller_id: string
          started_at: string
          status: string
          step_atual: number
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          consent_hash?: string | null
          created_at?: string
          flow_id: string
          flow_versao: number
          id?: string
          ip_fim?: string | null
          ip_inicio?: string | null
          origem?: string | null
          payload_respostas?: Json
          seller_id: string
          started_at?: string
          status?: string
          step_atual?: number
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          consent_hash?: string | null
          created_at?: string
          flow_id?: string
          flow_versao?: number
          id?: string
          ip_fim?: string | null
          ip_inicio?: string | null
          origem?: string | null
          payload_respostas?: Json
          seller_id?: string
          started_at?: string
          status?: string
          step_atual?: number
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_user_progress_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "onboarding_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_events: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          order_id: string
          seller_id: string
          status: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          order_id: string
          seller_id: string
          status?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          order_id?: string
          seller_id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      order_cost_breakdown_cache: {
        Row: {
          adjustments: number | null
          buyer_name: string | null
          buyer_nickname: string | null
          calculated_at: string
          cancelamentos_reembolsos: number | null
          commission_cost: number | null
          cost_fees: number
          cost_items_total: number
          cost_net: number | null
          cost_other: number
          cost_packaging: number
          cost_packaging_detail: Json | null
          cost_shipping: number
          cost_total: number
          created_at_meli: string | null
          custo_diferenca_peso_medidas: number | null
          custo_envio_declarado: number | null
          difal_applied: boolean | null
          fee_ml: number | null
          fee_ml_source: string | null
          has_real_cost: boolean | null
          has_real_financial: boolean | null
          id: string
          installments_cost: number | null
          last_checked_at: string | null
          last_recalculated_at: string | null
          margin_net: number | null
          margin_percent: number
          missing_cost_items_count: number
          missing_fields: string[] | null
          missing_financial_count: number | null
          notes: string | null
          order_id: string
          profit_net: number | null
          profit_total: number
          raw_summary_json: Json | null
          real_cost_synced_at: string | null
          receita_acrescimo: number | null
          receita_envio: number | null
          receita_produtos: number | null
          revenue_net: number | null
          revenue_total: number
          seller_id: string
          shipment_id: string | null
          shipping_balance: number | null
          shipping_cost_seller: number | null
          source_refs: Json | null
          status: string
          tarifa_venda_e_impostos: number | null
          tarifas_envio: number | null
          tax_percent_total: number | null
          tax_value: number | null
          taxa_parcelamento_equivalente: number | null
          total_liquido: number | null
          total_marketplace_cost: number | null
          user_id: string
        }
        Insert: {
          adjustments?: number | null
          buyer_name?: string | null
          buyer_nickname?: string | null
          calculated_at?: string
          cancelamentos_reembolsos?: number | null
          commission_cost?: number | null
          cost_fees?: number
          cost_items_total?: number
          cost_net?: number | null
          cost_other?: number
          cost_packaging?: number
          cost_packaging_detail?: Json | null
          cost_shipping?: number
          cost_total?: number
          created_at_meli?: string | null
          custo_diferenca_peso_medidas?: number | null
          custo_envio_declarado?: number | null
          difal_applied?: boolean | null
          fee_ml?: number | null
          fee_ml_source?: string | null
          has_real_cost?: boolean | null
          has_real_financial?: boolean | null
          id?: string
          installments_cost?: number | null
          last_checked_at?: string | null
          last_recalculated_at?: string | null
          margin_net?: number | null
          margin_percent?: number
          missing_cost_items_count?: number
          missing_fields?: string[] | null
          missing_financial_count?: number | null
          notes?: string | null
          order_id: string
          profit_net?: number | null
          profit_total?: number
          raw_summary_json?: Json | null
          real_cost_synced_at?: string | null
          receita_acrescimo?: number | null
          receita_envio?: number | null
          receita_produtos?: number | null
          revenue_net?: number | null
          revenue_total?: number
          seller_id: string
          shipment_id?: string | null
          shipping_balance?: number | null
          shipping_cost_seller?: number | null
          source_refs?: Json | null
          status?: string
          tarifa_venda_e_impostos?: number | null
          tarifas_envio?: number | null
          tax_percent_total?: number | null
          tax_value?: number | null
          taxa_parcelamento_equivalente?: number | null
          total_liquido?: number | null
          total_marketplace_cost?: number | null
          user_id: string
        }
        Update: {
          adjustments?: number | null
          buyer_name?: string | null
          buyer_nickname?: string | null
          calculated_at?: string
          cancelamentos_reembolsos?: number | null
          commission_cost?: number | null
          cost_fees?: number
          cost_items_total?: number
          cost_net?: number | null
          cost_other?: number
          cost_packaging?: number
          cost_packaging_detail?: Json | null
          cost_shipping?: number
          cost_total?: number
          created_at_meli?: string | null
          custo_diferenca_peso_medidas?: number | null
          custo_envio_declarado?: number | null
          difal_applied?: boolean | null
          fee_ml?: number | null
          fee_ml_source?: string | null
          has_real_cost?: boolean | null
          has_real_financial?: boolean | null
          id?: string
          installments_cost?: number | null
          last_checked_at?: string | null
          last_recalculated_at?: string | null
          margin_net?: number | null
          margin_percent?: number
          missing_cost_items_count?: number
          missing_fields?: string[] | null
          missing_financial_count?: number | null
          notes?: string | null
          order_id?: string
          profit_net?: number | null
          profit_total?: number
          raw_summary_json?: Json | null
          real_cost_synced_at?: string | null
          receita_acrescimo?: number | null
          receita_envio?: number | null
          receita_produtos?: number | null
          revenue_net?: number | null
          revenue_total?: number
          seller_id?: string
          shipment_id?: string | null
          shipping_balance?: number | null
          shipping_cost_seller?: number | null
          source_refs?: Json | null
          status?: string
          tarifa_venda_e_impostos?: number | null
          tarifas_envio?: number | null
          tax_percent_total?: number | null
          tax_value?: number | null
          taxa_parcelamento_equivalente?: number | null
          total_liquido?: number | null
          total_marketplace_cost?: number | null
          user_id?: string
        }
        Relationships: []
      }
      packaging_types: {
        Row: {
          company_id: string
          cost_value: number
          created_at: string | null
          height_cm: number | null
          id: string
          is_active: boolean | null
          length_cm: number | null
          name: string
          updated_at: string | null
          width_cm: number | null
        }
        Insert: {
          company_id: string
          cost_value?: number
          created_at?: string | null
          height_cm?: number | null
          id?: string
          is_active?: boolean | null
          length_cm?: number | null
          name: string
          updated_at?: string | null
          width_cm?: number | null
        }
        Update: {
          company_id?: string
          cost_value?: number
          created_at?: string | null
          height_cm?: number | null
          id?: string
          is_active?: boolean | null
          length_cm?: number | null
          name?: string
          updated_at?: string | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "packaging_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          company_id: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          discount_cents: number | null
          final_amount_cents: number | null
          gateway_payment_id: string | null
          id: string
          mercadopago_payment_id: string | null
          mercadopago_status: string | null
          paid_at: string | null
          payment_method: string | null
          status: string
          subscription_id: string | null
          user_id: string
          voucher_id: string | null
        }
        Insert: {
          amount_cents: number
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          discount_cents?: number | null
          final_amount_cents?: number | null
          gateway_payment_id?: string | null
          id?: string
          mercadopago_payment_id?: string | null
          mercadopago_status?: string | null
          paid_at?: string | null
          payment_method?: string | null
          status: string
          subscription_id?: string | null
          user_id: string
          voucher_id?: string | null
        }
        Update: {
          amount_cents?: number
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          discount_cents?: number | null
          final_amount_cents?: number | null
          gateway_payment_id?: string | null
          id?: string
          mercadopago_payment_id?: string | null
          mercadopago_status?: string | null
          paid_at?: string | null
          payment_method?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_prices: {
        Row: {
          auto_renew: boolean
          badge_text: string | null
          campaign_notes: string | null
          created_at: string
          currency: string
          id: string
          is_campaign: boolean
          mode: string
          mp_checkout_url: string | null
          mp_preapproval_plan_id: string | null
          period: string
          plan_id: string
          price_cents: number
          recurring: boolean
          sort_order: number
          updated_at: string
          visible: boolean
        }
        Insert: {
          auto_renew?: boolean
          badge_text?: string | null
          campaign_notes?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_campaign?: boolean
          mode: string
          mp_checkout_url?: string | null
          mp_preapproval_plan_id?: string | null
          period: string
          plan_id: string
          price_cents: number
          recurring?: boolean
          sort_order?: number
          updated_at?: string
          visible?: boolean
        }
        Update: {
          auto_renew?: boolean
          badge_text?: string | null
          campaign_notes?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_campaign?: boolean
          mode?: string
          mp_checkout_url?: string | null
          mp_preapproval_plan_id?: string | null
          period?: string
          plan_id?: string
          price_cents?: number
          recurring?: boolean
          sort_order?: number
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "plan_prices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_prices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "public_plans_v1"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      plan_settings: {
        Row: {
          enable_annual_campaign: boolean
          key: string
          updated_at: string
        }
        Insert: {
          enable_annual_campaign?: boolean
          key?: string
          updated_at?: string
        }
        Update: {
          enable_annual_campaign?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string | null
          features: Json
          id: string
          max_sales: number | null
          min_sales: number | null
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          max_sales?: number | null
          min_sales?: number | null
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          max_sales?: number | null
          min_sales?: number | null
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      plans_v2: {
        Row: {
          badge_text: string | null
          billing_period: string
          created_at: string
          description_long: string | null
          description_short: string | null
          display_order: number
          features: Json
          id: string
          is_active: boolean
          is_featured: boolean
          limits_json: Json
          name: string
          plan_type: string
          price_cents: number
          requires_ml_owner: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          badge_text?: string | null
          billing_period?: string
          created_at?: string
          description_long?: string | null
          description_short?: string | null
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean
          limits_json?: Json
          name: string
          plan_type?: string
          price_cents?: number
          requires_ml_owner?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          badge_text?: string | null
          billing_period?: string
          created_at?: string
          description_long?: string | null
          description_short?: string | null
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean
          limits_json?: Json
          name?: string
          plan_type?: string
          price_cents?: number
          requires_ml_owner?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      post_sale_automation_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          require_approval: boolean
          seller_id: string
          template_id: string
          updated_at: string
          user_id: string
          wait_for_buyer_response: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          require_approval?: boolean
          seller_id: string
          template_id: string
          updated_at?: string
          user_id: string
          wait_for_buyer_response?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          require_approval?: boolean
          seller_id?: string
          template_id?: string
          updated_at?: string
          user_id?: string
          wait_for_buyer_response?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "post_sale_automation_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "post_sale_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      post_sale_blocked_patterns: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          pattern: string
          pattern_type: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          pattern: string
          pattern_type?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          pattern?: string
          pattern_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      post_sale_conversation_messages: {
        Row: {
          attachments: Json | null
          conversation_id: string
          created_at: string
          from_type: string
          from_user_id: string
          has_attachments: boolean | null
          id: string
          message_date: string
          message_status: string | null
          message_text: string | null
          ml_message_id: string | null
          moderation_reason: string | null
          moderation_status: string | null
          read_at: string | null
        }
        Insert: {
          attachments?: Json | null
          conversation_id: string
          created_at?: string
          from_type: string
          from_user_id: string
          has_attachments?: boolean | null
          id?: string
          message_date: string
          message_status?: string | null
          message_text?: string | null
          ml_message_id?: string | null
          moderation_reason?: string | null
          moderation_status?: string | null
          read_at?: string | null
        }
        Update: {
          attachments?: Json | null
          conversation_id?: string
          created_at?: string
          from_type?: string
          from_user_id?: string
          has_attachments?: boolean | null
          id?: string
          message_date?: string
          message_status?: string | null
          message_text?: string | null
          ml_message_id?: string | null
          moderation_reason?: string | null
          moderation_status?: string | null
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_sale_conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "post_sale_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      post_sale_conversations: {
        Row: {
          buyer_id: string
          buyer_name: string | null
          conversation_status: string
          created_at: string
          id: string
          item_thumbnail: string | null
          item_title: string | null
          last_message_date: string | null
          last_message_from: string | null
          last_message_text: string | null
          order_id: string
          pack_id: string | null
          seller_id: string
          seller_max_chars: number | null
          shipment_id: string | null
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          buyer_id: string
          buyer_name?: string | null
          conversation_status?: string
          created_at?: string
          id?: string
          item_thumbnail?: string | null
          item_title?: string | null
          last_message_date?: string | null
          last_message_from?: string | null
          last_message_text?: string | null
          order_id: string
          pack_id?: string | null
          seller_id: string
          seller_max_chars?: number | null
          shipment_id?: string | null
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          buyer_id?: string
          buyer_name?: string | null
          conversation_status?: string
          created_at?: string
          id?: string
          item_thumbnail?: string | null
          item_title?: string | null
          last_message_date?: string | null
          last_message_from?: string | null
          last_message_text?: string | null
          order_id?: string
          pack_id?: string | null
          seller_id?: string
          seller_max_chars?: number | null
          shipment_id?: string | null
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      post_sale_messages: {
        Row: {
          block_details: Json | null
          block_reason: string | null
          buyer_id: string | null
          buyer_name: string | null
          content_sent: string
          created_at: string
          id: string
          is_visible: boolean
          listing_id: string | null
          listing_title: string | null
          message_type: Database["public"]["Enums"]["post_sale_message_type"]
          ml_message_id: string | null
          order_id: string
          pack_id: string | null
          seller_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["post_sale_message_status"]
          suggested_fix: string | null
          template_id: string | null
          trigger_event: Database["public"]["Enums"]["post_sale_trigger_event"]
          user_id: string
        }
        Insert: {
          block_details?: Json | null
          block_reason?: string | null
          buyer_id?: string | null
          buyer_name?: string | null
          content_sent: string
          created_at?: string
          id?: string
          is_visible?: boolean
          listing_id?: string | null
          listing_title?: string | null
          message_type: Database["public"]["Enums"]["post_sale_message_type"]
          ml_message_id?: string | null
          order_id: string
          pack_id?: string | null
          seller_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["post_sale_message_status"]
          suggested_fix?: string | null
          template_id?: string | null
          trigger_event: Database["public"]["Enums"]["post_sale_trigger_event"]
          user_id: string
        }
        Update: {
          block_details?: Json | null
          block_reason?: string | null
          buyer_id?: string | null
          buyer_name?: string | null
          content_sent?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          listing_id?: string | null
          listing_title?: string | null
          message_type?: Database["public"]["Enums"]["post_sale_message_type"]
          ml_message_id?: string | null
          order_id?: string
          pack_id?: string | null
          seller_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["post_sale_message_status"]
          suggested_fix?: string | null
          template_id?: string | null
          trigger_event?: Database["public"]["Enums"]["post_sale_trigger_event"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_sale_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "post_sale_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      post_sale_messages_sync_state: {
        Row: {
          created_at: string
          cursor_created_at_meli: string | null
          cursor_offset: number | null
          cursor_order_id: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_heartbeat_at: string | null
          last_success_at: string | null
          processed_orders: number | null
          seller_id: string
          status: string
          synced_conversations: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cursor_created_at_meli?: string | null
          cursor_offset?: number | null
          cursor_order_id?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_heartbeat_at?: string | null
          last_success_at?: string | null
          processed_orders?: number | null
          seller_id: string
          status?: string
          synced_conversations?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cursor_created_at_meli?: string | null
          cursor_offset?: number | null
          cursor_order_id?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_heartbeat_at?: string | null
          last_success_at?: string | null
          processed_orders?: number | null
          seller_id?: string
          status?: string
          synced_conversations?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      post_sale_template_scopes: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          scope_type: string
          scope_value: string | null
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          scope_type: string
          scope_value?: string | null
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          scope_type?: string
          scope_value?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_sale_template_scopes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "post_sale_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      post_sale_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          is_active: boolean
          logistics_profile:
            | Database["public"]["Enums"]["post_sale_logistics_profile"]
            | null
          max_characters: number | null
          message_type: Database["public"]["Enums"]["post_sale_message_type"]
          name: string
          seller_id: string
          trigger_event: Database["public"]["Enums"]["post_sale_trigger_event"]
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          logistics_profile?:
            | Database["public"]["Enums"]["post_sale_logistics_profile"]
            | null
          max_characters?: number | null
          message_type: Database["public"]["Enums"]["post_sale_message_type"]
          name: string
          seller_id: string
          trigger_event: Database["public"]["Enums"]["post_sale_trigger_event"]
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          logistics_profile?:
            | Database["public"]["Enums"]["post_sale_logistics_profile"]
            | null
          max_characters?: number | null
          message_type?: Database["public"]["Enums"]["post_sale_message_type"]
          name?: string
          seller_id?: string
          trigger_event?: Database["public"]["Enums"]["post_sale_trigger_event"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      price_adjustment_logs: {
        Row: {
          arredondamento: string | null
          created_at: string
          empresa_id: string | null
          id: string
          item_id: string
          modo: string
          percentual: number | null
          possui_pxq: boolean | null
          possui_variacao: boolean | null
          preco_antigo: number | null
          preco_novo: number | null
          request_payload: Json | null
          response_body: Json | null
          response_status: number | null
          seller_id: string
          tipo_ajuste: string
          titulo: string | null
          user_id: string
        }
        Insert: {
          arredondamento?: string | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          item_id: string
          modo: string
          percentual?: number | null
          possui_pxq?: boolean | null
          possui_variacao?: boolean | null
          preco_antigo?: number | null
          preco_novo?: number | null
          request_payload?: Json | null
          response_body?: Json | null
          response_status?: number | null
          seller_id: string
          tipo_ajuste: string
          titulo?: string | null
          user_id: string
        }
        Update: {
          arredondamento?: string | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          item_id?: string
          modo?: string
          percentual?: number | null
          possui_pxq?: boolean | null
          possui_variacao?: boolean | null
          preco_antigo?: number | null
          preco_novo?: number | null
          request_payload?: Json | null
          response_body?: Json | null
          response_status?: number | null
          seller_id?: string
          tipo_ajuste?: string
          titulo?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_adjustment_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_simulation_events: {
        Row: {
          actor_user_id: string
          created_at: string
          event_payload: Json | null
          event_type: Database["public"]["Enums"]["pricing_event_type"]
          id: string
          margin_at_event: number | null
          profit_at_event: number | null
          simulation_id: string
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          event_payload?: Json | null
          event_type: Database["public"]["Enums"]["pricing_event_type"]
          id?: string
          margin_at_event?: number | null
          profit_at_event?: number | null
          simulation_id: string
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          event_payload?: Json | null
          event_type?: Database["public"]["Enums"]["pricing_event_type"]
          id?: string
          margin_at_event?: number | null
          profit_at_event?: number | null
          simulation_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_simulation_events_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "pricing_simulations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_simulation_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_simulation_inputs: {
        Row: {
          channel_params: Json | null
          cost_extra: number
          cost_packaging: number
          cost_product: number
          cost_source: string | null
          created_at: string
          dimensions_source: string | null
          discount_percent: number
          discount_value: number
          fee_fixed: number
          fee_mode: string
          fee_percent: number
          fee_ruleset_id: string | null
          freight_profile: string | null
          freight_ruleset_id: string | null
          height_cm: number | null
          id: string
          length_cm: number | null
          listing_type: string
          logistic_type: string | null
          shipping_charged_to_customer: number
          shipping_cost_estimated: number
          shipping_mode: string
          simulation_id: string
          tax_mode: string
          tax_percent: number
          version: number
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          channel_params?: Json | null
          cost_extra?: number
          cost_packaging?: number
          cost_product?: number
          cost_source?: string | null
          created_at?: string
          dimensions_source?: string | null
          discount_percent?: number
          discount_value?: number
          fee_fixed?: number
          fee_mode?: string
          fee_percent?: number
          fee_ruleset_id?: string | null
          freight_profile?: string | null
          freight_ruleset_id?: string | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          listing_type?: string
          logistic_type?: string | null
          shipping_charged_to_customer?: number
          shipping_cost_estimated?: number
          shipping_mode?: string
          simulation_id: string
          tax_mode?: string
          tax_percent?: number
          version?: number
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          channel_params?: Json | null
          cost_extra?: number
          cost_packaging?: number
          cost_product?: number
          cost_source?: string | null
          created_at?: string
          dimensions_source?: string | null
          discount_percent?: number
          discount_value?: number
          fee_fixed?: number
          fee_mode?: string
          fee_percent?: number
          fee_ruleset_id?: string | null
          freight_profile?: string | null
          freight_ruleset_id?: string | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          listing_type?: string
          logistic_type?: string | null
          shipping_charged_to_customer?: number
          shipping_cost_estimated?: number
          shipping_mode?: string
          simulation_id?: string
          tax_mode?: string
          tax_percent?: number
          version?: number
          weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_simulation_inputs_freight_ruleset_id_fkey"
            columns: ["freight_ruleset_id"]
            isOneToOne: false
            referencedRelation: "freight_rulesets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_simulation_inputs_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "pricing_simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_simulation_results: {
        Row: {
          breakeven_price: number
          cost_breakdown: Json | null
          created_at: string
          fees_breakdown: Json | null
          flags: Json | null
          gross_revenue: number
          id: string
          inputs_id: string
          margin_after_shipping: number
          margin_percent: number
          marketplace_fees_total: number
          markup_percent: number
          min_price_for_target: number | null
          net_revenue: number
          profit_total: number
          profit_value: number
          simulation_id: string
          taxes_total: number
          total_cost: number
          validation_message: string | null
          validation_passed: boolean | null
          validation_rule_id: string | null
          version: number
        }
        Insert: {
          breakeven_price?: number
          cost_breakdown?: Json | null
          created_at?: string
          fees_breakdown?: Json | null
          flags?: Json | null
          gross_revenue?: number
          id?: string
          inputs_id: string
          margin_after_shipping?: number
          margin_percent?: number
          marketplace_fees_total?: number
          markup_percent?: number
          min_price_for_target?: number | null
          net_revenue?: number
          profit_total?: number
          profit_value?: number
          simulation_id: string
          taxes_total?: number
          total_cost?: number
          validation_message?: string | null
          validation_passed?: boolean | null
          validation_rule_id?: string | null
          version?: number
        }
        Update: {
          breakeven_price?: number
          cost_breakdown?: Json | null
          created_at?: string
          fees_breakdown?: Json | null
          flags?: Json | null
          gross_revenue?: number
          id?: string
          inputs_id?: string
          margin_after_shipping?: number
          margin_percent?: number
          marketplace_fees_total?: number
          markup_percent?: number
          min_price_for_target?: number | null
          net_revenue?: number
          profit_total?: number
          profit_value?: number
          simulation_id?: string
          taxes_total?: number
          total_cost?: number
          validation_message?: string | null
          validation_passed?: boolean | null
          validation_rule_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_simulation_results_inputs_id_fkey"
            columns: ["inputs_id"]
            isOneToOne: false
            referencedRelation: "pricing_simulation_inputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_simulation_results_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "pricing_simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_simulations: {
        Row: {
          created_at: string
          created_by_user_id: string
          currency: string
          id: string
          marketplace: string
          notes: string | null
          product_key: string | null
          product_ref_id: string | null
          product_ref_type: Database["public"]["Enums"]["pricing_product_ref_type"]
          quantity: number
          sale_price: number | null
          status: Database["public"]["Enums"]["pricing_simulation_status"]
          target_margin: number | null
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          currency?: string
          id?: string
          marketplace?: string
          notes?: string | null
          product_key?: string | null
          product_ref_id?: string | null
          product_ref_type?: Database["public"]["Enums"]["pricing_product_ref_type"]
          quantity?: number
          sale_price?: number | null
          status?: Database["public"]["Enums"]["pricing_simulation_status"]
          target_margin?: number | null
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          currency?: string
          id?: string
          marketplace?: string
          notes?: string | null
          product_key?: string | null
          product_ref_id?: string | null
          product_ref_type?: Database["public"]["Enums"]["pricing_product_ref_type"]
          quantity?: number
          sale_price?: number | null
          status?: Database["public"]["Enums"]["pricing_simulation_status"]
          target_margin?: number | null
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_simulations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_validation_rules: {
        Row: {
          allow_negative_margin: boolean
          allow_zero_cost: boolean
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          marketplace: string | null
          min_margin_percent: number
          min_profit_value: number | null
          name: string
          priority: number
          require_dimensions: boolean
          scope: string
          updated_at: string
          warning_margin_percent: number
          workspace_id: string
        }
        Insert: {
          allow_negative_margin?: boolean
          allow_zero_cost?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          marketplace?: string | null
          min_margin_percent?: number
          min_profit_value?: number | null
          name: string
          priority?: number
          require_dimensions?: boolean
          scope?: string
          updated_at?: string
          warning_margin_percent?: number
          workspace_id: string
        }
        Update: {
          allow_negative_margin?: boolean
          allow_zero_cost?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          marketplace?: string | null
          min_margin_percent?: number
          min_profit_value?: number | null
          name?: string
          priority?: number
          require_dimensions?: boolean
          scope?: string
          updated_at?: string
          warning_margin_percent?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_validation_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      product_assets: {
        Row: {
          asset_type: string | null
          created_at: string | null
          file_size: number | null
          hash: string | null
          height: number | null
          id: string
          is_cover: boolean | null
          ml_picture_id: string | null
          product_record_id: string
          sort_order: number | null
          source: string | null
          source_url: string | null
          storage_url: string | null
          variant_id: string | null
          width: number | null
        }
        Insert: {
          asset_type?: string | null
          created_at?: string | null
          file_size?: number | null
          hash?: string | null
          height?: number | null
          id?: string
          is_cover?: boolean | null
          ml_picture_id?: string | null
          product_record_id: string
          sort_order?: number | null
          source?: string | null
          source_url?: string | null
          storage_url?: string | null
          variant_id?: string | null
          width?: number | null
        }
        Update: {
          asset_type?: string | null
          created_at?: string | null
          file_size?: number | null
          hash?: string | null
          height?: number | null
          id?: string
          is_cover?: boolean | null
          ml_picture_id?: string | null
          product_record_id?: string
          sort_order?: number | null
          source?: string | null
          source_url?: string | null
          storage_url?: string | null
          variant_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_assets_product_record_id_fkey"
            columns: ["product_record_id"]
            isOneToOne: false
            referencedRelation: "product_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_assets_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribute_map: {
        Row: {
          attribute_id: string
          created_at: string | null
          filled_by: string | null
          id: string
          name: string | null
          product_record_id: string
          required_level: string | null
          unit: string | null
          updated_at: string | null
          validation_message: string | null
          validation_status: string | null
          value_id: string | null
          value_name: string | null
          value_struct: Json | null
        }
        Insert: {
          attribute_id: string
          created_at?: string | null
          filled_by?: string | null
          id?: string
          name?: string | null
          product_record_id: string
          required_level?: string | null
          unit?: string | null
          updated_at?: string | null
          validation_message?: string | null
          validation_status?: string | null
          value_id?: string | null
          value_name?: string | null
          value_struct?: Json | null
        }
        Update: {
          attribute_id?: string
          created_at?: string | null
          filled_by?: string | null
          id?: string
          name?: string | null
          product_record_id?: string
          required_level?: string | null
          unit?: string | null
          updated_at?: string | null
          validation_message?: string | null
          validation_status?: string | null
          value_id?: string | null
          value_name?: string | null
          value_struct?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_map_product_record_id_fkey"
            columns: ["product_record_id"]
            isOneToOne: false
            referencedRelation: "product_records"
            referencedColumns: ["id"]
          },
        ]
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
      product_packaging_link: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          packaging_id: string
          product_key: string
          seller_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          packaging_id: string
          product_key: string
          seller_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          packaging_id?: string
          product_key?: string
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_packaging_link_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_packaging_link_packaging_id_fkey"
            columns: ["packaging_id"]
            isOneToOne: false
            referencedRelation: "packaging_types"
            referencedColumns: ["id"]
          },
        ]
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
      product_records: {
        Row: {
          condition: string | null
          created_at: string | null
          created_by: string | null
          default_currency: string | null
          default_price: number | null
          description: string | null
          id: string
          listing_type_id: string | null
          name_internal: string
          published_at: string | null
          published_item_id: string | null
          source_learned_listing_id: string | null
          status: string | null
          target_category_id: string | null
          target_category_name: string | null
          target_site: string | null
          updated_at: string | null
          validation_issues: Json | null
          validation_score: number | null
          video_id: string | null
          warranty: string | null
          workspace_id: string
        }
        Insert: {
          condition?: string | null
          created_at?: string | null
          created_by?: string | null
          default_currency?: string | null
          default_price?: number | null
          description?: string | null
          id?: string
          listing_type_id?: string | null
          name_internal: string
          published_at?: string | null
          published_item_id?: string | null
          source_learned_listing_id?: string | null
          status?: string | null
          target_category_id?: string | null
          target_category_name?: string | null
          target_site?: string | null
          updated_at?: string | null
          validation_issues?: Json | null
          validation_score?: number | null
          video_id?: string | null
          warranty?: string | null
          workspace_id: string
        }
        Update: {
          condition?: string | null
          created_at?: string | null
          created_by?: string | null
          default_currency?: string | null
          default_price?: number | null
          description?: string | null
          id?: string
          listing_type_id?: string | null
          name_internal?: string
          published_at?: string | null
          published_item_id?: string | null
          source_learned_listing_id?: string | null
          status?: string | null
          target_category_id?: string | null
          target_category_name?: string | null
          target_site?: string | null
          updated_at?: string | null
          validation_issues?: Json | null
          validation_score?: number | null
          video_id?: string | null
          warranty?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_records_source_learned_listing_id_fkey"
            columns: ["source_learned_listing_id"]
            isOneToOne: false
            referencedRelation: "learned_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          available_quantity: number | null
          created_at: string | null
          gtin: string | null
          id: string
          picture_ids: Json | null
          price: number | null
          product_record_id: string
          seller_custom_field: string | null
          sku_internal: string | null
          source_variation_id: string | null
          status: string | null
          updated_at: string | null
          variant_attributes: Json | null
        }
        Insert: {
          available_quantity?: number | null
          created_at?: string | null
          gtin?: string | null
          id?: string
          picture_ids?: Json | null
          price?: number | null
          product_record_id: string
          seller_custom_field?: string | null
          sku_internal?: string | null
          source_variation_id?: string | null
          status?: string | null
          updated_at?: string | null
          variant_attributes?: Json | null
        }
        Update: {
          available_quantity?: number | null
          created_at?: string | null
          gtin?: string | null
          id?: string
          picture_ids?: Json | null
          price?: number | null
          product_record_id?: string
          seller_custom_field?: string | null
          sku_internal?: string | null
          source_variation_id?: string | null
          status?: string | null
          updated_at?: string | null
          variant_attributes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_record_id_fkey"
            columns: ["product_record_id"]
            isOneToOne: false
            referencedRelation: "product_records"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_permissions: {
        Row: {
          allowed: boolean
          created_at: string
          feature_id: string
          id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          feature_id: string
          id?: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          feature_id?: string
          id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_permissions_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "system_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_cep: string | null
          address_city: string | null
          address_complement: string | null
          address_district: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          company_name: string | null
          cpf: string | null
          created_at: string
          email: string | null
          email_verified: boolean | null
          full_name: string
          id: string
          instagram_url: string | null
          linkedin_url: string | null
          other_url: string | null
          photo_url: string | null
          updated_at: string
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          company_name?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          email_verified?: boolean | null
          full_name: string
          id: string
          instagram_url?: string | null
          linkedin_url?: string | null
          other_url?: string | null
          photo_url?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          company_name?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          email_verified?: boolean | null
          full_name?: string
          id?: string
          instagram_url?: string | null
          linkedin_url?: string | null
          other_url?: string | null
          photo_url?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      promotion_agent_config: {
        Row: {
          accept_unknown_type: boolean
          accepted_types: string[]
          allow_when_margin_unknown: boolean
          created_at: string
          exclude_items: string[]
          id: string
          is_enabled: boolean
          max_seller_discount: number
          min_margin: number | null
          min_stock: number
          min_total_discount: number | null
          require_copart: boolean
          scope_categories: string[]
          scope_items: string[]
          scope_type: string
          seller_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accept_unknown_type?: boolean
          accepted_types?: string[]
          allow_when_margin_unknown?: boolean
          created_at?: string
          exclude_items?: string[]
          id?: string
          is_enabled?: boolean
          max_seller_discount?: number
          min_margin?: number | null
          min_stock?: number
          min_total_discount?: number | null
          require_copart?: boolean
          scope_categories?: string[]
          scope_items?: string[]
          scope_type?: string
          seller_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accept_unknown_type?: boolean
          accepted_types?: string[]
          allow_when_margin_unknown?: boolean
          created_at?: string
          exclude_items?: string[]
          id?: string
          is_enabled?: boolean
          max_seller_discount?: number
          min_margin?: number | null
          min_stock?: number
          min_total_discount?: number | null
          require_copart?: boolean
          scope_categories?: string[]
          scope_items?: string[]
          scope_type?: string
          seller_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_agent_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_agent_logs: {
        Row: {
          details: Json
          executed_at: string
          id: string
          items_adhered: number
          items_failed: number
          items_skipped: number
          promotions_affected: number
          run_id: string
          seller_id: string
          triggered_by: string
          workspace_id: string
        }
        Insert: {
          details?: Json
          executed_at?: string
          id?: string
          items_adhered?: number
          items_failed?: number
          items_skipped?: number
          promotions_affected?: number
          run_id: string
          seller_id: string
          triggered_by?: string
          workspace_id: string
        }
        Update: {
          details?: Json
          executed_at?: string
          id?: string
          items_adhered?: number
          items_failed?: number
          items_skipped?: number
          promotions_affected?: number
          run_id?: string
          seller_id?: string
          triggered_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_agent_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_items_snapshots: {
        Row: {
          account_id: string | null
          created_at: string
          discount_percent: number | null
          effective_price: number | null
          error_reason: string | null
          id: string
          item_id: string
          item_status: string
          max_discounted_price: number | null
          min_discounted_price: number | null
          net_proceeds_amount: number | null
          net_proceeds_currency: string | null
          original_price: number | null
          promo_price: number | null
          promotion_id: string
          raw_item_data: Json | null
          seller_id: string | null
          suggested_price: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          discount_percent?: number | null
          effective_price?: number | null
          error_reason?: string | null
          id?: string
          item_id: string
          item_status?: string
          max_discounted_price?: number | null
          min_discounted_price?: number | null
          net_proceeds_amount?: number | null
          net_proceeds_currency?: string | null
          original_price?: number | null
          promo_price?: number | null
          promotion_id: string
          raw_item_data?: Json | null
          seller_id?: string | null
          suggested_price?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          discount_percent?: number | null
          effective_price?: number | null
          error_reason?: string | null
          id?: string
          item_id?: string
          item_status?: string
          max_discounted_price?: number | null
          min_discounted_price?: number | null
          net_proceeds_amount?: number | null
          net_proceeds_currency?: string | null
          original_price?: number | null
          promo_price?: number | null
          promotion_id?: string
          raw_item_data?: Json | null
          seller_id?: string | null
          suggested_price?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_items_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_snapshots: {
        Row: {
          account_id: string | null
          created_at: string
          end_at: string | null
          id: string
          items_count: number | null
          promotion_id: string
          promotion_name: string | null
          promotion_type: string
          raw_data: Json | null
          seller_id: string | null
          start_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          end_at?: string | null
          id?: string
          items_count?: number | null
          promotion_id: string
          promotion_name?: string | null
          promotion_type: string
          raw_data?: Json | null
          seller_id?: string | null
          start_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          end_at?: string | null
          id?: string
          items_count?: number | null
          promotion_id?: string
          promotion_name?: string | null
          promotion_type?: string
          raw_data?: Json | null
          seller_id?: string | null
          start_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_sync_logs: {
        Row: {
          account_id: string
          created_at: string
          duration_ms: number | null
          ended_at: string | null
          error_details: Json | null
          error_message: string | null
          events_created: number | null
          id: string
          items_synced: number | null
          promotions_fetched: number | null
          promotions_synced: number | null
          started_at: string
          status: string
          sync_source: string | null
          workspace_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          duration_ms?: number | null
          ended_at?: string | null
          error_details?: Json | null
          error_message?: string | null
          events_created?: number | null
          id?: string
          items_synced?: number | null
          promotions_fetched?: number | null
          promotions_synced?: number | null
          started_at?: string
          status?: string
          sync_source?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          duration_ms?: number | null
          ended_at?: string | null
          error_details?: Json | null
          error_message?: string | null
          events_created?: number | null
          id?: string
          items_synced?: number | null
          promotions_fetched?: number | null
          promotions_synced?: number | null
          started_at?: string
          status?: string
          sync_source?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_sync_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      public_categories: {
        Row: {
          children_count: number | null
          collect_subcategories: boolean | null
          created_at: string | null
          depth: number | null
          id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          path: string[] | null
          priority: number | null
        }
        Insert: {
          children_count?: number | null
          collect_subcategories?: boolean | null
          created_at?: string | null
          depth?: number | null
          id: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          path?: string[] | null
          priority?: number | null
        }
        Update: {
          children_count?: number | null
          collect_subcategories?: boolean | null
          created_at?: string | null
          depth?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          path?: string[] | null
          priority?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "public_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "public_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      public_testimonials: {
        Row: {
          candidate_id: string
          channels: string[]
          created_at: string | null
          display_company: string | null
          display_name: string | null
          id: string
          is_active: boolean | null
          photo_url: string | null
          published_at: string | null
          stars: number
          text: string
          user_id: string
        }
        Insert: {
          candidate_id: string
          channels?: string[]
          created_at?: string | null
          display_company?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          photo_url?: string | null
          published_at?: string | null
          stars: number
          text: string
          user_id: string
        }
        Update: {
          candidate_id?: string
          channels?: string[]
          created_at?: string | null
          display_company?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          photo_url?: string | null
          published_at?: string | null
          stars?: number
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_testimonials_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "testimonial_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      public_trends_status: {
        Row: {
          coverage_highlights: number | null
          coverage_keywords: number | null
          id: string
          last_failed_at: string | null
          last_partial_at: string | null
          last_run_at: string | null
          last_subcategory_sync_at: string | null
          last_success_at: string | null
          next_run_at: string | null
          subcategories_collected: number | null
          total_categories: number | null
          updated_at: string | null
        }
        Insert: {
          coverage_highlights?: number | null
          coverage_keywords?: number | null
          id?: string
          last_failed_at?: string | null
          last_partial_at?: string | null
          last_run_at?: string | null
          last_subcategory_sync_at?: string | null
          last_success_at?: string | null
          next_run_at?: string | null
          subcategories_collected?: number | null
          total_categories?: number | null
          updated_at?: string | null
        }
        Update: {
          coverage_highlights?: number | null
          coverage_keywords?: number | null
          id?: string
          last_failed_at?: string | null
          last_partial_at?: string | null
          last_run_at?: string | null
          last_subcategory_sync_at?: string | null
          last_success_at?: string | null
          next_run_at?: string | null
          subcategories_collected?: number | null
          total_categories?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      qa_audit_log: {
        Row: {
          action: string
          actor_id: string
          block_reasons: string[] | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          question_id: string | null
          question_text: string | null
          response_id: string | null
          response_source:
            | Database["public"]["Enums"]["qa_response_source"]
            | null
          response_text: string | null
          seller_id: string
          user_agent: string | null
          user_id: string
          validation_result: Json | null
        }
        Insert: {
          action: string
          actor_id: string
          block_reasons?: string[] | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          question_id?: string | null
          question_text?: string | null
          response_id?: string | null
          response_source?:
            | Database["public"]["Enums"]["qa_response_source"]
            | null
          response_text?: string | null
          seller_id: string
          user_agent?: string | null
          user_id: string
          validation_result?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string
          block_reasons?: string[] | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          question_id?: string | null
          question_text?: string | null
          response_id?: string | null
          response_source?:
            | Database["public"]["Enums"]["qa_response_source"]
            | null
          response_text?: string | null
          seller_id?: string
          user_agent?: string | null
          user_id?: string
          validation_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_audit_log_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "qa_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_audit_log_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "qa_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_daily_metrics: {
        Row: {
          avg_response_time_minutes: number | null
          created_at: string
          id: string
          metric_date: string
          questions_answered: number | null
          questions_blocked: number | null
          questions_pending: number | null
          questions_received: number | null
          responses_from_ai: number | null
          responses_from_library: number | null
          responses_manual: number | null
          seller_id: string
          sla_breaches: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_response_time_minutes?: number | null
          created_at?: string
          id?: string
          metric_date: string
          questions_answered?: number | null
          questions_blocked?: number | null
          questions_pending?: number | null
          questions_received?: number | null
          responses_from_ai?: number | null
          responses_from_library?: number | null
          responses_manual?: number | null
          seller_id: string
          sla_breaches?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_response_time_minutes?: number | null
          created_at?: string
          id?: string
          metric_date?: string
          questions_answered?: number | null
          questions_blocked?: number | null
          questions_pending?: number | null
          questions_received?: number | null
          responses_from_ai?: number | null
          responses_from_library?: number | null
          responses_manual?: number | null
          seller_id?: string
          sla_breaches?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      qa_questions: {
        Row: {
          answered_at: string | null
          category: string | null
          created_at: string
          id: string
          is_sla_breached: boolean | null
          is_snoozed: boolean | null
          item_sku: string | null
          item_thumbnail: string | null
          item_title: string | null
          item_variation: string | null
          ml_buyer_id: string | null
          ml_item_id: string
          ml_question_id: string
          needs_attention: boolean | null
          question_date: string
          question_text: string
          risk_level: Database["public"]["Enums"]["qa_risk_level"] | null
          risk_reasons: string[] | null
          seller_id: string
          sla_deadline: string | null
          snooze_until: string | null
          status: Database["public"]["Enums"]["qa_question_status"] | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          answered_at?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_sla_breached?: boolean | null
          is_snoozed?: boolean | null
          item_sku?: string | null
          item_thumbnail?: string | null
          item_title?: string | null
          item_variation?: string | null
          ml_buyer_id?: string | null
          ml_item_id: string
          ml_question_id: string
          needs_attention?: boolean | null
          question_date: string
          question_text: string
          risk_level?: Database["public"]["Enums"]["qa_risk_level"] | null
          risk_reasons?: string[] | null
          seller_id: string
          sla_deadline?: string | null
          snooze_until?: string | null
          status?: Database["public"]["Enums"]["qa_question_status"] | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          answered_at?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_sla_breached?: boolean | null
          is_snoozed?: boolean | null
          item_sku?: string | null
          item_thumbnail?: string | null
          item_title?: string | null
          item_variation?: string | null
          ml_buyer_id?: string | null
          ml_item_id?: string
          ml_question_id?: string
          needs_attention?: boolean | null
          question_date?: string
          question_text?: string
          risk_level?: Database["public"]["Enums"]["qa_risk_level"] | null
          risk_reasons?: string[] | null
          seller_id?: string
          sla_deadline?: string | null
          snooze_until?: string | null
          status?: Database["public"]["Enums"]["qa_question_status"] | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_questions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_response_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          seller_id: string
          sort_order: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          seller_id: string
          sort_order?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          seller_id?: string
          sort_order?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      qa_response_library: {
        Row: {
          category_id: string | null
          content: string
          created_at: string
          id: string
          is_active: boolean | null
          is_approved: boolean | null
          name: string
          seller_id: string
          shortcut: string | null
          tags: string[] | null
          updated_at: string
          usage_count: number | null
          use_greeting: boolean
          use_signature: boolean
          user_id: string
        }
        Insert: {
          category_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          name: string
          seller_id: string
          shortcut?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number | null
          use_greeting?: boolean
          use_signature?: boolean
          user_id: string
        }
        Update: {
          category_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          name?: string
          seller_id?: string
          shortcut?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number | null
          use_greeting?: boolean
          use_signature?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_response_library_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "qa_response_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_responses: {
        Row: {
          ai_model: string | null
          ai_original_text: string | null
          created_at: string
          id: string
          is_draft: boolean | null
          is_sent: boolean | null
          library_response_id: string | null
          ml_response_id: string | null
          question_id: string
          response_text: string
          retry_count: number | null
          seller_id: string
          send_error: string | null
          sent_at: string | null
          source: Database["public"]["Enums"]["qa_response_source"]
          updated_at: string
          user_id: string
          validation_errors: string[] | null
          validation_passed: boolean | null
        }
        Insert: {
          ai_model?: string | null
          ai_original_text?: string | null
          created_at?: string
          id?: string
          is_draft?: boolean | null
          is_sent?: boolean | null
          library_response_id?: string | null
          ml_response_id?: string | null
          question_id: string
          response_text: string
          retry_count?: number | null
          seller_id: string
          send_error?: string | null
          sent_at?: string | null
          source: Database["public"]["Enums"]["qa_response_source"]
          updated_at?: string
          user_id: string
          validation_errors?: string[] | null
          validation_passed?: boolean | null
        }
        Update: {
          ai_model?: string | null
          ai_original_text?: string | null
          created_at?: string
          id?: string
          is_draft?: boolean | null
          is_sent?: boolean | null
          library_response_id?: string | null
          ml_response_id?: string | null
          question_id?: string
          response_text?: string
          retry_count?: number | null
          seller_id?: string
          send_error?: string | null
          sent_at?: string | null
          source?: Database["public"]["Enums"]["qa_response_source"]
          updated_at?: string
          user_id?: string
          validation_errors?: string[] | null
          validation_passed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_responses_library_response_id_fkey"
            columns: ["library_response_id"]
            isOneToOne: false
            referencedRelation: "qa_response_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "qa_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_settings: {
        Row: {
          created_at: string
          greeting_enabled: boolean
          greeting_template: string
          id: string
          seller_id: string
          signature_enabled: boolean
          signature_template: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          greeting_enabled?: boolean
          greeting_template?: string
          id?: string
          seller_id: string
          signature_enabled?: boolean
          signature_template?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          greeting_enabled?: boolean
          greeting_template?: string
          id?: string
          seller_id?: string
          signature_enabled?: boolean
          signature_template?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quick_sync_state: {
        Row: {
          changes_found: number | null
          company_id: string
          cooldown_until: string | null
          created_at: string
          id: string
          is_running: boolean
          last_error: string | null
          last_run_at: string | null
          last_run_duration_ms: number | null
          orders_checked: number | null
          seller_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          changes_found?: number | null
          company_id: string
          cooldown_until?: string | null
          created_at?: string
          id?: string
          is_running?: boolean
          last_error?: string | null
          last_run_at?: string | null
          last_run_duration_ms?: number | null
          orders_checked?: number | null
          seller_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          changes_found?: number | null
          company_id?: string
          cooldown_until?: string | null
          created_at?: string
          id?: string
          is_running?: boolean
          last_error?: string | null
          last_run_at?: string | null
          last_run_duration_ms?: number | null
          orders_checked?: number | null
          seller_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rating_consents: {
        Row: {
          accepted: boolean
          accepted_at: string
          consent_key: string
          consent_version: number
          created_at: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          source: string
          template_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted: boolean
          accepted_at?: string
          consent_key: string
          consent_version: number
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          source: string
          template_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted?: boolean
          accepted_at?: string
          consent_key?: string
          consent_version?: number
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          source?: string
          template_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rating_consents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "consent_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      retrospective_reports: {
        Row: {
          company_name: string | null
          created_at: string
          error_message: string | null
          id: string
          json_snapshot: Json
          logo_url: string | null
          pdf_url: string | null
          periodo_fim: string
          periodo_inicio: string
          seller_id: string
          status: string
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          json_snapshot?: Json
          logo_url?: string | null
          pdf_url?: string | null
          periodo_fim: string
          periodo_inicio: string
          seller_id: string
          status?: string
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          json_snapshot?: Json
          logo_url?: string | null
          pdf_url?: string | null
          periodo_fim?: string
          periodo_inicio?: string
          seller_id?: string
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_menu_permissions: {
        Row: {
          can_edit: boolean
          can_manage: boolean
          can_view: boolean
          created_at: string
          id: string
          menu_item_id: string
          role_id: string
        }
        Insert: {
          can_edit?: boolean
          can_manage?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          menu_item_id: string
          role_id: string
        }
        Update: {
          can_edit?: boolean
          can_manage?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          menu_item_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_menu_permissions_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "config_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_menu_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_company_snapshot: {
        Row: {
          acos_medio: number | null
          company_id: string
          created_at: string
          cutoff_coleta_time: string | null
          cutoff_flex_time: string | null
          estoque_critico: number | null
          etiquetas_pendentes: number | null
          faturamento_ads_semana: number | null
          gasto_ads_semana: number | null
          id: string
          mediacoes_abertas: number | null
          nf_pendentes: number | null
          pedidos_envio: number | null
          pedidos_semana: number | null
          perguntas_pendentes: number | null
          pos_venda_pendente: number | null
          produto_mais_vendido: string | null
          reclamacoes_abertas: number | null
          reclamacoes_aguardando: number | null
          roas_medio: number | null
          seller_id: string
          snapshot_error: string | null
          snapshot_status: string | null
          ticket_medio: number | null
          total_vendas_semana: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          acos_medio?: number | null
          company_id: string
          created_at?: string
          cutoff_coleta_time?: string | null
          cutoff_flex_time?: string | null
          estoque_critico?: number | null
          etiquetas_pendentes?: number | null
          faturamento_ads_semana?: number | null
          gasto_ads_semana?: number | null
          id?: string
          mediacoes_abertas?: number | null
          nf_pendentes?: number | null
          pedidos_envio?: number | null
          pedidos_semana?: number | null
          perguntas_pendentes?: number | null
          pos_venda_pendente?: number | null
          produto_mais_vendido?: string | null
          reclamacoes_abertas?: number | null
          reclamacoes_aguardando?: number | null
          roas_medio?: number | null
          seller_id: string
          snapshot_error?: string | null
          snapshot_status?: string | null
          ticket_medio?: number | null
          total_vendas_semana?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          acos_medio?: number | null
          company_id?: string
          created_at?: string
          cutoff_coleta_time?: string | null
          cutoff_flex_time?: string | null
          estoque_critico?: number | null
          etiquetas_pendentes?: number | null
          faturamento_ads_semana?: number | null
          gasto_ads_semana?: number | null
          id?: string
          mediacoes_abertas?: number | null
          nf_pendentes?: number | null
          pedidos_envio?: number | null
          pedidos_semana?: number | null
          perguntas_pendentes?: number | null
          pos_venda_pendente?: number | null
          produto_mais_vendido?: string | null
          reclamacoes_abertas?: number | null
          reclamacoes_aguardando?: number | null
          roas_medio?: number | null
          seller_id?: string
          snapshot_error?: string | null
          snapshot_status?: string | null
          ticket_medio?: number | null
          total_vendas_semana?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_company_snapshot_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_category_eligibility: {
        Row: {
          api_attempts_count: number
          block_reason: string | null
          blocked_until: string | null
          calculated_at: string
          category_id: string
          created_at: string
          eligibility_state: string
          expires_at: string
          id: string
          last_api_attempt_at: string | null
          last_error: string | null
          orders_count: number
          period_key: string
          revenue: number
          seller_id: string
          threshold_orders: number
          threshold_revenue: number
          units_sold: number
          updated_at: string
          user_id: string
        }
        Insert: {
          api_attempts_count?: number
          block_reason?: string | null
          blocked_until?: string | null
          calculated_at?: string
          category_id: string
          created_at?: string
          eligibility_state?: string
          expires_at?: string
          id?: string
          last_api_attempt_at?: string | null
          last_error?: string | null
          orders_count?: number
          period_key?: string
          revenue?: number
          seller_id: string
          threshold_orders?: number
          threshold_revenue?: number
          units_sold?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          api_attempts_count?: number
          block_reason?: string | null
          blocked_until?: string | null
          calculated_at?: string
          category_id?: string
          created_at?: string
          eligibility_state?: string
          expires_at?: string
          id?: string
          last_api_attempt_at?: string | null
          last_error?: string | null
          orders_count?: number
          period_key?: string
          revenue?: number
          seller_id?: string
          threshold_orders?: number
          threshold_revenue?: number
          units_sold?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seller_category_metrics: {
        Row: {
          avg_ticket: number | null
          calculated_at: string | null
          category_id: string
          created_at: string | null
          id: string
          items_count: number | null
          margin_percent: number | null
          orders_count: number | null
          period_key: string
          quantity_sold: number | null
          revenue: number | null
          seller_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avg_ticket?: number | null
          calculated_at?: string | null
          category_id: string
          created_at?: string | null
          id?: string
          items_count?: number | null
          margin_percent?: number | null
          orders_count?: number | null
          period_key: string
          quantity_sold?: number | null
          revenue?: number | null
          seller_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avg_ticket?: number | null
          calculated_at?: string | null
          category_id?: string
          created_at?: string | null
          id?: string
          items_count?: number | null
          margin_percent?: number | null
          orders_count?: number | null
          period_key?: string
          quantity_sold?: number | null
          revenue?: number | null
          seller_id?: string
          updated_at?: string | null
          user_id?: string
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
      seller_public_profile_settings: {
        Row: {
          display_company: string | null
          display_name: string | null
          id: string
          photo_url: string | null
          show_company: boolean | null
          show_name: boolean | null
          show_photo: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          display_company?: string | null
          display_name?: string | null
          id?: string
          photo_url?: string | null
          show_company?: boolean | null
          show_name?: boolean | null
          show_photo?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          display_company?: string | null
          display_name?: string | null
          id?: string
          photo_url?: string | null
          show_company?: boolean | null
          show_name?: boolean | null
          show_photo?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      seller_visual_preferences: {
        Row: {
          allow_category: boolean
          allow_seasonal: boolean
          created_at: string
          fixed_template_id: string | null
          mode: string
          preferred_intensity: number
          seller_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_category?: boolean
          allow_seasonal?: boolean
          created_at?: string
          fixed_template_id?: string | null
          mode?: string
          preferred_intensity?: number
          seller_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_category?: boolean
          allow_seasonal?: boolean
          created_at?: string
          fixed_template_id?: string | null
          mode?: string
          preferred_intensity?: number
          seller_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_visual_preferences_fixed_template_id_fkey"
            columns: ["fixed_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      send_aplus_candidates: {
        Row: {
          consecutive_periods: number | null
          created_at: string
          id: string
          is_promoted_to_aplus: boolean | null
          item_id: string
          item_title: string | null
          last_evaluated_at: string | null
          periods_in_curve_a: Json | null
          seller_id: string
          stability_score: number | null
          total_revenue: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          consecutive_periods?: number | null
          created_at?: string
          id?: string
          is_promoted_to_aplus?: boolean | null
          item_id: string
          item_title?: string | null
          last_evaluated_at?: string | null
          periods_in_curve_a?: Json | null
          seller_id: string
          stability_score?: number | null
          total_revenue?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          consecutive_periods?: number | null
          created_at?: string
          id?: string
          is_promoted_to_aplus?: boolean | null
          item_id?: string
          item_title?: string | null
          last_evaluated_at?: string | null
          periods_in_curve_a?: Json | null
          seller_id?: string
          stability_score?: number | null
          total_revenue?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      send_item_history: {
        Row: {
          event_data: Json | null
          event_type: string
          id: string
          item_id: string
          occurred_at: string
          seller_id: string
          user_id: string
        }
        Insert: {
          event_data?: Json | null
          event_type: string
          id?: string
          item_id: string
          occurred_at?: string
          seller_id: string
          user_id: string
        }
        Update: {
          event_data?: Json | null
          event_type?: string
          id?: string
          item_id?: string
          occurred_at?: string
          seller_id?: string
          user_id?: string
        }
        Relationships: []
      }
      send_metrics_snapshots: {
        Row: {
          avg_sales_interval_hours: number | null
          conversion_rate: number | null
          conversion_trend: number | null
          created_at: string
          growth_velocity: number | null
          id: string
          item_id: string
          maturity_score: number | null
          planted_item_id: string
          position_checked_at: string | null
          position_tier:
            | Database["public"]["Enums"]["send_position_tier"]
            | null
          sales_count_30d: number | null
          sales_count_7d: number | null
          sales_stability_score: number | null
          search_keyword: string | null
          seller_id: string
          snapshot_date: string
          user_id: string
          visit_trend: number | null
          visits_30d: number | null
          visits_7d: number | null
        }
        Insert: {
          avg_sales_interval_hours?: number | null
          conversion_rate?: number | null
          conversion_trend?: number | null
          created_at?: string
          growth_velocity?: number | null
          id?: string
          item_id: string
          maturity_score?: number | null
          planted_item_id: string
          position_checked_at?: string | null
          position_tier?:
            | Database["public"]["Enums"]["send_position_tier"]
            | null
          sales_count_30d?: number | null
          sales_count_7d?: number | null
          sales_stability_score?: number | null
          search_keyword?: string | null
          seller_id: string
          snapshot_date: string
          user_id: string
          visit_trend?: number | null
          visits_30d?: number | null
          visits_7d?: number | null
        }
        Update: {
          avg_sales_interval_hours?: number | null
          conversion_rate?: number | null
          conversion_trend?: number | null
          created_at?: string
          growth_velocity?: number | null
          id?: string
          item_id?: string
          maturity_score?: number | null
          planted_item_id?: string
          position_checked_at?: string | null
          position_tier?:
            | Database["public"]["Enums"]["send_position_tier"]
            | null
          sales_count_30d?: number | null
          sales_count_7d?: number | null
          sales_stability_score?: number | null
          search_keyword?: string | null
          seller_id?: string
          snapshot_date?: string
          user_id?: string
          visit_trend?: number | null
          visits_30d?: number | null
          visits_7d?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "send_metrics_snapshots_planted_item_id_fkey"
            columns: ["planted_item_id"]
            isOneToOne: false
            referencedRelation: "send_planted_items"
            referencedColumns: ["id"]
          },
        ]
      }
      send_planted_items: {
        Row: {
          abc_class: string | null
          created_at: string
          days_planted: number
          growth_stage: Database["public"]["Enums"]["send_growth_stage"]
          health_status: Database["public"]["Enums"]["send_health_status"]
          id: string
          is_a_plus: boolean | null
          item_id: string
          item_thumbnail: string | null
          item_title: string | null
          last_health_check_at: string | null
          last_metrics_at: string | null
          planted_at: string
          seller_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          abc_class?: string | null
          created_at?: string
          days_planted?: number
          growth_stage?: Database["public"]["Enums"]["send_growth_stage"]
          health_status?: Database["public"]["Enums"]["send_health_status"]
          id?: string
          is_a_plus?: boolean | null
          item_id: string
          item_thumbnail?: string | null
          item_title?: string | null
          last_health_check_at?: string | null
          last_metrics_at?: string | null
          planted_at?: string
          seller_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          abc_class?: string | null
          created_at?: string
          days_planted?: number
          growth_stage?: Database["public"]["Enums"]["send_growth_stage"]
          health_status?: Database["public"]["Enums"]["send_health_status"]
          id?: string
          is_a_plus?: boolean | null
          item_id?: string
          item_thumbnail?: string | null
          item_title?: string | null
          last_health_check_at?: string | null
          last_metrics_at?: string | null
          planted_at?: string
          seller_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      send_seed_balance: {
        Row: {
          created_at: string
          id: string
          plan_tier: string | null
          seeds_from_plan: number
          seeds_purchased: number
          seeds_used: number
          seller_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_tier?: string | null
          seeds_from_plan?: number
          seeds_purchased?: number
          seeds_used?: number
          seller_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_tier?: string | null
          seeds_from_plan?: number
          seeds_purchased?: number
          seeds_used?: number
          seller_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      send_seed_purchases: {
        Row: {
          amount_brl: number
          created_at: string
          expires_at: string | null
          id: string
          payment_id: string | null
          payment_method: string | null
          payment_status: string | null
          seeds_quantity: number
          seller_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_brl: number
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          seeds_quantity: number
          seller_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_brl?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          seeds_quantity?: number
          seller_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seo_page_settings: {
        Row: {
          canonical_url: string | null
          created_at: string
          evergreen_content: boolean | null
          id: string
          meta_description: string | null
          meta_keywords: string | null
          meta_title: string | null
          og_description: string | null
          og_image: string | null
          og_title: string | null
          page_path: string
          page_type: string
          primary_keyword: string | null
          robots_follow: boolean
          robots_index: boolean
          secondary_keywords: string | null
          seo_cluster: string | null
          seo_roadmap: string | null
          structured_data: Json | null
          suggested_update_date: string | null
          updated_at: string
        }
        Insert: {
          canonical_url?: string | null
          created_at?: string
          evergreen_content?: boolean | null
          id?: string
          meta_description?: string | null
          meta_keywords?: string | null
          meta_title?: string | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          page_path: string
          page_type?: string
          primary_keyword?: string | null
          robots_follow?: boolean
          robots_index?: boolean
          secondary_keywords?: string | null
          seo_cluster?: string | null
          seo_roadmap?: string | null
          structured_data?: Json | null
          suggested_update_date?: string | null
          updated_at?: string
        }
        Update: {
          canonical_url?: string | null
          created_at?: string
          evergreen_content?: boolean | null
          id?: string
          meta_description?: string | null
          meta_keywords?: string | null
          meta_title?: string | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          page_path?: string
          page_type?: string
          primary_keyword?: string | null
          robots_follow?: boolean
          robots_index?: boolean
          secondary_keywords?: string | null
          seo_cluster?: string | null
          seo_roadmap?: string | null
          structured_data?: Json | null
          suggested_update_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_invoice_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_data: Json | null
          event_type: string
          id: string
          queue_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          queue_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          queue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_invoice_events_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "service_invoice_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      service_invoice_queue: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string | null
          error_message: string | null
          id: string
          issued_at: string | null
          last_retry_at: string | null
          nfse_number: string | null
          nfse_protocol: string | null
          nfse_url: string | null
          retry_count: number | null
          service_code: string | null
          service_description: string | null
          service_order_id: string | null
          status: string
          updated_at: string
          valor_iss: number | null
          valor_servico: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          issued_at?: string | null
          last_retry_at?: string | null
          nfse_number?: string | null
          nfse_protocol?: string | null
          nfse_url?: string | null
          retry_count?: number | null
          service_code?: string | null
          service_description?: string | null
          service_order_id?: string | null
          status?: string
          updated_at?: string
          valor_iss?: number | null
          valor_servico?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          issued_at?: string | null
          last_retry_at?: string | null
          nfse_number?: string | null
          nfse_protocol?: string | null
          nfse_url?: string | null
          retry_count?: number | null
          service_code?: string | null
          service_description?: string | null
          service_order_id?: string | null
          status?: string
          updated_at?: string
          valor_iss?: number | null
          valor_servico?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_invoice_queue_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "service_order_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_invoice_queue_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_customers: {
        Row: {
          company_id: string
          created_at: string
          documento: string | null
          documento_tipo: string | null
          email: string | null
          endereco_bairro: string | null
          endereco_cep: string | null
          endereco_cidade: string | null
          endereco_complemento: string | null
          endereco_numero: string | null
          endereco_rua: string | null
          endereco_uf: string | null
          external_customer_id: string | null
          id: string
          is_complete: boolean | null
          missing_fields: string[] | null
          nome: string | null
          observacoes: string | null
          provider: string | null
          raw_data: Json | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          documento?: string | null
          documento_tipo?: string | null
          email?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_complemento?: string | null
          endereco_numero?: string | null
          endereco_rua?: string | null
          endereco_uf?: string | null
          external_customer_id?: string | null
          id?: string
          is_complete?: boolean | null
          missing_fields?: string[] | null
          nome?: string | null
          observacoes?: string | null
          provider?: string | null
          raw_data?: Json | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          documento?: string | null
          documento_tipo?: string | null
          email?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_complemento?: string | null
          endereco_numero?: string | null
          endereco_rua?: string | null
          endereco_uf?: string | null
          external_customer_id?: string | null
          id?: string
          is_complete?: boolean | null
          missing_fields?: string[] | null
          nome?: string | null
          observacoes?: string | null
          provider?: string | null
          raw_data?: Json | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_orders: {
        Row: {
          channel: string | null
          company_id: string
          created_at: string
          customer_id: string | null
          external_order_id: string
          external_order_number: string | null
          id: string
          integration_id: string | null
          nfse_error_message: string | null
          nfse_status: string | null
          order_date: string | null
          order_status: string | null
          provider: string
          raw_data: Json | null
          total_value: number | null
          updated_at: string
        }
        Insert: {
          channel?: string | null
          company_id: string
          created_at?: string
          customer_id?: string | null
          external_order_id: string
          external_order_number?: string | null
          id?: string
          integration_id?: string | null
          nfse_error_message?: string | null
          nfse_status?: string | null
          order_date?: string | null
          order_status?: string | null
          provider: string
          raw_data?: Json | null
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          channel?: string | null
          company_id?: string
          created_at?: string
          customer_id?: string | null
          external_order_id?: string
          external_order_number?: string | null
          id?: string
          integration_id?: string | null
          nfse_error_message?: string | null
          nfse_status?: string | null
          order_date?: string | null
          order_status?: string | null
          provider?: string
          raw_data?: Json | null
          total_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_service_orders_customer"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "service_order_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "erp_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_cutoff_cache: {
        Row: {
          colecta_cutoff_calculated: boolean
          colecta_cutoff_time: string | null
          colecta_enabled: boolean
          colecta_window_from: string | null
          colecta_window_to: string | null
          company_id: string
          created_at: string
          date_ref: string
          error_message: string | null
          expires_at: string
          fetched_at: string
          flex_cutoff_time: string | null
          flex_cutoff_type: string | null
          flex_enabled: boolean
          flex_zone_details: Json | null
          flex_zone_summary_first: string | null
          flex_zone_summary_last: string | null
          id: string
          provider: string
          seller_id: string
          source_payload: Json | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          colecta_cutoff_calculated?: boolean
          colecta_cutoff_time?: string | null
          colecta_enabled?: boolean
          colecta_window_from?: string | null
          colecta_window_to?: string | null
          company_id: string
          created_at?: string
          date_ref: string
          error_message?: string | null
          expires_at: string
          fetched_at?: string
          flex_cutoff_time?: string | null
          flex_cutoff_type?: string | null
          flex_enabled?: boolean
          flex_zone_details?: Json | null
          flex_zone_summary_first?: string | null
          flex_zone_summary_last?: string | null
          id?: string
          provider?: string
          seller_id: string
          source_payload?: Json | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          colecta_cutoff_calculated?: boolean
          colecta_cutoff_time?: string | null
          colecta_enabled?: boolean
          colecta_window_from?: string | null
          colecta_window_to?: string | null
          company_id?: string
          created_at?: string
          date_ref?: string
          error_message?: string | null
          expires_at?: string
          fetched_at?: string
          flex_cutoff_time?: string | null
          flex_cutoff_type?: string | null
          flex_enabled?: boolean
          flex_zone_details?: Json | null
          flex_zone_summary_first?: string | null
          flex_zone_summary_last?: string | null
          id?: string
          provider?: string
          seller_id?: string
          source_payload?: Json | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipping_cutoff_locks: {
        Row: {
          company_id: string
          date_ref: string
          expires_at: string
          id: string
          lock_key: string
          locked_at: string
          locked_by_user_id: string | null
          seller_id: string
          status: string
        }
        Insert: {
          company_id: string
          date_ref: string
          expires_at: string
          id?: string
          lock_key: string
          locked_at?: string
          locked_by_user_id?: string | null
          seller_id: string
          status?: string
        }
        Update: {
          company_id?: string
          date_ref?: string
          expires_at?: string
          id?: string
          lock_key?: string
          locked_at?: string
          locked_by_user_id?: string | null
          seller_id?: string
          status?: string
        }
        Relationships: []
      }
      shipping_cutoff_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          endpoint_name: string | null
          error_message: string | null
          execution_time_ms: number | null
          http_status: number | null
          id: string
          payload_summary: Json | null
          seller_id: string | null
          status: string
          step: string
          trace_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          endpoint_name?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          http_status?: number | null
          id?: string
          payload_summary?: Json | null
          seller_id?: string | null
          status?: string
          step?: string
          trace_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          endpoint_name?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          http_status?: number | null
          id?: string
          payload_summary?: Json | null
          seller_id?: string | null
          status?: string
          step?: string
          trace_id?: string | null
        }
        Relationships: []
      }
      shipping_cutoff_manual_rate_limit: {
        Row: {
          company_id: string
          cooldown_minutes: number
          id: string
          last_manual_refresh_at: string
          seller_id: string
        }
        Insert: {
          company_id: string
          cooldown_minutes?: number
          id?: string
          last_manual_refresh_at: string
          seller_id: string
        }
        Update: {
          company_id?: string
          cooldown_minutes?: number
          id?: string
          last_manual_refresh_at?: string
          seller_id?: string
        }
        Relationships: []
      }
      site_content: {
        Row: {
          chave: string
          created_at: string
          descricao: string | null
          id: string
          ordem: number | null
          pagina: string
          secao: string | null
          status: string
          texto: string
          tipo: string
          updated_at: string
        }
        Insert: {
          chave: string
          created_at?: string
          descricao?: string | null
          id?: string
          ordem?: number | null
          pagina: string
          secao?: string | null
          status?: string
          texto?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          chave?: string
          created_at?: string
          descricao?: string | null
          id?: string
          ordem?: number | null
          pagina?: string
          secao?: string | null
          status?: string
          texto?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      social_calendar_engagement_events: {
        Row: {
          created_at: string
          event_id: string | null
          event_type: string
          id: string
          metadata: Json | null
          seller_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          seller_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          seller_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      social_calendar_events: {
        Row: {
          category: string
          country_code: string | null
          created_at: string
          description: string | null
          event_date: string
          id: string
          is_active: boolean
          source: string
          tags: Json | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          country_code?: string | null
          created_at?: string
          description?: string | null
          event_date: string
          id?: string
          is_active?: boolean
          source?: string
          tags?: Json | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          country_code?: string | null
          created_at?: string
          description?: string | null
          event_date?: string
          id?: string
          is_active?: boolean
          source?: string
          tags?: Json | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      social_calendar_saved_ideas: {
        Row: {
          chosen_template_id: string | null
          created_at: string
          custom_notes: string | null
          custom_title: string | null
          event_id: string | null
          id: string
          planned_date: string | null
          seller_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chosen_template_id?: string | null
          created_at?: string
          custom_notes?: string | null
          custom_title?: string | null
          event_id?: string | null
          id?: string
          planned_date?: string | null
          seller_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chosen_template_id?: string | null
          created_at?: string
          custom_notes?: string | null
          custom_title?: string | null
          event_id?: string | null
          id?: string
          planned_date?: string | null
          seller_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_calendar_saved_ideas_chosen_template_id_fkey"
            columns: ["chosen_template_id"]
            isOneToOne: false
            referencedRelation: "social_calendar_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_calendar_saved_ideas_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "social_calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      social_calendar_templates: {
        Row: {
          created_at: string
          cta: string | null
          event_category: string | null
          format: string
          hook: string
          id: string
          is_active: boolean
          niche: string
          script: string
          tags: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta?: string | null
          event_category?: string | null
          format?: string
          hook: string
          id?: string
          is_active?: boolean
          niche?: string
          script: string
          tags?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta?: string | null
          event_category?: string | null
          format?: string
          hook?: string
          id?: string
          is_active?: boolean
          niche?: string
          script?: string
          tags?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      social_calendar_user_preferences: {
        Row: {
          codigo_ibge: number | null
          country_code: string
          created_at: string
          id: string
          objective: string | null
          preferred_formats: Json | null
          selected_niches: Json | null
          seller_id: string | null
          uf: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          codigo_ibge?: number | null
          country_code?: string
          created_at?: string
          id?: string
          objective?: string | null
          preferred_formats?: Json | null
          selected_niches?: Json | null
          seller_id?: string | null
          uf?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          codigo_ibge?: number | null
          country_code?: string
          created_at?: string
          id?: string
          objective?: string | null
          preferred_formats?: Json | null
          selected_niches?: Json | null
          seller_id?: string | null
          uf?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          auto_renew: boolean | null
          billing_cycle: string | null
          cancelled_at: string | null
          company_id: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          gateway: string
          gateway_customer_id: string | null
          gateway_subscription_id: string | null
          id: string
          plan_id: string | null
          plan_name: string | null
          plan_price_cents: number | null
          plan_price_id: string | null
          plan_type: string
          status: string
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_renew?: boolean | null
          billing_cycle?: string | null
          cancelled_at?: string | null
          company_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          gateway?: string
          gateway_customer_id?: string | null
          gateway_subscription_id?: string | null
          id?: string
          plan_id?: string | null
          plan_name?: string | null
          plan_price_cents?: number | null
          plan_price_id?: string | null
          plan_type?: string
          status?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_renew?: boolean | null
          billing_cycle?: string | null
          cancelled_at?: string | null
          company_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          gateway?: string
          gateway_customer_id?: string | null
          gateway_subscription_id?: string | null
          id?: string
          plan_id?: string | null
          plan_name?: string | null
          plan_price_cents?: number | null
          plan_price_id?: string | null
          plan_type?: string
          status?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ai_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          sources: Json | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          sources?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          sources?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ai_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "support_ai_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ai_sessions: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ai_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      support_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string
          id: string
          is_screenshot: boolean | null
          message_id: string | null
          storage_path: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type: string
          id?: string
          is_screenshot?: boolean | null
          message_id?: string | null
          storage_path: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string
          id?: string
          is_screenshot?: boolean | null
          message_id?: string | null
          storage_path?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_internal: boolean | null
          sender_type: string
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          sender_type: string
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          sender_type?: string
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: Database["public"]["Enums"]["support_ticket_category"]
          closed_at: string | null
          created_at: string
          current_module: string | null
          current_route: string | null
          description: string
          id: string
          metadata: Json | null
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["support_ticket_category"]
          closed_at?: string | null
          created_at?: string
          current_module?: string | null
          current_route?: string | null
          description: string
          id?: string
          metadata?: Json | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["support_ticket_category"]
          closed_at?: string | null
          created_at?: string
          current_module?: string | null
          current_route?: string | null
          description?: string
          id?: string
          metadata?: Json | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_jobs: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_type: string
          ml_account_id: string | null
          processed_records: number | null
          seller_id: string
          status: string
          total_records: number | null
          user_id: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          ml_account_id?: string | null
          processed_records?: number | null
          seller_id: string
          status?: string
          total_records?: number | null
          user_id: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_type?: string
          ml_account_id?: string | null
          processed_records?: number | null
          seller_id?: string
          status?: string
          total_records?: number | null
          user_id?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_scheduler: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          job_name: string
          last_run_at: string | null
          lock_expires_at: string | null
          locked_by: string | null
          next_run_at: string | null
          stats: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_name: string
          last_run_at?: string | null
          lock_expires_at?: string | null
          locked_by?: string | null
          next_run_at?: string | null
          stats?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_name?: string
          last_run_at?: string | null
          lock_expires_at?: string | null
          locked_by?: string | null
          next_run_at?: string | null
          stats?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_actions: {
        Row: {
          created_at: string
          id: string
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      system_events: {
        Row: {
          account_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "workspace_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      system_features: {
        Row: {
          action_id: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          module_id: string
          name: string
        }
        Insert: {
          action_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          module_id: string
          name: string
        }
        Update: {
          action_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          module_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_features_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "system_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_features_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "system_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      system_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          nps: number | null
          rating: number
          seller_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          nps?: number | null
          rating: number
          seller_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          nps?: number | null
          rating?: number
          seller_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          id: string
          level: string
          message: string | null
          meta_json: Json
          success: boolean
          system_area: string
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          id?: string
          level?: string
          message?: string | null
          meta_json?: Json
          success?: boolean
          system_area: string
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          id?: string
          level?: string
          message?: string | null
          meta_json?: Json
          success?: boolean
          system_area?: string
          user_id?: string | null
        }
        Relationships: []
      }
      system_modules: {
        Row: {
          created_at: string
          description: string | null
          icon_key: string | null
          id: string
          is_active: boolean
          is_internal_only: boolean
          key: string
          layer: Database["public"]["Enums"]["module_layer"]
          name: string
          parent_module_id: string | null
          route: string | null
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon_key?: string | null
          id?: string
          is_active?: boolean
          is_internal_only?: boolean
          key: string
          layer?: Database["public"]["Enums"]["module_layer"]
          name: string
          parent_module_id?: string | null
          route?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon_key?: string | null
          id?: string
          is_active?: boolean
          is_internal_only?: boolean
          key?: string
          layer?: Database["public"]["Enums"]["module_layer"]
          name?: string
          parent_module_id?: string | null
          route?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_modules_parent_module_id_fkey"
            columns: ["parent_module_id"]
            isOneToOne: false
            referencedRelation: "system_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      system_modules_legacy: {
        Row: {
          created_at: string
          description: string | null
          icon_name: string | null
          id: string
          is_active: boolean
          name: string
          route: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon_name?: string | null
          id: string
          is_active?: boolean
          name: string
          route?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          name?: string
          route?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_rating_stats: {
        Row: {
          avg_stars: number | null
          id: string
          key: string
          last_rating_at: string | null
          ratings_count: number | null
          stars_1: number | null
          stars_2: number | null
          stars_3: number | null
          stars_4: number | null
          stars_5: number | null
          updated_at: string | null
        }
        Insert: {
          avg_stars?: number | null
          id?: string
          key?: string
          last_rating_at?: string | null
          ratings_count?: number | null
          stars_1?: number | null
          stars_2?: number | null
          stars_3?: number | null
          stars_4?: number | null
          stars_5?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_stars?: number | null
          id?: string
          key?: string
          last_rating_at?: string | null
          ratings_count?: number | null
          stars_1?: number | null
          stars_2?: number | null
          stars_3?: number | null
          stars_4?: number | null
          stars_5?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      system_ratings: {
        Row: {
          comment: string | null
          created_at: string | null
          hidden_reason: string | null
          id: string
          is_hidden_by_admin: boolean | null
          stars: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden_by_admin?: boolean | null
          stars: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden_by_admin?: boolean | null
          stars?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      system_status_logs: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_status: string
          previous_status: string
          service_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: string
          previous_status: string
          service_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: string
          previous_status?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_status_logs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "system_status_services"
            referencedColumns: ["id"]
          },
        ]
      }
      system_status_services: {
        Row: {
          created_at: string
          id: string
          last_checked: string
          message: string | null
          service_name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_checked?: string
          message?: string | null
          service_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_checked?: string
          message?: string | null
          service_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_checklists: {
        Row: {
          created_at: string
          id: string
          is_done: boolean
          sort_order: number
          task_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_done?: boolean
          sort_order?: number
          task_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_done?: boolean
          sort_order?: number
          task_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklists_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_watchers: {
        Row: {
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_watchers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          account_id: string | null
          assignee_user_id: string | null
          created_at: string
          created_by_user_id: string
          description: string | null
          due_at: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          source_id: string | null
          source_ref: Json | null
          source_type: string | null
          status: Database["public"]["Enums"]["task_status"]
          tags: string[] | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          assignee_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          source_id?: string | null
          source_ref?: Json | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[] | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          assignee_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          source_id?: string | null
          source_ref?: Json | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[] | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "workspace_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_configuration: {
        Row: {
          cofins_percent: number | null
          company_id: string
          created_at: string | null
          csll_percent: number | null
          das_icms_percent: number | null
          difal_enabled: boolean | null
          difal_percent: number | null
          id: string
          irpj_percent: number | null
          origin_state: string | null
          pis_percent: number | null
          updated_at: string | null
        }
        Insert: {
          cofins_percent?: number | null
          company_id: string
          created_at?: string | null
          csll_percent?: number | null
          das_icms_percent?: number | null
          difal_enabled?: boolean | null
          difal_percent?: number | null
          id?: string
          irpj_percent?: number | null
          origin_state?: string | null
          pis_percent?: number | null
          updated_at?: string | null
        }
        Update: {
          cofins_percent?: number | null
          company_id?: string
          created_at?: string | null
          csll_percent?: number | null
          das_icms_percent?: number | null
          difal_enabled?: boolean | null
          difal_percent?: number | null
          id?: string
          irpj_percent?: number | null
          origin_state?: string | null
          pis_percent?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_configuration_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      template_assets: {
        Row: {
          asset_type: string
          created_at: string
          file_url: string
          id: string
          meta: Json | null
          template_id: string
        }
        Insert: {
          asset_type: string
          created_at?: string
          file_url: string
          id?: string
          meta?: Json | null
          template_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          file_url?: string
          id?: string
          meta?: Json | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_assets_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          payload: Json | null
          template_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          payload?: Json | null
          template_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          payload?: Json | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_audit_log_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_rules: {
        Row: {
          category_key: string | null
          company_id: string | null
          created_at: string
          end_day: number | null
          end_month: number | null
          id: string
          is_enabled: boolean
          match_categories: string[] | null
          priority: number
          rule_type: string
          seasonal_key: string | null
          source_group_id: string | null
          start_day: number | null
          start_month: number | null
          subcategory_key: string | null
          template_id: string
          updated_at: string
        }
        Insert: {
          category_key?: string | null
          company_id?: string | null
          created_at?: string
          end_day?: number | null
          end_month?: number | null
          id?: string
          is_enabled?: boolean
          match_categories?: string[] | null
          priority?: number
          rule_type: string
          seasonal_key?: string | null
          source_group_id?: string | null
          start_day?: number | null
          start_month?: number | null
          subcategory_key?: string | null
          template_id: string
          updated_at?: string
        }
        Update: {
          category_key?: string | null
          company_id?: string | null
          created_at?: string
          end_day?: number | null
          end_month?: number | null
          id?: string
          is_enabled?: boolean
          match_categories?: string[] | null
          priority?: number
          rule_type?: string
          seasonal_key?: string | null
          source_group_id?: string | null
          start_day?: number | null
          start_month?: number | null
          subcategory_key?: string | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_rules_source_group_id_fkey"
            columns: ["source_group_id"]
            isOneToOne: false
            referencedRelation: "visual_category_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_variants: {
        Row: {
          created_at: string
          design_tokens: Json
          id: string
          intensity: number | null
          overlay_opacity: number | null
          overlay_url: string | null
          preview_image_url: string | null
          template_id: string
          updated_at: string
          variant_key: string
        }
        Insert: {
          created_at?: string
          design_tokens?: Json
          id?: string
          intensity?: number | null
          overlay_opacity?: number | null
          overlay_url?: string | null
          preview_image_url?: string | null
          template_id: string
          updated_at?: string
          variant_key?: string
        }
        Update: {
          created_at?: string
          design_tokens?: Json
          id?: string
          intensity?: number | null
          overlay_opacity?: number | null
          overlay_url?: string | null
          preview_image_url?: string | null
          template_id?: string
          updated_at?: string
          variant_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_variants_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system_default: boolean
          name: string
          owner_workspace_id: string | null
          scope: string
          slug: string | null
          source_group_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_default?: boolean
          name: string
          owner_workspace_id?: string | null
          scope?: string
          slug?: string | null
          source_group_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_default?: boolean
          name?: string
          owner_workspace_id?: string | null
          scope?: string
          slug?: string | null
          source_group_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_source_group_id_fkey"
            columns: ["source_group_id"]
            isOneToOne: false
            referencedRelation: "visual_category_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonial_candidates: {
        Row: {
          admin_notes: string | null
          consent_id: string | null
          created_at: string | null
          id: string
          source_id: string
          source_type: string
          stars: number
          status: string
          suggested_channels: string[]
          text: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          consent_id?: string | null
          created_at?: string | null
          id?: string
          source_id: string
          source_type: string
          stars: number
          status?: string
          suggested_channels?: string[]
          text?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          consent_id?: string | null
          created_at?: string | null
          id?: string
          source_id?: string
          source_type?: string
          stars?: number
          status?: string
          suggested_channels?: string[]
          text?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonial_candidates_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "rating_consents"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          consent_granted_at: string | null
          consent_requested_at: string | null
          consent_status: string | null
          created_at: string
          display_name: string
          featured: boolean
          id: string
          published: boolean
          published_at: string | null
          quote: string
          rating: number | null
          role: string | null
          seller_id: string
          source: string
          source_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          consent_granted_at?: string | null
          consent_requested_at?: string | null
          consent_status?: string | null
          created_at?: string
          display_name: string
          featured?: boolean
          id?: string
          published?: boolean
          published_at?: string | null
          quote: string
          rating?: number | null
          role?: string | null
          seller_id: string
          source?: string
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          consent_granted_at?: string | null
          consent_requested_at?: string | null
          consent_status?: string | null
          created_at?: string
          display_name?: string
          featured?: boolean
          id?: string
          published?: boolean
          published_at?: string | null
          quote?: string
          rating?: number | null
          role?: string | null
          seller_id?: string
          source?: string
          source_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      timeline_events: {
        Row: {
          company_id: string
          created_at: string
          event_payload: Json
          event_title: string
          event_type: string
          id: string
          ip: string | null
          occurred_at: string
          seller_id: string
          source: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          event_payload?: Json
          event_title: string
          event_type: string
          id?: string
          ip?: string | null
          occurred_at: string
          seller_id: string
          source?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          event_payload?: Json
          event_title?: string
          event_type?: string
          id?: string
          ip?: string | null
          occurred_at?: string
          seller_id?: string
          source?: string | null
          user_agent?: string | null
          user_id?: string | null
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
      trends_category_visibility: {
        Row: {
          account_id: string
          category_id: string
          created_at: string
          id: string
          mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          category_id: string
          created_at?: string
          id?: string
          mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          category_id?: string
          created_at?: string
          id?: string
          mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trial_policy: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          one_trial_per_account: boolean
          requires_card: boolean
          trial_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          one_trial_per_account?: boolean
          requires_card?: boolean
          trial_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          one_trial_per_account?: boolean
          requires_card?: boolean
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      ui_theme_presets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          is_system: boolean | null
          name: string
          scope: string
          theme_data: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_system?: boolean | null
          name: string
          scope: string
          theme_data?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_system?: boolean | null
          name?: string
          scope?: string
          theme_data?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      ui_theme_settings: {
        Row: {
          accent_color: string | null
          active_preset_id: string | null
          background_color: string | null
          card_bg_color: string | null
          card_border_color: string | null
          card_indicator_critical: string | null
          card_indicator_positive: string | null
          card_indicator_warning: string | null
          card_text_secondary_color: string | null
          card_title_color: string | null
          card_value_color: string | null
          color_mode_preference: string | null
          company_id: string
          contrast_mode: string | null
          created_at: string
          id: string
          is_synced: boolean | null
          menu_bg_color: string | null
          menu_icon_color: string | null
          menu_item_active_color: string | null
          menu_item_color: string | null
          menu_item_hover_color: string | null
          menu_text_color: string | null
          primary_color: string | null
          scope: string
          secondary_color: string | null
          text_primary_color: string | null
          text_secondary_color: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          active_preset_id?: string | null
          background_color?: string | null
          card_bg_color?: string | null
          card_border_color?: string | null
          card_indicator_critical?: string | null
          card_indicator_positive?: string | null
          card_indicator_warning?: string | null
          card_text_secondary_color?: string | null
          card_title_color?: string | null
          card_value_color?: string | null
          color_mode_preference?: string | null
          company_id: string
          contrast_mode?: string | null
          created_at?: string
          id?: string
          is_synced?: boolean | null
          menu_bg_color?: string | null
          menu_icon_color?: string | null
          menu_item_active_color?: string | null
          menu_item_color?: string | null
          menu_item_hover_color?: string | null
          menu_text_color?: string | null
          primary_color?: string | null
          scope: string
          secondary_color?: string | null
          text_primary_color?: string | null
          text_secondary_color?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          active_preset_id?: string | null
          background_color?: string | null
          card_bg_color?: string | null
          card_border_color?: string | null
          card_indicator_critical?: string | null
          card_indicator_positive?: string | null
          card_indicator_warning?: string | null
          card_text_secondary_color?: string | null
          card_title_color?: string | null
          card_value_color?: string | null
          color_mode_preference?: string | null
          company_id?: string
          contrast_mode?: string | null
          created_at?: string
          id?: string
          is_synced?: boolean | null
          menu_bg_color?: string | null
          menu_icon_color?: string | null
          menu_item_active_color?: string | null
          menu_item_color?: string | null
          menu_item_hover_color?: string | null
          menu_text_color?: string | null
          primary_color?: string | null
          scope?: string
          secondary_color?: string | null
          text_primary_color?: string | null
          text_secondary_color?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_access_state: {
        Row: {
          active_subscription_id: string | null
          created_at: string
          default_label_size: string | null
          default_print_mode: string | null
          id: string
          ml_account_connected: boolean
          ml_account_id: string | null
          ml_account_role: Database["public"]["Enums"]["ml_account_role"]
          onboarding_completed_at: string | null
          onboarding_objective: string[] | null
          onboarding_status: Database["public"]["Enums"]["onboarding_status"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          selected_plan_id: string | null
          trial_end_at: string | null
          trial_start_at: string | null
          trial_status: Database["public"]["Enums"]["trial_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          active_subscription_id?: string | null
          created_at?: string
          default_label_size?: string | null
          default_print_mode?: string | null
          id?: string
          ml_account_connected?: boolean
          ml_account_id?: string | null
          ml_account_role?: Database["public"]["Enums"]["ml_account_role"]
          onboarding_completed_at?: string | null
          onboarding_objective?: string[] | null
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          selected_plan_id?: string | null
          trial_end_at?: string | null
          trial_start_at?: string | null
          trial_status?: Database["public"]["Enums"]["trial_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          active_subscription_id?: string | null
          created_at?: string
          default_label_size?: string | null
          default_print_mode?: string | null
          id?: string
          ml_account_connected?: boolean
          ml_account_id?: string | null
          ml_account_role?: Database["public"]["Enums"]["ml_account_role"]
          onboarding_completed_at?: string | null
          onboarding_objective?: string[] | null
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          selected_plan_id?: string | null
          trial_end_at?: string | null
          trial_start_at?: string | null
          trial_status?: Database["public"]["Enums"]["trial_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_access_state_active_subscription_id_fkey"
            columns: ["active_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_access_state_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_access_state_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_access_state_selected_plan_id_fkey"
            columns: ["selected_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_access_state_selected_plan_id_fkey"
            columns: ["selected_plan_id"]
            isOneToOne: false
            referencedRelation: "public_plans_v1"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      user_consents: {
        Row: {
          accepted_at: string
          analytics: boolean | null
          consent_scope: string
          consent_type: string
          created_at: string
          document_hash: string
          document_type: string
          document_version: string
          essential: boolean
          id: string
          ip_address: string | null
          pdf_path: string | null
          performance: boolean | null
          source: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          analytics?: boolean | null
          consent_scope: string
          consent_type: string
          created_at?: string
          document_hash: string
          document_type: string
          document_version: string
          essential?: boolean
          id?: string
          ip_address?: string | null
          pdf_path?: string | null
          performance?: boolean | null
          source: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          analytics?: boolean | null
          consent_scope?: string
          consent_type?: string
          created_at?: string
          document_hash?: string
          document_type?: string
          document_version?: string
          essential?: boolean
          id?: string
          ip_address?: string | null
          pdf_path?: string | null
          performance?: boolean | null
          source?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_context: {
        Row: {
          active_company_id: string | null
          active_marketplace_account_id: string | null
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active_company_id?: string | null
          active_marketplace_account_id?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active_company_id?: string | null
          active_marketplace_account_id?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_context_active_company_id_fkey"
            columns: ["active_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_context_active_marketplace_account_id_fkey"
            columns: ["active_marketplace_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_context_active_marketplace_account_id_fkey"
            columns: ["active_marketplace_account_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_dashboard_shortcuts: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_enabled: boolean
          shortcut_key: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          shortcut_key: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          shortcut_key?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
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
      user_message_preferences: {
        Row: {
          created_at: string
          exibir_mensagem: boolean
          permitir_gerar_card: boolean
          tema_preferido: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exibir_mensagem?: boolean
          permitir_gerar_card?: boolean
          tema_preferido?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exibir_mensagem?: boolean
          permitir_gerar_card?: boolean
          tema_preferido?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_module_card_views: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          module_slug: string
          user_agent: string | null
          user_id: string
          visualizado: boolean
          visualizado_em: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          module_slug: string
          user_agent?: string | null
          user_id: string
          visualizado?: boolean
          visualizado_em?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          module_slug?: string
          user_agent?: string | null
          user_id?: string
          visualizado?: boolean
          visualizado_em?: string | null
        }
        Relationships: []
      }
      user_module_usage: {
        Row: {
          actions_count: number
          created_at: string
          first_seen_at: string
          id: string
          last_action_at: string | null
          last_seen_at: string
          module_slug: string
          seller_id: string
          updated_at: string
          user_id: string
          views_count: number
        }
        Insert: {
          actions_count?: number
          created_at?: string
          first_seen_at?: string
          id?: string
          last_action_at?: string | null
          last_seen_at?: string
          module_slug: string
          seller_id: string
          updated_at?: string
          user_id: string
          views_count?: number
        }
        Update: {
          actions_count?: number
          created_at?: string
          first_seen_at?: string
          id?: string
          last_action_at?: string | null
          last_seen_at?: string
          module_slug?: string
          seller_id?: string
          updated_at?: string
          user_id?: string
          views_count?: number
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          active_workspace_id: string | null
          created_at: string
          hour_format: string | null
          language: string | null
          tasks_enabled: boolean
          timezone: string | null
          updated_at: string
          user_id: string
          widgets_enabled: Json | null
          widgets_layout: Json | null
        }
        Insert: {
          active_workspace_id?: string | null
          created_at?: string
          hour_format?: string | null
          language?: string | null
          tasks_enabled?: boolean
          timezone?: string | null
          updated_at?: string
          user_id: string
          widgets_enabled?: Json | null
          widgets_layout?: Json | null
        }
        Update: {
          active_workspace_id?: string | null
          created_at?: string
          hour_format?: string | null
          language?: string | null
          tasks_enabled?: boolean
          timezone?: string | null
          updated_at?: string
          user_id?: string
          widgets_enabled?: Json | null
          widgets_layout?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_active_workspace_id_fkey"
            columns: ["active_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sentiments: {
        Row: {
          comment: string | null
          context: string
          created_at: string
          id: string
          sentiment: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          context: string
          created_at?: string
          id?: string
          sentiment: string
          user_id: string
        }
        Update: {
          comment?: string | null
          context?: string
          created_at?: string
          id?: string
          sentiment?: string
          user_id?: string
        }
        Relationships: []
      }
      user_usage: {
        Row: {
          created_at: string | null
          id: string
          last_calculated_at: string | null
          month_key: string
          total_sales: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_calculated_at?: string | null
          month_key: string
          total_sales?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_calculated_at?: string | null
          month_key?: string
          total_sales?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      visual_category_groups: {
        Row: {
          ativo: boolean
          categorias_ml: string[]
          created_at: string
          gradiente_fim: string
          gradiente_inicio: string
          id: string
          imagem_overlay_url: string | null
          intensidade_padrao: number
          nome: string
          prioridade: number
          slug: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categorias_ml?: string[]
          created_at?: string
          gradiente_fim?: string
          gradiente_inicio?: string
          id?: string
          imagem_overlay_url?: string | null
          intensidade_padrao?: number
          nome: string
          prioridade?: number
          slug: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categorias_ml?: string[]
          created_at?: string
          gradiente_fim?: string
          gradiente_inicio?: string
          id?: string
          imagem_overlay_url?: string | null
          intensidade_padrao?: number
          nome?: string
          prioridade?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      visual_identity_logs: {
        Row: {
          categoria_detectada: string | null
          created_at: string
          detalhes: Json | null
          grupo_visual_aplicado: string | null
          id: string
          modo_aplicado: string
          origem: string
          seller_id: string
          user_id: string | null
        }
        Insert: {
          categoria_detectada?: string | null
          created_at?: string
          detalhes?: Json | null
          grupo_visual_aplicado?: string | null
          id?: string
          modo_aplicado: string
          origem: string
          seller_id: string
          user_id?: string | null
        }
        Update: {
          categoria_detectada?: string | null
          created_at?: string
          detalhes?: Json | null
          grupo_visual_aplicado?: string | null
          id?: string
          modo_aplicado?: string
          origem?: string
          seller_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      visual_identity_settings: {
        Row: {
          aplicar_cards: boolean
          aplicar_dashboard: boolean
          aplicar_menu: boolean
          categoria_detectada: string | null
          created_at: string
          grupo_visual_aplicado: string | null
          grupo_visual_manual: string | null
          id: string
          intensidade_overlay: number
          modo_identidade: string
          seller_id: string
          updated_at: string
        }
        Insert: {
          aplicar_cards?: boolean
          aplicar_dashboard?: boolean
          aplicar_menu?: boolean
          categoria_detectada?: string | null
          created_at?: string
          grupo_visual_aplicado?: string | null
          grupo_visual_manual?: string | null
          id?: string
          intensidade_overlay?: number
          modo_identidade?: string
          seller_id: string
          updated_at?: string
        }
        Update: {
          aplicar_cards?: boolean
          aplicar_dashboard?: boolean
          aplicar_menu?: boolean
          categoria_detectada?: string | null
          created_at?: string
          grupo_visual_aplicado?: string | null
          grupo_visual_manual?: string | null
          id?: string
          intensidade_overlay?: number
          modo_identidade?: string
          seller_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          code: string
          created_at: string | null
          current_uses: number | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          max_uses: number | null
          plan_ids: string[] | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type?: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          plan_ids?: string[] | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          plan_ids?: string[] | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      webhook_event_logs: {
        Row: {
          created_at: string
          details: Json | null
          event_id: string | null
          id: string
          level: string
          message: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_id?: string | null
          id?: string
          level: string
          message: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_id?: string | null
          id?: string
          level?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_event_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "webhook_events"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          application_id: string | null
          attempts: number
          created_at: string
          dedupe_key: string
          error_code: string | null
          id: string
          last_error: string | null
          max_attempts: number
          ml_user_id: string
          next_retry_at: string | null
          payload_raw: Json
          processed_at: string | null
          provider: string
          received_at: string
          resource: string
          status: string
          topic: string
        }
        Insert: {
          application_id?: string | null
          attempts?: number
          created_at?: string
          dedupe_key: string
          error_code?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          ml_user_id: string
          next_retry_at?: string | null
          payload_raw: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          resource: string
          status?: string
          topic: string
        }
        Update: {
          application_id?: string | null
          attempts?: number
          created_at?: string
          dedupe_key?: string
          error_code?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          ml_user_id?: string
          next_retry_at?: string | null
          payload_raw?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          resource?: string
          status?: string
          topic?: string
        }
        Relationships: []
      }
      wholesale_product_overrides: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          custom_tiers: Json | null
          id: string
          is_excluded: boolean
          item_id: string
          override_mode: string
          product_key: string | null
          profile_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          custom_tiers?: Json | null
          id?: string
          is_excluded?: boolean
          item_id: string
          override_mode?: string
          product_key?: string | null
          profile_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          custom_tiers?: Json | null
          id?: string
          is_excluded?: boolean
          item_id?: string
          override_mode?: string
          product_key?: string | null
          profile_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_product_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_product_overrides_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "wholesale_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_profile_categories: {
        Row: {
          category_id: string
          category_name: string | null
          category_path: string[] | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          priority: number
          profile_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          category_name?: string | null
          category_path?: string[] | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: number
          profile_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          category_name?: string | null
          category_path?: string[] | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: number
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_profile_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_profile_categories_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "wholesale_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_profile_tiers: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          min_quantity: number
          profile_id: string
          tier_index: number
          updated_at: string
          value: number
          value_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          min_quantity?: number
          profile_id: string
          tier_index: number
          updated_at?: string
          value?: number
          value_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          min_quantity?: number
          profile_id?: string
          tier_index?: number
          updated_at?: string
          value?: number
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_profile_tiers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "wholesale_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_profiles: {
        Row: {
          allow_without_cost: boolean
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          margin_min_pct: number | null
          name: string
          rounding_mode: string
          updated_at: string
        }
        Insert: {
          allow_without_cost?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          margin_min_pct?: number | null
          name: string
          rounding_mode?: string
          updated_at?: string
        }
        Update: {
          allow_without_cost?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          margin_min_pct?: number | null
          name?: string
          rounding_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_seller_settings: {
        Row: {
          auto_reapply_mode: string
          auto_reapply_on_price_change: boolean
          company_id: string
          created_at: string
          default_profile_id: string | null
          id: string
          scheduled_time: string
          strategy_mode: string
          timezone: string
          updated_at: string
        }
        Insert: {
          auto_reapply_mode?: string
          auto_reapply_on_price_change?: boolean
          company_id: string
          created_at?: string
          default_profile_id?: string | null
          id?: string
          scheduled_time?: string
          strategy_mode?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          auto_reapply_mode?: string
          auto_reapply_on_price_change?: boolean
          company_id?: string
          created_at?: string
          default_profile_id?: string | null
          id?: string
          scheduled_time?: string
          strategy_mode?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_seller_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_seller_settings_default_profile_id_fkey"
            columns: ["default_profile_id"]
            isOneToOne: false
            referencedRelation: "wholesale_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_accounts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          marketplace: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          marketplace?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          marketplace?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_preferences: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          default_language: string | null
          id: string
          state: string | null
          updated_at: string
          weather_update_interval: number | null
          workspace_id: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          default_language?: string | null
          id?: string
          state?: string | null
          updated_at?: string
          weather_update_interval?: number | null
          workspace_id: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          default_language?: string | null
          id?: string
          state?: string | null
          updated_at?: string
          weather_update_interval?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
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
      mktpfacil_clone_history: {
        Row: {
          created_at: string | null
          created_units: number | null
          destination_account_id: string | null
          destination_nickname: string | null
          destination_seller_id: string | null
          failed_units: number | null
          finished_at: string | null
          job_id: string | null
          settings_json: Json | null
          source_item_id: string | null
          source_thumbnail: string | null
          source_title: string | null
          source_url: string | null
          started_at: string | null
          status: string | null
          summary_json: Json | null
          total_units: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mktpfacil_clone_jobs_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mktpfacil_clone_jobs_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "unified_marketplace_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      priority_notifications: {
        Row: {
          action_url: string | null
          body: string | null
          category: Database["public"]["Enums"]["notification_category"] | null
          created_at: string | null
          expires_at: string | null
          group_key: string | null
          id: string | null
          is_actioned: boolean | null
          is_dismissed: boolean | null
          is_read: boolean | null
          is_snoozed: boolean | null
          metadata: Json | null
          origin_module: string | null
          priority: Database["public"]["Enums"]["notification_priority"] | null
          priority_score: number | null
          read_at: string | null
          reference_id: string | null
          reference_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          seller_id: string | null
          snooze_until: string | null
          snoozed_at: string | null
          title: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          category?: Database["public"]["Enums"]["notification_category"] | null
          created_at?: string | null
          expires_at?: string | null
          group_key?: string | null
          id?: string | null
          is_actioned?: boolean | null
          is_dismissed?: boolean | null
          is_read?: boolean | null
          is_snoozed?: boolean | null
          metadata?: Json | null
          origin_module?: string | null
          priority?: Database["public"]["Enums"]["notification_priority"] | null
          priority_score?: never
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          seller_id?: string | null
          snooze_until?: string | null
          snoozed_at?: string | null
          title?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action_url?: string | null
          body?: string | null
          category?: Database["public"]["Enums"]["notification_category"] | null
          created_at?: string | null
          expires_at?: string | null
          group_key?: string | null
          id?: string | null
          is_actioned?: boolean | null
          is_dismissed?: boolean | null
          is_read?: boolean | null
          is_snoozed?: boolean | null
          metadata?: Json | null
          origin_module?: string | null
          priority?: Database["public"]["Enums"]["notification_priority"] | null
          priority_score?: never
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          seller_id?: string | null
          snooze_until?: string | null
          snoozed_at?: string | null
          title?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      public_plans_v1: {
        Row: {
          active: boolean | null
          auto_renew: boolean | null
          badge_text: string | null
          campaign_notes: string | null
          category: string | null
          currency: string | null
          description: string | null
          features: Json | null
          is_campaign: boolean | null
          max_sales: number | null
          min_sales: number | null
          mode: string | null
          mode_order: number | null
          mp_checkout_url: string | null
          mp_preapproval_plan_id: string | null
          name: string | null
          period: string | null
          period_order: number | null
          plan_id: string | null
          plan_sort_order: number | null
          price_cents: number | null
          price_id: string | null
          price_sort_order: number | null
          recurring: boolean | null
          slug: string | null
          visible: boolean | null
        }
        Relationships: []
      }
      unified_marketplace_accounts: {
        Row: {
          ads_auto_sync: boolean | null
          ads_connection_id: string | null
          ads_last_sync: string | null
          created_at: string | null
          email: string | null
          id: string | null
          is_active: boolean | null
          nickname: string | null
          provider: string | null
          seller_id: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_admin_by_email: { Args: { p_email: string }; Returns: undefined }
      admin_adjust_trial: {
        Args: {
          p_days_adjustment: number
          p_reason?: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_reset_trial: {
        Args: {
          p_reason?: string
          p_target_user_id: string
          p_trial_days?: number
        }
        Returns: Json
      }
      admin_set_user_blocked: {
        Args: {
          p_blocked: boolean
          p_reason?: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_set_user_role: {
        Args: {
          p_action: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_target_user_id: string
        }
        Returns: Json
      }
      calculate_category_eligibility: {
        Args: {
          p_category_id: string
          p_period_days?: number
          p_seller_id: string
          p_threshold_orders?: number
          p_user_id: string
        }
        Returns: {
          eligibility_state: string
          orders_count: number
          revenue: number
          units_sold: number
        }[]
      }
      can_edit_tasks: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      can_manage_workspace: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      check_ml_api_access: { Args: { p_user_id: string }; Returns: Json }
      check_permission: {
        Args: { p_company_id: string; p_feature_key: string; p_user_id: string }
        Returns: boolean
      }
      check_snoozed_notifications: { Args: never; Returns: undefined }
      count_orders_needing_cost_sync: {
        Args: { p_seller_id: string }
        Returns: {
          no_breakdown: number
          pending_billing: number
          total_pending: number
        }[]
      }
      ensure_ads_connection: {
        Args: { p_seller_id: string; p_user_id: string }
        Returns: {
          connection_id: string
          is_new: boolean
        }[]
      }
      ensure_workspace: { Args: { p_user_id: string }; Returns: Json }
      generate_blog_slug: { Args: { title: string }; Returns: string }
      generate_category_slug: { Args: { name: string }; Returns: string }
      generate_retrospective_snapshot: {
        Args: {
          p_periodo_fim: string
          p_periodo_inicio: string
          p_seller_id: string
          p_user_id: string
        }
        Returns: Json
      }
      get_admin_dashboard_stats: { Args: never; Returns: Json }
      get_global_ads_metrics: { Args: never; Returns: Json }
      get_global_total_revenue: { Args: never; Returns: number }
      get_or_create_ml_account: {
        Args: {
          p_access_token?: string
          p_email?: string
          p_expires_at?: string
          p_nickname?: string
          p_refresh_token?: string
          p_seller_id: string
          p_user_id: string
        }
        Returns: {
          account_id: string
          is_new: boolean
          seller_id: string
        }[]
      }
      get_or_create_user_access_state: {
        Args: { p_user_id: string }
        Returns: {
          active_subscription_id: string | null
          created_at: string
          default_label_size: string | null
          default_print_mode: string | null
          id: string
          ml_account_connected: boolean
          ml_account_id: string | null
          ml_account_role: Database["public"]["Enums"]["ml_account_role"]
          onboarding_completed_at: string | null
          onboarding_objective: string[] | null
          onboarding_status: Database["public"]["Enums"]["onboarding_status"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          selected_plan_id: string | null
          trial_end_at: string | null
          trial_start_at: string | null
          trial_status: Database["public"]["Enums"]["trial_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_access_state"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_orders_needing_cost_sync: {
        Args: { p_limit?: number; p_offset?: number; p_seller_id: string }
        Returns: {
          created_at_meli: string
          current_fee_ml_source: string
          order_id: string
          shipment_id: string
          total_amount: number
        }[]
      }
      get_sales_metrics: {
        Args: { p_date_from?: string; p_date_to?: string; p_seller_id: string }
        Returns: Json
      }
      get_seller_visible_categories: {
        Args: { p_account_id: string; p_limit?: number; p_user_id: string }
        Returns: {
          category_id: string
          category_name: string
          category_path: string[]
          gmv_90d: number
          is_pinned_auto: boolean
          level1_category_id: string
          level1_category_name: string
          orders_count_90d: number
          pinned_reason: string
          source: string
          visibility_mode: string
        }[]
      }
      get_send_available_seeds: {
        Args: { p_seller_id: string; p_user_id: string }
        Returns: number
      }
      get_shipping_orders: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_page?: number
          p_page_size?: number
          p_period_type?: string
          p_search_query?: string
          p_seller_id: string
          p_sort_dir?: string
          p_sort_field?: string
          p_status_filter?: string
        }
        Returns: Json
      }
      get_user_feature_flags: { Args: { p_user_id: string }; Returns: Json }
      get_user_full_context: { Args: { p_user_id: string }; Returns: Json }
      get_user_menu: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: {
          icon_key: string
          is_internal_only: boolean
          layer: Database["public"]["Enums"]["module_layer"]
          module_id: string
          module_key: string
          module_name: string
          parent_module_id: string
          route: string
          sort_order: number
        }[]
      }
      get_user_permissions: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: {
          allowed: boolean
          feature_key: string
        }[]
      }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      get_user_status: { Args: never; Returns: Json }
      get_user_subscription: {
        Args: { p_user_id: string }
        Returns: {
          current_period_end: string
          days_remaining: number
          is_trial: boolean
          max_sales: number
          plan_code: string
          plan_name: string
          plan_type: string
          status: string
          subscription_id: string
        }[]
      }
      get_workspace_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_help_article_views: {
        Args: { p_article_id: string }
        Returns: undefined
      }
      increment_voucher_usage: {
        Args: { voucher_id: string }
        Returns: undefined
      }
      initialize_new_user: {
        Args: { p_email: string; p_full_name?: string; p_user_id: string }
        Returns: Json
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_company_owner: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      log_admin_action: {
        Args: {
          p_action_type: string
          p_description?: string
          p_new_value?: Json
          p_old_value?: Json
          p_target_id?: string
          p_target_table?: string
        }
        Returns: string
      }
      register_system_log: {
        Args: {
          p_action: string
          p_company_id?: string
          p_level: string
          p_message?: string
          p_meta_json?: Json
          p_success?: boolean
          p_system_area: string
          p_user_id?: string
        }
        Returns: string
      }
      resolve_notification: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      select_plan: { Args: { p_plan_id: string }; Returns: Json }
      set_user_active_context: {
        Args: {
          p_company_id?: string
          p_marketplace_account_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      snooze_notification: {
        Args: { p_notification_id: string; p_snooze_hours?: number }
        Returns: undefined
      }
      start_company_trial: { Args: { p_company_id: string }; Returns: Json }
      start_user_trial: {
        Args: { p_plan_code?: string; p_user_id: string }
        Returns: string
      }
      sync_visual_group_to_templates: {
        Args: { p_group_id: string }
        Returns: Json
      }
      track_module_usage: {
        Args: {
          p_is_action?: boolean
          p_module_slug: string
          p_seller_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      update_onboarding_state: {
        Args: {
          p_label_size?: string
          p_objective?: string[]
          p_print_mode?: string
          p_status?: Database["public"]["Enums"]["onboarding_status"]
        }
        Returns: {
          active_subscription_id: string | null
          created_at: string
          default_label_size: string | null
          default_print_mode: string | null
          id: string
          ml_account_connected: boolean
          ml_account_id: string | null
          ml_account_role: Database["public"]["Enums"]["ml_account_role"]
          onboarding_completed_at: string | null
          onboarding_objective: string[] | null
          onboarding_status: Database["public"]["Enums"]["onboarding_status"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          selected_plan_id: string | null
          trial_end_at: string | null
          trial_start_at: string | null
          trial_status: Database["public"]["Enums"]["trial_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_access_state"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "seller"
      billing_cycle: "monthly" | "quarterly" | "semiannual" | "annual"
      ml_account_role: "none" | "owner" | "collaborator"
      module_layer:
        | "admin"
        | "marketplace"
        | "operacional"
        | "ferramentas"
        | "sistema"
        | "financeiro"
      notification_category:
        | "qa_pending"
        | "qa_sla_warning"
        | "qa_sla_breached"
        | "qa_blocked"
        | "qa_send_error"
        | "post_sale_blocked"
        | "post_sale_error"
        | "system_alert"
        | "task_assigned"
        | "promotion_alert"
      notification_priority: "low" | "normal" | "high" | "urgent"
      onboarding_status: "pending" | "completed"
      payment_status: "free" | "trial" | "active" | "blocked" | "cancelled"
      plan_type_enum: "volume" | "zpl_full"
      post_sale_logistics_profile: "mercado_envios" | "full" | "outros"
      post_sale_message_status:
        | "enviado"
        | "bloqueado"
        | "erro"
        | "pendente"
        | "rascunho"
      post_sale_message_type: "informativa" | "preventiva" | "relacionamento"
      post_sale_trigger_event:
        | "venda_confirmada"
        | "pedido_enviado"
        | "pedido_entregue"
      pricing_event_type:
        | "created"
        | "recalculated"
        | "saved"
        | "approved"
        | "duplicated"
        | "archived"
      pricing_product_ref_type: "listing" | "variant" | "manual"
      pricing_simulation_status: "draft" | "saved" | "approved" | "archived"
      qa_question_status:
        | "pending"
        | "answered"
        | "draft"
        | "archived"
        | "blocked"
      qa_response_source:
        | "manual"
        | "library"
        | "ai_suggested"
        | "ai_edited"
        | "ml_synced"
      qa_risk_level: "low" | "medium" | "high"
      send_growth_stage: "seed" | "sprout" | "growing" | "mature" | "fruiting"
      send_health_status: "healthy" | "stagnant" | "weakening" | "dormant"
      send_position_tier:
        | "top_page_1"
        | "page_1"
        | "page_2"
        | "page_3_plus"
        | "not_found"
      support_ticket_category:
        | "bug"
        | "question"
        | "suggestion"
        | "financial"
        | "integration"
        | "other"
      support_ticket_priority: "low" | "medium" | "high" | "urgent"
      support_ticket_status:
        | "open"
        | "in_progress"
        | "waiting_response"
        | "resolved"
        | "closed"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "doing" | "blocked" | "done"
      trial_status: "none" | "active" | "expired"
      workspace_role: "admin" | "gestor" | "operador" | "visualizador"
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
    Enums: {
      app_role: ["admin", "seller"],
      billing_cycle: ["monthly", "quarterly", "semiannual", "annual"],
      ml_account_role: ["none", "owner", "collaborator"],
      module_layer: [
        "admin",
        "marketplace",
        "operacional",
        "ferramentas",
        "sistema",
        "financeiro",
      ],
      notification_category: [
        "qa_pending",
        "qa_sla_warning",
        "qa_sla_breached",
        "qa_blocked",
        "qa_send_error",
        "post_sale_blocked",
        "post_sale_error",
        "system_alert",
        "task_assigned",
        "promotion_alert",
      ],
      notification_priority: ["low", "normal", "high", "urgent"],
      onboarding_status: ["pending", "completed"],
      payment_status: ["free", "trial", "active", "blocked", "cancelled"],
      plan_type_enum: ["volume", "zpl_full"],
      post_sale_logistics_profile: ["mercado_envios", "full", "outros"],
      post_sale_message_status: [
        "enviado",
        "bloqueado",
        "erro",
        "pendente",
        "rascunho",
      ],
      post_sale_message_type: ["informativa", "preventiva", "relacionamento"],
      post_sale_trigger_event: [
        "venda_confirmada",
        "pedido_enviado",
        "pedido_entregue",
      ],
      pricing_event_type: [
        "created",
        "recalculated",
        "saved",
        "approved",
        "duplicated",
        "archived",
      ],
      pricing_product_ref_type: ["listing", "variant", "manual"],
      pricing_simulation_status: ["draft", "saved", "approved", "archived"],
      qa_question_status: [
        "pending",
        "answered",
        "draft",
        "archived",
        "blocked",
      ],
      qa_response_source: [
        "manual",
        "library",
        "ai_suggested",
        "ai_edited",
        "ml_synced",
      ],
      qa_risk_level: ["low", "medium", "high"],
      send_growth_stage: ["seed", "sprout", "growing", "mature", "fruiting"],
      send_health_status: ["healthy", "stagnant", "weakening", "dormant"],
      send_position_tier: [
        "top_page_1",
        "page_1",
        "page_2",
        "page_3_plus",
        "not_found",
      ],
      support_ticket_category: [
        "bug",
        "question",
        "suggestion",
        "financial",
        "integration",
        "other",
      ],
      support_ticket_priority: ["low", "medium", "high", "urgent"],
      support_ticket_status: [
        "open",
        "in_progress",
        "waiting_response",
        "resolved",
        "closed",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "doing", "blocked", "done"],
      trial_status: ["none", "active", "expired"],
      workspace_role: ["admin", "gestor", "operador", "visualizador"],
    },
  },
} as const
