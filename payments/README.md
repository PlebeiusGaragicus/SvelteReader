# SvelteReader Payments Service

Cashu ecash wallet service for handling payments.

## Overview

This service runs separately from the main AI backend for security isolation. It handles:

- Receiving ecash tokens from users
- Managing wallet balance
- Sweeping funds for withdrawal

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate
```

2. Install dependencies:
```bash
pip install -e .
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Configure environment variables:
```
WALLET_MNEMONIC=your twelve word mnemonic phrase here
MINT_URL=https://mint.minibits.cash/Bitcoin
WALLET_DB_PATH=wallet_db
```

**IMPORTANT**: Generate a secure mnemonic at https://iancoleman.io/bip39/ and back it up!

## Running

```bash
uvicorn src.main:app --reload --port 8001
```

The service runs on port 8001 by default (separate from AI backend on 8000).

## API Endpoints

- `POST /api/wallet/receive` - Receive an ecash token
- `GET /api/wallet/balance` - Get current balance
- `POST /api/wallet/sweep` - Sweep all funds to a token
- `POST /api/wallet/send?amount=100` - Create a send token
- `GET /health` - Health check
