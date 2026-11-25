import type { Expense } from './models/types.ts';
import { calculateSplits } from './engine/splitCalculator.ts';
import { analyzeGroupSettlement } from './engine/simplifyDebts.ts';

// 1. Define Friends in the Group
const users = {
  Yash: 'user_yash',
  Alice: 'user_alice',
  Bob: 'user_bob',
  Charlie: 'user_charlie',
  Diana: 'user_diana'
};

const userNames: Record<string, string> = {
  [users.Yash]: 'Yash',
  [users.Alice]: 'Alice',
  [users.Bob]: 'Bob',
  [users.Charlie]: 'Charlie',
  [users.Diana]: 'Diana'
};

const all5 = Object.values(users).map(id => ({ userId: id }));

console.log('='.repeat(75));
console.log(' 🪙  SPLITWISE REVERSE-ENGINEERED ENGINE DEMO');
console.log('='.repeat(75));
console.log('Scenario: 5 Friends (Yash, Alice, Bob, Charlie, Diana) on a Weekend Trip\n');

// 2. Create Realistic Expenses
const expenses: Expense[] = [
  {
    id: 'exp_1',
    description: 'Beach Villa Rental (2 Nights)',
    totalAmount: 15000,
    currency: 'INR',
    payers: [{ userId: users.Yash, amount: 15000 }],
    splitType: 'EQUAL',
    splits: calculateSplits(15000, 'EQUAL', all5),
    category: 'Lodging',
    createdAt: new Date('2026-11-20T10:00:00Z')
  },
  {
    id: 'exp_2',
    description: 'Seafood Dinner & Drinks',
    totalAmount: 4200,
    currency: 'INR',
    payers: [{ userId: users.Alice, amount: 4200 }],
    splitType: 'EQUAL',
    splits: calculateSplits(4200, 'EQUAL', all5),
    category: 'Food & Dining',
    createdAt: new Date('2026-11-20T21:00:00Z')
  },
  {
    id: 'exp_3',
    description: 'Rental Car & Fuel',
    totalAmount: 3000,
    currency: 'INR',
    payers: [{ userId: users.Bob, amount: 3000 }],
    splitType: 'EQUAL',
    splits: calculateSplits(3000, 'EQUAL', [
      { userId: users.Yash },
      { userId: users.Bob },
      { userId: users.Charlie }
    ]),
    category: 'Transport',
    createdAt: new Date('2026-11-21T09:00:00Z')
  },
  {
    id: 'exp_4',
    description: 'Supermarket Groceries & Snacks',
    totalAmount: 2400,
    currency: 'INR',
    // Split by shares: Yash (2 shares), Charlie (1 share), Diana (1 share)
    payers: [{ userId: users.Charlie, amount: 2400 }],
    splitType: 'SHARES',
    splits: calculateSplits(2400, 'SHARES', [
      { userId: users.Yash, value: 2 },
      { userId: users.Charlie, value: 1 },
      { userId: users.Diana, value: 1 }
    ]),
    category: 'Groceries',
    createdAt: new Date('2026-11-21T14:00:00Z')
  },
  {
    id: 'exp_5',
    description: 'Scuba Diving & Watersports',
    totalAmount: 6000,
    currency: 'INR',
    // Split with exact amounts (Alice and Diana did extra dives)
    payers: [{ userId: users.Diana, amount: 6000 }],
    splitType: 'EXACT',
    splits: calculateSplits(6000, 'EXACT', [
      { userId: users.Alice, value: 2500 },
      { userId: users.Diana, value: 2500 },
      { userId: users.Bob, value: 1000 }
    ]),
    category: 'Activities',
    createdAt: new Date('2026-11-22T11:00:00Z')
  }
];

// 3. Print Expense Log
console.log('📋 Logged Group Expenses:');
expenses.forEach((e, idx) => {
  const payerNames = e.payers.map(p => `${userNames[p.userId]} (₹${p.amount})`).join(', ');
  console.log(`  ${idx + 1}. [${e.category}] ${e.description}`);
  console.log(`     Total: ₹${e.totalAmount.toLocaleString('en-IN')} | Paid by: ${payerNames} | Split: ${e.splitType}`);
});

// 4. Run Analysis & Debt Simplification
const summary = analyzeGroupSettlement(expenses);

console.log('\n' + '-'.repeat(75));
console.log(' 📊 NET BALANCES (Total Paid minus Total Consumed)');
console.log('-'.repeat(75));

let checksum = 0;
for (const [userId, balance] of summary.netBalances.entries()) {
  const name = userNames[userId].padEnd(10);
  checksum += balance;
  if (balance > 0) {
    console.log(`  🟢 ${name} : +₹${balance.toLocaleString('en-IN').padStart(8)}  (gets back)`);
  } else if (balance < 0) {
    console.log(`  🔴 ${name} : -₹${Math.abs(balance).toLocaleString('en-IN').padStart(8)}  (owes)`);
  } else {
    console.log(`  ⚪ ${name} :  ₹0.00  (settled)`);
  }
}
console.log(`\n  Mathematical Checksum: ₹${Math.abs(checksum) < 0.001 ? '0.00 (Perfect Zero-Sum)' : checksum.toFixed(2)}`);

console.log('\n' + '-'.repeat(75));
console.log(` 🔀 UN-SIMPLIFIED DEBTS (${summary.unsimplifiedDebts.length} individual peer-to-peer transfers needed)`);
console.log('-'.repeat(75));
summary.unsimplifiedDebts.forEach((d, i) => {
  console.log(`  ${i + 1}. ${userNames[d.fromUser].padEnd(8)} owes ${userNames[d.toUser].padEnd(8)} : ₹${d.amount.toLocaleString('en-IN')}`);
});

console.log('\n' + '='.repeat(75));
console.log(` ✨ SPLITWISE SIMPLIFIED DEBTS (${summary.simplifiedDebts.length} optimal transactions! -${summary.reductionPercentage}% transfers)`);
console.log('='.repeat(75));
summary.simplifiedDebts.forEach((d, i) => {
  console.log(`  ✅ Transaction ${i + 1}:  ${userNames[d.fromUser].padEnd(8)}  ── ₹${d.amount.toLocaleString('en-IN').padEnd(7)} ──▶  ${userNames[d.toUser]}`);
});
console.log('\n' + '='.repeat(75) + '\n');
