// src/server.ts
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

// src/db/database.ts
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
var SplitwiseDB = class {
  db;
  constructor(dbPath = process.env.DATABASE_PATH || (process.env.VERCEL ? "/tmp/splitwise.db" : "splitwise.db")) {
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }
  initSchema() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        avatar_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        currency TEXT NOT NULL DEFAULT 'INR',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (group_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        total_amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        split_type TEXT NOT NULL,
        category TEXT DEFAULT 'General',
        is_settlement INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS expense_payers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS expense_splits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        percentage REAL,
        shares REAL
      );

      CREATE TABLE IF NOT EXISTS friendships (
        user_id1 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_id2 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id1, user_id2)
      );

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
  // --- Users ---
  createUser(user) {
    const id = user.id || randomUUID();
    const stmt = this.db.prepare(
      "INSERT INTO users (id, name, email, avatar_url) VALUES (?, ?, ?, ?) RETURNING id, name, email, avatar_url"
    );
    const row = stmt.get(id, user.name, user.email || null, user.avatarUrl || null);
    return {
      id: row.id,
      name: row.name,
      email: row.email || void 0,
      avatarUrl: row.avatar_url || void 0
    };
  }
  getUsers() {
    const rows = this.db.prepare("SELECT id, name, email, avatar_url FROM users ORDER BY name ASC").all();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || void 0,
      avatarUrl: r.avatar_url || void 0
    }));
  }
  getUserById(id) {
    const row = this.db.prepare("SELECT id, name, email, avatar_url FROM users WHERE id = ?").get(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email || void 0,
      avatarUrl: row.avatar_url || void 0
    };
  }
  // --- Groups ---
  createGroup(data) {
    const groupId = data.id || randomUUID();
    const currency = data.currency || "INR";
    this.db.prepare("INSERT INTO groups (id, name, description, currency) VALUES (?, ?, ?, ?)").run(
      groupId,
      data.name,
      data.description || null,
      currency
    );
    if (data.memberIds && data.memberIds.length > 0) {
      const memberStmt = this.db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)");
      for (const uid of data.memberIds) {
        memberStmt.run(groupId, uid);
      }
    }
    return this.getGroupById(groupId);
  }
  getGroups() {
    const rows = this.db.prepare("SELECT id, name, description, currency, created_at FROM groups ORDER BY created_at DESC").all();
    return rows.map((r) => this.hydrateGroup(r));
  }
  getGroupById(id) {
    const row = this.db.prepare("SELECT id, name, description, currency, created_at FROM groups WHERE id = ?").get(id);
    if (!row) return null;
    return this.hydrateGroup(row);
  }
  addGroupMember(groupId, userId) {
    this.db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)").run(groupId, userId);
  }
  getGroupMembers(groupId) {
    const rows = this.db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_url
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY u.name ASC
    `).all(groupId);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || void 0,
      avatarUrl: r.avatar_url || void 0
    }));
  }
  hydrateGroup(row) {
    return {
      id: row.id,
      name: row.name,
      description: row.description || void 0,
      currency: row.currency,
      members: this.getGroupMembers(row.id),
      createdAt: new Date(row.created_at)
    };
  }
  // --- Expenses ---
  createExpense(data) {
    const expenseId = data.id || randomUUID();
    const currency = data.currency || "INR";
    const createdAtStr = data.createdAt ? data.createdAt.toISOString() : (/* @__PURE__ */ new Date()).toISOString();
    this.db.prepare(`
      INSERT INTO expenses (id, group_id, description, total_amount, currency, split_type, category, is_settlement, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      expenseId,
      data.groupId || null,
      data.description,
      data.totalAmount,
      currency,
      data.splitType,
      data.category || "General",
      data.isSettlement ? 1 : 0,
      createdAtStr
    );
    const payerStmt = this.db.prepare("INSERT INTO expense_payers (expense_id, user_id, amount) VALUES (?, ?, ?)");
    for (const p of data.payers) {
      payerStmt.run(expenseId, p.userId, p.amount);
    }
    const splitStmt = this.db.prepare(
      "INSERT INTO expense_splits (expense_id, user_id, amount, percentage, shares) VALUES (?, ?, ?, ?, ?)"
    );
    for (const s of data.splits) {
      splitStmt.run(expenseId, s.userId, s.amount, s.percentage || null, s.shares || null);
    }
    return this.getExpenseById(expenseId);
  }
  getExpenseById(id) {
    const row = this.db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
    if (!row) return null;
    return this.hydrateExpense(row);
  }
  getGroupExpenses(groupId) {
    const rows = this.db.prepare(
      "SELECT * FROM expenses WHERE group_id = ? ORDER BY created_at DESC"
    ).all(groupId);
    return rows.map((r) => this.hydrateExpense(r));
  }
  getAllExpenses() {
    const rows = this.db.prepare("SELECT * FROM expenses ORDER BY created_at DESC").all();
    return rows.map((r) => this.hydrateExpense(r));
  }
  deleteExpense(id) {
    const res = this.db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
    return res.changes > 0;
  }
  recordSettlement(groupId, fromUserId, toUserId, amount, currency = "INR") {
    const fromUser = this.getUserById(fromUserId);
    const toUser = this.getUserById(toUserId);
    const fromName = fromUser?.name || fromUserId;
    const toName = toUser?.name || toUserId;
    return this.createExpense({
      groupId,
      description: `Settlement: ${fromName} paid ${toName}`,
      totalAmount: amount,
      currency,
      splitType: "EXACT",
      category: "Payment",
      isSettlement: true,
      payers: [{ userId: fromUserId, amount }],
      splits: [{ userId: toUserId, amount }]
    });
  }
  hydrateExpense(row) {
    const payerRows = this.db.prepare("SELECT user_id, amount FROM expense_payers WHERE expense_id = ?").all(row.id);
    const splitRows = this.db.prepare(
      "SELECT user_id, amount, percentage, shares FROM expense_splits WHERE expense_id = ?"
    ).all(row.id);
    return {
      id: row.id,
      groupId: row.group_id || void 0,
      description: row.description,
      totalAmount: row.total_amount,
      currency: row.currency,
      splitType: row.split_type,
      category: row.category || void 0,
      createdAt: new Date(row.created_at),
      payers: payerRows.map((p) => ({
        userId: p.user_id,
        amount: p.amount
      })),
      splits: splitRows.map((s) => ({
        userId: s.user_id,
        amount: s.amount,
        percentage: s.percentage !== null ? s.percentage : void 0,
        shares: s.shares !== null ? s.shares : void 0
      }))
    };
  }
  // --- Friendships & 1-on-1 Expenses ---
  addFriend(userId1, userId2) {
    if (userId1 === userId2) return;
    const [u1, u2] = [userId1, userId2].sort();
    this.db.prepare("INSERT OR IGNORE INTO friendships (user_id1, user_id2) VALUES (?, ?)").run(u1, u2);
  }
  getFriends(userId) {
    const rows = this.db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_url
      FROM users u
      WHERE u.id IN (
        SELECT user_id2 FROM friendships WHERE user_id1 = ?
        UNION
        SELECT user_id1 FROM friendships WHERE user_id2 = ?
      )
      ORDER BY u.name ASC
    `).all(userId, userId);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || void 0,
      avatarUrl: r.avatar_url || void 0
    }));
  }
  getDirectExpenses(userId1, userId2) {
    const rows = this.db.prepare(`
      SELECT DISTINCT e.*
      FROM expenses e
      WHERE (e.group_id IS NULL OR e.group_id = '' OR e.group_id = '0')
        AND e.id IN (
          SELECT expense_id FROM expense_payers WHERE user_id IN (?, ?)
          UNION
          SELECT expense_id FROM expense_splits WHERE user_id IN (?, ?)
        )
      ORDER BY e.created_at DESC
    `).all(userId1, userId2, userId1, userId2);
    return rows.map((r) => this.hydrateExpense(r));
  }
  getFriendBalance(currentUserId, friendId) {
    const expenses = this.getAllExpenses();
    let balance = 0;
    for (const exp of expenses) {
      const total = exp.totalAmount;
      if (total <= 0) continue;
      const currentUserPaid = exp.payers.find((p) => p.userId === currentUserId)?.amount || 0;
      const friendPaid = exp.payers.find((p) => p.userId === friendId)?.amount || 0;
      const currentUserOwed = exp.splits.find((s) => s.userId === currentUserId)?.amount || 0;
      const friendOwed = exp.splits.find((s) => s.userId === friendId)?.amount || 0;
      if (currentUserPaid > 0 && friendOwed > 0) {
        balance += friendOwed * currentUserPaid / total;
      }
      if (friendPaid > 0 && currentUserOwed > 0) {
        balance -= currentUserOwed * friendPaid / total;
      }
    }
    return Math.round(balance * 100) / 100;
  }
  getFriendSummaries(currentUserId) {
    const friends = this.getFriends(currentUserId);
    return friends.map((f) => ({
      friend: f,
      netBalance: this.getFriendBalance(currentUserId, f.id),
      currency: "INR"
    }));
  }
  // --- Comments ---
  addComment(expenseId, userId, content) {
    const id = randomUUID();
    const createdAt = /* @__PURE__ */ new Date();
    this.db.prepare("INSERT INTO comments (id, expense_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)").run(
      id,
      expenseId,
      userId,
      content,
      createdAt.toISOString()
    );
    const user = this.getUserById(userId);
    return {
      id,
      expenseId,
      userId,
      userName: user?.name || userId,
      userAvatar: user?.avatarUrl,
      content,
      createdAt
    };
  }
  getComments(expenseId) {
    const rows = this.db.prepare(`
      SELECT c.id, c.expense_id, c.user_id, c.content, c.created_at, u.name, u.avatar_url
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.expense_id = ?
      ORDER BY c.created_at ASC
    `).all(expenseId);
    return rows.map((r) => ({
      id: r.id,
      expenseId: r.expense_id,
      userId: r.user_id,
      userName: r.name || r.user_id,
      userAvatar: r.avatar_url || void 0,
      content: r.content,
      createdAt: new Date(r.created_at)
    }));
  }
  deleteComment(commentId) {
    const res = this.db.prepare("DELETE FROM comments WHERE id = ?").run(commentId);
    return res.changes > 0;
  }
  clearAllData() {
    this.db.exec(`
      DELETE FROM comments;
      DELETE FROM friendships;
      DELETE FROM expense_splits;
      DELETE FROM expense_payers;
      DELETE FROM expenses;
      DELETE FROM group_members;
      DELETE FROM groups;
      DELETE FROM users;
    `);
  }
};
var db = new SplitwiseDB();

// src/engine/splitCalculator.ts
function calculateSplits(totalAmount, splitType, participants) {
  if (participants.length === 0) {
    throw new Error("At least one participant is required to split an expense.");
  }
  const roundedTotal = Math.round(totalAmount * 100) / 100;
  const count = participants.length;
  switch (splitType) {
    case "EQUAL": {
      const totalCents = Math.round(roundedTotal * 100);
      const baseShareCents = Math.floor(totalCents / count);
      let remainderCents = totalCents % count;
      return participants.map((p) => {
        let userCents = baseShareCents;
        if (remainderCents > 0) {
          userCents += 1;
          remainderCents -= 1;
        }
        return {
          userId: p.userId,
          amount: userCents / 100
        };
      });
    }
    case "EXACT": {
      const splits = participants.map((p) => ({
        userId: p.userId,
        amount: Math.round((p.value || 0) * 100) / 100
      }));
      const sum = splits.reduce((acc, s) => acc + s.amount, 0);
      if (Math.abs(sum - roundedTotal) > 0.01) {
        throw new Error(`Exact amounts sum to ${sum.toFixed(2)}, which does not match total amount ${roundedTotal.toFixed(2)}`);
      }
      return splits;
    }
    case "PERCENT": {
      const totalPercent = participants.reduce((acc, p) => acc + (p.value || 0), 0);
      if (Math.abs(totalPercent - 100) > 0.01) {
        throw new Error(`Percentages sum to ${totalPercent}%, which must equal 100%`);
      }
      let distributedCents = 0;
      const totalCents = Math.round(roundedTotal * 100);
      const splits = participants.map((p, idx) => {
        if (idx === count - 1) {
          const lastCents = totalCents - distributedCents;
          return {
            userId: p.userId,
            percentage: p.value,
            amount: lastCents / 100
          };
        }
        const cents = Math.round(roundedTotal * (p.value || 0) / 100 * 100);
        distributedCents += cents;
        return {
          userId: p.userId,
          percentage: p.value,
          amount: cents / 100
        };
      });
      return splits;
    }
    case "SHARES": {
      const totalShares = participants.reduce((acc, p) => acc + (p.value || 1), 0);
      if (totalShares <= 0) {
        throw new Error("Total shares must be greater than zero.");
      }
      let distributedCents = 0;
      const totalCents = Math.round(roundedTotal * 100);
      const splits = participants.map((p, idx) => {
        const share = p.value || 1;
        if (idx === count - 1) {
          const lastCents = totalCents - distributedCents;
          return {
            userId: p.userId,
            shares: share,
            amount: lastCents / 100
          };
        }
        const cents = Math.round(totalCents * share / totalShares);
        distributedCents += cents;
        return {
          userId: p.userId,
          shares: share,
          amount: cents / 100
        };
      });
      return splits;
    }
    default:
      throw new Error(`Unsupported split type: ${splitType}`);
  }
}
function calculateEqualSplit(totalAmount, userIds) {
  return calculateSplits(
    totalAmount,
    "EQUAL",
    userIds.map((uid) => ({ userId: uid }))
  );
}

// src/engine/simplifyDebts.ts
function calculateNetBalances(expenses) {
  const netBalances = /* @__PURE__ */ new Map();
  const addBalance = (userId, amount) => {
    const current = netBalances.get(userId) || 0;
    netBalances.set(userId, Math.round((current + amount) * 100) / 100);
  };
  for (const exp of expenses) {
    for (const payer of exp.payers) {
      addBalance(payer.userId, payer.amount);
    }
    for (const split of exp.splits) {
      addBalance(split.userId, -split.amount);
    }
  }
  for (const [userId, val] of netBalances.entries()) {
    netBalances.set(userId, Math.round(val * 100) / 100);
  }
  return netBalances;
}
function calculateUnsimplifiedDebts(expenses) {
  const debtMatrix = /* @__PURE__ */ new Map();
  const addDirectedDebt = (fromUser, toUser, amount) => {
    if (fromUser === toUser || amount <= 5e-3) return;
    if (!debtMatrix.has(fromUser)) debtMatrix.set(fromUser, /* @__PURE__ */ new Map());
    const userMap = debtMatrix.get(fromUser);
    userMap.set(toUser, (userMap.get(toUser) || 0) + amount);
  };
  for (const exp of expenses) {
    const total = exp.totalAmount;
    if (total <= 0) continue;
    for (const split of exp.splits) {
      for (const payer of exp.payers) {
        if (payer.amount <= 0) continue;
        const shareOfPayer = split.amount * payer.amount / total;
        addDirectedDebt(split.userId, payer.userId, shareOfPayer);
      }
    }
  }
  const debts = [];
  const processedPairs = /* @__PURE__ */ new Set();
  for (const [u1, map1] of debtMatrix.entries()) {
    for (const [u2, amt1] of map1.entries()) {
      const pairKey = [u1, u2].sort().join(":::");
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);
      const amt2 = debtMatrix.get(u2)?.get(u1) || 0;
      const net = Math.round((amt1 - amt2) * 100) / 100;
      if (net > 5e-3) {
        debts.push({ fromUser: u1, toUser: u2, amount: net });
      } else if (net < -5e-3) {
        debts.push({ fromUser: u2, toUser: u1, amount: -net });
      }
    }
  }
  return debts;
}
function simplifyDebts(netBalances) {
  const creditors = [];
  const debtors = [];
  for (const [userId, balance] of netBalances.entries()) {
    const rounded = Math.round(balance * 100) / 100;
    if (rounded > 5e-3) {
      creditors.push({ userId, amount: rounded });
    } else if (rounded < -5e-3) {
      debtors.push({ userId, amount: -rounded });
    }
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);
  const simplifiedDebts = [];
  let cIdx = 0;
  let dIdx = 0;
  while (cIdx < creditors.length && dIdx < debtors.length) {
    const creditor = creditors[cIdx];
    const debtor = debtors[dIdx];
    const settlementAmount = Math.min(creditor.amount, debtor.amount);
    const roundedSettlement = Math.round(settlementAmount * 100) / 100;
    if (roundedSettlement > 5e-3) {
      simplifiedDebts.push({
        fromUser: debtor.userId,
        toUser: creditor.userId,
        amount: roundedSettlement
      });
    }
    creditor.amount = Math.round((creditor.amount - settlementAmount) * 100) / 100;
    debtor.amount = Math.round((debtor.amount - settlementAmount) * 100) / 100;
    if (creditor.amount <= 5e-3) {
      cIdx++;
    }
    if (debtor.amount <= 5e-3) {
      dIdx++;
    }
  }
  return simplifiedDebts;
}
function analyzeGroupSettlement(expenses) {
  const netBalances = calculateNetBalances(expenses);
  const unsimplifiedDebts = calculateUnsimplifiedDebts(expenses);
  const simplifiedDebts = simplifyDebts(netBalances);
  const totalVolume = unsimplifiedDebts.reduce((sum, d) => sum + d.amount, 0);
  const reductionPercentage = unsimplifiedDebts.length > 0 ? Math.round((unsimplifiedDebts.length - simplifiedDebts.length) / unsimplifiedDebts.length * 100) : 0;
  return {
    netBalances,
    unsimplifiedDebts,
    simplifiedDebts,
    totalVolume,
    reductionPercentage
  };
}

// src/db/seed.ts
function seedDatabase() {
  console.log("\u{1F331} Seeding Splitwise Database...");
  db.clearAllData();
  const yash = db.createUser({ id: "u_yash", name: "Yash", email: "yash@example.com", avatarUrl: "\u{1F468}\u200D\u{1F4BB}" });
  const alice = db.createUser({ id: "u_alice", name: "Alice", email: "alice@example.com", avatarUrl: "\u{1F469}\u200D\u{1F3A8}" });
  const bob = db.createUser({ id: "u_bob", name: "Bob", email: "bob@example.com", avatarUrl: "\u{1F3C4}\u200D\u2642\uFE0F" });
  const charlie = db.createUser({ id: "u_charlie", name: "Charlie", email: "charlie@example.com", avatarUrl: "\u{1F3B8}" });
  const diana = db.createUser({ id: "u_diana", name: "Diana", email: "diana@example.com", avatarUrl: "\u{1F4F8}" });
  const allUserIds = [yash.id, alice.id, bob.id, charlie.id, diana.id];
  db.addFriend(yash.id, alice.id);
  db.addFriend(yash.id, bob.id);
  db.addFriend(yash.id, charlie.id);
  db.addFriend(yash.id, diana.id);
  db.addFriend(alice.id, bob.id);
  db.addFriend(charlie.id, diana.id);
  const trip = db.createGroup({
    id: "grp_goa_trip",
    name: "Goa Beach Trip \u{1F334}",
    description: "Weekend getaway with villa, scuba diving & sunset dinner",
    currency: "INR",
    memberIds: allUserIds
  });
  console.log(` Created group: "${trip.name}" with ${trip.members.length} members`);
  db.createExpense({
    groupId: trip.id,
    description: "Luxury Beach Villa (3 nights)",
    totalAmount: 15e3,
    currency: "INR",
    category: "Lodging",
    payers: [{ userId: yash.id, amount: 15e3 }],
    splitType: "EQUAL",
    splits: calculateEqualSplit(15e3, allUserIds)
  });
  db.createExpense({
    groupId: trip.id,
    description: "Fisherman\u2019s Wharf Seafood Dinner",
    totalAmount: 5400,
    currency: "INR",
    category: "Food",
    payers: [{ userId: alice.id, amount: 5400 }],
    splitType: "EQUAL",
    splits: calculateEqualSplit(5400, allUserIds)
  });
  const scubaParticipants = [yash.id, bob.id, charlie.id];
  db.createExpense({
    groupId: trip.id,
    description: "Scuba Diving & Snorkeling at Grand Island",
    totalAmount: 9e3,
    currency: "INR",
    category: "Activities",
    payers: [{ userId: bob.id, amount: 9e3 }],
    splitType: "EQUAL",
    splits: calculateEqualSplit(9e3, scubaParticipants)
  });
  db.createExpense({
    groupId: trip.id,
    description: "Thar 4x4 Rental & Fuel",
    totalAmount: 4e3,
    currency: "INR",
    category: "Transport",
    payers: [{ userId: charlie.id, amount: 4e3 }],
    splitType: "EQUAL",
    splits: calculateEqualSplit(4e3, allUserIds)
  });
  const exp5 = db.createExpense({
    groupId: trip.id,
    description: "Curlies Sunset Cocktails & Appetizers",
    totalAmount: 2500,
    currency: "INR",
    category: "Drinks",
    payers: [{ userId: diana.id, amount: 2500 }],
    splitType: "EQUAL",
    splits: calculateEqualSplit(2500, allUserIds)
  });
  const directExp = db.createExpense({
    description: "Airport Prepaid Cab (Goa Airport to Villa)",
    totalAmount: 1200,
    currency: "INR",
    category: "Transport",
    payers: [{ userId: yash.id, amount: 1200 }],
    splitType: "EQUAL",
    splits: calculateEqualSplit(1200, [yash.id, alice.id])
  });
  const allGroupExpenses = db.getGroupExpenses(trip.id);
  const villaExp = allGroupExpenses.find((e) => e.description.includes("Villa"));
  const dinnerExp = allGroupExpenses.find((e) => e.description.includes("Seafood"));
  if (villaExp) {
    db.addComment(villaExp.id, alice.id, "The ocean view from the terrace was breathtaking! \u{1F30A}");
    db.addComment(villaExp.id, yash.id, "Totally worth it! Glad everyone loved the private pool.");
  }
  if (dinnerExp) {
    db.addComment(dinnerExp.id, charlie.id, "Best butter garlic prawns in North Goa! \u{1F364}");
  }
  if (directExp) {
    db.addComment(directExp.id, alice.id, "Thanks for booking the cab Yash, split added! \u{1F695}");
  }
  const expenses = db.getGroupExpenses(trip.id);
  console.log(` Added ${expenses.length} expenses to "${trip.name}".`);
  const summary = analyzeGroupSettlement(expenses);
  console.log(` Settlement Stats:`);
  console.log(`   - Unsimplified Transactions: ${summary.unsimplifiedDebts.length}`);
  console.log(`   - Simplified Transactions:   ${summary.simplifiedDebts.length}`);
  console.log(`   - Transaction Reduction:     ${summary.reductionPercentage}%`);
  console.log(" Database seeded successfully!");
}
if (process.argv[1]?.endsWith("seed.ts")) {
  seedDatabase();
}

// src/server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var rootDir = path.resolve(__dirname, "..");
var app = express();
var PORT = process.env.PORT || 3e3;
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(rootDir, "public")));
var initialized = false;
app.use((req, res, next) => {
  if (!initialized) {
    try {
      if (db.getGroups().length === 0) {
        seedDatabase();
      }
      initialized = true;
    } catch (e) {
      console.error("Error auto-seeding:", e);
    }
  }
  next();
});
function getUserMap() {
  const users = db.getUsers();
  const map = /* @__PURE__ */ new Map();
  for (const u of users) {
    map.set(u.id, u.name);
  }
  return map;
}
app.get("/api/users", (req, res) => {
  try {
    const users = db.getUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/users", (req, res) => {
  try {
    const { name, email, avatarUrl } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ success: false, error: "Name is required" });
    }
    const user = db.createUser({ name, email, avatarUrl });
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/groups", (req, res) => {
  try {
    const groups = db.getGroups();
    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/groups", (req, res) => {
  try {
    const { name, description, currency, memberIds } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ success: false, error: "Group name is required" });
    }
    const group = db.createGroup({ name, description, currency, memberIds });
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/groups/:id", (req, res) => {
  try {
    const group = db.getGroupById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, error: "Group not found" });
    }
    res.json({ success: true, data: group });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/groups/:id/members", (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: "userId is required" });
    }
    db.addGroupMember(req.params.id, userId);
    const updated = db.getGroupById(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/groups/:id/expenses", (req, res) => {
  try {
    const expenses = db.getGroupExpenses(req.params.id);
    res.json({ success: true, data: expenses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
function handleCreateExpense(req, res, forcedGroupId) {
  try {
    const groupId = forcedGroupId !== void 0 ? forcedGroupId : req.body.groupId === "0" ? void 0 : req.body.groupId;
    const {
      description,
      totalAmount,
      currency,
      category,
      splitType = "EQUAL",
      payers,
      splits,
      participants
    } = req.body;
    if (!description || !totalAmount || Number(totalAmount) <= 0) {
      return res.status(400).json({ success: false, error: "Valid description and totalAmount are required" });
    }
    if (!payers || !Array.isArray(payers) || payers.length === 0) {
      return res.status(400).json({ success: false, error: "At least one payer is required" });
    }
    let calculatedSplits = splits;
    if (!calculatedSplits || calculatedSplits.length === 0) {
      if (splitType === "EQUAL" && Array.isArray(participants) && participants.length > 0) {
        calculatedSplits = calculateEqualSplit(Number(totalAmount), participants);
      } else {
        return res.status(400).json({ success: false, error: "Valid split items or participants list is required" });
      }
    }
    if (!groupId && participants && participants.length >= 2) {
      db.addFriend(participants[0], participants[1]);
    }
    const expense = db.createExpense({
      groupId: groupId || void 0,
      description,
      totalAmount: Number(totalAmount),
      currency: currency || "INR",
      category: category || "General",
      splitType,
      payers,
      splits: calculatedSplits
    });
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}
app.post("/api/groups/:id/expenses", (req, res) => {
  handleCreateExpense(req, res, req.params.id);
});
app.post("/api/expenses", (req, res) => {
  handleCreateExpense(req, res);
});
app.delete("/api/expenses/:id", (req, res) => {
  try {
    const ok = db.deleteExpense(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: "Expense not found" });
    }
    res.json({ success: true, message: "Expense deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/groups/:id/settlement", (req, res) => {
  try {
    const groupId = req.params.id;
    const group = db.getGroupById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, error: "Group not found" });
    }
    const expenses = db.getGroupExpenses(groupId);
    const summary = analyzeGroupSettlement(expenses);
    const userMap = getUserMap();
    const netBalancesList = [];
    for (const [userId, balance] of summary.netBalances.entries()) {
      netBalancesList.push({
        userId,
        userName: userMap.get(userId) || userId,
        balance
      });
    }
    netBalancesList.sort((a, b) => b.balance - a.balance);
    const unsimplifiedWithNames = summary.unsimplifiedDebts.map((d) => ({
      ...d,
      fromUserName: userMap.get(d.fromUser) || d.fromUser,
      toUserName: userMap.get(d.toUser) || d.toUser
    }));
    const simplifiedWithNames = summary.simplifiedDebts.map((d) => ({
      ...d,
      fromUserName: userMap.get(d.fromUser) || d.fromUser,
      toUserName: userMap.get(d.toUser) || d.toUser
    }));
    res.json({
      success: true,
      data: {
        currency: group.currency,
        netBalances: netBalancesList,
        unsimplifiedDebts: unsimplifiedWithNames,
        simplifiedDebts: simplifiedWithNames,
        stats: {
          totalVolume: summary.totalVolume,
          unsimplifiedCount: summary.unsimplifiedDebts.length,
          simplifiedCount: summary.simplifiedDebts.length,
          reductionPercentage: summary.reductionPercentage,
          totalExpenses: expenses.length
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/groups/:id/settle", (req, res) => {
  try {
    const groupId = req.params.id;
    const { fromUserId, toUserId, amount, currency } = req.body;
    if (!fromUserId || !toUserId || !amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: "fromUserId, toUserId, and a positive amount are required to settle"
      });
    }
    const expense = db.recordSettlement(groupId, fromUserId, toUserId, Number(amount), currency);
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/friends", (req, res) => {
  try {
    const currentUserId = req.query.userId || db.getUsers()[0]?.id;
    if (!currentUserId) {
      return res.json({ success: true, data: [] });
    }
    const friendSummaries = db.getFriendSummaries(currentUserId);
    res.json({ success: true, data: friendSummaries });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/friends", (req, res) => {
  try {
    const { userId1, userId2 } = req.body;
    if (!userId1 || !userId2) {
      return res.status(400).json({ success: false, error: "Both userId1 and userId2 are required" });
    }
    db.addFriend(userId1, userId2);
    res.status(201).json({ success: true, message: "Friendship created" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/friends/:id/expenses", (req, res) => {
  try {
    const friendId = req.params.id;
    const currentUserId = req.query.userId || db.getUsers()[0]?.id;
    const directExpenses = db.getDirectExpenses(currentUserId, friendId);
    res.json({ success: true, data: directExpenses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/friends/:id/balance", (req, res) => {
  try {
    const friendId = req.params.id;
    const currentUserId = req.query.userId || db.getUsers()[0]?.id;
    const balance = db.getFriendBalance(currentUserId, friendId);
    res.json({ success: true, data: { userId: currentUserId, friendId, netBalance: balance } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/expenses/:id/comments", (req, res) => {
  try {
    const comments = db.getComments(req.params.id);
    res.json({ success: true, data: comments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/expenses/:id/comments", (req, res) => {
  try {
    const expenseId = req.params.id;
    const { userId, content } = req.body;
    if (!userId || !content || !content.trim()) {
      return res.status(400).json({ success: false, error: "userId and non-empty content are required" });
    }
    const comment = db.addComment(expenseId, userId, content.trim());
    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.delete("/api/comments/:id", (req, res) => {
  try {
    const ok = db.deleteComment(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: "Comment not found" });
    }
    res.json({ success: true, message: "Comment deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/seed", (req, res) => {
  try {
    seedDatabase();
    res.json({ success: true, message: "Database reseeded with Goa Beach Trip scenario!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
if (process.argv[1]?.endsWith("server.ts")) {
  if (db.getGroups().length === 0) {
    console.log("Database is empty. Populating initial seed data...");
    seedDatabase();
  }
  app.listen(PORT, () => {
    console.log(`
=================================================`);
    console.log(`\u{1F680} Splitwise Server & UI running at http://localhost:${PORT}`);
    console.log(`\u{1F4E1} REST API Documentation available at http://localhost:${PORT}/api/groups`);
    console.log(`=================================================
`);
  });
}
var server_default = app;

// src/vercel-handler.ts
var vercel_handler_default = server_default;
export {
  vercel_handler_default as default
};
