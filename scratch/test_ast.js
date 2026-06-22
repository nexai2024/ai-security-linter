const fs = require('fs');
const path = require('path');
const { parse } = require("@typescript-eslint/typescript-estree");

function getMemberExpressionRoot(node) {
  let curr = node;
  while (curr && curr.type === 'MemberExpression') {
    curr = curr.object;
  }
  return curr && curr.type === 'Identifier' ? curr.name : null;
}

function runASTScanner(code, fileName) {
  const violations = [];
  let ast;

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

  function walk(node) {
    if (!node) return;

    // RULE: SEC-001 - Naked Server Action Check
    if (isServerFile && node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
      let hasDatabaseMutation = false;
      let hasAuthCheck = false;

      // Helper to traverse the function body nodes
      function checkFunctionNode(innerNode) {
        if (!innerNode) return;

        // Check for prisma mutations
        if (innerNode.type === 'MemberExpression') {
          const rootName = getMemberExpressionRoot(innerNode);
          if (rootName === 'prisma') {
            const method = innerNode.property.name;
            if (['create', 'update', 'delete', 'createMany', 'updateMany', 'deleteMany'].includes(method)) {
              hasDatabaseMutation = true;
            }
          }
        }

        // Check for auth checks
        if (innerNode.type === 'CallExpression') {
          const calleeStr = JSON.stringify(innerNode.callee);
          if (calleeStr.includes('auth') || calleeStr.includes('getSession') || calleeStr.includes('verifySession')) {
            hasAuthCheck = true;
          }
        }

        for (const key in innerNode) {
          if (typeof innerNode[key] === 'object') checkFunctionNode(innerNode[key]);
        }
      }

      checkFunctionNode(node.declaration.body);

      if (hasDatabaseMutation && !hasAuthCheck) {
        violations.push({
          type: 'NAKED_SERVER_ACTION',
          line: node.loc.start.line,
          fileName,
          snippet: code.substring(node.range[0], node.range[1]),
          message: "⚠️ **CRITICAL: Unauthenticated Server Action.** This function mutates the database but lacks an explicit authentication check (e.g., `auth()`). Server Actions are public endpoints by default."
        });
      }
    }

    // RULE: PERF-001 - Prisma N+1 Loop
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      const methodName = node.callee.property.name;
      if (methodName === 'map' || methodName === 'forEach') {
        let hasPrismaQueryInside = false;

        function checkLoopNode(innerNode) {
          if (!innerNode) return;
          if (innerNode.type === 'MemberExpression') {
            const rootName = getMemberExpressionRoot(innerNode);
            if (rootName === 'prisma') {
              const method = innerNode.property.name;
              if (['findMany', 'findUnique', 'findFirst', 'update', 'create', 'delete'].includes(method)) {
                hasPrismaQueryInside = true;
              }
            }
          }
          for (const key in innerNode) {
            if (typeof innerNode[key] === 'object') checkLoopNode(innerNode[key]);
          }
        }

        // Check loop arguments (callback function)
        node.arguments.forEach(arg => checkLoopNode(arg));

        if (hasPrismaQueryInside) {
          violations.push({
            type: 'PRISMA_N_PLUS_ONE',
            line: node.loc.start.line,
            fileName,
            snippet: code.substring(node.range[0], node.range[1]),
            message: "🚀 **PERFORMANCE: Prisma N+1 Loop Detected.** You are executing a database query inside an iterative loop. This will exhaust connection pools in production. Refactor to pull the query outside the loop using Prisma's `in` operator."
          });
        }
      }
    }

    for (const key in node) {
      if (typeof node[key] === 'object') walk(node[key]);
    }
  }

  walk(ast);
  return violations;
}

const actionsContent = fs.readFileSync(path.join(__dirname, '../actions.ts'), 'utf8');
console.log("=== Actions.ts Scan ===");
const actionsViolations = runASTScanner(actionsContent, 'actions.ts');
console.log(actionsViolations);

const queriesContent = fs.readFileSync(path.join(__dirname, '../queries.ts'), 'utf8');
console.log("\n=== Queries.ts Scan ===");
const queriesViolations = runASTScanner(queriesContent, 'queries.ts');
console.log(queriesViolations);
