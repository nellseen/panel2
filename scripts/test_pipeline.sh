#!/usr/bin/env bash
set -e

echo "================================================================="
echo "        TERMUX NODEPANEL — COMPREHENSIVE TEST PIPELINE           "
echo "================================================================="

echo ""
echo ">>> STAGE 1: Static Checks & Compilation Validation"
echo "[*] Running TypeScript type check (tsc --noEmit)..."
npm run lint
echo "    [PASS] TypeScript passed"

echo "[*] Building React static assets with Vite..."
npm run build
echo "    [PASS] Frontend Vite build passed"

echo ""
echo "================================================================="
echo "       ALL TEST STAGES COMPLETED SUCCESSFULLY WITH 0 FAILURES    "
echo "================================================================="
