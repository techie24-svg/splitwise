# Splitwise Core Engine, Persistence & Web Dashboard

A complete, production-grade implementation of the **Splitwise Core Expense & Debt Simplification System**, featuring:
1. **Core Algorithmic Engine**: Min-Cash-Flow graph optimization reducing debt transfers to at most $N-1$ transactions.
2. **Persistence Layer**: ACID-compliant relational storage powered by Node 24's native `node:sqlite` (`DatabaseSync`).
3. **REST API**: Clean Express HTTP API for managing users, groups, multi-payer expenses, and debt settlements.
4. **Interactive Web UI Dashboard**: Modern responsive UI with live settlement flow cards (`Debtor ── ₹Amount ──▶ Creditor`), net balance badges, multi-type split calculator, and 1-click settlement.

GitHub Repository: [**github.com/techie24-svg/splitwise**](https://github.com/techie24-svg/splitwise)

---

## ⚡ Quick Start

```bash
# 1. Start the REST API & Web UI Dashboard
npm start
# ➔ Opens http://localhost:3000

# 2. Run All Unit Test Suites (Algorithmic Engine + SQLite Persistence)
npm test

# 3. Seed / Reset Sample Goa Trip Scenario
npm run seed

# 4. Run CLI Simulation Demo
npm run demo
```

---

## 🌐 Interactive Web UI Dashboard

When you start the server and navigate to `http://localhost:3000`:
- **Active Group Overview**: Switch groups, view total trip spend, and debt volume.
- **Min-Cash-Flow Optimization Metric**: Live comparison of peer-to-peer transfers vs. optimal transactions (e.g. **-56% reduction** from 9 transfers to 4).
- **Interactive Settlement Cards**:
  - View animated debt transfer cards: `[From] ── ₹Amount ──▶ [To]`
  - Toggle between **Simplified (Optimal)** and **Unsimplified (Peer-to-Peer)** debt graphs.
  - **1-Click Settle**: Settle any debt directly from the card.
- **Net Balances Grid**: Color-coded balance badges for creditors (🟢 `+₹X.XX`), debtors (🔴 `-₹X.XX`), and settled participants.
- **Add Expense Modal**:
  - Supports multiple split modes: `= Equally`, `₹ Exact Amounts`, `% Percentage`, `⚖️ Shares`.
  - Auto-calculates shares and validates odd-cent currency rounding.
- **Reset Demo**: Instantly restore the sample 5-friend Goa trip dataset with 1 click.

---

## 📐 The "Simplify Debts" Algorithm

Splitwise's signature feature solves the **Minimum Cash Flow Problem** on a directed debt graph:

1. **Net Balance Theorem**:
   For any participant $u$, calculate their net monetary balance across all group expenses:
   $$\text{net}[u] = \sum_{\text{paid}} \text{amount} - \sum_{\text{consumed}} \text{share}$$
   - Positive balance ($> 0$): **Net Creditor** (gets paid back).
   - Negative balance ($< 0$): **Net Debtor** (owes money).
   - Conservation of Money: $\sum \text{net}[u] = 0$.

2. **Greedy Min-Cash-Flow Matching**:
   - In each round, pair the maximum creditor with the maximum debtor.
   - Settle $\min(\text{credit}, \text{debt})$.
   - Deduct settled amounts and repeat until all balances reach ₹0.00.
   - **Guaranteed bound**: Reduces any arbitrary debt graph with $N$ active people down to at most **$N - 1$ transactions** (often a 50%–80% reduction in payments) with zero loss of funds.

---

## 📡 REST API Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/users` | List all users |
| `POST` | `/api/users` | Create user `{ name, email, avatarUrl }` |
| `GET` | `/api/groups` | List all groups with members |
| `POST` | `/api/groups` | Create group `{ name, description, currency, memberIds }` |
| `GET` | `/api/groups/:id` | Get group details |
| `POST` | `/api/groups/:id/members` | Add user to group `{ userId }` |
| `GET` | `/api/groups/:id/expenses` | List group expenses |
| `POST` | `/api/groups/:id/expenses` | Add expense with multi-payer & split support |
| `DELETE` | `/api/expenses/:id` | Delete an expense |
| `GET` | `/api/groups/:id/settlement` | Get Net Balances, Unsimplified Debts & Min-Cash-Flow debts |
| `POST` | `/api/groups/:id/settle` | Record settlement payment `{ fromUserId, toUserId, amount }` |
| `POST` | `/api/seed` | Reset and reseed Goa Beach Trip demo dataset |

---

## 📦 Directory Structure

```text
reverse-engineering/
├── public/                      # Interactive Web UI Dashboard
│   ├── index.html               # Semantic HTML5 layout & modals
│   ├── style.css                # Dark modern theme, responsive grid
│   └── app.js                   # Client state, dynamic forms, API integration
├── src/
│   ├── db/
│   │   ├── database.ts          # Native Node 24 SQLite persistence layer
│   │   └── seed.ts              # Seed script (5-friend Goa Beach Trip scenario)
│   ├── engine/
│   │   ├── splitCalculator.ts   # EQUAL, EXACT, PERCENT, SHARES split logic + rounding
│   │   └── simplifyDebts.ts     # Min-Cash-Flow graph solver & net balance ledger
│   ├── models/
│   │   └── types.ts             # Domain contracts (User, Group, Expense, Debt)
│   ├── demo.ts                  # CLI simulation demo
│   └── server.ts                # Express REST API & static asset server
├── tests/
│   ├── simplifyDebts.test.ts    # Engine tests (circular debts, precision, conservation)
│   └── database.test.ts         # SQLite schema, CRUD, and settlement persistence tests
├── package.json
└── README.md
```

---

## 🧪 Split Types Supported

- **`EQUAL`**: Automatically handles odd-cent / paise rounding (e.g., ₹100 split 3 ways &rarr; ₹33.34, ₹33.33, ₹33.33).
- **`EXACT`**: Validates individual amounts sum exactly to total amount.
- **`PERCENT`**: Proportional distribution with strict 100% total validation.
- **`SHARES`**: Weighted multi-part splits ($s_i / \sum s$).
