import type { Expense } from '../src/models/types.ts';
import { calculateSplits } from '../src/engine/splitCalculator.ts';
import { calculateNetBalances, simplifyDebts, analyzeGroupSettlement } from '../src/engine/simplifyDebts.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertClose(actual: number, expected: number, message: string) {
  if (Math.abs(actual - expected) > 0.01) {
    throw new Error(`Expected ${expected}, got ${actual}: ${message}`);
  }
}

console.log('Running Splitwise Engine Unit Tests...\n');

// Test 1: Equal Split with Remainder (Odd cents)
{
  const splits = calculateSplits(100, 'EQUAL', [
    { userId: 'u1' },
    { userId: 'u2' },
    { userId: 'u3' }
  ]);
  assert(splits.length === 3, 'Should have 3 splits');
  const sum = splits.reduce((acc, s) => acc + s.amount, 0);
  assertClose(sum, 100, 'Sum of splits must be exactly 100.00');
  assertClose(splits[0].amount, 33.34, 'First user gets 1 cent remainder');
  assertClose(splits[1].amount, 33.33, 'Second user gets 33.33');
  assertClose(splits[2].amount, 33.33, 'Third user gets 33.33');
  console.log('✓ Test 1: Equal split with odd cent remainder passed.');
}

// Test 2: Percentage Split
{
  const splits = calculateSplits(500, 'PERCENT', [
    { userId: 'u1', value: 50 },
    { userId: 'u2', value: 30 },
    { userId: 'u3', value: 20 }
  ]);
  assertClose(splits[0].amount, 250, '50% of 500 is 250');
  assertClose(splits[1].amount, 150, '30% of 500 is 150');
  assertClose(splits[2].amount, 100, '20% of 500 is 100');
  console.log('✓ Test 2: Percentage split passed.');
}

// Test 3: Shares Split
{
  const splits = calculateSplits(300, 'SHARES', [
    { userId: 'u1', value: 3 }, // 3 shares
    { userId: 'u2', value: 2 }, // 2 shares
    { userId: 'u3', value: 1 }  // 1 share -> total 6 shares
  ]);
  assertClose(splits[0].amount, 150, '3/6 of 300 is 150');
  assertClose(splits[1].amount, 100, '2/6 of 300 is 100');
  assertClose(splits[2].amount, 50,  '1/6 of 300 is 50');
  console.log('✓ Test 3: Proportional shares split passed.');
}

// Test 4: Circular Debt Simplification (A -> B -> C -> A = 0 debts)
{
  // A pays 100 for B
  // B pays 100 for C
  // C pays 100 for A
  const circularExpenses: Expense[] = [
    {
      id: 'e1',
      description: 'A pays for B',
      totalAmount: 100,
      currency: 'INR',
      payers: [{ userId: 'A', amount: 100 }],
      splitType: 'EXACT',
      splits: [{ userId: 'B', amount: 100 }],
      createdAt: new Date()
    },
    {
      id: 'e2',
      description: 'B pays for C',
      totalAmount: 100,
      currency: 'INR',
      payers: [{ userId: 'B', amount: 100 }],
      splitType: 'EXACT',
      splits: [{ userId: 'C', amount: 100 }],
      createdAt: new Date()
    },
    {
      id: 'e3',
      description: 'C pays for A',
      totalAmount: 100,
      currency: 'INR',
      payers: [{ userId: 'C', amount: 100 }],
      splitType: 'EXACT',
      splits: [{ userId: 'A', amount: 100 }],
      createdAt: new Date()
    }
  ];

  const summary = analyzeGroupSettlement(circularExpenses);
  assert(summary.unsimplifiedDebts.length === 3, 'Unsimplified should have 3 circular debts');
  assert(summary.simplifiedDebts.length === 0, 'Simplified debts must be 0 (everyone is even)');
  for (const [, balance] of summary.netBalances.entries()) {
    assertClose(balance, 0, 'Every net balance must be 0');
  }
  console.log('✓ Test 4: Circular debt resolution (3 debts -> 0 debts) passed.');
}

// Test 5: Debt Conservation & Upper Bound Guarantee (<= N - 1)
{
  const testExpenses: Expense[] = [
    {
      id: 'e1',
      description: 'Dinner',
      totalAmount: 1200,
      currency: 'INR',
      payers: [{ userId: 'U1', amount: 1200 }],
      splitType: 'EQUAL',
      splits: calculateSplits(1200, 'EQUAL', [
        { userId: 'U1' }, { userId: 'U2' }, { userId: 'U3' }, { userId: 'U4' }
      ]),
      createdAt: new Date()
    },
    {
      id: 'e2',
      description: 'Drinks',
      totalAmount: 800,
      currency: 'INR',
      payers: [{ userId: 'U2', amount: 800 }],
      splitType: 'EQUAL',
      splits: calculateSplits(800, 'EQUAL', [
        { userId: 'U1' }, { userId: 'U2' }, { userId: 'U3' }, { userId: 'U4' }
      ]),
      createdAt: new Date()
    }
  ];

  const summary = analyzeGroupSettlement(testExpenses);
  const nonZeroUsers = Array.from(summary.netBalances.values()).filter(v => Math.abs(v) > 0.01).length;
  
  assert(
    summary.simplifiedDebts.length <= Math.max(0, nonZeroUsers - 1),
    `Transactions (${summary.simplifiedDebts.length}) must be <= N - 1 (${nonZeroUsers - 1})`
  );

  // Validate that simplified debts completely clear everyone's balance
  const testBalances = new Map(summary.netBalances);
  for (const tx of summary.simplifiedDebts) {
    testBalances.set(tx.fromUser, (testBalances.get(tx.fromUser) || 0) + tx.amount);
    testBalances.set(tx.toUser, (testBalances.get(tx.toUser) || 0) - tx.amount);
  }

  for (const [u, b] of testBalances.entries()) {
    assertClose(b, 0, `After executing simplified transactions, user ${u} must have 0 balance`);
  }

  console.log('✓ Test 5: Mathematical conservation and N-1 transaction upper bound passed.');
}

console.log('\nAll 5 Unit Tests Passed Successfully! 💯');
