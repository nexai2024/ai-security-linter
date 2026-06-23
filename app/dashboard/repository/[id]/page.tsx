import React from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase";
import RepoRulesForm from "@/components/RepoRulesForm";
import {
  Card,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Settings,
  History,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

export const revalidate = 0;

interface RepositoryPageProps {
  params: Promise<{ id: string }>;
}

export default async function RepositoryConfigPage(props: RepositoryPageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id } = await props.params;
  const repoId = parseInt(id, 10);
  if (isNaN(repoId)) {
    return notFound();
  }

  const supabase = createSupabaseServiceClient();

  // 1. Fetch repository details
  const { data: repo, error: repoError } = await supabase
    .from("repositories")
    .select("*")
    .eq("id", repoId)
    .single();

  if (repoError || !repo) {
    return notFound();
  }

  // 2. Security validation: Verify the repo owner account is owned by the Clerk user
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", repo.owner_id)
    .eq("clerk_user_id", userId)
    .single();

  if (accountError || !account) {
    // User does not own the account connected to this repository
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center p-4">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4 animate-bounce" />
        <h1 className="text-2xl font-bold">Unauthorized Access</h1>
        <p className="text-muted-foreground mt-2 text-center max-w-md">
          You do not have administrative permissions to modify configuration settings for this repository.
        </p>
        <Link href="/dashboard" className="mt-6">
          <Button variant="outline" className="border-white/10 text-zinc-300 hover:bg-white/5 rounded-full">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  // 3. Fetch historical scan runs for this repository
  const { data: scans } = await supabase
    .from("scan_runs")
    .select("*")
    .eq("repository_id", repoId)
    .order("created_at", { ascending: false });

  const githubUrl = `https://github.com/${repo.full_name}`;

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-12 relative overflow-hidden">
      {/* Decorative radial glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 blur-[120px] rounded-full -z-10" />

      <div className="max-w-7xl mx-auto px-4 space-y-8 animate-fade-in">
        {/* Back Link & Header */}
        <div className="space-y-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition text-sm cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <span>REPOS</span>
                <ChevronRight className="h-3 w-3" />
                <span>{repoId}</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mt-1">
                {repo.name}
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5 flex items-center gap-1.5">
                {repo.full_name}
                <Link
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-primary hover:text-primary/90 text-xs gap-0.5 ml-1"
                >
                  GitHub <ExternalLink className="h-3 w-3" />
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Dashboard Sections grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Rules Configuration (Left/Main Column) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center gap-2.5">
              <Settings className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-white">AST Analysis Configurations</h2>
            </div>
            <Card className="border border-white/5 bg-white/[0.02] backdrop-blur-sm p-6 rounded-2xl">
              <RepoRulesForm
                repositoryId={repoId}
                initialSettings={repo.rule_settings || {}}
              />
            </Card>
          </div>

          {/* Historical Scans List (Right Column) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="flex items-center gap-2.5">
              <History className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-xl font-bold text-white">Scan Runs History</h2>
            </div>

            <Card className="border border-white/5 bg-white/[0.01] overflow-hidden rounded-2xl">
              {scans && scans.length > 0 ? (
                <Table>
                  <TableHeader className="bg-white/[0.02] border-b border-white/5">
                    <TableRow className="border-b border-white/5 hover:bg-transparent">
                      <TableHead className="text-muted-foreground font-semibold">PR / Commit</TableHead>
                      <TableHead className="text-muted-foreground font-semibold">Status</TableHead>
                      <TableHead className="text-muted-foreground font-semibold text-right">Date</TableHead>
                      <TableHead className="text-muted-foreground font-semibold text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scans.map((scan) => (
                      <TableRow
                        key={scan.id}
                        className="border-b border-white/5 hover:bg-white/[0.02] transition duration-150"
                      >
                        <TableCell className="font-semibold text-zinc-300">
                          <Link href={`/dashboard/scan/${scan.id}`}>
                            <span className="hover:underline hover:text-white cursor-pointer font-bold">
                              PR #{scan.pull_request_number}
                            </span>
                          </Link>
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {scan.commit_sha.slice(0, 7)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {scan.status === "SAFE" && (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-bold">
                              <ShieldCheck className="h-2.5 w-2.5" /> SAFE
                            </span>
                          )}
                          {scan.status === "VULNERABILITY_CONFIRMED" && (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-full font-bold">
                              <ShieldAlert className="h-2.5 w-2.5" /> FLAGGED ({scan.violations_count})
                            </span>
                          )}
                          {scan.status === "PENDING" && (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                              PENDING
                            </span>
                          )}
                          {scan.status === "FAILED" && (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-white/10 text-muted-foreground border border-white/15 px-1.5 py-0.5 rounded-full font-bold">
                              FAILED
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground font-mono">
                          <div className="flex items-center justify-end gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {new Date(scan.created_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dashboard/scan/${scan.id}`}>
                            <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-white/5 rounded-full">
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-12 text-center text-muted-foreground">
                  <History className="h-8 w-8 text-zinc-800 mx-auto mb-3" />
                  <p className="text-sm">No scans run yet.</p>
                  <p className="text-xs text-zinc-700 mt-1">
                    Once a webhook triggers a PR scan, its results will appear here.
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
