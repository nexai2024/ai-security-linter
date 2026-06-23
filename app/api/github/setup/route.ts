import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { App } from "octokit";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const installationId = searchParams.get("installation_id");

    if (!installationId) {
      // If no installation_id, just redirect back to dashboard
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    const supabase = createSupabaseServiceClient();

    // Initialize octokit app
    const app = new App({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    });

    // 1. Get installation details
    const { data: installation } = await app.octokit.rest.apps.getInstallation({
      installation_id: Number(installationId),
    });

    if (!installation || !installation.account) {
      console.error("[GithubSetup] Failed to fetch installation details from GitHub.");
      return NextResponse.redirect(new URL("/dashboard?error=installation_failed", req.url));
    }

    const accountInfo = installation.account as {
      id: number;
      login?: string;
      slug?: string;
      name?: string;
      type?: string;
      avatar_url?: string;
    };

    // 2. Upsert account to database with the user's clerk_user_id
    const { error: accountError } = await supabase
      .from("accounts")
      .upsert(
        {
          id: accountInfo.id,
          login: accountInfo.login || accountInfo.slug || accountInfo.name || "unknown",
          type: (accountInfo.type || "user").toLowerCase(),
          avatar_url: accountInfo.avatar_url || null,
          installation_id: Number(installationId),
          clerk_user_id: userId,
        },
        { onConflict: "id" }
      );

    if (accountError) {
      console.error("[GithubSetup] Database error upserting account:", accountError);
      return NextResponse.redirect(new URL("/dashboard?error=db_account_sync_failed", req.url));
    }

    // 3. Get installation client & sync repositories
    const octokit = await app.getInstallationOctokit(Number(installationId));
    const { data: reposData } = await octokit.rest.apps.listReposAccessibleToInstallation();

    if (reposData.repositories && reposData.repositories.length > 0) {
      const reposToUpsert = reposData.repositories.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner_id: installation.account!.id,
        github_installation_id: Number(installationId),
      }));

      const { error: reposError } = await supabase
        .from("repositories")
        .upsert(reposToUpsert, { onConflict: "id" });

      if (reposError) {
        console.error("[GithubSetup] Database error syncing repositories:", reposError);
      }
    }

    // Redirect to dashboard on success
    return NextResponse.redirect(new URL("/dashboard?setup_success=true", req.url));
  } catch (error) {
    const err = error as Error;
    console.error("[GithubSetup] Unexpected error:", err);
    return NextResponse.redirect(
      new URL(`/dashboard?error=${encodeURIComponent(err?.message || "unknown")}`, req.url)
    );
  }
}
