import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { User, Group, Expense, Payer, SplitItem, SplitType, Comment, FriendBalance, Activity, Session } from '../models/types.ts';

export class SplitwiseDB {
  private db: DatabaseSync;

  constructor(
    dbPath: string = process.env.DATABASE_PATH || (process.env.VERCEL ? '/tmp/splitwise.db' : 'splitwise.db')
  ) {
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
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

    // Safe column migrations for existing databases
    try {
      this.db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT;');
    } catch {}
    try {
      this.db.exec('ALTER TABLE users ADD COLUMN salt TEXT;');
    } catch {}
    try {
      this.db.exec("ALTER TABLE users ADD COLUMN default_currency TEXT NOT NULL DEFAULT 'INR';");
    } catch {}
    try {
      this.db.exec('ALTER TABLE users ADD COLUMN google_id TEXT;');
    } catch {}
  }

  // --- Password Hashing Helpers ---
  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString('hex');
  }

  // --- Authentication & Users ---
  public registerUser(data: {
    id?: string;
    name: string;
    email: string;
    password?: string;
    avatarUrl?: string;
    defaultCurrency?: string;
  }): { user: User; token: string } {
    const id = data.id || randomUUID();
    const salt = randomBytes(16).toString('hex');
    const password = data.password || 'password123';
    const passwordHash = this.hashPassword(password, salt);
    const defaultCurrency = data.defaultCurrency || 'INR';
    const avatarUrl = data.avatarUrl || '👤';

    const stmt = this.db.prepare(`
      INSERT INTO users (id, name, email, password_hash, salt, avatar_url, default_currency)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING id, name, email, avatar_url, default_currency
    `);

    const row = stmt.get(id, data.name, data.email.toLowerCase(), passwordHash, salt, avatarUrl, defaultCurrency) as any;

    const user: User = {
      id: row.id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatar_url,
      defaultCurrency: row.default_currency,
    };

    const token = this.createSession(user.id);
    this.logActivity({
      userId: user.id,
      type: 'user_joined',
      description: `${user.name} joined Splitwise!`,
    });

    return { user, token };
  }

  public loginUser(email: string, password: string): { user: User; token: string } | null {
    const row = this.db.prepare(`
      SELECT id, name, email, password_hash, salt, avatar_url, default_currency
      FROM users
      WHERE lower(email) = lower(?)
    `).get(email) as any;

    if (!row || !row.password_hash || !row.salt) {
      return null;
    }

    const computedHash = this.hashPassword(password, row.salt);
    const valid = timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(row.password_hash, 'hex'));
    if (!valid) {
      return null;
    }

    const user: User = {
      id: row.id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatar_url,
      defaultCurrency: row.default_currency,
    };

    const token = this.createSession(user.id);
    return { user, token };
  }

  public loginOrRegisterGoogleUser(data: {
    name: string;
    email: string;
    avatarUrl?: string;
    googleId?: string;
  }): { user: User; token: string } {
    const email = data.email.toLowerCase().trim();
    let row = this.db.prepare(`
      SELECT id, name, email, avatar_url, default_currency, google_id
      FROM users
      WHERE lower(email) = ?
    `).get(email) as any;

    let user: User;

    if (row) {
      if (data.googleId && !row.google_id) {
        this.db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(data.googleId, row.id);
      }
      user = {
        id: row.id,
        name: row.name,
        email: row.email,
        avatarUrl: row.avatar_url || data.avatarUrl || '👤',
        defaultCurrency: row.default_currency || 'INR',
      };
    } else {
      const id = randomUUID();
      const salt = randomBytes(16).toString('hex');
      const passwordHash = this.hashPassword(randomBytes(32).toString('hex'), salt);
      const avatarUrl = data.avatarUrl || '👤';
      const defaultCurrency = 'INR';

      this.db.prepare(`
        INSERT INTO users (id, name, email, password_hash, salt, avatar_url, default_currency, google_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.name, email, passwordHash, salt, avatarUrl, defaultCurrency, data.googleId || null);

      this.logActivity({
        userId: id,
        type: 'user_joined',
        description: `${data.name} signed up with Google!`,
      });

      user = {
        id,
        name: data.name,
        email,
        avatarUrl,
        defaultCurrency,
      };
    }

    const token = this.createSession(user.id);
    return { user, token };
  }

  public createSession(userId: string): string {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    this.db.prepare(`
      INSERT INTO sessions (token, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(token, userId, expiresAt.toISOString());
    return token;
  }

  public getSessionUser(token: string): User | null {
    if (!token) return null;
    const row = this.db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_url, u.default_currency, s.expires_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
    `).get(token) as any;

    if (!row) return null;

    if (new Date(row.expires_at) < new Date()) {
      this.deleteSession(token);
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatar_url,
      defaultCurrency: row.default_currency,
    };
  }

  public deleteSession(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  public updateUserProfile(
    userId: string,
    data: { name?: string; avatarUrl?: string; defaultCurrency?: string; password?: string }
  ): User {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found');

    const name = data.name || user.name;
    const avatarUrl = data.avatarUrl || user.avatarUrl;
    const defaultCurrency = data.defaultCurrency || user.defaultCurrency || 'INR';

    if (data.password) {
      const salt = randomBytes(16).toString('hex');
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

    return this.getUserById(userId)!;
  }

  // Backwards-compatible simple user creation
  public createUser(user: { id?: string; name: string; email?: string; avatarUrl?: string; defaultCurrency?: string; password?: string }): User {
    const id = user.id || randomUUID();
    const email = user.email ? user.email.toLowerCase() : `${id}@example.com`;
    const salt = randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(user.password || 'password123', salt);
    const defaultCurrency = user.defaultCurrency || 'INR';

    const stmt = this.db.prepare(`
      INSERT INTO users (id, name, email, password_hash, salt, avatar_url, default_currency)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING id, name, email, avatar_url, default_currency
    `);
    const row = stmt.get(id, user.name, email, passwordHash, salt, user.avatarUrl || '👤', defaultCurrency) as any;
    return {
      id: row.id,
      name: row.name,
      email: row.email || undefined,
      avatarUrl: row.avatar_url || undefined,
      defaultCurrency: row.default_currency,
    };
  }

  public getUsers(): User[] {
    const rows = this.db.prepare('SELECT id, name, email, avatar_url, default_currency FROM users ORDER BY name ASC').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || undefined,
      avatarUrl: r.avatar_url || undefined,
      defaultCurrency: r.default_currency || 'INR',
    }));
  }

  public getUserById(id: string): User | null {
    const row = this.db.prepare('SELECT id, name, email, avatar_url, default_currency FROM users WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email || undefined,
      avatarUrl: row.avatar_url || undefined,
      defaultCurrency: row.default_currency || 'INR',
    };
  }

  // --- Groups ---
  public createGroup(data: { id?: string; name: string; description?: string; currency?: string; memberIds?: string[] }): Group {
    const groupId = data.id || randomUUID();
    const currency = data.currency || 'INR';

    this.db.prepare('INSERT INTO groups (id, name, description, currency) VALUES (?, ?, ?, ?)').run(
      groupId,
      data.name,
      data.description || null,
      currency
    );

    if (data.memberIds && data.memberIds.length > 0) {
      const memberStmt = this.db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)');
      for (const uid of data.memberIds) {
        memberStmt.run(groupId, uid);
      }
    }

    return this.getGroupById(groupId)!;
  }

  public getGroups(): Group[] {
    const rows = this.db.prepare('SELECT id, name, description, currency, created_at FROM groups ORDER BY created_at DESC').all() as any[];
    return rows.map((r) => this.hydrateGroup(r));
  }

  public getGroupById(id: string): Group | null {
    const row = this.db.prepare('SELECT id, name, description, currency, created_at FROM groups WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.hydrateGroup(row);
  }

  public addGroupMember(groupId: string, userId: string): void {
    this.db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, userId);
  }

  public getGroupMembers(groupId: string): User[] {
    const rows = this.db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_url, u.default_currency
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY u.name ASC
    `).all(groupId) as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || undefined,
      avatarUrl: r.avatar_url || undefined,
      defaultCurrency: r.default_currency || 'INR',
    }));
  }

  private hydrateGroup(row: any): Group {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      currency: row.currency,
      members: this.getGroupMembers(row.id),
      createdAt: new Date(row.created_at),
    };
  }

  // --- Expenses ---
  public createExpense(data: {
    id?: string;
    groupId?: string;
    description: string;
    totalAmount: number;
    currency?: string;
    splitType: SplitType;
    category?: string;
    isSettlement?: boolean;
    payers: Payer[];
    splits: SplitItem[];
    createdAt?: Date;
  }): Expense {
    const expenseId = data.id || randomUUID();
    const currency = data.currency || 'INR';
    const createdAt = data.createdAt ? data.createdAt.toISOString() : new Date().toISOString();
    const isSettlement = data.isSettlement ? 1 : 0;
    const category = data.category || (data.isSettlement ? 'Payment' : 'General');
    const groupId = data.groupId && data.groupId !== '0' ? data.groupId : null;

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

    return this.getExpenseById(expenseId)!;
  }

  public recordSettlement(
    groupId: string | undefined,
    fromUserId: string,
    toUserId: string,
    amount: number,
    currency: string = 'INR'
  ): Expense {
    const fromUser = this.getUserById(fromUserId);
    const toUser = this.getUserById(toUserId);
    const fromName = fromUser?.name || fromUserId;
    const toName = toUser?.name || toUserId;

    const expense = this.createExpense({
      groupId,
      description: `Settlement: ${fromName} paid ${toName}`,
      totalAmount: amount,
      currency,
      splitType: 'EXACT',
      category: 'Payment',
      isSettlement: true,
      payers: [{ userId: fromUserId, amount }],
      splits: [{ userId: toUserId, amount }],
    });

    this.logActivity({
      userId: fromUserId,
      groupId: groupId && groupId !== '0' ? groupId : undefined,
      type: 'settlement',
      description: `${fromName} paid ${toName} ${currency === 'INR' ? '₹' : currency + ' '}${amount.toFixed(2)}`,
    });

    return expense;
  }

  public getExpenseById(id: string): Expense | null {
    const row = this.db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.hydrateExpense(row);
  }

  public getExpensesByGroupId(groupId: string): Expense[] {
    const rows = this.db.prepare('SELECT * FROM expenses WHERE group_id = ? ORDER BY created_at DESC').all(groupId) as any[];
    return rows.map((r) => this.hydrateExpense(r));
  }

  public getGroupExpenses(groupId: string): Expense[] {
    return this.getExpensesByGroupId(groupId);
  }

  public getAllExpenses(): Expense[] {
    const rows = this.db.prepare('SELECT * FROM expenses ORDER BY created_at DESC').all() as any[];
    return rows.map((r) => this.hydrateExpense(r));
  }

  public getDirectExpenses(userId1: string, userId2: string): Expense[] {
    const expenses = this.getAllExpenses();
    return expenses.filter((e) => {
      const involvesUser1 = e.payers.some((p) => p.userId === userId1) || e.splits.some((s) => s.userId === userId1);
      const involvesUser2 = e.payers.some((p) => p.userId === userId2) || e.splits.some((s) => s.userId === userId2);
      return involvesUser1 && involvesUser2;
    });
  }

  public deleteExpense(expenseId: string): boolean {
    const res = this.db.prepare('DELETE FROM expenses WHERE id = ?').run(expenseId);
    return res.changes > 0;
  }

  private hydrateExpense(row: any): Expense {
    const payersRows = this.db.prepare('SELECT user_id, amount FROM expense_payers WHERE expense_id = ?').all(row.id) as any[];
    const splitsRows = this.db.prepare('SELECT user_id, amount, percentage, shares FROM expense_splits WHERE expense_id = ?').all(row.id) as any[];

    return {
      id: row.id,
      groupId: row.group_id || undefined,
      description: row.description,
      totalAmount: row.total_amount,
      currency: row.currency,
      splitType: row.split_type as SplitType,
      category: row.category,
      createdAt: new Date(row.created_at),
      payers: payersRows.map((p) => ({ userId: p.user_id, amount: p.amount })),
      splits: splitsRows.map((s) => ({
        userId: s.user_id,
        amount: s.amount,
        percentage: s.percentage !== null ? s.percentage : undefined,
        shares: s.shares !== null ? s.shares : undefined,
      })),
    };
  }

  // --- Friendships & Direct Ledger ---
  public addFriend(userId1: string, userId2: string): void {
    if (userId1 === userId2) return;
    const [u1, u2] = [userId1, userId2].sort();
    this.db.prepare('INSERT OR IGNORE INTO friendships (user_id1, user_id2) VALUES (?, ?)').run(u1, u2);
  }

  public getFriends(userId: string): User[] {
    const rows = this.db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_url, u.default_currency
      FROM friendships f
      JOIN users u ON (u.id = f.user_id1 AND f.user_id2 = ?) OR (u.id = f.user_id2 AND f.user_id1 = ?)
      ORDER BY u.name ASC
    `).all(userId, userId) as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || undefined,
      avatarUrl: r.avatar_url || undefined,
      defaultCurrency: r.default_currency || 'INR',
    }));
  }

  public getFriendBalance(currentUserId: string, friendId: string): number {
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
        balance += (friendOwed * currentUserPaid) / total;
      }

      if (friendPaid > 0 && currentUserOwed > 0) {
        balance -= (currentUserOwed * friendPaid) / total;
      }
    }

    return Math.round(balance * 100) / 100;
  }

  public getFriendSummaries(currentUserId: string): FriendBalance[] {
    const friends = this.getFriends(currentUserId);
    return friends.map((f) => ({
      friend: f,
      netBalance: this.getFriendBalance(currentUserId, f.id),
      currency: 'INR',
    }));
  }

  // --- Comments ---
  public addComment(expenseId: string, userId: string, content: string): Comment {
    const id = randomUUID();
    const createdAt = new Date();
    this.db.prepare('INSERT INTO comments (id, expense_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)').run(
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
      createdAt,
    };
  }

  public getComments(expenseId: string): Comment[] {
    const rows = this.db.prepare(`
      SELECT c.id, c.expense_id, c.user_id, c.content, c.created_at, u.name, u.avatar_url
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.expense_id = ?
      ORDER BY c.created_at ASC
    `).all(expenseId) as any[];

    return rows.map((r) => ({
      id: r.id,
      expenseId: r.expense_id,
      userId: r.user_id,
      userName: r.name || r.user_id,
      userAvatar: r.avatar_url || undefined,
      content: r.content,
      createdAt: new Date(r.created_at),
    }));
  }

  public deleteComment(commentId: string): boolean {
    const res = this.db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
    return res.changes > 0;
  }

  // --- Activities / Audit Logging ---
  public logActivity(data: {
    userId: string;
    groupId?: string;
    type: 'expense_created' | 'expense_deleted' | 'settlement' | 'comment' | 'group_created' | 'user_joined';
    description: string;
  }): Activity {
    const id = randomUUID();
    const createdAt = new Date();
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
      createdAt,
    };
  }

  public getActivities(limit: number = 50): Activity[] {
    const rows = this.db.prepare(`
      SELECT a.id, a.user_id, a.group_id, a.type, a.description, a.created_at,
             u.name as user_name, u.avatar_url as user_avatar,
             g.name as group_name
      FROM activities a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN groups g ON a.group_id = g.id
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name || r.user_id,
      userAvatar: r.user_avatar,
      groupId: r.group_id || undefined,
      groupName: r.group_name || undefined,
      type: r.type,
      description: r.description,
      createdAt: new Date(r.created_at),
    }));
  }

  // --- Export Group Expenses to CSV ---
  public exportGroupExpensesCSV(groupId: string): string {
    const group = this.getGroupById(groupId);
    if (!group) throw new Error('Group not found');

    const expenses = this.getExpensesByGroupId(groupId);
    const users = this.getUsers();
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const headers = ['Date', 'Description', 'Category', 'Cost', 'Currency', 'Payer', 'Split Type', 'Shares Breakdown'];
    const rows: string[] = [headers.join(',')];

    for (const exp of expenses) {
      const dateStr = exp.createdAt.toISOString().split('T')[0];
      const desc = `"${exp.description.replace(/"/g, '""')}"`;
      const cat = exp.category || 'General';
      const cost = exp.totalAmount.toFixed(2);
      const curr = exp.currency;
      const payer = `"${exp.payers.map((p) => `${userMap.get(p.userId) || p.userId} (${p.amount})`).join('; ')}"`;
      const splitType = exp.splitType;
      const breakdown = `"${exp.splits.map((s) => `${userMap.get(s.userId) || s.userId}: ${s.amount}`).join('; ')}"`;

      rows.push([dateStr, desc, cat, cost, curr, payer, splitType, breakdown].join(','));
    }

    return rows.join('\n');
  }

  public clearAllData(): void {
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
}

// Global default singleton instance
export const db = new SplitwiseDB();
