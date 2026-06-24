import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

interface ClerkWebhookData {
  id: string;
  email_addresses?: Array<{ email_address: string }>;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  username?: string | null;
  external_accounts?: Array<{
    provider: string;
    provider_user_id: string;
    username?: string;
    avatar_url?: string;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    console.log("[ClerkWebhook] Received webhook POST request")
    const evt = await verifyWebhook(req)
    const eventType = evt.type
    const userData = evt.data as unknown as ClerkWebhookData;
    const id = userData.id

    console.log(`[ClerkWebhook] Processing event type: ${eventType} for Clerk user ID: ${id}`)
    console.log('[ClerkWebhook] Webhook payload data:', JSON.stringify(userData, null, 2))

    let result = {}

    if (eventType === "user.created" || eventType === "user.updated") {
      result = await upsertUser(userData)
    } else if (eventType === "user.deleted") {
      result = await deleteUser(id)
    }

    return new Response(JSON.stringify({ message: 'Webhook processed successfully', result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const error = err as Error;
    console.error('[ClerkWebhook] Webhook processing failed:', error)
    return new Response(JSON.stringify({ error: 'Webhook processing failed', details: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

async function upsertUser(userData: ClerkWebhookData) {
  try {
    console.log(`[ClerkWebhook] upsertUser triggered for Clerk user ID: ${userData.id}`)
    
    // Look for GitHub external account in Clerk data
    const githubAccount = userData.external_accounts?.find(
      (acc) => acc.provider === "github" || acc.provider === "oauth_github"
    );

    if (!githubAccount) {
      console.log(`[ClerkWebhook] Skip: No connected GitHub external account found for Clerk user ${userData.id}`);
      return { status: "skipped", reason: "no_github_account" };
    }

    const githubUserId = parseInt(githubAccount.provider_user_id, 10);
    if (isNaN(githubUserId)) {
      console.error(`[ClerkWebhook] Error: GitHub provider_user_id "${githubAccount.provider_user_id}" is not a valid number.`);
      return { status: "error", reason: "invalid_github_id" };
    }

    const supabase = createSupabaseServiceClient();

    // Extract default login / email
    const email = userData.email_addresses?.[0]?.email_address || "unknown";
    const login = githubAccount.username || userData.username || email;

    const payload = {
      id: githubUserId,
      login: login,
      type: "user",
      avatar_url: githubAccount.avatar_url || userData.image_url || null,
      clerk_user_id: userData.id,
    };

    console.log(`[ClerkWebhook] Upserting to Supabase accounts with payload:`, JSON.stringify(payload, null, 2));

    const { data: user, error } = await supabase
      .from("accounts")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("[ClerkWebhook] Database error in upsert operation:", error);
      throw new Error(`Database upsert failed: ${error.message}`);
    }

    console.log("[ClerkWebhook] Successfully upserted account in Supabase:", JSON.stringify(user, null, 2));
    return { status: "success", user };
  } catch (error) {
    const err = error as Error;
    console.error("[ClerkWebhook] Exception in upsertUser function:", err);
    throw err;
  }
}

async function deleteUser(clerkUserId: string) {
  try {
    console.log(`[ClerkWebhook] deleteUser triggered for Clerk user ID: ${clerkUserId}`);
    const supabase = createSupabaseServiceClient();

    // Delete the account (cascades deletion to repositories & scan runs)
    const { data, error } = await supabase
      .from("accounts")
      .delete()
      .eq("clerk_user_id", clerkUserId)
      .select();

    if (error) {
      console.error("[ClerkWebhook] Database error in delete operation:", error);
      throw new Error(`Database delete failed: ${error.message}`);
    }

    console.log("[ClerkWebhook] Successfully deleted account rows in Supabase:", JSON.stringify(data, null, 2));
    return { status: "success", deletedCount: data?.length || 0 };
  } catch (error) {
    const err = error as Error;
    console.error("[ClerkWebhook] Exception in deleteUser function:", err);
    throw err;
  }
}