import { NextResponse } from "next/server";
import { App } from "octokit";
import { parse, TSESTree } from "@typescript-eslint/typescript-estree";
import OpenAI from "openai";
import { createHmac, timingSafeEqual } from "crypto";
import { createSupabaseServiceClient } from "@/lib/supabase";

// Initialize OpenAI. Make sure OPENAI_API_KEY is in your .env
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
function runASTScanner(code: string, fileName: string): ASTViolation[] {
  const violations: ASTViolation[] = [];
  let ast: TSESTree.Program;

  try {
    ast = parse(code, { loc: true, range: true, jsx: fileName.endsWith('.tsx') });
  } catch (e) {
    console.error(`[Vibe-Check] Failed to parse AST for ${fileName}`, e);
    return violations;
  }

  const isServerFile = ast.body.some(
    (node) => node.type === 'ExpressionStatement' && node.expression.type === 'Literal' && node.expression.value === 'use server'
  );

  const isClientFile = ast.body.some(
    (node) => node.type === 'ExpressionStatement' && node.expression.type === 'Literal' && node.expression.value === 'use client'
  );

  const isRouteHandler = fileName.includes('route.ts');
  const codeStrLower = code.toLowerCase();
  const hasRateLimitImport = codeStrLower.includes('ratelimit') || codeStrLower.includes('rate-limit');

  function walk(node: TSESTree.Node) {
    if (!node) return;

    // RULE: SEC-001 - Naked Server Action Check
    if (isServerFile && node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
      const funcBody = node.declaration.body?.body;
      if (funcBody) {
        const bodyStr = JSON.stringify(funcBody);
        const hasDatabaseMutation = bodyStr.includes('prisma.') && (bodyStr.includes('create') || bodyStr.includes('update') || bodyStr.includes('delete'));
        const hasAuthCheck = bodyStr.includes('auth()') || bodyStr.includes('getSession()') || bodyStr.includes('verifySession()');

        if (hasDatabaseMutation && !hasAuthCheck) {
          violations.push({
            type: 'NAKED_SERVER_ACTION',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "⚠️ **CRITICAL: Unauthenticated Server Action.** This function mutates the database but lacks an explicit authentication check (e.g., `auth()`)."
          });
        }
      }
    }

    // RULE: SEC-003 - Missing Rate Limiting on Mutation Routes
    if (isRouteHandler && node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
      const funcName = node.declaration.id?.name;
      if (funcName === 'POST' || funcName === 'PUT' || funcName === 'DELETE' || funcName === 'PATCH') {
        if (!hasRateLimitImport) {
          violations.push({
            type: 'MISSING_RATE_LIMIT',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "🛡️ **HIGH: Missing Rate Limiter.** This mutation route lacks an imported rate limiter (like Upstash). It is vulnerable to credential stuffing and DoS attacks."
          });
        }

        // RULE: SEC-002 - Unauthenticated Route Handler
        const bodyStr = JSON.stringify(node.declaration.body);
        const hasAuthCheck = bodyStr.includes('auth()') || bodyStr.includes('getSession()') || bodyStr.includes('verifySession()') || bodyStr.includes('getToken(');
        const hasDatabaseAccess = bodyStr.includes('prisma.');
        
        if (hasDatabaseAccess && !hasAuthCheck) {
          violations.push({
            type: 'UNAUTHENTICATED_ROUTE_HANDLER',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "⚠️ **CRITICAL: Unauthenticated Route Handler.** This route accesses the database but lacks a session validation check."
          });
        }

        // RULE: SEC-005 - Missing Runtime Schema Validation
        const acceptsInput = bodyStr.includes('req.json()') || bodyStr.includes('formData()');
        const hasValidation = bodyStr.includes('.parse') || bodyStr.includes('z.object');
        
        if (hasDatabaseAccess && acceptsInput && !hasValidation) {
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

    // RULE: SEC-005 for Server Actions
    if (isServerFile && node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
       const funcBody = node.declaration.body?.body;
       if (funcBody) {
         const bodyStr = JSON.stringify(funcBody);
         const hasValidation = bodyStr.includes('.parse') || bodyStr.includes('z.object');
         const hasDatabaseAccess = bodyStr.includes('prisma.');
         const hasParams = node.declaration.params.length > 0;
         if (hasParams && hasDatabaseAccess && !hasValidation) {
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

    // RULE: SEC-004 - Client Component Secret Leak
    if (isClientFile && node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration') {
       const decl = node.declaration.declarations[0];
       if (decl && (decl.init?.type === 'ArrowFunctionExpression' || decl.init?.type === 'FunctionExpression')) {
           const paramsStr = JSON.stringify(decl.init.params);
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
    }

    // RULE: SEC-008 - Unsanitized HTML
    if (node.type === 'JSXAttribute' && node.name?.name === 'dangerouslySetInnerHTML') {
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
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'fetch') {
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
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.id.name) {
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
    if (node.type === 'Literal' && typeof node.value === 'string') {
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
    if (node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'PrismaClient') {
      violations.push({
        type: 'CONNECTION_POOL_EXHAUSTION',
        line: node.loc.start.line,
        fileName,
        snippet: code.substring(node.range[0], node.range[1]),
        message: "💥 **CRITICAL: Connection Pool Exhaustion.** Instantiating `new PrismaClient()` directly inside application logic will spawn a new connection per request in serverless environments, crashing your database."
      });
    }

    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      const methodName = (node.callee.property as TSESTree.Identifier).name;

      // RULE: PERF-001 - Prisma N+1 Loop
      if (methodName === 'map' || methodName === 'forEach') {
        const loopBodyStr = JSON.stringify(node.arguments);
        if (loopBodyStr.includes('prisma.') && (loopBodyStr.includes('findMany') || loopBodyStr.includes('findUnique') || loopBodyStr.includes('update'))) {
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
        const argsStr = JSON.stringify(node.arguments);
        if (argsStr.includes('where') && !argsStr.includes('userId') && !argsStr.includes('ownerId') && !argsStr.includes('session')) {
           violations.push({
            type: 'IDOR_VULNERABILITY',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "🔓 **CRITICAL: Potential IDOR Vulnerability.** This Prisma mutation relies on a `where` clause without verifying ownership (missing `userId` or session bounds). A user could modify another user's data by changing the ID."
          });
        }
      }

      // RULE: PERF-002 - Unbounded Prisma Query
      if (methodName === 'findMany') {
        const argsStr = JSON.stringify(node.arguments);
        if (argsStr.length > 2 && !argsStr.includes('"take"') && !argsStr.includes('take:') && !argsStr.includes('"skip"')) {
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
        if (arg && (arg.type === 'TemplateLiteral' || arg.type === 'BinaryExpression' || (arg.type === 'Literal' && typeof arg.value === 'string'))) {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (node as any)[key];
      if (child && typeof child === 'object') {
        walk(child);
      }
    }
  }

  walk(ast);
  return violations;
}

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

  systemPrompt += ` Always respond STRICTLY in JSON format: { "status": "VULNERABILITY_CONFIRMED" | "FALSE_POSITIVE", "reasoning": "string", "fixedCode": "string" }`;

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

    if (eventType === "pull_request" && (payload.action === "opened" || payload.action === "synchronize")) {
      console.log(`[Vibe-Check] Scanning PR #${payload.pull_request.number}`);

      const installationId = payload.installation?.id;
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      const pull_number = payload.pull_request.number;
      const commit_id = payload.pull_request.head.sha;

      const app = new App({
        appId: process.env.GITHUB_APP_ID!,
        privateKey: process.env.GITHUB_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      });
      const octokit = await app.getInstallationOctokit(installationId);

      // --- DATABASE LOGGING: UPSERT ACCOUNT & REPOSITORY ---
      const supabase = createSupabaseServiceClient();

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

      let confirmedViolations: EngineResult[] = [];
      let scanStatus: 'SAFE' | 'VULNERABILITY_CONFIRMED' | 'FAILED' = 'SAFE';

      try {
        // 1. Fetch files
        const { data: files } = await octokit.rest.pulls.listFiles({ owner, repo, pull_number });
        const allViolations: ASTViolation[] = [];

        // 2. Run AST Scanner
        for (const file of files) {
          if (!file.filename.endsWith('.ts') && !file.filename.endsWith('.tsx')) continue;
          if (file.status === 'removed') continue;

          const { data: fileContent } = await octokit.rest.repos.getContent({
            owner, repo, path: file.filename, ref: commit_id, mediaType: { format: 'raw' }
          });

          const violations = runASTScanner(fileContent as unknown as string, file.filename);
          allViolations.push(...violations);
        }

        // 3. AI Processing & Filtering
        const aiResults = await Promise.all(allViolations.map(v => processViolationWithAI(v)));
        confirmedViolations = aiResults.filter(r => r.status === 'VULNERABILITY_CONFIRMED');
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
      if (scanRun) {
        // Update scan run status
        const { error: updateScanRunError } = await supabase
          .from("scan_runs")
          .update({
            status: scanStatus,
            violations_count: confirmedViolations.length,
          })
          .eq("id", scanRun.id);

        if (updateScanRunError) {
          console.error("[Vibe-Check] Database error updating scan run:", updateScanRunError);
        }

        // Insert violations
        if (confirmedViolations.length > 0) {
          const violationsToInsert = confirmedViolations.map(result => ({
            scan_run_id: scanRun.id,
            file_path: result.violation.fileName,
            line_number: result.violation.line,
            violation_type: result.violation.type,
            message: result.violation.message,
            snippet: result.violation.snippet || null,
            suggested_fix: result.suggestedFix || null,
            status: "CONFIRMED",
          }));

          const { error: violationsInsertError } = await supabase
            .from("scan_violations")
            .insert(violationsToInsert);

          if (violationsInsertError) {
            console.error("[Vibe-Check] Database error inserting violations:", violationsInsertError);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Vibe-Check] Error handling webhook request:", error);
    return NextResponse.json({ success: false, error: "Internal Error" }, { status: 500 });
  }
}
