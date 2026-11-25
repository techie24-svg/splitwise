import assert from 'node:assert';
import { SplitwiseDB } from '../src/db/database.ts';
import { calculateEqualSplit } from '../src/engine/splitCalculator.ts';
import { analyzeGroupSettlement } from '../src/engine/simplifyDebts.ts';

console.log('Running Splitwise Database Persistence Tests...\n');

// Use an in-memory database instance for testing
const testDb = new SplitwiseDB(':memory:');

// 1. Create Users
const u1 = testDb.createUser({ name: 'Alice', email: 'alice@test.com' });
const u2 = testDb.createUser({ name: 'Bob', email: 'bob@test.com' });
const u3 = testDb.createUser({ name: 'Charlie', email: 'charlie@test.com' });

assert.strictEqual(testDb.getUsers().length, 3, 'Should have 3 users in DB');
console.log('✓ Test 1: User creation & retrieval in SQLite passed.');

// 2. Create Group & Members
const group = testDb.createGroup({
  name: 'Roadtrip',
  currency: 'USD',
  memberIds: [u1.id, u2.id, u3.id],
});

assert.strictEqual(group.name, 'Roadtrip');
assert.strictEqual(group.members.length, 3);
console.log('✓ Test 2: Group creation with member relations passed.');

// 3. Add Expenses
testDb.createExpense({
  groupId: group.id,
  description: 'Gas',
  totalAmount: 60,
  currency: 'USD',
  category: 'Transport',
  splitType: 'EQUAL',
  payers: [{ userId: u1.id, amount: 60 }],
  splits: calculateEqualSplit(60, [u1.id, u2.id, u3.id]),
});

testDb.createExpense({
  groupId: group.id,
  description: 'Snacks',
  totalAmount: 30,
  currency: 'USD',
  category: 'Food',
  splitType: 'EQUAL',
  payers: [{ userId: u2.id, amount: 30 }],
  splits: calculateEqualSplit(30, [u1.id, u2.id, u3.id]),
});

const expenses = testDb.getGroupExpenses(group.id);
assert.strictEqual(expenses.length, 2, 'Should have 2 expenses recorded');
console.log('✓ Test 3: Multi-payer and split item persistence passed.');

// 4. Net Balances & Settlement Analysis
const summary = analyzeGroupSettlement(expenses);
// Gas (60 by u1): u1 paid 60, share is 20 -> net +40. u2 share 20, u3 share 20.
// Snacks (30 by u2): u2 paid 30, share is 10 -> net +20. u1 share 10, u3 share 10.
// Net:
// u1: +40 - 10 = +30
// u2: -20 + 20 = 0
// u3: -20 - 10 = -30
assert.strictEqual(summary.netBalances.get(u1.id), 30);
assert.strictEqual(summary.netBalances.get(u2.id), 0);
assert.strictEqual(summary.netBalances.get(u3.id), -30);

// Simplified debts: Charlie (u3) pays Alice (u1) $30
assert.strictEqual(summary.simplifiedDebts.length, 1);
assert.strictEqual(summary.simplifiedDebts[0].fromUser, u3.id);
assert.strictEqual(summary.simplifiedDebts[0].toUser, u1.id);
assert.strictEqual(summary.simplifiedDebts[0].amount, 30);
console.log('✓ Test 4: Debt simplification engine on SQLite records passed.');

// 5. Record Settlement
const settlement = testDb.recordSettlement(group.id, u3.id, u1.id, 30, 'USD');
assert.strictEqual(settlement.totalAmount, 30);

const expensesAfterSettlement = testDb.getGroupExpenses(group.id);
const summaryAfterSettlement = analyzeGroupSettlement(expensesAfterSettlement);

// All balances should now be 0
for (const [userId, bal] of summaryAfterSettlement.netBalances.entries()) {
  assert.strictEqual(bal, 0, `User ${userId} should be settled up to 0`);
}
assert.strictEqual(summaryAfterSettlement.simplifiedDebts.length, 0, 'No remaining simplified debts');
console.log('✓ Test 5: Settle up transaction resolves all balances to $0.00.');

console.log('\nAll Database Tests Passed Successfully! 🚀');
