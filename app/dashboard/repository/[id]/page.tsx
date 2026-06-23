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
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col justify-center items-center p-4">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4 animate-bounce" />
        <h1 className="text-2xl font-bold">Unauthorized Access</h1>
        <p className="text-zinc-400 mt-2 text-center max-w-md">
          You do not have administrative permissions to modify configuration settings for this repository.
        </p>
        <Link href="/dashboard" className="mt-6">
          <Button variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-900">
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
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans">
      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12 space-y-8 animate-fade-in">
        {/* Back Link & Header */}
        <div className="space-y-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition text-sm cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                <span>REPOS</span>
                <ChevronRight className="h-3 w-3" />
                <span>{repoId}</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-zinc-100 mt-1">
                {repo.name}
              </h1>
              <p className="text-zinc-400 text-sm mt-0.5 flex items-center gap-1.5">
                {repo.full_name}
                <Link
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-indigo-400 hover:text-indigo-300 text-xs gap-0.5 ml-1"
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
              <Settings className="h-5 w-5 text-indigo-400" />
              <h2 className="text-xl font-bold text-zinc-100">AST Analysis Configurations</h2>
            </div>
            <Card className="bg-zinc-900/20 border-zinc-800/80 p-6">
              <RepoRulesForm
                repositoryId={repoId}
                initialSettings={repo.rule_settings || {}}
              />
            </Card>
          </div>

          {/* Historical Scans List (Right Column) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="flex items-center gap-2.5">
              <History className="h-5 w-5 text-zinc-400" />
              <h2 className="text-xl font-bold text-zinc-100">Scan Runs History</h2>
            </div>

            <Card className="bg-zinc-900/20 border-zinc-800/80 overflow-hidden">
              {scans && scans.length > 0 ? (
                <Table>
                  <TableHeader className="bg-zinc-900/40 border-b border-zinc-800">
                    <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-zinc-400 font-medium">PR / Commit</TableHead>
                      <TableHead className="text-zinc-400 font-medium">Status</TableHead>
                      <TableHead className="text-zinc-400 font-medium text-right">Date</TableHead>
                      <TableHead className="text-zinc-400 font-medium text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scans.map((scan) => (
                      <TableRow
                        key={scan.id}
                        className="border-b border-zinc-800/60 hover:bg-zinc-900/30 transition duration-150"
                      >
                        <TableCell className="font-medium text-zinc-300">
                          <Link href={`/dashboard/scan/${scan.id}`}>
                            <span className="hover:underline hover:text-white cursor-pointer font-semibold text-zinc-300">
                              PR #{scan.pull_request_number}
                            </span>
                          </Link>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            {scan.commit_sha.slice(0, 7)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {scan.status === "SAFE" && (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-950/60 text-emerald-400 border border-emerald-900 px-1.5 py-0.5 rounded-full font-semibold">
                              <ShieldCheck className="h-2.5 w-2.5" /> SAFE
                            </span>
                          )}
                          {scan.status === "VULNERABILITY_CONFIRMED" && (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-red-950/60 text-red-400 border border-red-900 px-1.5 py-0.5 rounded-full font-semibold">
                              <ShieldAlert className="h-2.5 w-2.5" /> FLAGGED ({scan.violations_count})
                            </span>
                          )}
                          {scan.status === "PENDING" && (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-blue-950/60 text-blue-400 border border-blue-900 px-1.5 py-0.5 rounded-full font-semibold animate-pulse">
                              PENDING
                            </span>
                          )}
                          {scan.status === "FAILED" && (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded-full font-semibold">
                              FAILED
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-zinc-500 font-mono">
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
                            <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-zinc-800">
                              <ChevronRight className="h-4 w-4 text-zinc-500" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-12 text-center text-zinc-500">
                  <History className="h-8 w-8 text-zinc-800 mx-auto mb-3" />
                  <p className="text-sm">No scans run yet.</p>
                  <p className="text-xs text-zinc-600 mt-1">
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
