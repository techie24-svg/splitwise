# Splitwise Reverse-Engineered Engine & Architecture

A high-performance TypeScript implementation of the **Splitwise Core Expense & Debt Simplification Engine**, built and verified directly in this workspace.

Pushed to GitHub: [**github.com/techie24-svg/splitwise**](https://github.com/techie24-svg/splitwise)

---

## ⚡ Quick Start

```bash
# Run the Interactive 5-Friend Trip Simulation
npm run demo

# Run Full Algorithmic Unit Tests
npm test
```

---

## 📐 The "Simplify Debts" Algorithm

Splitwise's signature feature solves the **Minimum Cash Flow Problem** in a directed debt graph:

1. **Net Balance Theorem**:
   For any participant $u$, calculate their net monetary balance across all group expenses:
   $$\text{net}[u] = \sum_{\text{paid}} \text{amount} - \sum_{\text{consumed}} \text{share}$$
   - Positive balance ($> 0$): **Net Creditor** (gets paid back).
   - Negative balance ($< 0$): **Net Debtor** (owes money).
   - $\sum \text{net}[u] = 0$ (Conservation of Money).

2. **Greedy Min-Cash-Flow Matching**:
   - In each round, pair the maximum creditor with the maximum debtor.
   - Settle $\min(\text{credit}, \text{debt})$.
   - Deduct settled amounts and repeat until all balances reach ₹0.00.
   - **Guaranteed bound**: Reduces any arbitrary debt graph with $N$ active people down to at most **$N - 1$ transactions** (often a 50%–80% reduction in payments).

---

## 📦 Directory Structure

```text
reverse-engineering/
├── src/
│   ├── models/
│   │   └── types.ts             # Domain models (User, Group, Expense, SplitItem, Debt)
│   ├── engine/
│   │   ├── splitCalculator.ts   # EQUAL, EXACT, PERCENT, SHARES split logic + rounding
│   │   └── simplifyDebts.ts     # Splitwise Min-Cash-Flow graph solver & net ledger
│   └── demo.ts                  # Interactive 5-person trip simulation
├── tests/
│   └── simplifyDebts.test.ts    # Comprehensive unit tests (circular debts, precision)
├── targets/                     # Dropped apps/binaries for inspection
├── extracted/                   # Unpacked assets and bundles
├── analysis/                    # Architecture logs and reverse engineering findings
└── .agents/skills/              # Reverse Engineer Anything (REA) skill definitions
```

---

## 🧪 Split Types Supported

- **`EQUAL`**: Automatically handles odd-cent / paise rounding (e.g., ₹100 split 3 ways &rarr; ₹33.34, ₹33.33, ₹33.33).
- **`EXACT`**: Validates individual amounts sum exactly to total amount.
- **`PERCENT`**: Proportional distribution with strict 100% total validation.
- **`SHARES`**: Weighted multi-part splits ($s_i / \sum s$).
