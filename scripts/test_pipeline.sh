#!/usr/bin/env bash
set -euo pipefail

echo "================================================================="
echo "        TERMUX NODEPANEL — 5-STAGE AUTOMATED TEST PIPELINE       "
echo "================================================================="

echo ""
echo ">>> STAGE 1: Static Typecheck, ESLint & Production Build"
npm run typecheck
echo "    [PASS] TypeScript typecheck passed"

npm run lint
echo "    [PASS] ESLint static analysis passed"

echo ""
echo ">>> STAGE 2: Unit & Regression Tests (Vitest + Testing Library)"
npm run test:unit
echo "    [PASS] Unit tests passed"

echo ""
echo ">>> STAGE 3: Isolated API, Process Lifecycle & WS Integration Tests"
npm run test:integration
echo "    [PASS] Integration tests passed"

echo ""
echo ">>> Building Production Assets (Vite)"
npm run build
echo "    [PASS] Production bundle built cleanly"

echo ""
echo ">>> STAGE 4: Playwright End-to-End Browser Automation"
npm run test:e2e
echo "    [PASS] E2E browser suite passed"

if [[ "${RUN_LOAD_TEST:-0}" == "1" ]]; then
  echo ""
  echo ">>> STAGE 5: Staged HTTP & WebSocket Load Test"
  npm run test:load
  echo "    [PASS] Stage 5 load test passed"
fi

echo ""
echo "================================================================="
echo "       ALL PIPELINE STAGES COMPLETED WITH 0 FAILURES             "
echo "================================================================="
