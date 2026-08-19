// Shared Mercado Livre token freshness helper.
//
// Root cause it fixes: several sync workers read `ml_accounts.access_token`
// blindly. When the token expires (6h TTL) every ML call returns 401 and the
// account silently stops syncing FOREVER — no orders, no shipments, and the
// UI ends up showing "sem vendas" for a perfectly active seller.
//
// Any worker that touches the ML API must call `ensureFreshToken` first.

const ML_APP_ID = Deno.env.get("ML_APP_ID") || "";
const ML_SECRET_KEY = Deno.env.get("ML_SECRET_KEY") || "";

// Refresh a bit before the real expiry so long-running batches never expire mid-run.
const SAFETY_WINDOW_MS = 10 * 60 * 1000;

export interface MlTokenAccount {
  id: string;
  ml_user_id: string;
  access_token?: string | null;
  refresh_token?: string | null;
  token_expires_at?: string | null;
}

/**
 * Returns a valid access token for the account, refreshing + persisting it when
 * it is expired (or about to expire). Returns null when the connection is dead
 * (invalid_grant) so the caller can skip the account instead of looping on 401.
 */
export async function ensureFreshToken(
  supabaseAdmin: any,
  account: MlTokenAccount,
  logPrefix = "[ml-token]",
): Promise<string | null> {
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  const stillValid = expiresAt > Date.now() + SAFETY_WINDOW_MS;

  if (stillValid && account.access_token) return account.access_token;
  if (!account.refresh_token) {
    console.warn(`${logPrefix} No refresh token for seller ${account.ml_user_id}`);
    return account.access_token || null;
  }

  try {
    const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: ML_APP_ID,
        client_secret: ML_SECRET_KEY,
        refresh_token: account.refresh_token,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      let code = "refresh_failed";
      try { if (JSON.parse(text)?.error === "invalid_grant") code = "invalid_grant"; } catch { /* noop */ }
      console.error(`${logPrefix} Refresh failed for ${account.ml_user_id}: ${resp.status} ${text.slice(0, 200)}`);

      await supabaseAdmin
        .from("ml_accounts")
        .update({
          connection_status: code === "invalid_grant" ? "disconnected" : "attention",
          last_api_error_code: code,
          last_api_error_at: new Date().toISOString(),
        })
        .eq("id", account.id);

      return code === "invalid_grant" ? null : (account.access_token || null);
    }

    const data = await resp.json();
    const expiresIn = Number(data.expires_in) || 21600;

    await supabaseAdmin
      .from("ml_accounts")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token || account.refresh_token,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        last_token_refresh_at: new Date().toISOString(),
        connection_status: "connected",
        last_api_error_code: null,
        consecutive_failures: 0,
      })
      .eq("id", account.id);

    console.log(`${logPrefix} Token refreshed for seller ${account.ml_user_id}`);
    return data.access_token as string;
  } catch (err) {
    console.error(`${logPrefix} Refresh error for ${account.ml_user_id}:`, err);
    return account.access_token || null;
  }
}
