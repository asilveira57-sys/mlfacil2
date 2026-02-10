/**
 * ML API Access Gate
 * 
 * Shared utility to check if a user/company has permission to call ML API.
 * Must be called at the start of EVERY edge function that hits the Mercado Livre API.
 * 
 * Usage:
 *   import { assertMlApiAccess } from "../_shared/ml-api-gate.ts";
 *   const gate = await assertMlApiAccess(supabaseAdmin, userId);
 *   if (!gate.allowed) return gate.response; // returns 402/403 Response
 */

interface MlApiGateResult {
  allowed: boolean;
  reason: string;
  response?: Response; // Pre-built error Response when not allowed
  trial_ends_at?: string;
  trial_days_remaining?: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

export async function assertMlApiAccess(
  supabaseAdmin: any,
  userId: string,
): Promise<MlApiGateResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc('check_ml_api_access', {
      p_user_id: userId,
    });

    if (error) {
      console.error('[ml-api-gate] RPC error:', error.message);
      // On error, deny access as safety measure
      return {
        allowed: false,
        reason: 'gate_error',
        response: new Response(
          JSON.stringify({
            error: 'Failed to verify API access',
            error_code: 'GATE_ERROR',
            message: 'Erro ao verificar permissão de acesso. Tente novamente.',
          }),
          { status: 500, headers: corsHeaders }
        ),
      };
    }

    const result = data as {
      allowed: boolean;
      reason: string;
      error_code?: string;
      message?: string;
      trial_ends_at?: string;
      trial_days_remaining?: number;
    };

    if (result.allowed) {
      return {
        allowed: true,
        reason: result.reason,
        trial_ends_at: result.trial_ends_at,
        trial_days_remaining: result.trial_days_remaining,
      };
    }

    // Map reason to HTTP status
    const statusCode = result.error_code === 'TRIAL_EXPIRED' ? 402 : 403;

    return {
      allowed: false,
      reason: result.reason,
      response: new Response(
        JSON.stringify({
          error: result.message || 'Access denied',
          error_code: result.error_code || 'ACCESS_DENIED',
          reason: result.reason,
          trial_ends_at: result.trial_ends_at,
        }),
        { status: statusCode, headers: corsHeaders }
      ),
    };
  } catch (err) {
    console.error('[ml-api-gate] Unexpected error:', err);
    return {
      allowed: false,
      reason: 'unexpected_error',
      response: new Response(
        JSON.stringify({
          error: 'Internal error checking access',
          error_code: 'GATE_ERROR',
        }),
        { status: 500, headers: corsHeaders }
      ),
    };
  }
}
