import { db } from './database.ts';
import { calculateEqualSplit } from '../engine/splitCalculator.ts';
import { analyzeGroupSettlement } from '../engine/simplifyDebts.ts';

export function seedDatabase() {
  console.log('🌱 Seeding Splitwise Database...');
  db.clearAllData();

  // 1. Create Users
  const yash = db.createUser({ id: 'u_yash', name: 'Yash', email: 'yash@example.com', avatarUrl: '👨‍💻' });
  const alice = db.createUser({ id: 'u_alice', name: 'Alice', email: 'alice@example.com', avatarUrl: '👩‍🎨' });
  const bob = db.createUser({ id: 'u_bob', name: 'Bob', email: 'bob@example.com', avatarUrl: '🏄‍♂️' });
  const charlie = db.createUser({ id: 'u_charlie', name: 'Charlie', email: 'charlie@example.com', avatarUrl: '🎸' });
  const diana = db.createUser({ id: 'u_diana', name: 'Diana', email: 'diana@example.com', avatarUrl: '📸' });

  const allUserIds = [yash.id, alice.id, bob.id, charlie.id, diana.id];

  // 2. Create Group
  const trip = db.createGroup({
    id: 'grp_goa_trip',
    name: 'Goa Beach Trip 🌴',
    description: 'Weekend getaway with villa, scuba diving & sunset dinner',
    currency: 'INR',
    memberIds: allUserIds,
  });

  console.log(` Created group: "${trip.name}" with ${trip.members.length} members`);

  // 3. Seed Realistic Expenses
  // Expense 1: Villa Rental - Yash paid 15000, all 5 split
  db.createExpense({
    groupId: trip.id,
    description: 'Luxury Beach Villa (3 nights)',
    totalAmount: 15000,
    currency: 'INR',
    category: 'Lodging',
    payers: [{ userId: yash.id, amount: 15000 }],
    splitType: 'EQUAL',
    splits: calculateEqualSplit(15000, allUserIds),
  });

  // Expense 2: Seafood Shack Dinner - Alice paid 5400, all 5 split
  db.createExpense({
    groupId: trip.id,
    description: 'Fisherman’s Wharf Seafood Dinner',
    totalAmount: 5400,
    currency: 'INR',
    category: 'Food',
    payers: [{ userId: alice.id, amount: 5400 }],
    splitType: 'EQUAL',
    splits: calculateEqualSplit(5400, allUserIds),
  });

  // Expense 3: Scuba Diving - Bob paid 9000, split by Yash, Bob, Charlie (3000 each)
  const scubaParticipants = [yash.id, bob.id, charlie.id];
  db.createExpense({
    groupId: trip.id,
    description: 'Scuba Diving & Snorkeling at Grand Island',
    totalAmount: 9000,
    currency: 'INR',
    category: 'Activities',
    payers: [{ userId: bob.id, amount: 9000 }],
    splitType: 'EQUAL',
    splits: calculateEqualSplit(9000, scubaParticipants),
  });

  // Expense 4: SUV Rental & Fuel - Charlie paid 4000, all 5 split
  db.createExpense({
    groupId: trip.id,
    description: 'Thar 4x4 Rental & Fuel',
    totalAmount: 4000,
    currency: 'INR',
    category: 'Transport',
    payers: [{ userId: charlie.id, amount: 4000 }],
    splitType: 'EQUAL',
    splits: calculateEqualSplit(4000, allUserIds),
  });

  // Expense 5: Sunset Cocktails & Snacks - Diana paid 2500, all 5 split
  db.createExpense({
    groupId: trip.id,
    description: 'Curlies Sunset Cocktails & Appetizers',
    totalAmount: 2500,
    currency: 'INR',
    category: 'Drinks',
    payers: [{ userId: diana.id, amount: 2500 }],
    splitType: 'EQUAL',
    splits: calculateEqualSplit(2500, allUserIds),
  });

  const expenses = db.getGroupExpenses(trip.id);
  console.log(` Added ${expenses.length} expenses to "${trip.name}".`);

  // Analyze settlement summary
  const summary = analyzeGroupSettlement(expenses);
  console.log(` Settlement Stats:`);
  console.log(`   - Unsimplified Transactions: ${summary.unsimplifiedDebts.length}`);
  console.log(`   - Simplified Transactions:   ${summary.simplifiedDebts.length}`);
  console.log(`   - Transaction Reduction:     ${summary.reductionPercentage}%`);
  console.log(' Database seeded successfully!');
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase();
}
