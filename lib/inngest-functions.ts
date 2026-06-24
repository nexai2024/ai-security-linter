import { inngest } from "./inngest";
import { App } from "octokit";
import { parse, AST_NODE_TYPES } from "@typescript-eslint/typescript-estree";
import OpenAI from "openai";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { createHash } from "crypto";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- TYPES & INTERFACES ---
type ViolationType =
  | 'NAKED_SERVER_ACTION'
  | 'PRISMA_N_PLUS_ONE'
  | 'CLIENT_SECRET_LEAK'
  | 'IDOR_VULNERABILITY'
  | 'CONNECTION_POOL_EXHAUSTION'
  | 'MISSING_RATE_LIMIT'
  | 'UNAUTHENTICATED_ROUTE_HANDLER'
  | 'MISSING_SCHEMA_VALIDATION'
  | 'EXPOSED_SERVER_SECRETS'
  | 'UNSANITIZED_HTML'
  | 'RAW_SQL_INJECTION'
  | 'CACHE_POISONING'
  | 'UNBOUNDED_PRISMA_QUERY';

interface ASTViolation {
  type: ViolationType;
  line: number;
  fileName: string;
  snippet: string;
  message: string;
}

interface EngineResult {
  status: 'SAFE' | 'FALSE_POSITIVE' | 'VULNERABILITY_CONFIRMED';
  violation: ASTViolation;
  suggestedFix?: string;
  aiReasoning?: string;
}

// --- DETERMINISTIC AST SCANNER ---
/* eslint-disable @typescript-eslint/no-explicit-any */
function runASTScanner(code: string, fileName: string): ASTViolation[] {
  const violations: ASTViolation[] = [];
  let ast: any;

  try {
    ast = parse(code, { loc: true, range: true, jsx: fileName.endsWith('.tsx') });
  } catch (e) {
    console.error(`[Vibe-Check] Failed to parse AST for ${fileName}`, e);
    return violations;
  }

  const isServerFile = code.includes('"use server"') || code.includes("'use server'");
  const isClientFile = code.includes('"use client"') || code.includes("'use client'");
  const isRouteHandler = fileName.includes('route.ts');
  const codeStrLower = code.toLowerCase();
  const hasRateLimitImport = codeStrLower.includes('ratelimit') || codeStrLower.includes('rate-limit');

  function hasPrismaUsage(node: any): boolean {
    let found = false;
    const walkInternal = (n: any) => {
        if (found || !n) return;
        if (n.type === AST_NODE_TYPES.Identifier && n.name === 'prisma') {
            found = true;
            return;
        }
        for (const key in n) {
            if (key === 'parent') continue;
            const child = n[key];
            if (child && typeof child === 'object') {
                if (Array.isArray(child)) {
                    child.forEach(walkInternal);
                } else {
                    walkInternal(child);
                }
            }
        }
    };
    walkInternal(node);
    return found;
  }

  function getAuthCheckCount(node: any): number {
    let count = 0;
    const authFunctions = ['auth', 'getSession', 'verifySession', 'getToken'];
    const walkInternal = (n: any) => {
        if (!n) return;
        if (n.type === AST_NODE_TYPES.CallExpression && n.callee.type === AST_NODE_TYPES.Identifier && authFunctions.includes(n.callee.name)) {
            count++;
        }
        for (const key in n) {
            if (key === 'parent') continue;
            const child = n[key];
            if (child && typeof child === 'object') {
                if (Array.isArray(child)) {
                    child.forEach(walkInternal);
                } else {
                    walkInternal(child);
                }
            }
        }
    };
    walkInternal(node);
    return count;
  }

  function getValidationCount(node: any): number {
    let count = 0;
    const walkInternal = (n: any) => {
        if (!n) return;
        if (n.type === AST_NODE_TYPES.CallExpression) {
            const callee = n.callee;
            if (callee.type === AST_NODE_TYPES.MemberExpression && callee.property.type === AST_NODE_TYPES.Identifier && (callee.property.name === 'parse' || callee.property.name === 'safeParse')) {
                count++;
            } else if (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'z') {
                count++;
            }
        }
        for (const key in n) {
            if (key === 'parent') continue;
            const child = n[key];
            if (child && typeof child === 'object') {
                if (Array.isArray(child)) {
                    child.forEach(walkInternal);
                } else {
                    walkInternal(child);
                }
            }
        }
    };
    walkInternal(node);
    return count;
  }

  function getPrismaMutationCount(node: any): number {
    let count = 0;
    const mutations = ['create', 'update', 'delete', 'upsert', 'createMany', 'updateMany', 'deleteMany'];
    const walkInternal = (n: any) => {
        if (!n) return;
        if (n.type === AST_NODE_TYPES.CallExpression && n.callee.type === AST_NODE_TYPES.MemberExpression) {
            const callee = n.callee;
            if (callee.object.type === AST_NODE_TYPES.MemberExpression && callee.object.object.type === AST_NODE_TYPES.Identifier && callee.object.object.name === 'prisma' && mutations.includes((callee.property as any).name)) {
                count++;
            } else if (callee.object.type === AST_NODE_TYPES.Identifier && callee.object.name === 'prisma' && mutations.includes((callee.property as any).name)) {
                count++;
            }
        }
        for (const key in n) {
            if (key === 'parent') continue;
            const child = n[key];
            if (child && typeof child === 'object') {
                if (Array.isArray(child)) {
                    child.forEach(walkInternal);
                } else {
                    walkInternal(child);
                }
            }
        }
    };
    walkInternal(node);
    return count;
  }

  function walk(node: any, parent: any = null) {
    if (!node) return;

    // RULE: SEC-001 & SEC-005 - Server Action Checks
    if (isServerFile && (node.type === AST_NODE_TYPES.FunctionDeclaration || node.type === AST_NODE_TYPES.ArrowFunctionExpression || node.type === AST_NODE_TYPES.FunctionExpression)) {
      let isExported = parent?.type === AST_NODE_TYPES.ExportNamedDeclaration ||
                        (parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.parent?.type === AST_NODE_TYPES.VariableDeclaration && parent.parent.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration);

      if (!isExported && node.type === AST_NODE_TYPES.FunctionDeclaration && node.range) {
          const textBefore = code.substring(Math.max(0, node.range[0] - 20), node.range[0]);
          if (textBefore.includes('export ')) isExported = true;
      }

      if (!isExported && node.type === AST_NODE_TYPES.ArrowFunctionExpression && parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.parent?.range) {
           const textBefore = code.substring(Math.max(0, parent.parent.range[0] - 20), parent.parent.range[0]);
           if (textBefore.includes('export ')) isExported = true;
      }

      if (isExported) {
        const mutations = getPrismaMutationCount(node.body || node);
        const authChecks = getAuthCheckCount(node.body || node);

        if (mutations > 0 && authChecks === 0) {
          violations.push({
            type: 'NAKED_SERVER_ACTION',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "⚠️ **CRITICAL: Unauthenticated Server Action.** This function mutates the database but lacks an explicit authentication check (e.g., `auth()`)."
          });
        }

        const validations = getValidationCount(node.body || node);
        const hasParams = node.params?.length > 0;
        if (hasParams && hasPrismaUsage(node.body || node) && validations === 0) {
           violations.push({
             type: 'MISSING_SCHEMA_VALIDATION',
             line: node.loc.start.line,
             fileName,
             snippet: code.substring(node.range[0], node.range[1]),
             message: "🛡️ **HIGH: Missing Runtime Schema Validation.** This Server Action accepts arguments and mutates the database without runtime validation (e.g., Zod schema)."
           });
        }
      }
    }

    // RULE: SEC-002, SEC-003, SEC-005 - Route Handler Checks
    if (isRouteHandler && (node.type === AST_NODE_TYPES.FunctionDeclaration || node.type === AST_NODE_TYPES.ArrowFunctionExpression || node.type === AST_NODE_TYPES.FunctionExpression)) {
      let funcName = '';
      if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
        funcName = node.id?.name || '';
      } else if (parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier) {
        funcName = parent.id.name;
      } else if (parent?.type === AST_NODE_TYPES.ExportNamedDeclaration && parent.declaration?.type === AST_NODE_TYPES.FunctionDeclaration) {
        funcName = parent.declaration.id?.name || '';
      }

      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      if (methods.includes(funcName.toUpperCase())) {
        if (methods.slice(1).includes(funcName.toUpperCase())) {
            if (!hasRateLimitImport) {
              violations.push({
                type: 'MISSING_RATE_LIMIT',
                line: node.loc.start.line,
                fileName,
                snippet: code.substring(node.range[0], node.range[1]),
                message: "🛡️ **HIGH: Missing Rate Limiter.** This mutation route lacks an imported rate limiter (like Upstash). It is vulnerable to credential stuffing and DoS attacks."
              });
            }
        }

        const authChecks = getAuthCheckCount(node.body || node);
        const hasDb = hasPrismaUsage(node.body || node);

        if (hasDb && authChecks === 0) {
          violations.push({
            type: 'UNAUTHENTICATED_ROUTE_HANDLER',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "⚠️ **CRITICAL: Unauthenticated Route Handler.** This route accesses the database but lacks a session validation check."
          });
        }

        const validations = getValidationCount(node.body || node);

        if (hasDb && validations === 0) {
          violations.push({
            type: 'MISSING_SCHEMA_VALIDATION',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "🛡️ **HIGH: Missing Runtime Schema Validation.** User input is passed to the database without validation (e.g., Zod). This opens the door to NoSQL/SQL injection and malformed data."
          });
        }
      }
    }

    // RULE: SEC-004 - Client Component Secret Leak
    if (isClientFile && (node.type === AST_NODE_TYPES.FunctionDeclaration || node.type === AST_NODE_TYPES.ArrowFunctionExpression || node.type === AST_NODE_TYPES.FunctionExpression)) {
       const paramsStr = JSON.stringify(node.params); // Minimal use of stringify for shallow check
       if (paramsStr.includes('"name":"user"') || paramsStr.includes('"name":"account"') || paramsStr.includes('"name":"profile"')) {
          violations.push({
            type: 'CLIENT_SECRET_LEAK',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "🚨 **CRITICAL: Client Secret Leak.** You are passing a potentially raw database object (e.g., `user`, `account`) directly to a Client Component. This exposes all underlying fields (like password hashes) in the browser network tab."
          });
       }
    }

    // RULE: SEC-008 - Unsanitized HTML
    if (node.type === AST_NODE_TYPES.JSXAttribute && node.name?.name === 'dangerouslySetInnerHTML') {
      const valStr = code.substring(node.value?.range?.[0] || 0, node.value?.range?.[1] || 0).toLowerCase();
      if (!valStr.includes('sanitize') && !valStr.includes('purify')) {
        violations.push({
          type: 'UNSANITIZED_HTML',
          line: node.loc.start.line,
          fileName,
          snippet: code.substring(node.range[0], node.range[1]),
          message: "☣️ **HIGH: Unsanitized HTML.** Using dangerouslySetInnerHTML without a sanitizer (like DOMPurify) creates a direct Cross-Site Scripting (XSS) vulnerability."
        });
      }
    }

    // RULE: STRUC-001 - Cache Poisoning
    if (node.type === AST_NODE_TYPES.CallExpression && node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'fetch') {
      const argsStr = JSON.stringify(node.arguments);
      if ((argsStr.includes('Authorization') || argsStr.includes('cookie') || argsStr.includes('bearer')) && !argsStr.includes('no-store') && !argsStr.includes('revalidate')) {
        violations.push({
          type: 'CACHE_POISONING',
          line: node.loc.start.line,
          fileName,
          snippet: code.substring(node.range[0], node.range[1]),
          message: "🏗️ **HIGH: Cross-Tenant Cache Poisoning.** Authenticated fetch request is missing `cache: 'no-store'`. Next.js may cache this globally, leaking private data."
        });
      }
    }

    // RULE: SEC-006 - Exposed Server Secrets
    if (node.type === AST_NODE_TYPES.VariableDeclarator && node.id?.type === AST_NODE_TYPES.Identifier && node.id.name) {
       const varName = node.id.name.toUpperCase();
       if (varName.startsWith('NEXT_PUBLIC_') && (varName.includes('SECRET') || varName.includes('PASSWORD') || varName.includes('KEY'))) {
          violations.push({
            type: 'EXPOSED_SERVER_SECRETS',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "🔑 **CRITICAL: Exposed Server Secret.** You are prefixing a sensitive key with `NEXT_PUBLIC_`, which bundles it into the client-side JavaScript."
          });
       }
    }
    if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
       const val = node.value;
       if (val.startsWith('postgres://') || val.startsWith('mysql://') || val.startsWith('mongodb+srv://')) {
          violations.push({
            type: 'EXPOSED_SERVER_SECRETS',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "🔑 **CRITICAL: Hardcoded Database Connection String.** Secrets should never be hardcoded. Use `process.env`."
          });
       }
    }

    // RULE: PERF-003 - Serverless Connection Pool Exhaustion
    if (node.type === AST_NODE_TYPES.NewExpression && node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'PrismaClient') {
      violations.push({
        type: 'CONNECTION_POOL_EXHAUSTION',
        line: node.loc.start.line,
        fileName,
        snippet: code.substring(node.range[0], node.range[1]),
        message: "💥 **CRITICAL: Connection Pool Exhaustion.** Instantiating `new PrismaClient()` directly inside application logic will spawn a new connection per request in serverless environments, crashing your database."
      });
    }

    if (node.type === AST_NODE_TYPES.CallExpression && node.callee.type === AST_NODE_TYPES.MemberExpression) {
      const methodName = (node.callee.property as any).name;

      // RULE: PERF-001 - Prisma N+1 Loop
      if (methodName === 'map' || methodName === 'forEach') {
        const hasDbCall = hasPrismaUsage(node.arguments[0]);
        if (hasDbCall) {
           violations.push({
            type: 'PRISMA_N_PLUS_ONE',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "🚀 **PERFORMANCE: Prisma N+1 Loop Detected.** You are executing a database query inside an iterative loop. This will exhaust connection pools."
          });
        }
      }

      // RULE: SEC-007 - IDOR Vulnerability (Naive Check)
      if (methodName === 'update' || methodName === 'delete') {
        const args = node.arguments[0];
        if (args && args.type === AST_NODE_TYPES.ObjectExpression) {
            const hasWhere = (args.properties as any[]).some((p: any) => p.key?.name === 'where');
            const hasOwner = JSON.stringify(args).includes('"name":"userId"') || JSON.stringify(args).includes('"name":"ownerId"');
            if (hasWhere && !hasOwner) {
                violations.push({
                    type: 'IDOR_VULNERABILITY',
                    line: node.loc.start.line,
                    fileName,
                    snippet: code.substring(node.range[0], node.range[1]),
                    message: "🔓 **CRITICAL: Potential IDOR Vulnerability.** This Prisma mutation relies on a `where` clause without verifying ownership (missing `userId` or session bounds). A user could modify another user's data by changing the ID."
                });
            }
        }
      }

      // RULE: PERF-002 - Unbounded Prisma Query
      if (methodName === 'findMany') {
        const args = node.arguments[0];
        const hasLimit = args && args.type === AST_NODE_TYPES.ObjectExpression && (args.properties as any[]).some((p: any) => p.key?.name === 'take' || p.key?.name === 'skip');
        if (!hasLimit) {
           violations.push({
            type: 'UNBOUNDED_PRISMA_QUERY',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "🐌 **MEDIUM: Unbounded Prisma Query.** `findMany` is called without `take` or `skip` parameters. This can cause massive memory spikes."
          });
        }
      }

      // RULE: SEC-009 - Unparameterized Raw SQL Injection
      if (methodName === '$queryRaw' || methodName === '$executeRaw') {
        const arg = node.arguments[0];
        if (arg && (arg.type === AST_NODE_TYPES.TemplateLiteral || arg.type === AST_NODE_TYPES.BinaryExpression || (arg.type === AST_NODE_TYPES.Literal && typeof arg.value === 'string'))) {
           violations.push({
            type: 'RAW_SQL_INJECTION',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "💉 **CRITICAL: Raw SQL Injection.** You are passing a standard string or standard template literal to a raw SQL query. Use Prisma's `Prisma.sql` tagged template."
          });
        }
      }
    }

    for (const key in node) {
      if (key === 'parent') continue;
      const child = node[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach((c: any) => walk(c, node));
        } else {
          walk(child, node);
        }
      }
    }
  }

  walk(ast);
  return violations;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// --- AI FILTER & AUTO-FIX ENGINE ---
async function processViolationWithAI(violation: ASTViolation): Promise<EngineResult> {
  let systemPrompt = "You are a Senior Next.js DevSecOps auditor.";

  switch (violation.type) {
    case 'NAKED_SERVER_ACTION':
      systemPrompt += ` A Server Action mutates data but lacks auth.
      1. If context implies it MUST be public (e.g., login, signup, webhook), return {"status": "FALSE_POSITIVE"}.
      2. Otherwise, return {"status": "VULNERABILITY_CONFIRMED", "reasoning": "...", "fixedCode": "Function rewritten with auth() check."}`;
      break;
    case 'PRISMA_N_PLUS_ONE':
      systemPrompt += ` A Prisma query is inside a loop.
      Rewrite the code to fetch all records in a single query outside the loop using Prisma 'in' operator or 'include'.
      Return {"status": "VULNERABILITY_CONFIRMED", "reasoning": "...", "fixedCode": "Optimized code."}`;
      break;
    case 'IDOR_VULNERABILITY':
      systemPrompt += ` A Prisma update/delete operation lacks user-bounding in the where clause.
      1. If it's an internal admin script or clearly already validated, return {"status": "FALSE_POSITIVE"}.
      2. Otherwise, rewrite the Prisma query to include the authenticated user's ID in the where clause to enforce ownership.
      Return {"status": "VULNERABILITY_CONFIRMED", "reasoning": "...", "fixedCode": "Fixed query."}`;
      break;
    case 'CONNECTION_POOL_EXHAUSTION':
      systemPrompt += ` 'new PrismaClient()' is instantiated dynamically.
      Rewrite the code to import a cached PrismaClient singleton (e.g., \`import prisma from '@/lib/db'\`).
      Return {"status": "VULNERABILITY_CONFIRMED", "reasoning": "...", "fixedCode": "Fixed imports and implementation."}`;
      break;
    case 'MISSING_RATE_LIMIT':
      systemPrompt += ` A mutation route lacks a rate limiter.
      1. If the route is not sensitive or already uses a custom limiter, return {"status": "FALSE_POSITIVE"}.
      2. Otherwise, rewrite the route handler to implement Upstash RateLimiting before processing the payload.
      Return {"status": "VULNERABILITY_CONFIRMED", "reasoning": "...", "fixedCode": "Secured route code."}`;
      break;
    case 'UNAUTHENTICATED_ROUTE_HANDLER':
      systemPrompt += ` An API route handler accesses the database without an authentication check.
      1. If it's a public webhook or explicitly public route, return {"status": "FALSE_POSITIVE"}.
      2. Otherwise, rewrite it to include a session check (e.g. \`auth()\`) and return a 401 if unauthorized.
      Return {"status": "VULNERABILITY_CONFIRMED", "reasoning": "...", "fixedCode": "Secured route handler."}`;
      break;
    case 'MISSING_SCHEMA_VALIDATION':
      systemPrompt += ` User input is passed directly to Prisma without validation.
      Rewrite the function to parse the input using a Zod schema before executing the database query.
      Return {"status": "VULNERABILITY_CONFIRMED", "reasoning": "...", "fixedCode": "Validated code."}`;
      break;
    case 'EXPOSED_SERVER_SECRETS':
      systemPrompt += ` Hardcoded secrets or sensitive NEXT_PUBLIC_ variables were found.
      Rewrite the code to use standard \`process.env\` variables without the NEXT_PUBLIC_ prefix for secrets.
      Return {"status": "VULNERABILITY_CONFIRMED", "reasoning": "...", "fixedCode": "Secure environment variable usage."}`;
      break;
    case 'UNSANITIZED_HTML':
      systemPrompt += ` dangerouslySetInnerHTML is used without a sanitizer.
      Rewrite the component to wrap the HTML content in DOMPurify.sanitize() (or isomorphic-dompurify).
      Return {"status": "VULNERABILITY_CONFIRMED", "reasoning": "...", "fixedCode": "Sanitized component."}`;
      break;
    case 'RAW_SQL_INJECTION':
      systemPrompt += ` Raw SQL is passed to Prisma without using Prisma.sql tagged templates.
      Rewrite the query to strictly use the \`Prisma.sql\` tagged template literal for parameterization.
      Return {"status": "VULNERABILITY_CONFIRMED", "reasoning": "...", "fixedCode": "Parameterized query."}`;
      break;
    case 'CACHE_POISONING':
      systemPrompt += ` An authenticated fetch call lacks cache: 'no-store'.
      Rewrite the fetch call to include \`{ cache: 'no-store' }\` in the options object.
      Return {"status": "VULNERABILITY_CONFIRMED", "reasoning": "...", "fixedCode": "Secure fetch call."}`;
      break;
    case 'UNBOUNDED_PRISMA_QUERY':
      systemPrompt += ` A findMany query lacks pagination limits.
      Rewrite the query to include a default \`take: 50\` or similar pagination bound.
      Return {"status": "VULNERABILITY_CONFIRMED", "reasoning": "...", "fixedCode": "Bounded query."}`;
      break;
    case 'CLIENT_SECRET_LEAK':
      systemPrompt += ` A raw database object is passed to a Client Component.
      Rewrite the code to explicitly map the object to only necessary safe fields (e.g., id, name) before passing it.
      Return {"status": "VULNERABILITY_CONFIRMED", "reasoning": "...", "fixedCode": "Mapped safe object."}`;
      break;
    default:
      return { status: 'VULNERABILITY_CONFIRMED', violation };
  }

  systemPrompt += ` Always respond STRICTLY in JSON format: { \"status\": \"VULNERABILITY_CONFIRMED\" | \"FALSE_POSITIVE\", \"reasoning\": \"string\", \"fixedCode\": \"string\" }`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Here is the flagged snippet:\n\n${violation.snippet}` }
      ],
    });

    const aiResponse = JSON.parse(completion.choices[0].message.content || "{}");

    if (aiResponse.status === "FALSE_POSITIVE") {
      return { status: 'FALSE_POSITIVE', violation, aiReasoning: aiResponse.reasoning };
    }

    return {
      status: 'VULNERABILITY_CONFIRMED',
      violation,
      suggestedFix: aiResponse.fixedCode,
      aiReasoning: aiResponse.reasoning
    };
  } catch (error) {
    console.error("[Vibe-Check] AI Processing Failed, falling back to raw flag.", error);
    return { status: 'VULNERABILITY_CONFIRMED', violation };
  }
}

export const runBackgroundScan = inngest.createFunction(
  { id: "run-background-scan" },
  { event: "github/pull_request.scan" },
  async ({ event }) => {
    const { installationId, owner, repo, pull_number, commit_id, repository_id, scan_run_id } = event.data;
    const supabase = createSupabaseServiceClient();

    const app = new App({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    });
    const octokit = await app.getInstallationOctokit(installationId);

    const confirmedViolations: EngineResult[] = [];
    let scanStatus: 'SAFE' | 'VULNERABILITY_CONFIRMED' | 'FAILED' = 'SAFE';

    try {
      // Fetch rule settings for this repository
      const { data: repoSettings } = await supabase
        .from("repositories")
        .select("rule_settings")
        .eq("id", repository_id)
        .single();

      const ruleSettings = (repoSettings?.rule_settings as Record<string, boolean>) || {};
      const isRuleEnabled = (type: string) => ruleSettings[type] !== false;

      // 1. Fetch files
      const { data: files } = await octokit.rest.pulls.listFiles({ owner, repo, pull_number });

      // 2. Run AST Scanner & AI Filtering with Caching
      for (const file of files) {
        if (!file.filename.endsWith('.ts') && !file.filename.endsWith('.tsx')) continue;
        if (file.status === 'removed') continue;

        const { data: fileContentRaw } = await octokit.rest.repos.getContent({
          owner, repo, path: file.filename, ref: commit_id, mediaType: { format: 'raw' }
        });
        const fileContent = fileContentRaw as unknown as string;
        const fileHash = createHash("sha256").update(fileContent).digest("hex");

        // Check Cache
        const { data: cachedResult } = await supabase
          .from("file_cache")
          .select("analysis_result")
          .eq("file_hash", fileHash)
          .single();

        if (cachedResult) {
          console.log(`[Vibe-Check] Cache hit for ${file.filename}`);
          /* eslint-disable @typescript-eslint/no-explicit-any */
          const aiResults = (cachedResult.analysis_result as any).aiResults as EngineResult[];
          /* eslint-enable @typescript-eslint/no-explicit-any */
          confirmedViolations.push(...aiResults.filter(r => isRuleEnabled(r.violation.type)));
        } else {
          const violations = runASTScanner(fileContent, file.filename);
          // Filter violations based on enabled rules BEFORE AI processing (efficiency)
          const enabledViolations = violations.filter((v) => isRuleEnabled(v.type));

          // AI Processing
          const aiResults = await Promise.all(enabledViolations.map(v => processViolationWithAI(v)));
          const confirmedInFile = aiResults.filter(r => r.status === 'VULNERABILITY_CONFIRMED');

          // Store in Cache
          await supabase.from("file_cache").upsert({
            file_hash: fileHash,
            analysis_result: { aiResults: confirmedInFile }
          }, { onConflict: 'file_hash' });

          confirmedViolations.push(...confirmedInFile);
        }
      }

      scanStatus = confirmedViolations.length > 0 ? 'VULNERABILITY_CONFIRMED' : 'SAFE';

      // 4. Post Review Comments
      if (confirmedViolations.length > 0) {
        const comments = confirmedViolations.map(result => {
          let commentBody = result.violation.message;

          if (result.aiReasoning) {
            commentBody += `\n\n**Auditor Note:** ${result.aiReasoning}`;
          }
          if (result.suggestedFix) {
            commentBody += `\n\n**Suggested Fix:**\n\`\`\`typescript\n${result.suggestedFix}\n\`\`\``;
          }

          return {
            path: result.violation.fileName,
            line: result.violation.line,
            body: commentBody,
          };
        });

        await octokit.rest.pulls.createReview({
          owner, repo, pull_number, commit_id, event: 'COMMENT',
          body: "🛑 **Vibe-Check Security Audit:** Automated analysis detected high-severity structural issues in this PR. See inline comments for remediation.",
          comments: comments
        });
        console.log(`[Vibe-Check] Posted ${comments.length} confirmed violations with fixes to PR #${pull_number}`);
      } else {
        console.log(`[Vibe-Check] PR #${pull_number} is clean or flags were false positives.`);
      }
    } catch (scanError) {
      console.error("[Vibe-Check] Error during scanning workflow:", scanError);
      scanStatus = 'FAILED';
    }

    // --- DATABASE LOGGING: UPDATE SCAN RUN & WRITE VIOLATIONS ---
    if (scan_run_id) {
      // Update scan run status
      await supabase
        .from("scan_runs")
        .update({
          status: scanStatus,
          violations_count: confirmedViolations.length,
        })
        .eq("id", scan_run_id);

      // Insert violations
      if (confirmedViolations.length > 0) {
        const violationsToInsert = confirmedViolations.map(result => ({
          scan_run_id: scan_run_id,
          file_path: result.violation.fileName,
          line_number: result.violation.line,
          violation_type: result.violation.type,
          message: result.violation.message,
          snippet: result.violation.snippet || null,
          suggested_fix: result.suggestedFix || null,
          status: "CONFIRMED",
        }));

        await supabase
          .from("scan_violations")
          .insert(violationsToInsert);
      }
    }
  }
);
