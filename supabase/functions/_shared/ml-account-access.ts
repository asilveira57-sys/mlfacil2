export async function resolveAccessibleMlAccount(
  supabaseAdmin: any,
  supabaseAuth: any,
  userId: string,
  sellerId: string,
  fields: string,
): Promise<{ data: any | null; reason?: string; error?: any }> {
  const normalizedSellerId = String(sellerId);

  const { data: ownAccount, error: ownError } = await supabaseAdmin
    .from("ml_accounts")
    .select(fields)
    .eq("user_id", userId)
    .eq("ml_user_id", normalizedSellerId)
    .eq("is_active", true)
    .maybeSingle();

  if (ownAccount) return { data: ownAccount };
  if (ownError) console.warn("[ml-account-access] own account lookup warning:", ownError.message);

  const { data: accessibleAccounts, error: accessError } = await supabaseAuth
    .rpc("get_accessible_ml_accounts");

  if (accessError) {
    return { data: null, reason: "accessible_accounts_rpc_failed", error: accessError };
  }

  const accessible = ((accessibleAccounts || []) as any[]).find((account) =>
    String(account.ml_user_id) === normalizedSellerId &&
    account.is_connected !== false &&
    ["connected", "attention"].includes(account.connection_status || "connected")
  );

  if (!accessible?.id) {
    return { data: null, reason: "seller_not_accessible" };
  }

  const { data: inheritedAccount, error: inheritedError } = await supabaseAdmin
    .from("ml_accounts")
    .select(fields)
    .eq("id", accessible.id)
    .eq("ml_user_id", normalizedSellerId)
    .eq("is_active", true)
    .maybeSingle();

  if (inheritedError) {
    return { data: null, reason: "inherited_account_lookup_failed", error: inheritedError };
  }

  return inheritedAccount
    ? { data: inheritedAccount }
    : { data: null, reason: "inherited_account_inactive" };
}