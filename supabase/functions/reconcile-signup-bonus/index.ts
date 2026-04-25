import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const SIGNUP_BONUS_AMOUNT = 1500;
const SIGNUP_RULE_KEY = "signup_bonus_v1";
const SIGNUP_TRANSACTION_TYPE = "signup_bonus";

type WalletRow = {
  id: string;
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  last_rewarded_at: string | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return json(
    {
      ok: false,
      code,
      message,
      ...extra,
    },
    status,
  );
}

function isDuplicateConstraintError(message: string, constraintName: string) {
  return message.includes(constraintName) || (message.includes("duplicate key") && message.includes("wallet_transactions"));
}

async function getAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return { error: fail(401, "missing_auth", "Missing Authorization header.") };
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    return { error: fail(401, "invalid_auth", "Invalid or expired session token.") };
  }

  return { user };
}

async function getOrCreateWallet(admin: ReturnType<typeof createClient>, userId: string) {
  const walletQuery = await admin
    .from("wallets")
    .select("id, balance, lifetime_earned, lifetime_spent, last_rewarded_at")
    .eq("owner_profile_id", userId)
    .maybeSingle<WalletRow>();

  if (walletQuery.error) {
    throw new Error(`wallet_lookup_failed:${walletQuery.error.message}`);
  }

  if (walletQuery.data) {
    return {
      wallet: walletQuery.data,
      walletCreated: false,
    };
  }

  const walletInsert = await admin
    .from("wallets")
    .upsert(
      {
        owner_profile_id: userId,
        balance: 0,
        lifetime_earned: 0,
        lifetime_spent: 0,
      },
      {
        onConflict: "owner_profile_id",
      },
    )
    .select("id, balance, lifetime_earned, lifetime_spent, last_rewarded_at")
    .single<WalletRow>();

  if (walletInsert.error || !walletInsert.data) {
    throw new Error(`wallet_create_failed:${walletInsert.error?.message ?? "unknown error"}`);
  }

  return {
    wallet: walletInsert.data,
    walletCreated: true,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return fail(405, "method_not_allowed", "Use POST for this endpoint.");
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return fail(500, "missing_env", "Supabase environment variables are not fully configured.");
  }

  const auth = await getAuthenticatedUser(request);
  if ("error" in auth) {
    return auth.error;
  }

  const userId = auth.user.id;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const profileQuery = await admin
      .from("profiles")
      .select("id, username, role")
      .eq("id", userId)
      .maybeSingle<{ id: string; username: string; role: string }>();

    if (profileQuery.error) {
      return fail(500, "profile_lookup_failed", profileQuery.error.message);
    }

    if (!profileQuery.data) {
      return fail(409, "profile_not_ready", "Profile row is not ready yet. Retry shortly.", {
        retryable: true,
      });
    }

    if (!["participant", "admin"].includes(profileQuery.data.role)) {
      return fail(403, "unsupported_profile_role", "Only human participant/admin profiles can receive signup bonus.");
    }

    const { wallet, walletCreated } = await getOrCreateWallet(admin, userId);

    const existingBonus = await admin
      .from("wallet_transactions")
      .select("id, amount, created_at")
      .eq("wallet_id", wallet.id)
      .eq("transaction_type", SIGNUP_TRANSACTION_TYPE)
      .eq("status", "posted")
      .limit(1)
      .maybeSingle<{ id: string; amount: number; created_at: string }>();

    if (existingBonus.error) {
      return fail(500, "signup_bonus_check_failed", existingBonus.error.message);
    }

    if (existingBonus.data) {
      const refreshedWallet = await admin
        .from("wallets")
        .select("id, balance, lifetime_earned, lifetime_spent, last_rewarded_at")
        .eq("id", wallet.id)
        .single<WalletRow>();

      if (refreshedWallet.error || !refreshedWallet.data) {
        return fail(500, "wallet_refresh_failed", refreshedWallet.error?.message ?? "Wallet refresh failed.");
      }

      return json({
        ok: true,
        wallet_created: walletCreated,
        reward_granted: false,
        reason: "already_granted",
        reward_amount: 0,
        wallet: {
          wallet_id: refreshedWallet.data.id,
          balance: refreshedWallet.data.balance,
          lifetime_earned: refreshedWallet.data.lifetime_earned,
          lifetime_spent: refreshedWallet.data.lifetime_spent,
          last_rewarded_at: refreshedWallet.data.last_rewarded_at,
        },
      });
    }

    let rewardCycleId: string | null = null;
    const cycleWindowStart = new Date("2026-01-01T00:00:00.000Z").toISOString();
    const cycleWindowEnd = new Date("2026-12-31T23:59:59.999Z").toISOString();

    const rewardCycleUpsert = await admin
      .from("reward_cycles")
      .upsert(
        {
          cycle_type: "signup_bonus",
          status: "completed",
          rule_key: SIGNUP_RULE_KEY,
          reward_amount: SIGNUP_BONUS_AMOUNT,
          max_winners: null,
          window_start: cycleWindowStart,
          window_end: cycleWindowEnd,
          processed_at: new Date().toISOString(),
          created_by: null,
          notes: "Signup bonus cycle for MVP rollout.",
          metadata: {
            source: "reconcile-signup-bonus",
          },
        },
        {
          onConflict: "cycle_type,window_start,window_end",
        },
      )
      .select("id")
      .single<{ id: string }>();

    if (!rewardCycleUpsert.error && rewardCycleUpsert.data) {
      rewardCycleId = rewardCycleUpsert.data.id;
    }

    const transactionInsert = await admin
      .from("wallet_transactions")
      .insert({
        wallet_id: wallet.id,
        reward_cycle_id: rewardCycleId,
        direction: "credit",
        transaction_type: SIGNUP_TRANSACTION_TYPE,
        status: "posted",
        amount: SIGNUP_BONUS_AMOUNT,
        balance_before: wallet.balance,
        balance_after: wallet.balance + SIGNUP_BONUS_AMOUNT,
        created_by: null,
        description: "Starter coin bonus after signup.",
        metadata: {
          source: "reconcile-signup-bonus",
        },
      })
      .select("id")
      .single<{ id: string }>();

    if (transactionInsert.error) {
      if (isDuplicateConstraintError(transactionInsert.error.message, "wallet_transactions_signup_bonus_once_idx")) {
        const refreshedWallet = await admin
          .from("wallets")
          .select("id, balance, lifetime_earned, lifetime_spent, last_rewarded_at")
          .eq("id", wallet.id)
          .single<WalletRow>();

        if (refreshedWallet.error || !refreshedWallet.data) {
          return fail(500, "wallet_refresh_failed", refreshedWallet.error?.message ?? "Wallet refresh failed.");
        }

        return json({
          ok: true,
          wallet_created: walletCreated,
          reward_granted: false,
          reason: "already_granted",
          reward_amount: 0,
          wallet: {
            wallet_id: refreshedWallet.data.id,
            balance: refreshedWallet.data.balance,
            lifetime_earned: refreshedWallet.data.lifetime_earned,
            lifetime_spent: refreshedWallet.data.lifetime_spent,
            last_rewarded_at: refreshedWallet.data.last_rewarded_at,
          },
        });
      }

      return fail(500, "transaction_insert_failed", transactionInsert.error.message, {
        note: "For strict race-safety, add a unique constraint or move the full flow into one SQL transaction wrapper later.",
      });
    }

    const walletUpdate = await admin
      .from("wallets")
      .update({
        balance: wallet.balance + SIGNUP_BONUS_AMOUNT,
        lifetime_earned: wallet.lifetime_earned + SIGNUP_BONUS_AMOUNT,
        last_rewarded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", wallet.id)
      .select("id, balance, lifetime_earned, lifetime_spent, last_rewarded_at")
      .single<WalletRow>();

    if (walletUpdate.error || !walletUpdate.data) {
      return fail(500, "wallet_update_failed", walletUpdate.error?.message ?? "Wallet update failed.");
    }

    return json({
      ok: true,
      wallet_created: walletCreated,
      reward_granted: true,
      reason: "granted",
      reward_amount: SIGNUP_BONUS_AMOUNT,
      wallet: {
        wallet_id: walletUpdate.data.id,
        balance: walletUpdate.data.balance,
        lifetime_earned: walletUpdate.data.lifetime_earned,
        lifetime_spent: walletUpdate.data.lifetime_spent,
        last_rewarded_at: walletUpdate.data.last_rewarded_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return fail(500, "unexpected_error", message);
  }
});
