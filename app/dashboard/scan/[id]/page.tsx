import React from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  GitPullRequest,
  CheckCircle,
  Code,
  FileCode,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";

export const revalidate = 0;

interface ScanRunPageProps {
  params: Promise<{ id: string }>;
}

export default async function ScanRunDetailsPage(props: ScanRunPageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id: scanId } = await props.params;
  const supabase = createSupabaseServiceClient();

  // 1. Fetch scan run and its repository details
  const { data: scan, error: scanError } = await supabase
    .from("scan_runs")
    .select("*, repositories(*)")
    .eq("id", scanId)
    .single();

  if (scanError || !scan) {
    return notFound();
  }

  const repo = scan.repositories as { id: number; name: string; full_name: string; owner_id: number };

  // 2. Validate ownership: Verify the repository owner account belongs to the Clerk user
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", repo.owner_id)
    .eq("clerk_user_id", userId)
    .single();

  if (accountError || !account) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center p-4">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4 animate-bounce" />
        <h1 className="text-2xl font-bold">Unauthorized Access</h1>
        <p className="text-muted-foreground mt-2 text-center max-w-md">
          You do not have permissions to view scan reports for this repository.
        </p>
        <Link href="/dashboard" className="mt-6">
          <Button variant="outline" className="border-white/10 text-zinc-300 hover:bg-white/5 rounded-full">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  // 3. Fetch violations for this scan run
  const { data: violations } = await supabase
    .from("scan_violations")
    .select("*")
    .eq("scan_run_id", scanId)
    .order("file_path", { ascending: true })
    .order("line_number", { ascending: true });

  // Group violations by file path
  const groupedViolations: Record<string, NonNullable<typeof violations>> = {};
  if (violations) {
    violations.forEach((v) => {
      if (!groupedViolations[v.file_path]) {
        groupedViolations[v.file_path] = [];
      }
      groupedViolations[v.file_path].push(v);
    });
  }

  const githubUrl = `https://github.com/${repo.full_name}`;
  const prUrl = `${githubUrl}/pull/${scan.pull_request_number}`;
  const commitUrl = `${githubUrl}/commit/${scan.commit_sha}`;

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-12 relative overflow-hidden">
      {/* Decorative radial glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/5 blur-[120px] rounded-full -z-10" />

      <div className="max-w-7xl mx-auto px-4 space-y-8 animate-fade-in">
        {/* Back Link & Header */}
        <div className="space-y-4">
          <Link
            href={`/dashboard/repository/${repo.id}`}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition text-sm cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> Back to {repo.name}
          </Link>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-stretch gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <span>REPOS</span>
                <span>/</span>
                <Link href={`/dashboard/repository/${repo.id}`} className="hover:underline">
                  {repo.name}
                </Link>
                <span>/</span>
                <span>SCANS</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mt-1">
                Scan Report
              </h1>
              <p className="text-muted-foreground text-xs mt-1 font-mono">{scan.id}</p>
            </div>

            <div className="flex items-center gap-3">
              {scan.status === "SAFE" ? (
                <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-sm">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  <span>SECURE & PASSING</span>
                </div>
              ) : scan.status === "VULNERABILITY_CONFIRMED" ? (
                <div className="bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-sm">
                  <ShieldAlert className="h-5 w-5 text-red-400" />
                  <span>ACTION REQUIRED</span>
                </div>
              ) : (
                <div className="bg-white/10 text-muted-foreground border border-white/15 px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-sm">
                  <span>{scan.status}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Execution Summary Card */}
        <Card className="border border-white/5 bg-white/[0.02] backdrop-blur-sm rounded-2xl">
          <CardHeader className="border-b border-white/5 pb-4">
            <CardTitle className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
              Execution Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block">Repository</span>
              <span className="font-semibold text-zinc-200">{repo.full_name}</span>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block">Trigger Mechanism</span>
              <Link
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <GitPullRequest className="h-3.5 w-3.5 inline" /> Pull Request #{scan.pull_request_number}
              </Link>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block">Commit Hash</span>
              <Link
                href={commitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs font-semibold text-primary hover:underline"
              >
                {scan.commit_sha}
              </Link>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block">Scan Date</span>
              <div className="flex items-center gap-1.5 font-semibold text-zinc-300 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{new Date(scan.created_at).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Violations Section */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" /> Flagged Code Violations ({scan.violations_count})
          </h2>

          {scan.status === "SAFE" ? (
            <div className="p-8 text-center border border-white/5 bg-white/[0.01] rounded-2xl flex flex-col items-center justify-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-emerald-400" />
              </div>
              <h3 className="font-bold text-zinc-200">No vulnerabilities detected!</h3>
              <p className="text-muted-foreground text-xs max-w-sm">
                This scan was completed successfully and the engine detected no code quality or security violations in the scanned files.
              </p>
            </div>
          ) : Object.keys(groupedViolations).length > 0 ? (
            <div className="space-y-8">
              {Object.entries(groupedViolations).map(([filePath, fileViolations]) => (
                <div key={filePath} className="border border-white/5 rounded-2xl overflow-hidden bg-white/[0.01]">
                  {/* File Header */}
                  <div className="bg-white/[0.02] border-b border-white/5 px-5 py-4 flex items-center gap-3">
                    <FileCode className="h-5 w-5 text-primary shrink-0" />
                    <span className="font-mono text-sm text-zinc-200 font-bold truncate">
                      {filePath}
                    </span>
                    <span className="ml-auto text-[10px] bg-white/10 text-muted-foreground px-2 py-0.5 rounded-full border border-white/15 font-semibold">
                      {fileViolations?.length} {fileViolations?.length === 1 ? "flag" : "flags"}
                    </span>
                  </div>

                  {/* Violations in this file */}
                  <div className="divide-y divide-white/5">
                    {fileViolations?.map((violation) => (
                      <div key={violation.id} className="p-6 space-y-6">
                        {/* Title & Type */}
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                              {violation.violation_type}
                            </span>
                            <span className="text-muted-foreground text-xs font-semibold">
                              Line {violation.line_number}
                            </span>
                          </div>
                        </div>

                        {/* Message description card */}
                        <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl flex gap-3 text-sm text-red-300">
                          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-zinc-200">{violation.message.replace(/⚠️|🛡️|🚨|☣️|🏗️|🔑|💥|🚀|🐌|💉|🔓/g, "").trim()}</p>
                          </div>
                        </div>

                        {/* Code snippet viewer */}
                        {violation.snippet && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                              <Code className="h-3.5 w-3.5" /> Flagged Code Block
                            </div>
                            <div className="relative rounded-xl overflow-hidden border border-white/5 bg-zinc-950 p-4 text-xs font-mono text-zinc-300 leading-relaxed overflow-x-auto max-h-72">
                              <pre><code>{violation.snippet}</code></pre>
                            </div>
                          </div>
                        )}

                        {/* AI Suggested Fix */}
                        {violation.suggested_fix && (
                          <div className="space-y-3 pt-2">
                            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                              <Lightbulb className="h-3.5 w-3.5" /> AI Recommended Fix
                            </div>
                            <div className="relative rounded-xl overflow-hidden border border-emerald-500/10 bg-[#0e1111] p-4 text-xs font-mono text-emerald-300 leading-relaxed overflow-x-auto max-h-96">
                              <pre><code>{violation.suggested_fix}</code></pre>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center border border-white/5 bg-white/[0.01] rounded-2xl">
              <p className="text-sm text-muted-foreground">Scan details are loading or have errors.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
