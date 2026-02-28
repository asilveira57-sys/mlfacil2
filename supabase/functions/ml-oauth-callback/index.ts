import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code) {
      throw new Error('Missing authorization code');
    }

    console.log('Processing OAuth callback with code');

    // Parse state to get frontend origin, user_id, and company_id
    let frontendOrigin = 'https://lovable.dev';
    let userId = '';
    let companyId: string | null = null;
    
    try {
      if (state) {
        const stateData = JSON.parse(atob(state));
        frontendOrigin = stateData.origin || frontendOrigin;
        userId = stateData.userId || '';
        companyId = stateData.companyId || null;
      }
    } catch (e) {
      console.log('Could not parse state, using default origin');
    }

    console.log('Frontend origin:', frontendOrigin);
    console.log('User ID from state:', userId);
    console.log('Company ID from state:', companyId || 'none');

    if (!userId) {
      const errorUrl = new URL(`${frontendOrigin}/dashboard`);
      errorUrl.searchParams.set('ml_error', 'missing_user_id');
      return Response.redirect(errorUrl.toString(), 302);
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: Deno.env.get('ML_APP_ID') || '',
        client_secret: Deno.env.get('ML_SECRET_KEY') || '',
        code: code,
        redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/ml-oauth-callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Token exchange failed:', error);
      
      const errorUrl = new URL(`${frontendOrigin}/dashboard`);
      errorUrl.searchParams.set('ml_error', 'token_exchange_failed');
      return Response.redirect(errorUrl.toString(), 302);
    }

    const tokenData = await tokenResponse.json();
    console.log('Token received successfully');

    // Get user info from ML
    const userResponse = await fetch('https://api.mercadolibre.com/users/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      const errorUrl = new URL(`${frontendOrigin}/dashboard`);
      errorUrl.searchParams.set('ml_error', 'user_fetch_failed');
      return Response.redirect(errorUrl.toString(), 302);
    }

    const userData = await userResponse.json();
    console.log('User data received:', userData.id);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);

    // Initialize Supabase client with service role key to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const mlUserIdStr = userData.id.toString();
    const now = new Date().toISOString();

    // ================================================================
    // MULTI-ACCOUNT FIX: Do NOT deactivate other accounts!
    // Each account maintains its own independent connection status.
    // ================================================================
    
    // Check if this specific ML account already exists for this user
    const { data: existingAccount } = await supabaseAdmin
      .from('ml_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('ml_user_id', mlUserIdStr)
      .maybeSingle();

    let mlAccountId: string;

    if (existingAccount) {
      mlAccountId = existingAccount.id;
      console.log('Updating existing account:', mlAccountId);
      
      const updateData: Record<string, unknown> = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        nickname: userData.nickname || null,
        email: userData.email || null,
        country_id: userData.site_id || null,
        connection_status: 'connected',
        is_active: true,
        is_connected: true,
        last_token_refresh_at: now,
        last_api_ok_at: now,
        last_api_error_code: null,
        last_api_error_at: null,
        consecutive_failures: 0,
        updated_at: now,
      };
      
      if (companyId) {
        updateData.company_id = companyId;
      }
      
      const { error: updateError } = await supabaseAdmin
        .from('ml_accounts')
        .update(updateData)
        .eq('id', existingAccount.id);

      if (updateError) {
        console.error('Error updating ML account:', updateError);
        const errorUrl = new URL(`${frontendOrigin}/dashboard`);
        errorUrl.searchParams.set('ml_error', 'save_failed');
        return Response.redirect(errorUrl.toString(), 302);
      }
    } else {
      console.log('Creating new ML account for seller:', mlUserIdStr, 'with company:', companyId || 'none');
      
      const insertData: Record<string, unknown> = {
        user_id: userId,
        ml_user_id: mlUserIdStr,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        nickname: userData.nickname || null,
        email: userData.email || null,
        country_id: userData.site_id || null,
        connection_status: 'connected',
        is_active: true,
        is_connected: true,
        last_token_refresh_at: now,
        last_api_ok_at: now,
        consecutive_failures: 0,
      };
      
      if (companyId) {
        insertData.company_id = companyId;
      }
      
      const { data: newAccount, error: insertError } = await supabaseAdmin
        .from('ml_accounts')
        .insert(insertData)
        .select('id')
        .single();

      if (insertError || !newAccount) {
        console.error('Error creating ML account:', insertError);
        const errorUrl = new URL(`${frontendOrigin}/dashboard`);
        errorUrl.searchParams.set('ml_error', 'save_failed');
        return Response.redirect(errorUrl.toString(), 302);
      }
      
      mlAccountId = newAccount.id;
    }

    console.log('ML account saved successfully');

    // ================================================================
    // TRIAL + BOOTSTRAP: Start trial on first OAuth and trigger 30d import
    // ================================================================
    
    // Resolve company_id if not provided in state
    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId) {
      // Try to get company from ml_account
      const { data: mlAcc } = await supabaseAdmin
        .from('ml_accounts')
        .select('company_id')
        .eq('id', mlAccountId)
        .single();
      
      resolvedCompanyId = mlAcc?.company_id || null;
      
      // If still no company, try user's default company
      if (!resolvedCompanyId) {
        const { data: userCompany } = await supabaseAdmin
          .from('companies')
          .select('id')
          .eq('user_id', userId)
          .eq('is_active', true)
          .limit(1)
          .single();
        
        resolvedCompanyId = userCompany?.id || null;
        
        // Link ml_account to company if found
        if (resolvedCompanyId) {
          await supabaseAdmin
            .from('ml_accounts')
            .update({ company_id: resolvedCompanyId })
            .eq('id', mlAccountId);
        }
      }
    }

    if (resolvedCompanyId) {
      // Start trial if first OAuth connection ever for this company
      try {
        const { data: trialResult } = await supabaseAdmin.rpc('start_company_trial', {
          p_company_id: resolvedCompanyId,
        });
        
        if (trialResult?.started) {
          console.log('Trial started for company:', resolvedCompanyId, 'ends at:', trialResult.trial_ends_at);
        } else {
          console.log('Trial already started or not applicable:', trialResult?.reason);
        }
      } catch (trialErr) {
        console.error('Error starting trial (non-fatal):', trialErr);
      }

      // Create bootstrap_30d job (idempotent via unique constraint)
      try {
        const windowEnd = new Date();
        const windowStart = new Date(windowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        // Truncate to day boundaries for idempotency
        windowStart.setHours(0, 0, 0, 0);
        windowEnd.setHours(23, 59, 59, 999);

        const { data: existingJob } = await supabaseAdmin
          .from('sync_jobs')
          .select('id, status')
          .eq('company_id', resolvedCompanyId)
          .eq('ml_account_id', mlAccountId)
          .eq('job_type', 'bootstrap_30d')
          .eq('status', 'success')
          .limit(1)
          .maybeSingle();

        if (existingJob) {
          console.log('Bootstrap already completed for this account, skipping');
        } else {
          const { error: jobError } = await supabaseAdmin
            .from('sync_jobs')
            .upsert({
              user_id: userId,
              seller_id: mlUserIdStr,
              company_id: resolvedCompanyId,
              ml_account_id: mlAccountId,
              job_type: 'bootstrap_30d',
              status: 'processing',
              window_start: windowStart.toISOString(),
              window_end: windowEnd.toISOString(),
              total_records: 0,
              processed_records: 0,
            }, {
              onConflict: 'company_id,ml_account_id,job_type,window_start,window_end',
              ignoreDuplicates: true,
            });

          if (jobError) {
            console.error('Error creating bootstrap job (non-fatal):', jobError);
          } else {
            console.log('Bootstrap 30d job created for account:', mlAccountId);
          }
        }
      } catch (bootstrapErr) {
        console.error('Error setting up bootstrap (non-fatal):', bootstrapErr);
      }
    } else {
      console.warn('No company found for user, trial/bootstrap skipped');
    }

    console.log('ML OAuth completed successfully');

    // Redirect back to frontend dashboard with success flag
    const redirectUrl = new URL(`${frontendOrigin}/dashboard`);
    redirectUrl.searchParams.set('ml_connected', 'true');
    redirectUrl.searchParams.set('nickname', userData.nickname || '');
    
    return Response.redirect(redirectUrl.toString(), 302);

  } catch (error) {
    console.error('OAuth callback error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: 'Failed to process OAuth callback'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
