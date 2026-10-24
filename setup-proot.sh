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
echo "[2/5] Installing core dependencies (curl, git, sqlite3, golang)..."
apt-get install -y curl git sqlite3 golang-go ca-certificates gnupg

# 3. Install Stable Node.js 20 LTS via official NodeSource (Fixes Ubuntu's broken npm)
echo "[3/5] Installing official Node.js 20 LTS (NodeSource)..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 18 ]; then
    echo "    Adding official NodeSource repository for clean Node.js & npm..."
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
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

# 5. Compile Standalone Go Daemon (Embeds complete Bento Glassmorphism UI)
echo "[5/5] Compiling Termux NodePanel daemon binary..."
mkdir -p bin
go build -o bin/nodepanel ./cmd/panel

echo ""
echo "========================================================"
echo "           SETUP BERHASIL DISELESAIKAN!                 "
echo "========================================================"
echo ""
echo "Panel web dan backend Go sudah siap digunakan tanpa perlu"
echo "menjalankan npm install lagi untuk dashboard panel!"
echo ""
echo "Perintah menjalankan panel:"
echo "  ./bin/nodepanel start --port=8080 --host=0.0.0.0"
echo ""
echo "Buka di browser HP atau PC Anda:"
echo "  http://localhost:8080"
echo "========================================================"
