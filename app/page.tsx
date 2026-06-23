import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shield, ArrowRight, Bot, GitPullRequest, Code2 } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#09090b] text-zinc-100 flex flex-col items-center justify-center py-16 px-4 font-sans relative overflow-hidden">
      {/* Glow elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-1/4 w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl text-center space-y-6 relative z-10 animate-fade-in">
        {/* Shield Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-950/40 border border-indigo-900/60 rounded-full text-indigo-300 text-xs font-semibold">
          <Shield className="h-3.5 w-3.5" /> Next.js AST Linter
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-none">
          Secure Your Next.js Code in{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">
            Real Time
          </span>
        </h1>

        {/* Hero Description */}
        <p className="text-zinc-400 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
          Vibe-Check automatically scans your Pull Requests, runs deterministic AST checks for common SaaS vulnerabilities, and uses AI to recommend line-by-line fixes.
        </p>

        {/* Call to Actions */}
        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <Link href="/dashboard">
            <Button className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-5 rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-indigo-500/20">
              Go to Dashboard <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/subscription">
            <Button variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-900 px-6 py-5 rounded-xl text-sm">
              View Pricing
            </Button>
          </Link>
        </div>
      </div>

      {/* Feature section */}
      <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 relative z-10">
        <div className="p-6 bg-zinc-900/20 border border-zinc-800/80 rounded-2xl space-y-3">
          <div className="h-10 w-10 bg-indigo-950/60 border border-indigo-900/60 rounded-xl flex items-center justify-center">
            <GitPullRequest className="h-5 w-5 text-indigo-400" />
          </div>
          <h3 className="text-lg font-bold text-zinc-200">GitHub PR Integration</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Installs as a GitHub App. It intercepts Pull Requests on commit triggers and comments inline with audit feedback.
          </p>
        </div>

        <div className="p-6 bg-zinc-900/20 border border-zinc-800/80 rounded-2xl space-y-3">
          <div className="h-10 w-10 bg-purple-950/60 border border-purple-900/60 rounded-xl flex items-center justify-center">
            <Code2 className="h-5 w-5 text-purple-400" />
          </div>
          <h3 className="text-lg font-bold text-zinc-200">AST Analysis Engine</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Parses your files into abstract syntax trees to verify rate limit settings, unauthenticated route handlers, and data mutations.
          </p>
        </div>

        <div className="p-6 bg-zinc-900/20 border border-zinc-800/80 rounded-2xl space-y-3">
          <div className="h-10 w-10 bg-pink-950/60 border border-pink-900/60 rounded-xl flex items-center justify-center">
            <Bot className="h-5 w-5 text-pink-400" />
          </div>
          <h3 className="text-lg font-bold text-zinc-200">AI Remediation</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Goes beyond just highlighting code errors. Recommends complete, refactored drop-in code snippets to remediate confirmed security issues.
          </p>
        </div>
      </div>
    </main>
  );
}
