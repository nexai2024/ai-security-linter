import React from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { syncAccount } from "@/app/actions/sync-account";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Github,
  GitPullRequest,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  Settings,
  ArrowRight,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const revalidate = 0; // Disable caching to always show live data

export default async function DashboardPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // Trigger sync of user account from Clerk (runs server-side)
  await syncAccount();

  const supabase = createSupabaseServiceClient();

  // 1. Fetch connected accounts for the user
  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .eq("clerk_user_id", userId);

  const accountIds = accounts?.map((a) => a.id) || [];

  // 2. Fetch registered repositories
  const { data: repositories } = accountIds.length > 0
    ? await supabase.from("repositories").select("*").in("owner_id", accountIds)
    : { data: [] };

  const repoIds = repositories?.map((r) => r.id) || [];

  // 3. Fetch recent scan runs
  const { data: recentScans } = repoIds.length > 0
    ? await supabase
        .from("scan_runs")
        .select("*, repositories(name, full_name)")
        .in("repository_id", repoIds)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] };

  // Calculate stats
  const totalRepos = repositories?.length || 0;
  const totalScans = recentScans?.length || 0;
  const criticalRuns = recentScans?.filter((s) => s.status === "VULNERABILITY_CONFIRMED") || [];
  const activeIssues = criticalRuns.reduce((sum, run) => sum + (run.violations_count || 0), 0);

  const githubAppSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "ai-security-linter";
  const installLink = `https://github.com/apps/${githubAppSlug}/installations/new`;

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-12 relative overflow-hidden">
      {/* Decorative radial glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 blur-[120px] rounded-full -z-10" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 blur-[120px] rounded-full -z-10" />

      <div className="max-w-7xl mx-auto px-4 space-y-8 animate-fade-in">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/70">
              Security Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Monitor code quality, check for AST security vulnerabilities, and audit your repositories.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={installLink} target="_blank" rel="noopener noreferrer">
              <Button className="rounded-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold flex items-center gap-2 shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4" /> Install GitHub App
              </Button>
            </Link>
          </div>
        </div>

        {/* Info Banner on Search Success */}
        {(await props.searchParams).setup_success === "true" && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-300 flex items-center gap-3 text-sm">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            <span>GitHub App installation successfully completed! Repositories are now synchronized.</span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border border-white/5 bg-white/[0.02] backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                Protected Repositories
              </CardDescription>
              <CardTitle className="text-3xl font-extrabold mt-1 text-white">{totalRepos}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Connected via GitHub App installations</p>
            </CardContent>
          </Card>

          <Card className="border border-white/5 bg-white/[0.02] backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                Recent Scans Analyzed
              </CardDescription>
              <CardTitle className="text-3xl font-extrabold mt-1 text-white">{totalScans}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Triggered by PR workflows</p>
            </CardContent>
          </Card>

          <Card className="border border-white/5 bg-white/[0.02] backdrop-blur-sm border-l-red-500/40 border-l-2">
            <CardHeader className="pb-2">
              <CardDescription className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                Flagged Violations
              </CardDescription>
              <CardTitle className="text-3xl font-extrabold mt-1 text-red-400">{activeIssues}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Requires review and code patching</p>
            </CardContent>
          </Card>
        </div>

        {/* Repositories & Recent Scans split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left panel: Repositories list */}
          <div className="lg:col-span-5 space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-white">
              <Github className="h-5 w-5 text-muted-foreground" /> Connected Repositories
            </h2>

            {repositories && repositories.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {repositories.map((repo) => (
                  <Link key={repo.id} href={`/dashboard/repository/${repo.id}`}>
                    <div className="group p-5 border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] rounded-2xl hover:border-primary/30 transition-all duration-200 flex justify-between items-center cursor-pointer">
                      <div className="space-y-1">
                        <div className="font-bold text-zinc-200 group-hover:text-white transition">
                          {repo.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px] md:max-w-xs">
                          {repo.full_name}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-full font-semibold">
                          Active
                        </span>
                        <Settings className="h-4 w-4 text-muted-foreground group-hover:text-zinc-300 transition" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center border border-white/5 bg-white/[0.01] rounded-2xl">
                <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-bold text-zinc-300">No repositories found</h3>
                <p className="text-muted-foreground text-xs mt-1 mb-4">
                  Install the GitHub App on your account or organization to add repos.
                </p>
                <Link href={installLink} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="rounded-full border-white/10 hover:bg-white/5 text-zinc-300">
                    Get Started
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Right panel: Recent Scan Runs list */}
          <div className="lg:col-span-7 space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-white">
              <GitPullRequest className="h-5 w-5 text-muted-foreground" /> Recent Scan Runs
            </h2>

            <Card className="border border-white/5 bg-white/[0.01] overflow-hidden rounded-2xl">
              {recentScans && recentScans.length > 0 ? (
                <Table>
                  <TableHeader className="bg-white/[0.02] border-b border-white/5">
                    <TableRow className="border-b border-white/5 hover:bg-transparent">
                      <TableHead className="text-muted-foreground font-semibold">Repository</TableHead>
                      <TableHead className="text-muted-foreground font-semibold text-center">PR</TableHead>
                      <TableHead className="text-muted-foreground font-semibold">Status</TableHead>
                      <TableHead className="text-muted-foreground font-semibold text-right">Violations</TableHead>
                      <TableHead className="text-muted-foreground font-semibold text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentScans.map((scan) => (
                      <TableRow
                        key={scan.id}
                        className="border-b border-white/5 hover:bg-white/[0.02] transition duration-150"
                      >
                        <TableCell className="font-semibold text-zinc-300">
                          <Link href={`/dashboard/scan/${scan.id}`}>
                            <span className="hover:underline hover:text-white cursor-pointer truncate max-w-[150px] inline-block">
                              {(scan.repositories as { name?: string })?.name || "Unknown"}
                            </span>
                          </Link>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {scan.commit_sha.slice(0, 7)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-bold text-muted-foreground">
                          #{scan.pull_request_number}
                        </TableCell>
                        <TableCell>
                          {scan.status === "SAFE" && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                              <ShieldCheck className="h-3 w-3" /> SAFE
                            </span>
                          )}
                          {scan.status === "VULNERABILITY_CONFIRMED" && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-bold">
                              <ShieldAlert className="h-3 w-3" /> FLAGGED
                            </span>
                          )}
                          {scan.status === "PENDING" && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold animate-pulse">
                              PENDING
                            </span>
                          )}
                          {scan.status === "FAILED" && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-white/10 text-muted-foreground border border-white/15 px-2 py-0.5 rounded-full font-bold">
                              FAILED
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-zinc-300">
                          {scan.violations_count}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dashboard/scan/${scan.id}`}>
                            <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-white/5 rounded-full">
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-12 text-center text-muted-foreground">
                  <GitPullRequest className="h-8 w-8 text-zinc-800 mx-auto mb-3" />
                  <p className="text-sm">No scans run yet.</p>
                  <p className="text-xs text-zinc-700 mt-1">
                    Open a Pull Request on a connected repository to trigger automated scanning.
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
