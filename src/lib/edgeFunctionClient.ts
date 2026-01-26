/**
 * Standardized Edge Function API Client
 * Provides resilient error handling for edge function invocations
 */

import { supabase } from '@/integrations/supabase/client';

// Standard API response structure
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Result wrapper for edge function calls
export interface EdgeFunctionResult<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  errorCode: string | null;
  rawResponse?: unknown;
}

interface InvokeOptions {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * Safely parse JSON with fallback
 */
function safeJsonParse<T>(value: unknown): T | null {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

/**
 * Normalize error response to standard format
 */
function normalizeError(err: unknown): { code: string; message: string } {
  if (err instanceof Error) {
    if (err.message?.includes('Unexpected end of JSON input')) {
      return { code: 'EMPTY_RESPONSE', message: 'Resposta vazia do servidor. Tente novamente.' };
    }
    return { code: 'CLIENT_ERROR', message: err.message };
  }
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    return {
      code: (e.code as string) || 'UNKNOWN_ERROR',
      message: (e.message as string) || (e.error as string) || 'Erro desconhecido',
    };
  }
  return { code: 'UNKNOWN_ERROR', message: String(err) };
}

/**
 * Invoke an edge function with standardized error handling
 * 
 * @example
 * const result = await invokeEdgeFunction<SyncResult>('promotions-sync', {
 *   body: { workspace_id, account_id }
 * });
 * 
 * if (!result.success) {
 *   toast.error(result.error);
 *   return;
 * }
 * 
 * console.log(result.data);
 */
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  options: InvokeOptions = {}
): Promise<EdgeFunctionResult<T>> {
  const startTime = Date.now();
  
  console.log(`[EdgeFunction] Invoking ${functionName}`, options.body);
  
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: options.body,
      headers: options.headers,
    });

    const elapsed = Date.now() - startTime;
    console.log(`[EdgeFunction] ${functionName} completed in ${elapsed}ms`);

    // Handle Supabase client-level error
    if (error) {
      console.error(`[EdgeFunction] ${functionName} client error:`, error);

       // Common parse failure when server returns empty/invalid JSON
      const msg = error.message || 'Erro ao chamar função';
      const looksLikeEmptyJson = msg.includes('Unexpected end of JSON input');
      return {
        success: false,
        data: null,
        error: looksLikeEmptyJson ? 'Resposta vazia do servidor. Tente novamente.' : msg,
        errorCode: looksLikeEmptyJson ? 'EMPTY_RESPONSE' : 'INVOKE_ERROR',
        rawResponse: error,
      };
    }

    // Handle empty response
    if (data === null || data === undefined) {
      console.warn(`[EdgeFunction] ${functionName} returned empty response`);
      return {
        success: false,
        data: null,
        error: 'Resposta vazia do servidor',
        errorCode: 'EMPTY_RESPONSE',
      };
    }

    // Parse response if string (edge function might return raw JSON string)
    const parsed = safeJsonParse<Record<string, unknown>>(data);
    
    if (parsed === null) {
      console.error(`[EdgeFunction] ${functionName} invalid JSON:`, data);
      return {
        success: false,
        data: null,
        error: 'Resposta inválida do servidor',
        errorCode: 'INVALID_JSON',
        rawResponse: data,
      };
    }

    // Check for standardized error response { ok: false, error: {...} }
    if (parsed.ok === false && parsed.error) {
      const err = parsed.error as Record<string, unknown>;
      return {
        success: false,
        data: null,
        error: (err.message as string) || 'Erro no servidor',
        errorCode: (err.code as string) || 'SERVER_ERROR',
        rawResponse: parsed,
      };
    }

    // Check for legacy error response { error: "...", success: false }
    if (parsed.success === false || parsed.error) {
      const errorMsg = typeof parsed.error === 'string' 
        ? parsed.error 
        : (parsed.error as Record<string, unknown>)?.message || 'Erro no servidor';
      
      return {
        success: false,
        data: null,
        error: errorMsg as string,
        errorCode: (parsed.error_code as string) || 'SERVER_ERROR',
        rawResponse: parsed,
      };
    }

    // Success - extract data from standardized response or use full response
    const resultData = (parsed.ok === true && parsed.data !== undefined) 
      ? parsed.data 
      : parsed;

    return {
      success: true,
      data: resultData as T,
      error: null,
      errorCode: null,
      rawResponse: parsed,
    };

  } catch (err) {
    console.error(`[EdgeFunction] ${functionName} exception:`, err);
    const normalized = normalizeError(err);
    
    return {
      success: false,
      data: null,
      error: normalized.message,
      errorCode: normalized.code,
    };
  }
}

/**
 * Error codes and their user-friendly messages
 */
export const ERROR_MESSAGES: Record<string, string> = {
  INVOKE_ERROR: 'Erro ao conectar com o servidor. Tente novamente.',
  EMPTY_RESPONSE: 'O servidor não retornou dados. Tente sincronizar novamente.',
  INVALID_JSON: 'Resposta inválida do servidor. Entre em contato com o suporte.',
  SERVER_ERROR: 'Erro no servidor. Tente novamente em alguns minutos.',
  TOKEN_EXPIRED: 'Sua sessão expirou. Reconecte sua conta do Mercado Livre.',
  ML_AUTH_REQUIRED: 'É necessário reconectar sua conta do Mercado Livre.',
  NO_CONNECTED_ACCOUNT: 'Nenhuma conta conectada para esta seleção. Conecte uma conta para continuar.',
  ML_API_ERROR: 'Erro ao comunicar com o Mercado Livre. Tente novamente.',
  NETWORK_ERROR: 'Erro de conexão. Verifique sua internet.',
  UNKNOWN_ERROR: 'Erro inesperado. Tente novamente.',
};

/**
 * Get a user-friendly error message
 */
export function getUserFriendlyError(errorCode: string | null, fallback?: string): string {
  if (!errorCode) return fallback || ERROR_MESSAGES.UNKNOWN_ERROR;
  return ERROR_MESSAGES[errorCode] || fallback || errorCode;
}
