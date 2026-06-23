"use client";

import React, { useState, useTransition } from "react";
import { updateRules } from "@/app/actions/update-rules";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Shield, Zap, LayoutGrid, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface Rule {
  id: string;
  code: string;
  name: string;
  category: "Security" | "Performance" | "Structure";
  description: string;
}

const RULES: Rule[] = [
  {
    id: "NAKED_SERVER_ACTION",
    code: "SEC-001",
    name: "Naked Server Action Check",
    category: "Security",
    description: "Detects 'use server' functions mutating the database without auth() verification.",
  },
  {
    id: "UNAUTHENTICATED_ROUTE_HANDLER",
    code: "SEC-002",
    name: "Unauthenticated Route Handler",
    category: "Security",
    description: "Flags Next.js API route handlers (POST, PUT, DELETE, PATCH) accessing database without auth session checks.",
  },
  {
    id: "MISSING_RATE_LIMIT",
    code: "SEC-003",
    name: "Missing Rate Limiting",
    category: "Security",
    description: "Detects database-modifying API routes lacking rate limit headers or middleware imports.",
  },
  {
    id: "CLIENT_SECRET_LEAK",
    code: "SEC-004",
    name: "Client Component Secret Leak",
    category: "Security",
    description: "Warns when raw database models with sensitive fields are passed directly to client components.",
  },
  {
    id: "MISSING_SCHEMA_VALIDATION",
    code: "SEC-005",
    name: "Missing Schema Validation",
    category: "Security",
    description: "Identifies database mutations lacking input schema validation (e.g., Zod schemas).",
  },
  {
    id: "EXPOSED_SERVER_SECRETS",
    code: "SEC-006",
    name: "Exposed Server Secrets",
    category: "Security",
    description: "Flags hardcoded connection strings or NEXT_PUBLIC_ variables containing sensitive key names.",
  },
  {
    id: "IDOR_VULNERABILITY",
    code: "SEC-007",
    name: "Potential IDOR Vulnerability",
    category: "Security",
    description: "Flags database updates/deletes in Prisma lacking ownership bounds (userId) in where clauses.",
  },
  {
    id: "UNSANITIZED_HTML",
    code: "SEC-008",
    name: "Unsanitized HTML (XSS)",
    category: "Security",
    description: "Warns when dangerouslySetInnerHTML is used without DOMPurify or isomorphic-dompurify.",
  },
  {
    id: "RAW_SQL_INJECTION",
    code: "SEC-009",
    name: "Unparameterized Raw SQL Injection",
    category: "Security",
    description: "Flags raw SQL queries using template literals/concatenation instead of parameterized queries.",
  },
  {
    id: "PRISMA_N_PLUS_ONE",
    code: "PERF-001",
    name: "Prisma N+1 Loop",
    category: "Performance",
    description: "Detects Prisma queries executed inside map/forEach iterations (will saturate DB pools).",
  },
  {
    id: "UNBOUNDED_PRISMA_QUERY",
    code: "PERF-002",
    name: "Unbounded Prisma Query",
    category: "Performance",
    description: "Warns when calling findMany without limit (take) bounds, potentially leaking massive datasets.",
  },
  {
    id: "CONNECTION_POOL_EXHAUSTION",
    code: "PERF-003",
    name: "Prisma Connection Pool Exhaustion",
    category: "Performance",
    description: "Detects direct initialization of new PrismaClient() within components instead of singletons.",
  },
  {
    id: "CACHE_POISONING",
    code: "STRUC-001",
    name: "Cache Poisoning Vulnerability",
    category: "Structure",
    description: "Detects authenticated fetch requests missing cache: 'no-store' options, risking token caching.",
  },
];

interface RepoRulesFormProps {
  repositoryId: number;
  initialSettings: Record<string, boolean>;
}

export default function RepoRulesForm({ repositoryId, initialSettings }: RepoRulesFormProps) {
  const [settings, setSettings] = useState<Record<string, boolean>>(() => {
    const fullSettings: Record<string, boolean> = {};
    RULES.forEach((r) => {
      // Default to true if not explicitly set to false
      fullSettings[r.id] = initialSettings[r.id] !== false;
    });
    return fullSettings;
  });

  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleToggle = (ruleId: string, checked: boolean) => {
    const updated = { ...settings, [ruleId]: checked };
    setSettings(updated);
    
    // Save immediately
    startTransition(async () => {
      setMessage(null);
      const res = await updateRules(repositoryId, updated);
      if (res.success) {
        setMessage({ type: "success", text: "Settings saved successfully!" });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: "error", text: res.error || "Failed to save settings." });
      }
    });
  };

  const toggleAll = (enable: boolean) => {
    const updated = { ...settings };
    RULES.forEach((r) => {
      updated[r.id] = enable;
    });
    setSettings(updated);

    startTransition(async () => {
      setMessage(null);
      const res = await updateRules(repositoryId, updated);
      if (res.success) {
        setMessage({ type: "success", text: `All rules ${enable ? "enabled" : "disabled"} successfully!` });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: "error", text: res.error || "Failed to save settings." });
      }
    });
  };

  const categories: ("Security" | "Performance" | "Structure")[] = ["Security", "Performance", "Structure"];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Security":
        return <Shield className="h-5 w-5 text-red-400" />;
      case "Performance":
        return <Zap className="h-5 w-5 text-amber-400" />;
      default:
        return <LayoutGrid className="h-5 w-5 text-indigo-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick controls */}
      <div className="flex flex-wrap justify-between items-center bg-zinc-900/30 border border-zinc-800 p-4 rounded-xl gap-4">
        <div>
          <h3 className="font-semibold text-zinc-200 text-sm">Bulk Controls</h3>
          <p className="text-zinc-500 text-xs mt-0.5">Enable or disable all AST checks quickly.</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-xs"
            onClick={() => toggleAll(true)}
            disabled={isPending}
          >
            Enable All
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-xs"
            onClick={() => toggleAll(false)}
            disabled={isPending}
          >
            Disable All
          </Button>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-8">
        {categories.map((category) => {
          const categoryRules = RULES.filter((r) => r.category === category);
          return (
            <div key={category} className="space-y-4">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
                {getCategoryIcon(category)}
                <h3 className="font-bold text-zinc-200 text-md tracking-wide">{category} Rules</h3>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {categoryRules.map((rule) => {
                  const isChecked = settings[rule.id] !== false;
                  return (
                    <div
                      key={rule.id}
                      className="p-4 bg-zinc-900/10 border border-zinc-800/80 rounded-xl hover:border-zinc-700/80 transition duration-150 flex justify-between items-start gap-6"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-semibold border border-zinc-700/60">
                            {rule.code}
                          </span>
                          <span className="font-semibold text-zinc-200 text-sm">{rule.name}</span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl">
                          {rule.description}
                        </p>
                      </div>
                      <div className="pt-1">
                        <Switch
                          checked={isChecked}
                          onCheckedChange={(checked) => handleToggle(rule.id, checked)}
                          disabled={isPending}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Status Notification */}
      {message && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-in">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${
              message.type === "success"
                ? "bg-emerald-950 border-emerald-800 text-emerald-300"
                : "bg-red-950 border-red-800 text-red-300"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-400" />
            )}
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {/* Saving indicator */}
      {isPending && (
        <div className="fixed top-6 right-6 z-50 animate-fade-in">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3.5 py-2 rounded-full shadow-md text-zinc-400 text-xs">
            <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
            <span>Saving settings...</span>
          </div>
        </div>
      )}
    </div>
  );
}
