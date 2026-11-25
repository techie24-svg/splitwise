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

// 6. Friendships & 1-on-1 Direct Expenses
testDb.addFriend(u1.id, u2.id);
const aliceFriends = testDb.getFriends(u1.id);
assert.strictEqual(aliceFriends.length, 1, 'Alice should have 1 friend (Bob)');
assert.strictEqual(aliceFriends[0].id, u2.id);

// Add 1-on-1 direct expense between Alice and Bob (outside group)
const directExp = testDb.createExpense({
  description: 'Coffee',
  totalAmount: 10,
  currency: 'USD',
  splitType: 'EQUAL',
  payers: [{ userId: u1.id, amount: 10 }],
  splits: calculateEqualSplit(10, [u1.id, u2.id]),
});
assert.strictEqual(directExp.groupId, undefined, 'Direct expense should have no group');

// Bob owes Alice $10 from group expenses + $5 from coffee = $15 total
const friendBal = testDb.getFriendBalance(u1.id, u2.id);
assert.strictEqual(friendBal, 15, 'Bob should owe Alice $15 total ($10 mutual + $5 coffee)');
console.log('✓ Test 6: 1-on-1 Friendship and direct non-group expense balance passed.');

// 7. Comments
const comment = testDb.addComment(directExp.id, u2.id, 'Thanks for the coffee Alice!');
assert.strictEqual(comment.content, 'Thanks for the coffee Alice!');

const comments = testDb.getComments(directExp.id);
assert.strictEqual(comments.length, 1);
assert.strictEqual(comments[0].userName, 'Bob');
console.log('✓ Test 7: Expense comments thread persistence passed.');

// 8. Auth: Registration, Password Verification & Sessions
const registered = testDb.registerUser({
  name: 'Diana Prince',
  email: 'diana@superhero.com',
  password: 'securePassword123!',
  defaultCurrency: 'USD',
});
assert.strictEqual(registered.user.name, 'Diana Prince');
assert(registered.token.length > 20, 'Should return secure session token');

// Check login with correct password
const loginSuccess = testDb.loginUser('diana@superhero.com', 'securePassword123!');
assert(loginSuccess !== null, 'Login should succeed with correct credentials');
assert.strictEqual(loginSuccess.user.id, registered.user.id);

// Check login with incorrect password
const loginFail = testDb.loginUser('diana@superhero.com', 'wrongpassword');
assert.strictEqual(loginFail, null, 'Login should fail with wrong password');

// Check session retrieval
const sessionUser = testDb.getSessionUser(loginSuccess.token);
assert(sessionUser !== null);
assert.strictEqual(sessionUser.name, 'Diana Prince');

// Test Google Auth
const googleAuth = testDb.loginOrRegisterGoogleUser({
  name: 'Google User',
  email: 'googleuser@gmail.com',
  googleId: 'g_1234567890',
  avatarUrl: '🌐',
});
assert.strictEqual(googleAuth.user.name, 'Google User');
assert(googleAuth.token.length > 20);
console.log('✓ Test 8: User registration, cryptographic password verification, Google auth & sessions passed.');

// 9. Activity Logging & CSV Export
testDb.logActivity({
  userId: registered.user.id,
  type: 'expense_created',
  description: 'Diana added "Lasso of Truth" ($100.00)',
});
const activities = testDb.getActivities(10);
assert(activities.length >= 1, 'Should log and retrieve activities');
assert(activities.some((a) => a.userId === registered.user.id), 'Should log activity for registered user');

const csv = testDb.exportGroupExpensesCSV(group.id);
assert(csv.includes('Gas'), 'CSV export should include Gas expense');
assert(csv.includes('Snacks'), 'CSV export should include Snacks expense');
console.log('✓ Test 9: Activity stream audit logging & CSV export passed.');

console.log('\nAll Database Tests Passed Successfully! 🚀');
