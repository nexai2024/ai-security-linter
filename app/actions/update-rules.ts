"use server";

import { auth } from "@clerk/nextjs/server";
import { createSupabaseServiceClient } from "@/lib/supabase";

export async function updateRules(repositoryId: number, ruleSettings: Record<string, boolean>) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Not authenticated" };
    }

    const supabase = createSupabaseServiceClient();

    // 1. Verify ownership: Repository's owner must belong to the user's clerk_user_id
    const { data: repo, error: repoError } = await supabase
      .from("repositories")
      .select("owner_id")
      .eq("id", repositoryId)
      .single();

    if (repoError || !repo) {
      return { success: false, error: "Repository not found" };
    }

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", repo.owner_id)
      .eq("clerk_user_id", userId)
      .single();

    if (accountError || !account) {
      return { success: false, error: "Unauthorized access to repository settings" };
    }

    // 2. Update rule settings
    const { error: updateError } = await supabase
      .from("repositories")
      .update({ rule_settings: ruleSettings })
      .eq("id", repositoryId);

    if (updateError) {
      console.error("[UpdateRules] Database error updating settings:", updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    const err = error as Error;
    console.error("[UpdateRules] Unexpected error:", err);
    return { success: false, error: err?.message || "Internal error" };
  }
}
