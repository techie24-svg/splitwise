import { db } from './database.ts';
import { calculateEqualSplit } from '../engine/splitCalculator.ts';
import { analyzeGroupSettlement } from '../engine/simplifyDebts.ts';

export function seedDatabase() {
  console.log('🌱 Seeding Splitwise Database with Auth & Activity Stream...');
  db.clearAllData();

  // 1. Create Users with default password "password123"
  const yash = db.createUser({ id: 'u_yash', name: 'Yash', email: 'yash@example.com', avatarUrl: '👨‍💻', password: 'password123', defaultCurrency: 'INR' });
  const alice = db.createUser({ id: 'u_alice', name: 'Alice', email: 'alice@example.com', avatarUrl: '👩‍🎨', password: 'password123', defaultCurrency: 'INR' });
  const bob = db.createUser({ id: 'u_bob', name: 'Bob', email: 'bob@example.com', avatarUrl: '🏄‍♂️', password: 'password123', defaultCurrency: 'INR' });
  const charlie = db.createUser({ id: 'u_charlie', name: 'Charlie', email: 'charlie@example.com', avatarUrl: '🎸', password: 'password123', defaultCurrency: 'INR' });
  const diana = db.createUser({ id: 'u_diana', name: 'Diana', email: 'diana@example.com', avatarUrl: '📸', password: 'password123', defaultCurrency: 'INR' });

  const allUserIds = [yash.id, alice.id, bob.id, charlie.id, diana.id];

  // Friendships
  db.addFriend(yash.id, alice.id);
  db.addFriend(yash.id, bob.id);
  db.addFriend(yash.id, charlie.id);
  db.addFriend(yash.id, diana.id);
  db.addFriend(alice.id, bob.id);
  db.addFriend(charlie.id, diana.id);

  // 2. Create Group
  const trip = db.createGroup({
    id: 'grp_goa_trip',
    name: 'Goa Beach Trip 🌴',
    description: 'Weekend getaway with villa, scuba diving & sunset dinner',
    currency: 'INR',
    memberIds: allUserIds,
  });

  db.logActivity({
    userId: yash.id,
    groupId: trip.id,
    type: 'group_created',
    description: 'Yash created the group "Goa Beach Trip 🌴"',
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
  db.logActivity({
    userId: yash.id,
    groupId: trip.id,
    type: 'expense_created',
    description: 'Yash added "Luxury Beach Villa (3 nights)" (₹15,000.00)',
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
  db.logActivity({
    userId: alice.id,
    groupId: trip.id,
    type: 'expense_created',
    description: 'Alice added "Fisherman’s Wharf Seafood Dinner" (₹5,400.00)',
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
  db.logActivity({
    userId: bob.id,
    groupId: trip.id,
    type: 'expense_created',
    description: 'Bob added "Scuba Diving & Snorkeling at Grand Island" (₹9,000.00)',
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
  db.logActivity({
    userId: charlie.id,
    groupId: trip.id,
    type: 'expense_created',
    description: 'Charlie added "Thar 4x4 Rental & Fuel" (₹4,000.00)',
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
  db.logActivity({
    userId: diana.id,
    groupId: trip.id,
    type: 'expense_created',
    description: 'Diana added "Curlies Sunset Cocktails & Appetizers" (₹2,500.00)',
  });

  // Direct 1-on-1 Expense (Outside of Group: group_id is null)
  const directExp = db.createExpense({
    description: 'Airport Prepaid Cab (Goa Airport to Villa)',
    totalAmount: 1200,
    currency: 'INR',
    category: 'Transport',
    payers: [{ userId: yash.id, amount: 1200 }],
    splitType: 'EQUAL',
    splits: calculateEqualSplit(1200, [yash.id, alice.id]),
  });
  db.logActivity({
    userId: yash.id,
    type: 'expense_created',
    description: 'Yash added 1:1 expense "Airport Prepaid Cab" with Alice (₹1,200.00)',
  });

  // Comments on expenses
  const allGroupExpenses = db.getGroupExpenses(trip.id);
  const villaExp = allGroupExpenses.find((e) => e.description.includes('Villa'));
  const dinnerExp = allGroupExpenses.find((e) => e.description.includes('Seafood'));

  if (villaExp) {
    db.addComment(villaExp.id, alice.id, 'The ocean view from the terrace was breathtaking! 🌊');
    db.addComment(villaExp.id, yash.id, 'Totally worth it! Glad everyone loved the private pool.');
  }

  if (dinnerExp) {
    db.addComment(dinnerExp.id, charlie.id, 'Best butter garlic prawns in North Goa! 🍤');
  }

  if (directExp) {
    db.addComment(directExp.id, alice.id, 'Thanks for booking the cab Yash, split added! 🚕');
  }

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
