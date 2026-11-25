import type { Expense, Debt, SettlementSummary } from '../models/types.ts';

/**
 * Calculates net balances for all participants across a list of expenses.
 * Net balance = Total Amount Paid - Total Amount Owed
 * Positive (> 0): Creditor (is owed money)
 * Negative (< 0): Debtor (owes money)
 * Zero (0): Settled up
 */
export function calculateNetBalances(expenses: Expense[]): Map<string, number> {
  const netBalances = new Map<string, number>();

  const addBalance = (userId: string, amount: number) => {
    const current = netBalances.get(userId) || 0;
    netBalances.set(userId, Math.round((current + amount) * 100) / 100);
  };

  for (const exp of expenses) {
    // 1. Credit payers
    for (const payer of exp.payers) {
      addBalance(payer.userId, payer.amount);
    }
    // 2. Debit consumers
    for (const split of exp.splits) {
      addBalance(split.userId, -split.amount);
    }
  }

  // Round all values to 2 decimal places to eliminate floating point drift
  for (const [userId, val] of netBalances.entries()) {
    netBalances.set(userId, Math.round(val * 100) / 100);
  }

  return netBalances;
}

/**
 * Computes unsimplified pairwise debts directly from transactions.
 * (e.g. If Alice paid for Bob, Bob directly owes Alice).
 */
export function calculateUnsimplifiedDebts(expenses: Expense[]): Debt[] {
  // Directed debt matrix: debtMatrix.get(debtor).get(creditor) = amount
  const debtMatrix = new Map<string, Map<string, number>>();

  const addDirectedDebt = (fromUser: string, toUser: string, amount: number) => {
    if (fromUser === toUser || amount <= 0.005) return;
    if (!debtMatrix.has(fromUser)) debtMatrix.set(fromUser, new Map());
    const userMap = debtMatrix.get(fromUser)!;
    userMap.set(toUser, (userMap.get(toUser) || 0) + amount);
  };

  for (const exp of expenses) {
    const total = exp.totalAmount;
    if (total <= 0) continue;

    for (const split of exp.splits) {
      // Split amount is owed proportionally to payers
      for (const payer of exp.payers) {
        if (payer.amount <= 0) continue;
        const shareOfPayer = (split.amount * payer.amount) / total;
        addDirectedDebt(split.userId, payer.userId, shareOfPayer);
      }
    }
  }

  // Net pairwise debts between every pair of users (A owes B vs B owes A)
  const debts: Debt[] = [];
  const processedPairs = new Set<string>();

  for (const [u1, map1] of debtMatrix.entries()) {
    for (const [u2, amt1] of map1.entries()) {
      const pairKey = [u1, u2].sort().join(':::');
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      const amt2 = debtMatrix.get(u2)?.get(u1) || 0;
      const net = Math.round((amt1 - amt2) * 100) / 100;

      if (net > 0.005) {
        debts.push({ fromUser: u1, toUser: u2, amount: net });
      } else if (net < -0.005) {
        debts.push({ fromUser: u2, toUser: u1, amount: -net });
      }
    }
  }

  return debts;
}

/**
 * Splitwise Core Algorithm: "Simplify Debts" (Min-Cash-Flow Optimization).
 *
 * Algorithm Concept:
 * 1. Takes the net balance vector where sum(netBalances) == 0.
 * 2. Groups participants into Creditors (balance > 0) and Debtors (balance < 0).
 * 3. Uses a greedy maximum matching strategy:
 *    - In each iteration, pairs the maximum creditor with the maximum debtor.
 *    - Settles the minimum of what the debtor owes and what the creditor is owed.
 *    - Updates remaining balances until all accounts are 0.
 *
 * Guaranteed Complexity & Properties:
 * - Maximum number of transactions is strictly <= (N - 1), where N is number of non-zero accounts.
 * - Eliminates circular debt chains (A -> B -> C -> A).
 * - Exact conservation of money: Nobody pays a penny more or receives a penny less.
 */
export function simplifyDebts(netBalances: Map<string, number>): Debt[] {
  interface Node {
    userId: string;
    amount: number;
  }

  const creditors: Node[] = [];
  const debtors: Node[] = [];

  for (const [userId, balance] of netBalances.entries()) {
    const rounded = Math.round(balance * 100) / 100;
    if (rounded > 0.005) {
      creditors.push({ userId, amount: rounded });
    } else if (rounded < -0.005) {
      debtors.push({ userId, amount: -rounded }); // store as positive debt
    }
  }

  // Sort descending by amount
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const simplifiedDebts: Debt[] = [];

  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const creditor = creditors[cIdx];
    const debtor = debtors[dIdx];

    // Settle the minimum of what debtor owes and creditor is owed
    const settlementAmount = Math.min(creditor.amount, debtor.amount);
    const roundedSettlement = Math.round(settlementAmount * 100) / 100;

    if (roundedSettlement > 0.005) {
      simplifiedDebts.push({
        fromUser: debtor.userId,
        toUser: creditor.userId,
        amount: roundedSettlement
      });
    }

    creditor.amount = Math.round((creditor.amount - settlementAmount) * 100) / 100;
    debtor.amount = Math.round((debtor.amount - settlementAmount) * 100) / 100;

    if (creditor.amount <= 0.005) {
      cIdx++;
    }
    if (debtor.amount <= 0.005) {
      dIdx++;
    }
  }

  return simplifiedDebts;
}

/**
 * Generates an end-to-end settlement summary showing before & after optimization stats.
 */
export function analyzeGroupSettlement(expenses: Expense[]): SettlementSummary {
  const netBalances = calculateNetBalances(expenses);
  const unsimplifiedDebts = calculateUnsimplifiedDebts(expenses);
  const simplifiedDebts = simplifyDebts(netBalances);

  const totalVolume = unsimplifiedDebts.reduce((sum, d) => sum + d.amount, 0);
  const reductionPercentage = unsimplifiedDebts.length > 0
    ? Math.round(((unsimplifiedDebts.length - simplifiedDebts.length) / unsimplifiedDebts.length) * 100)
    : 0;

  return {
    netBalances,
    unsimplifiedDebts,
    simplifiedDebts,
    totalVolume,
    reductionPercentage
  };
}
