<p align="center">
  <img src="./assets/mim-wizard.webp" alt="Magic Internet Money Wizard" width="160">
</p>

<h1 align="center">MIM-Dashboard</h1>

<p align="center">
  <strong>A self-hosted web dashboard for your <a href="https://bitcoincore.org">Bitcoin Core</a> node</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#requirements">Requirements</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#screenshots">Screenshots</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Bitcoin-Core-F7931A?style=flat-square&logo=bitcoin&logoColor=white" alt="Bitcoin Core">
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker Ready">
  <img src="https://img.shields.io/badge/Self--Hosted-100%25-222?style=flat-square" alt="Self-Hosted">
  <img src="https://img.shields.io/github/license/diogofelixti/mim-dashboard?style=flat-square" alt="License">
</p>

---

https://github.com/user-attachments/assets/79d9ddfb-4d82-495d-a231-6c7c714b26f2


Monitor, manage, and interact with your Bitcoin Core node through a modern web interface. Connects via RPC and ZMQ — no third parties, no external APIs, no cloud. Just you and your node.

> *"Don't trust, verify."*

## Features

- **Setup Wizard** — Auto-detects your Bitcoin Core installation, RPC credentials, ZMQ endpoints, and network (mainnet/signet/testnet). Zero manual config needed.
- **Real-Time Dashboard** — Node sync status, peer connections, mempool usage, fee history charts, and BTC price ticker — all updating live.
- **Health Semaphore** — At-a-glance 🟢🟡🔴 node health indicator based on sync progress, peer count, and mempool usage, with detailed popover.
- **Block Explorer** — Browse blocks by height or hash, view transaction details with inputs/outputs diagram, search by block height, hash, or txid.
- **Wallet Management** — Create, load, unload, and backup wallets. Generate addresses (bech32, bech32m, p2sh-segwit, legacy). Full transaction history with inline notes.
- **Coin Control** — Visual UTXO selection table with search, filters (confirmations, spendable), lock/unlock, and send selected UTXOs directly.
- **PSBT Wizard** — Step-by-step workflow for Partially Signed Bitcoin Transactions: create, review, sign (wallet or external), combine (multisig), finalize, and broadcast.
- **Transaction Notes** — Add personal notes/labels to any transaction. Stored per-user in the database, visible in explorer and wallet history.
- **Live Feed** — Watch new blocks and mempool transactions arrive in real-time via ZeroMQ.
- **Fee Estimation** — Current fee estimates (fast/medium/slow) plus historical fee trend chart.
- **Broadcast & Decode** — Broadcast raw transactions, decode raw hex or PSBTs.
- **Onboarding Wizard** — First-login tour introducing all dashboard features.
- **Responsive Design** — Works on desktop, tablet, and mobile. Sidebar becomes a drawer on small screens.
- **Dark Theme** — Purpose-built dark interface optimized for node operators.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/diogofelixti/mim-dashboard.git
cd mim-dashboard

# Copy the example environment file
cp .env.example .env

# Start everything with Docker Compose
docker compose up -d

# Open in your browser
open http://localhost:3000
```

The setup wizard will guide you through connecting to your Bitcoin Core node on first launch.

## Requirements

| Requirement | Version |
|---|---|
| [Docker](https://docs.docker.com/get-docker/) | 20.10+ |
| [Docker Compose](https://docs.docker.com/compose/) | v2+ |
| [Bitcoin Core](https://bitcoincore.org/en/download/) | 22.0+ (running on the host) |

### Bitcoin Core Configuration

Your `bitcoin.conf` needs RPC and ZMQ enabled. The setup wizard will auto-detect most of this, but here's a minimal config:

```ini
# RPC
server=1
rpcuser=your_rpc_user
rpcpassword=your_rpc_password

# ZMQ (for live block/tx feed)
zmqpubhashblock=tcp://0.0.0.0:28332
zmqpubhashtx=tcp://0.0.0.0:28333
zmqpubrawtx=tcp://0.0.0.0:28334

# Recommended
txindex=1
```

> **Note:** `txindex=1` is recommended for full transaction lookups in the explorer. Without it, you can only view transactions from blocks or wallet history.

## Configuration

All configuration is done through the `.env` file and the setup wizard.

### Environment Variables

```bash
# Database
DB_NAME=mim_dashboard        # PostgreSQL database name
DB_USER=mim                  # PostgreSQL user
DB_PASSWORD=changeme         # PostgreSQL password (change this!)
DB_PORT=5432                 # PostgreSQL port

# Auth
JWT_SECRET=change_this       # JWT signing secret (change this!)

# Ports
BACKEND_PORT=3001            # Backend API port
FRONTEND_PORT=3000           # Frontend web port
```

> **Important:** Change `DB_PASSWORD` and `JWT_SECRET` before deploying.

### Setup Wizard

On first launch, the setup wizard will:

1. **Detect** your Bitcoin Core installation by scanning the host filesystem
2. **Configure** RPC connection (host, port, user, password — or cookie auth)
3. **Configure** ZMQ endpoints for real-time events
4. **Set** your dashboard admin password
5. **Launch** — you're ready to go

All node settings are stored in the database and can be changed later in Settings.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Docker Compose                                     │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Frontend    │  │   Backend    │  │ PostgreSQL │ │
│  │  Next.js     │→ │   Fastify    │→ │            │ │
│  │  :3000       │  │   :3001      │  │   :5432    │ │
│  └─────────────┘  └──────┬───────┘  └────────────┘ │
│                          │                          │
└──────────────────────────┼──────────────────────────┘
                           │ RPC + ZMQ
                    ┌──────┴───────┐
                    │ Bitcoin Core │
                    │   (host)     │
                    └──────────────┘
```

| Component | Tech | Description |
|---|---|---|
| **Frontend** | Next.js 14 (App Router), Tailwind CSS, Recharts | Server-rendered React UI with client components |
| **Backend** | Fastify, Node.js 20 | REST API + WebSocket relay, JWT authentication |
| **Database** | PostgreSQL 16 | Users, preferences, transaction notes, fee history |
| **Real-time** | ZeroMQ + WebSocket | Block and transaction events from Bitcoin Core |

## Project Structure

```
mim-dashboard/
├── frontend/               # Next.js application
│   ├── src/
│   │   ├── app/            # Pages (dashboard, explorer, wallets, etc.)
│   │   ├── components/     # Reusable components (layout, onboarding, etc.)
│   │   ├── hooks/          # Custom hooks (useWebSocket)
│   │   └── lib/            # API client, formatters
│   └── Dockerfile
├── backend/                # Fastify API server
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── rpc/            # Bitcoin Core RPC client
│   │   ├── zmq/            # ZeroMQ subscriber
│   │   ├── db/             # Database migrations
│   │   ├── auth/           # JWT authentication
│   │   └── services/       # Fee tracker, price service
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## API Overview

All endpoints require JWT authentication (`Authorization: Bearer <token>`) except `/api/auth/login` and `/api/setup/*`.

| Endpoint | Description |
|---|---|
| `GET /api/blocks` | Latest blocks list |
| `GET /api/blocks/:id` | Block detail (by height or hash) |
| `GET /api/tx/:txid` | Transaction detail with inputs/outputs |
| `POST /api/tx/broadcast` | Broadcast raw transaction |
| `POST /api/tx/decode` | Decode raw transaction hex |
| `GET /api/wallets` | List loaded and available wallets |
| `GET /api/wallets/:name/utxos` | UTXOs with lock status |
| `POST /api/wallets/:name/send` | Send BTC (with optional coin control) |
| `POST /api/psbt/create` | Create funded PSBT |
| `POST /api/psbt/sign` | Sign PSBT with wallet |
| `POST /api/psbt/finalize` | Finalize and extract raw tx |
| `GET /api/node/health` | Node health semaphore |
| `GET /api/fees/history` | Historical fee data |
| `GET /api/search/:query` | Search blocks, transactions |

## Development

To run the project locally without Docker:

```bash
# Backend
cd backend
npm install
node src/index.js

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Requires a running PostgreSQL instance and the environment variables set.

## Updating

```bash
git pull
docker compose build
docker compose up -d
```

## Security

- All API routes are protected by JWT authentication
- Passwords are hashed with bcrypt (12 rounds)
- The host filesystem is mounted **read-only** (`/host-fs:ro`) for Bitcoin Core auto-detection
- No external API calls except BTC price (CoinGecko) — can be disabled
- Cookie authentication supported for Bitcoin Core RPC
- All data stays local — nothing leaves your machine

## License

[MIT](LICENSE) &copy; Diogo Felix
