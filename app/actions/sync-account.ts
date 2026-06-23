"use server";

import { currentUser, auth } from "@clerk/nextjs/server";
import { createSupabaseServiceClient } from "@/lib/supabase";

export async function syncAccount() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Not authenticated" };
    }

    const user = await currentUser();
    if (!user) {
      return { success: false, error: "User profile not found" };
    }

    // Look for GitHub oauth external account
    const githubAccount = user.externalAccounts.find(
      (acc) => acc.provider === "oauth_github"
    ) as unknown as { providerUserId: string; username?: string; avatarUrl?: string };

    if (!githubAccount) {
      return { success: false, error: "GitHub account not connected in Clerk" };
    }

    const githubUserId = parseInt(githubAccount.providerUserId, 10);
    if (isNaN(githubUserId)) {
      return { success: false, error: "Invalid GitHub ID" };
    }

    const supabase = createSupabaseServiceClient();

    // Sync account details
    const { error } = await supabase
      .from("accounts")
      .upsert(
        {
          id: githubUserId,
          login: githubAccount.username || "unknown",
          type: "user",
          avatar_url: githubAccount.avatarUrl || user.imageUrl,
          clerk_user_id: userId,
        },
        { onConflict: "id" }
      );

    if (error) {
      console.error("[SyncAccount] Database error syncing account:", error);
      return { success: false, error: error.message };
    }

    return { success: true, githubUserId };
  } catch (error) {
    const err = error as Error;
    console.error("[SyncAccount] Error during sync:", err);
    return { success: false, error: err?.message || "Internal error" };
  }
}
