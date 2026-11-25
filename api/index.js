// src/server.ts
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

// src/db/database.ts
import { DatabaseSync } from "node:sqlite";
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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
        email TEXT UNIQUE,
        password_hash TEXT,
        salt TEXT,
        avatar_url TEXT,
        default_currency TEXT NOT NULL DEFAULT 'INR',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id TEXT,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
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
    try {
      this.db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT;");
    } catch {
    }
    try {
      this.db.exec("ALTER TABLE users ADD COLUMN salt TEXT;");
    } catch {
    }
    try {
      this.db.exec("ALTER TABLE users ADD COLUMN default_currency TEXT NOT NULL DEFAULT 'INR';");
    } catch {
    }
    try {
      this.db.exec("ALTER TABLE users ADD COLUMN google_id TEXT;");
    } catch {
    }
  }
  // --- Password Hashing Helpers ---
  hashPassword(password, salt) {
    return scryptSync(password, salt, 64).toString("hex");
  }
  // --- Authentication & Users ---
  registerUser(data) {
    const id = data.id || randomUUID();
    const salt = randomBytes(16).toString("hex");
    const password = data.password || "password123";
    const passwordHash = this.hashPassword(password, salt);
    const defaultCurrency = data.defaultCurrency || "INR";
    const avatarUrl = data.avatarUrl || "\u{1F464}";
    const stmt = this.db.prepare(`
      INSERT INTO users (id, name, email, password_hash, salt, avatar_url, default_currency)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING id, name, email, avatar_url, default_currency
    `);
    const row = stmt.get(id, data.name, data.email.toLowerCase(), passwordHash, salt, avatarUrl, defaultCurrency);
    const user = {
      id: row.id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatar_url,
      defaultCurrency: row.default_currency
    };
    const token = this.createSession(user.id);
    this.logActivity({
      userId: user.id,
      type: "user_joined",
      description: `${user.name} joined Splitwise!`
    });
    return { user, token };
  }
  loginUser(email, password) {
    const row = this.db.prepare(`
      SELECT id, name, email, password_hash, salt, avatar_url, default_currency
      FROM users
      WHERE lower(email) = lower(?)
    `).get(email);
    if (!row || !row.password_hash || !row.salt) {
      return null;
    }
    const computedHash = this.hashPassword(password, row.salt);
    const valid = timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(row.password_hash, "hex"));
    if (!valid) {
      return null;
    }
    const user = {
      id: row.id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatar_url,
      defaultCurrency: row.default_currency
    };
    const token = this.createSession(user.id);
    return { user, token };
  }
  loginOrRegisterGoogleUser(data) {
    const email = data.email.toLowerCase().trim();
    let row = this.db.prepare(`
      SELECT id, name, email, avatar_url, default_currency, google_id
      FROM users
      WHERE lower(email) = ?
    `).get(email);
    let user;
    if (row) {
      if (data.googleId && !row.google_id) {
        this.db.prepare("UPDATE users SET google_id = ? WHERE id = ?").run(data.googleId, row.id);
      }
      user = {
        id: row.id,
        name: row.name,
        email: row.email,
        avatarUrl: row.avatar_url || data.avatarUrl || "\u{1F464}",
        defaultCurrency: row.default_currency || "INR"
      };
    } else {
      const id = randomUUID();
      const salt = randomBytes(16).toString("hex");
      const passwordHash = this.hashPassword(randomBytes(32).toString("hex"), salt);
      const avatarUrl = data.avatarUrl || "\u{1F464}";
      const defaultCurrency = "INR";
      this.db.prepare(`
        INSERT INTO users (id, name, email, password_hash, salt, avatar_url, default_currency, google_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.name, email, passwordHash, salt, avatarUrl, defaultCurrency, data.googleId || null);
      this.logActivity({
        userId: id,
        type: "user_joined",
        description: `${data.name} signed up with Google!`
      });
      user = {
        id,
        name: data.name,
        email,
        avatarUrl,
        defaultCurrency
      };
    }
    const token = this.createSession(user.id);
    return { user, token };
  }
  createSession(userId) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3);
    this.db.prepare(`
      INSERT INTO sessions (token, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(token, userId, expiresAt.toISOString());
    return token;
  }
  getSessionUser(token) {
    if (!token) return null;
    const row = this.db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_url, u.default_currency, s.expires_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
    `).get(token);
    if (!row) return null;
    if (new Date(row.expires_at) < /* @__PURE__ */ new Date()) {
      this.deleteSession(token);
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatar_url,
      defaultCurrency: row.default_currency
    };
  }
  deleteSession(token) {
    this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }
  updateUserProfile(userId, data) {
    const user = this.getUserById(userId);
    if (!user) throw new Error("User not found");
    const name = data.name || user.name;
    const avatarUrl = data.avatarUrl || user.avatarUrl;
    const defaultCurrency = data.defaultCurrency || user.defaultCurrency || "INR";
    if (data.password) {
      const salt = randomBytes(16).toString("hex");
      const passwordHash = this.hashPassword(data.password, salt);
      this.db.prepare(`
        UPDATE users
        SET name = ?, avatar_url = ?, default_currency = ?, password_hash = ?, salt = ?
        WHERE id = ?
      `).run(name, avatarUrl || null, defaultCurrency, passwordHash, salt, userId);
    } else {
      this.db.prepare(`
        UPDATE users
        SET name = ?, avatar_url = ?, default_currency = ?
        WHERE id = ?
      `).run(name, avatarUrl || null, defaultCurrency, userId);
    }
    return this.getUserById(userId);
  }
  // Backwards-compatible simple user creation
  createUser(user) {
    const id = user.id || randomUUID();
    const email = user.email ? user.email.toLowerCase() : `${id}@example.com`;
    const salt = randomBytes(16).toString("hex");
    const passwordHash = this.hashPassword(user.password || "password123", salt);
    const defaultCurrency = user.defaultCurrency || "INR";
    const stmt = this.db.prepare(`
      INSERT INTO users (id, name, email, password_hash, salt, avatar_url, default_currency)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING id, name, email, avatar_url, default_currency
    `);
    const row = stmt.get(id, user.name, email, passwordHash, salt, user.avatarUrl || "\u{1F464}", defaultCurrency);
    return {
      id: row.id,
      name: row.name,
      email: row.email || void 0,
      avatarUrl: row.avatar_url || void 0,
      defaultCurrency: row.default_currency
    };
  }
  getUsers() {
    const rows = this.db.prepare("SELECT id, name, email, avatar_url, default_currency FROM users ORDER BY name ASC").all();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || void 0,
      avatarUrl: r.avatar_url || void 0,
      defaultCurrency: r.default_currency || "INR"
    }));
  }
  getUserById(id) {
    const row = this.db.prepare("SELECT id, name, email, avatar_url, default_currency FROM users WHERE id = ?").get(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email || void 0,
      avatarUrl: row.avatar_url || void 0,
      defaultCurrency: row.default_currency || "INR"
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
      SELECT u.id, u.name, u.email, u.avatar_url, u.default_currency
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY u.name ASC
    `).all(groupId);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || void 0,
      avatarUrl: r.avatar_url || void 0,
      defaultCurrency: r.default_currency || "INR"
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
    const createdAt = data.createdAt ? data.createdAt.toISOString() : (/* @__PURE__ */ new Date()).toISOString();
    const isSettlement = data.isSettlement ? 1 : 0;
    const category = data.category || (data.isSettlement ? "Payment" : "General");
    const groupId = data.groupId && data.groupId !== "0" ? data.groupId : null;
    this.db.prepare(`
      INSERT INTO expenses (id, group_id, description, total_amount, currency, split_type, category, is_settlement, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      expenseId,
      groupId,
      data.description,
      data.totalAmount,
      currency,
      data.splitType,
      category,
      isSettlement,
      createdAt
    );
    const payerStmt = this.db.prepare(`
      INSERT INTO expense_payers (expense_id, user_id, amount)
      VALUES (?, ?, ?)
    `);
    for (const p of data.payers) {
      payerStmt.run(expenseId, p.userId, p.amount);
    }
    const splitStmt = this.db.prepare(`
      INSERT INTO expense_splits (expense_id, user_id, amount, percentage, shares)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const s of data.splits) {
      splitStmt.run(expenseId, s.userId, s.amount, s.percentage || null, s.shares || null);
    }
    return this.getExpenseById(expenseId);
  }
  recordSettlement(groupId, fromUserId, toUserId, amount, currency = "INR") {
    const fromUser = this.getUserById(fromUserId);
    const toUser = this.getUserById(toUserId);
    const fromName = fromUser?.name || fromUserId;
    const toName = toUser?.name || toUserId;
    const expense = this.createExpense({
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
    this.logActivity({
      userId: fromUserId,
      groupId: groupId && groupId !== "0" ? groupId : void 0,
      type: "settlement",
      description: `${fromName} paid ${toName} ${currency === "INR" ? "\u20B9" : currency + " "}${amount.toFixed(2)}`
    });
    return expense;
  }
  getExpenseById(id) {
    const row = this.db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
    if (!row) return null;
    return this.hydrateExpense(row);
  }
  getExpensesByGroupId(groupId) {
    const rows = this.db.prepare("SELECT * FROM expenses WHERE group_id = ? ORDER BY created_at DESC").all(groupId);
    return rows.map((r) => this.hydrateExpense(r));
  }
  getGroupExpenses(groupId) {
    return this.getExpensesByGroupId(groupId);
  }
  getAllExpenses() {
    const rows = this.db.prepare("SELECT * FROM expenses ORDER BY created_at DESC").all();
    return rows.map((r) => this.hydrateExpense(r));
  }
  getDirectExpenses(userId1, userId2) {
    const expenses = this.getAllExpenses();
    return expenses.filter((e) => {
      const involvesUser1 = e.payers.some((p) => p.userId === userId1) || e.splits.some((s) => s.userId === userId1);
      const involvesUser2 = e.payers.some((p) => p.userId === userId2) || e.splits.some((s) => s.userId === userId2);
      return involvesUser1 && involvesUser2;
    });
  }
  deleteExpense(expenseId) {
    const res = this.db.prepare("DELETE FROM expenses WHERE id = ?").run(expenseId);
    return res.changes > 0;
  }
  hydrateExpense(row) {
    const payersRows = this.db.prepare("SELECT user_id, amount FROM expense_payers WHERE expense_id = ?").all(row.id);
    const splitsRows = this.db.prepare("SELECT user_id, amount, percentage, shares FROM expense_splits WHERE expense_id = ?").all(row.id);
    return {
      id: row.id,
      groupId: row.group_id || void 0,
      description: row.description,
      totalAmount: row.total_amount,
      currency: row.currency,
      splitType: row.split_type,
      category: row.category,
      createdAt: new Date(row.created_at),
      payers: payersRows.map((p) => ({ userId: p.user_id, amount: p.amount })),
      splits: splitsRows.map((s) => ({
        userId: s.user_id,
        amount: s.amount,
        percentage: s.percentage !== null ? s.percentage : void 0,
        shares: s.shares !== null ? s.shares : void 0
      }))
    };
  }
  // --- Friendships & Direct Ledger ---
  addFriend(userId1, userId2) {
    if (userId1 === userId2) return;
    const [u1, u2] = [userId1, userId2].sort();
    this.db.prepare("INSERT OR IGNORE INTO friendships (user_id1, user_id2) VALUES (?, ?)").run(u1, u2);
  }
  getFriends(userId) {
    const rows = this.db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_url, u.default_currency
      FROM friendships f
      JOIN users u ON (u.id = f.user_id1 AND f.user_id2 = ?) OR (u.id = f.user_id2 AND f.user_id1 = ?)
      ORDER BY u.name ASC
    `).all(userId, userId);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || void 0,
      avatarUrl: r.avatar_url || void 0,
      defaultCurrency: r.default_currency || "INR"
    }));
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
  // --- Activities / Audit Logging ---
  logActivity(data) {
    const id = randomUUID();
    const createdAt = /* @__PURE__ */ new Date();
    this.db.prepare(`
      INSERT INTO activities (id, user_id, group_id, type, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.userId, data.groupId || null, data.type, data.description, createdAt.toISOString());
    const user = this.getUserById(data.userId);
    const group = data.groupId ? this.getGroupById(data.groupId) : null;
    return {
      id,
      userId: data.userId,
      userName: user?.name,
      userAvatar: user?.avatarUrl,
      groupId: data.groupId,
      groupName: group?.name,
      type: data.type,
      description: data.description,
      createdAt
    };
  }
  getActivities(limit = 50) {
    const rows = this.db.prepare(`
      SELECT a.id, a.user_id, a.group_id, a.type, a.description, a.created_at,
             u.name as user_name, u.avatar_url as user_avatar,
             g.name as group_name
      FROM activities a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN groups g ON a.group_id = g.id
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(limit);
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name || r.user_id,
      userAvatar: r.user_avatar,
      groupId: r.group_id || void 0,
      groupName: r.group_name || void 0,
      type: r.type,
      description: r.description,
      createdAt: new Date(r.created_at)
    }));
  }
  // --- Export Group Expenses to CSV ---
  exportGroupExpensesCSV(groupId) {
    const group = this.getGroupById(groupId);
    if (!group) throw new Error("Group not found");
    const expenses = this.getExpensesByGroupId(groupId);
    const users = this.getUsers();
    const userMap = new Map(users.map((u) => [u.id, u.name]));
    const headers = ["Date", "Description", "Category", "Cost", "Currency", "Payer", "Split Type", "Shares Breakdown"];
    const rows = [headers.join(",")];
    for (const exp of expenses) {
      const dateStr = exp.createdAt.toISOString().split("T")[0];
      const desc = `"${exp.description.replace(/"/g, '""')}"`;
      const cat = exp.category || "General";
      const cost = exp.totalAmount.toFixed(2);
      const curr = exp.currency;
      const payer = `"${exp.payers.map((p) => `${userMap.get(p.userId) || p.userId} (${p.amount})`).join("; ")}"`;
      const splitType = exp.splitType;
      const breakdown = `"${exp.splits.map((s) => `${userMap.get(s.userId) || s.userId}: ${s.amount}`).join("; ")}"`;
      rows.push([dateStr, desc, cat, cost, curr, payer, splitType, breakdown].join(","));
    }
    return rows.join("\n");
  }
  clearAllData() {
    this.db.exec(`
      DELETE FROM activities;
      DELETE FROM sessions;
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

// src/server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var rootDir = path.resolve(__dirname, "..");
var app = express();
var PORT = process.env.PORT || 3e3;
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(rootDir, "public")));
function getUserMap() {
  const users = db.getUsers();
  const map = /* @__PURE__ */ new Map();
  for (const u of users) {
    map.set(u.id, u.name);
  }
  return map;
}
function getAuthToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  if (req.query.token && typeof req.query.token === "string") {
    return req.query.token;
  }
  return null;
}
app.post(["/api/auth/register", "/api/auth/signup"], (req, res) => {
  try {
    const { name, email, password, defaultCurrency, avatarUrl } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, error: "Full name is required" });
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ success: false, error: "Valid email address is required" });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
    }
    const existing = db.getUsers().find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(400).json({ success: false, error: "An account with this email already exists. Please log in." });
    }
    const { user, token } = db.registerUser({
      name: name.trim(),
      email: email.trim(),
      password: password || "password123",
      defaultCurrency: defaultCurrency || "INR",
      avatarUrl: avatarUrl || "\u{1F464}"
    });
    res.status(201).json({ success: true, data: { user, token } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }
    const result = db.loginUser(email.trim(), password);
    if (!result) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/auth/google", (req, res) => {
  try {
    let { name, email, avatarUrl, googleId, credential } = req.body;
    if (credential && typeof credential === "string") {
      try {
        const payloadBase64 = credential.split(".")[1];
        if (payloadBase64) {
          const decoded = JSON.parse(Buffer.from(payloadBase64, "base64").toString("utf8"));
          email = decoded.email || email;
          name = decoded.name || name;
          avatarUrl = decoded.picture || avatarUrl;
          googleId = decoded.sub || googleId;
        }
      } catch (jwtErr) {
        console.warn("Could not decode Google JWT credential, falling back to body fields", jwtErr);
      }
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ success: false, error: "Valid Google email is required" });
    }
    const resolvedName = name && typeof name === "string" && name.trim() ? name.trim() : email.split("@")[0];
    const resolvedAvatar = avatarUrl || "\u{1F464}";
    const result = db.loginOrRegisterGoogleUser({
      name: resolvedName,
      email: email.trim(),
      avatarUrl: resolvedAvatar,
      googleId: googleId || void 0
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/auth/me", (req, res) => {
  try {
    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: "Missing authentication token" });
    }
    const user = db.getSessionUser(token);
    if (!user) {
      return res.status(401).json({ success: false, error: "Session expired or invalid" });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/auth/logout", (req, res) => {
  try {
    const token = getAuthToken(req);
    if (token) {
      db.deleteSession(token);
    }
    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.put("/api/auth/profile", (req, res) => {
  try {
    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const sessionUser = db.getSessionUser(token);
    if (!sessionUser) {
      return res.status(401).json({ success: false, error: "Session expired" });
    }
    const { name, avatarUrl, defaultCurrency, password } = req.body;
    const updatedUser = db.updateUserProfile(sessionUser.id, {
      name,
      avatarUrl,
      defaultCurrency,
      password
    });
    res.json({ success: true, data: updatedUser });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/activities", (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const activities = db.getActivities(limit);
    res.json({ success: true, data: activities });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
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
    const { name, email, avatarUrl, defaultCurrency } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ success: false, error: "Name is required" });
    }
    const user = db.createUser({ name, email, avatarUrl, defaultCurrency });
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
    const creatorId = memberIds && memberIds.length > 0 ? memberIds[0] : db.getUsers()[0]?.id;
    if (creatorId) {
      db.logActivity({
        userId: creatorId,
        groupId: group.id,
        type: "group_created",
        description: `Created group "${group.name}"`
      });
    }
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
app.get("/api/groups/:id/export.csv", (req, res) => {
  try {
    const csvData = db.exportGroupExpensesCSV(req.params.id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="splitwise-group-${req.params.id}.csv"`);
    res.send(csvData);
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
app.get("/api/expenses", (req, res) => {
  try {
    const expenses = db.getAllExpenses();
    res.json({ success: true, data: expenses });
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
    const payerName = db.getUserById(payers[0].userId)?.name || "Someone";
    const currSym = (currency || "INR") === "INR" ? "\u20B9" : (currency || "INR") + " ";
    db.logActivity({
      userId: payers[0].userId,
      groupId: groupId || void 0,
      type: "expense_created",
      description: `${payerName} added "${description}" (${currSym}${Number(totalAmount).toFixed(2)})`
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
    const expense = db.getExpenseById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, error: "Expense not found" });
    }
    db.deleteExpense(req.params.id);
    const firstPayer = expense.payers[0]?.userId || db.getUsers()[0]?.id;
    if (firstPayer) {
      db.logActivity({
        userId: firstPayer,
        groupId: expense.groupId,
        type: "expense_deleted",
        description: `Deleted expense "${expense.description}"`
      });
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
    const expense = db.recordSettlement(groupId === "0" ? void 0 : groupId, fromUserId, toUserId, Number(amount), currency);
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
    const expense = db.getExpenseById(expenseId);
    const user = db.getUserById(userId);
    if (expense && user) {
      db.logActivity({
        userId,
        groupId: expense.groupId,
        type: "comment",
        description: `${user.name} commented on "${expense.description}"`
      });
    }
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
app.post(["/api/clear-all-data", "/api/seed"], (req, res) => {
  try {
    db.clearAllData();
    res.json({ success: true, message: "All data cleared successfully." });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
if (process.argv[1]?.endsWith("server.ts")) {
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
