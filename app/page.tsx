import { Button } from "@/components/ui/button";
import { ArrowRight, Code2, ShieldCheck, Zap } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen pt-32 pb-20">
      <section className="relative flex flex-col items-center text-center gap-8 max-w-4xl mx-auto px-4">
        {/* Decorative background glow */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-primary/20 blur-[120px] rounded-full -z-10" />

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-semibold tracking-wide uppercase animate-pulse">
          <Zap className="w-3 h-3" />
          Next-Gen AI Security
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
          Secure Your Code with <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-b from-primary to-primary/50">
            Intelligent Linting
          </span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
          The first AI-powered security linter that detects vulnerabilities in real-time.
          Stop exploits before they reach production with cutting-edge analysis.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mt-4">
          <Button size="lg" className="h-12 px-8 rounded-full text-base font-semibold group">
            Start Free Scan
            <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
          </Button>
          <Button size="lg" variant="outline" className="h-12 px-8 rounded-full text-base font-semibold">
            View Documentation
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 w-full">
          <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm text-left group hover:border-primary/50 transition-colors">
            <ShieldCheck className="w-10 h-10 text-primary mb-4" />
            <h3 className="text-xl font-bold mb-2">Real-time Protection</h3>
            <p className="text-sm text-muted-foreground">Instant analysis of every commit for security risks and vulnerabilities.</p>
          </div>
          <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm text-left group hover:border-primary/50 transition-colors">
            <Code2 className="w-10 h-10 text-primary mb-4" />
            <h3 className="text-xl font-bold mb-2">Smart Analysis</h3>
            <p className="text-sm text-muted-foreground">Powered by advanced LLMs trained on millions of exploit patterns.</p>
          </div>
          <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm text-left group hover:border-primary/50 transition-colors">
            <Zap className="w-10 h-10 text-primary mb-4" />
            <h3 className="text-xl font-bold mb-2">Zero Latency</h3>
            <p className="text-sm text-muted-foreground">Get results in milliseconds without disrupting your development workflow.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
