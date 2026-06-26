import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase";

const isDashboardRoute = createRouteMatcher(["/dashboard(.*)"]);
const isGitHubWebhookRoute = createRouteMatcher(["/api/webhook/github"]);

export default clerkMiddleware(async (auth, req) => {
  if (isDashboardRoute(req)) {
    await auth.protect();
  }

  if (isGitHubWebhookRoute(req)) {
    try {
      const body = await req.clone().json();
      if (body.pull_request && (body.action === "opened" || body.action === "synchronize")) {
        const ownerId = body.repository.owner.id;
        const supabase = createSupabaseServiceClient();

        const { data: account } = await supabase
          .from("accounts")
          .select("scan_limit, scans_used")
          .eq("id", ownerId)
          .single();

        if (account && account.scans_used >= account.scan_limit) {
          console.warn(`[Middleware] Blocked scan for account ${ownerId}: Limit reached (${account.scans_used}/${account.scan_limit})`);
          return NextResponse.json({ error: "Monthly scan limit reached" }, { status: 403 });
        }
      }
    } catch (e) {
      console.error("[Middleware] Error parsing webhook body:", e);
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
