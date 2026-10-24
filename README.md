# Termux NodePanel

Panel server & proses Node.js yang ringan, modular, dan modern dengan arsitektur **Full-Stack TypeScript & Node.js**, **Interactive Live Terminal**, **Bento UI Glassmorphism Liquid Glass**, dan isolasi direktori per-server. Didesain untuk berjalan mulus di lingkungan **native Termux**, **Ubuntu (`proot-distro`)**, maupun server Linux standar tanpa beban binary precompiled.

---

## ⚡ Fitur Utama

1. **Bebas Ketergantungan Binary Precompiled**:
   - Dijalankan langsung 100% dari source code menggunakan Node.js dan TypeScript (`tsx`).
   - Tidak memerlukan binary `bin/nodepanel` kompilasi luar yang tidak dapat diaudit atau di-maintain.
   - Build frontend terpisah dan dapat direproduksi (`npm run build`).

2. **Live Console Sebenarnya (Interactive Shell Terminal)**:
   - Menjalankan perintah shell interaktif langsung di direktori server/project yang sedang dipilih (`data/servers/<serverId>`).
   - Output `stdout` dan `stderr` streaming secara realtime melalui WebSocket.
   - Menampilkan exit code dan status proses saat selesai.
   - Mendukung riwayat perintah (command history navigasi panah Atas/Bawah).
   - Penanganan proses panjang dengan tombol stop/kill (^C / SIGINT) yang aman.
   - Indikator direktori kerja aktif (`cwd`) yang terikat pada server dan terlindung dari path traversal.

3. **Environment Variables Otomatis dari `.env.example`**:
   - Secara otomatis mendeteksi dan mem-parsing template variabel dari `.env.example` di root server.
   - Menampilkan komentar, deskripsi, dan nilai contoh.
   - Mengizinkan pengeditan nilai aktual, penambahan variabel baru, dan penghapusan dengan konfirmasi.
   - Menyimpan variabel ke file `.env` di root server tanpa pernah menimpa `.env.example`.

4. **File Manager Modern dengan Pop-Up Context Menu**:
   - Klik kanan atau klik tombol aksi 3-titik memunculkan menu konteks floating pop-up yang presisi di dekat item.
   - Viewport boundary detection: menu tidak terpotong tepi layar atau kontainer scroll.
   - Aksi file: Open / In-Browser Code Editor, Rename, Download, Copy Path, Delete.
   - Aksi folder: Open, Rename, Copy Path, Delete.
   - Navigasi breadcrumb dan dialog konfirmasi in-app yang aman.

5. **Process Supervisor & Server Management**:
   - Lifecycle management: Start, Stop, Restart, dan Delete server.
   - Monitoring metrik real-time: PID, RSS Memory (MB), Port, dan Uptime.
   - Auto-restart policy: `never`, `on-failure`, atau `always`.

---

## 🚀 Cara Menjalankan dari Source

### 1. Prasyarat
- **Node.js**: Versi 20 atau 22 LTS
- **npm**: Paket manager standar Node.js

### 2. Instalasi Dependensi
```bash
git clone https://github.com/termux-nodepanel/nodepanel.git
cd nodepanel
npm install
```

### 3. Mode Development (Live Dev Server)
Jalankan server gabungan (Express backend + Vite middleware) di port 3000:
```bash
npm run dev
```
Buka browser: **`http://localhost:3000`**

### 4. Mode Produksi
Bangun aset statis frontend dan jalankan server produksi:
```bash
npm run build
npm start
```

---

## 📁 Struktur Direktori

```text
nodepanel/
├── data/                         # Direktori penyimpanan data
│   ├── nodepanel.json            # Database JSON metadata server & activity
│   └── servers/                  # Direktori kerja per-server terisolasi
│       └── <serverId>/           # Root direktori server tertentu
│           ├── .env.example      # Template konfigurasi environment
│           ├── .env              # Variabel aktual yang terisolasi
│           ├── package.json      # Dependensi server
│           ├── index.js          # Entry script
│           └── logs/             # Log file eksekusi server
├── src/                          # Frontend React + TypeScript
│   ├── components/               # Komponen Bento UI
│   │   ├── ServerDetailView.tsx  # Terminal, File Manager, Env, App Logs
│   │   ├── ServerListView.tsx    # Daftar & status aplikasi
│   │   ├── DashboardView.tsx     # Ringkasan analitik & metrik
│   │   ├── PackagesView.tsx      # Manajemen paket sistem
│   │   ├── DiagnosticsView.tsx   # Diagnostik kernel & toolchain
│   │   └── SettingsView.tsx      # Konfigurasi panel
│   ├── services/                 # Klien API & WebSocket
│   └── types/                    # Definisi TypeScript
├── server.ts                     # Full-stack backend Express & WebSocket
├── package.json                  # Konfigurasi dependensi dan scripts
└── vite.config.ts                # Konfigurasi bundler Vite
```

---

## 🔒 Keamanan & Isolasi

- **Path Traversal Protection**: Semua operasi file dan navigasi direktori terminal di backend divalidasi ketat menggunakan `path.resolve` dan `path.relative` untuk mencegah akses di luar root server.
- **Process Isolation**: Perintah terminal dan proses server berjalan dengan working directory terikat pada direktori server masing-masing.
- **Zero Secrets in Logs**: Nilai rahasia dalam file `.env` tidak pernah dicatat ke sistem log.
