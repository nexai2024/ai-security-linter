import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { inngest } from "@/lib/inngest";

// --- WEBHOOK SIGNATURE VERIFICATION ---
function verifySignature(payload: string, signature: string, secret: string): boolean {
  try {
    const hmac = createHmac("sha256", secret);
    const digest = "sha256=" + hmac.update(payload).digest("hex");
    
    const signatureBuffer = Buffer.from(signature, "utf8");
    const digestBuffer = Buffer.from(digest, "utf8");
    
    if (signatureBuffer.length !== digestBuffer.length) {
      return false;
    }
    return timingSafeEqual(signatureBuffer, digestBuffer);
  } catch (error) {
    console.error("[Webhook] Signature verification error:", error);
    return false;
  }
}

// --- WEBHOOK HANDLER ---
export async function POST(req: Request) {
  try {
    const bodyText = await req.text();
    const signature = req.headers.get("x-hub-signature-256") || "";
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!secret) {
      console.error("[Vibe-Check] GITHUB_WEBHOOK_SECRET is not configured in .env");
      return NextResponse.json({ success: false, error: "Webhook secret is missing from environment" }, { status: 500 });
    }

    if (!verifySignature(bodyText, signature, secret)) {
      console.warn("[Vibe-Check] Webhook signature verification failed.");
      return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(bodyText);
    const eventType = req.headers.get("x-github-event");
    const supabase = createSupabaseServiceClient();

    if (eventType === "installation") {
      const action = payload.action;
      const installationId = payload.installation.id;
      const account = payload.installation.account;

      console.log(`[Vibe-Check Webhook] Installation event received: ${action} for installation ID ${installationId}`);

      if (action === "created") {
        // 1. Upsert account
        const { error: accErr } = await supabase.from("accounts").upsert({
          id: account.id,
          login: account.login,
          type: account.type.toLowerCase(),
          avatar_url: account.avatar_url || null,
          installation_id: installationId,
        }, { onConflict: "id" });

        if (accErr) console.error("[Vibe-Check Webhook] Error upserting account on installation.created:", accErr);

        // 2. Upsert repositories
        const repos = (payload.repositories || []) as Array<{ id: number; name: string; full_name: string }>;
        if (repos.length > 0) {
          const reposToUpsert = repos.map((r) => ({
            id: r.id,
            name: r.name,
            full_name: r.full_name,
            owner_id: account.id,
            github_installation_id: installationId,
          }));

          const { error: repoErr } = await supabase.from("repositories").upsert(reposToUpsert, { onConflict: "id" });
          if (repoErr) console.error("[Vibe-Check Webhook] Error upserting repos on installation.created:", repoErr);
        }
      } else if (action === "deleted") {
        // Remove installation_id from account
        await supabase.from("accounts").update({ installation_id: null }).eq("installation_id", installationId);
        // Cascade delete repositories
        const { error: deleteErr } = await supabase.from("repositories").delete().eq("github_installation_id", installationId);
        if (deleteErr) console.error("[Vibe-Check Webhook] Error deleting repositories on installation.deleted:", deleteErr);
      }

      return NextResponse.json({ success: true });
    }

    if (eventType === "installation_repositories") {
      const action = payload.action;
      const installationId = payload.installation.id;
      const account = payload.installation.account;

      console.log(`[Vibe-Check Webhook] Installation repositories event: ${action} for installation ${installationId}`);

      if (action === "added") {
        const reposAdded = (payload.repositories_added || []) as Array<{ id: number; name: string; full_name: string }>;
        if (reposAdded.length > 0) {
          const reposToUpsert = reposAdded.map((r) => ({
            id: r.id,
            name: r.name,
            full_name: r.full_name,
            owner_id: account.id,
            github_installation_id: installationId,
          }));

          const { error: repoErr } = await supabase.from("repositories").upsert(reposToUpsert, { onConflict: "id" });
          if (repoErr) console.error("[Vibe-Check Webhook] Error adding repositories:", repoErr);
        }
      } else if (action === "removed") {
        const reposRemoved = (payload.repositories_removed || []) as Array<{ id: number }>;
        if (reposRemoved.length > 0) {
          const ids = reposRemoved.map((r) => r.id);
          const { error: deleteErr } = await supabase.from("repositories").delete().in("id", ids);
          if (deleteErr) console.error("[Vibe-Check Webhook] Error removing repositories:", deleteErr);
        }
      }

      return NextResponse.json({ success: true });
    }

    if (eventType === "pull_request" && (payload.action === "opened" || payload.action === "synchronize")) {
      console.log(`[Vibe-Check] Received PR #${payload.pull_request.number}. Queueing scan.`);

      const installationId = payload.installation?.id;
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      const pull_number = payload.pull_request.number;
      const commit_id = payload.pull_request.head.sha;

      // --- DATABASE LOGGING: UPSERT ACCOUNT & REPOSITORY ---
      const { error: accountError } = await supabase
        .from("accounts")
        .upsert({
          id: payload.repository.owner.id,
          login: payload.repository.owner.login,
          type: payload.repository.owner.type,
          avatar_url: payload.repository.owner.avatar_url,
          installation_id: installationId || null,
        }, { onConflict: "id" });

      if (accountError) {
        console.error("[Vibe-Check] Database error upserting account:", accountError);
      }

      const { error: repoError } = await supabase
        .from("repositories")
        .upsert({
          id: payload.repository.id,
          name: repo,
          full_name: payload.repository.full_name,
          owner_id: payload.repository.owner.id,
          github_installation_id: installationId || null,
        }, { onConflict: "id" });

      if (repoError) {
        console.error("[Vibe-Check] Database error upserting repository:", repoError);
      }

      // Increment scans_used
      const { error: incError } = await supabase.rpc('increment_scans_used', { row_id: payload.repository.owner.id });
      if (incError) {
         console.warn("[Vibe-Check] RPC increment_scans_used failed, trying manual increment", incError);
         const { data: acc } = await supabase.from("accounts").select("scans_used").eq("id", payload.repository.owner.id).single();
         if (acc) {
            await supabase.from("accounts").update({ scans_used: (acc.scans_used || 0) + 1 }).eq("id", payload.repository.owner.id);
         }
      }

      // --- DATABASE LOGGING: CREATE SCAN RUN ---
      const { data: scanRun, error: scanRunError } = await supabase
        .from("scan_runs")
        .insert({
          repository_id: payload.repository.id,
          pull_request_number: pull_number,
          commit_sha: commit_id,
          status: "PENDING",
          violations_count: 0,
        })
        .select()
        .single();

      if (scanRunError) {
        console.error("[Vibe-Check] Database error creating scan run:", scanRunError);
      }

      // --- TRIGGER INNGEST BACKGROUND SCAN ---
      if (scanRun) {
        await inngest.send({
          name: "github/pull_request.scan",
          data: {
            installationId,
            owner,
            repo,
            pull_number,
            commit_id,
            repository_id: payload.repository.id,
            scan_run_id: scanRun.id,
          }
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Vibe-Check] Error handling webhook request:", error);
    return NextResponse.json({ success: false, error: "Internal Error" }, { status: 500 });
  }
}
