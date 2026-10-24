#!/usr/bin/env bash
# ==============================================================================
# Termux NodePanel - 1-Click Ubuntu (proot-distro) Automated Setup
# ==============================================================================
set -e

echo "========================================================"
echo "    TERMUX NODEPANEL — UBUNTU (PROOT-DISTRO) SETUP      "
echo "========================================================"
echo ""

# 1. Update Package Lists
echo "[1/5] Updating Ubuntu package lists..."
apt-get update -y

# 2. Install Essential Tools & Dependencies
echo "[2/5] Installing core dependencies (curl, git, ca-certificates, gnupg)..."
apt-get install -y curl git ca-certificates gnupg

# 3. Install Stable Node.js 22 LTS via official NodeSource
echo "[3/5] Installing official Node.js 22 LTS (NodeSource)..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 20 ]; then
    echo "    Adding official NodeSource repository for clean Node.js & npm..."
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
    apt-get update -y
    apt-get install -y nodejs
else
    echo "    Node.js $(node -v) is already installed."
fi

# 4. Optimize npm for proot environment (prevents hangs and permission crashes)
echo "[4/5] Optimizing npm settings for PRoot environment..."
npm config set update-notifier false --global >/dev/null 2>&1 || true
npm config set fund false --global >/dev/null 2>&1 || true
npm config set audit false --global >/dev/null 2>&1 || true

# 5. Install dependencies & build production NodePanel bundle
echo "[5/5] Installing dependencies and building production frontend..."
npm ci
npm run build

echo ""
echo "========================================================"
echo "           SETUP COMPLETED SUCCESSFULLY!                "
echo "========================================================"
echo ""
echo "Run Termux NodePanel in production mode:"
echo "  NODE_ENV=production PORT=3000 npm start"
echo ""
echo "Open in your mobile or desktop browser:"
echo "  http://127.0.0.1:3000"
echo "========================================================"
