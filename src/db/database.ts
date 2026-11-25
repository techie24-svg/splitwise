import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { User, Group, Expense, Payer, SplitItem, SplitType, Comment, FriendBalance } from '../models/types.ts';

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
  public createUser(user: { id?: string; name: string; email?: string; avatarUrl?: string }): User {
    const id = user.id || randomUUID();
    const stmt = this.db.prepare(
      'INSERT INTO users (id, name, email, avatar_url) VALUES (?, ?, ?, ?) RETURNING id, name, email, avatar_url'
    );
    const row = stmt.get(id, user.name, user.email || null, user.avatarUrl || null) as any;
    return {
      id: row.id,
      name: row.name,
      email: row.email || undefined,
      avatarUrl: row.avatar_url || undefined,
    };
  }

  public getUsers(): User[] {
    const rows = this.db.prepare('SELECT id, name, email, avatar_url FROM users ORDER BY name ASC').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || undefined,
      avatarUrl: r.avatar_url || undefined,
    }));
  }

  public getUserById(id: string): User | null {
    const row = this.db.prepare('SELECT id, name, email, avatar_url FROM users WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email || undefined,
      avatarUrl: row.avatar_url || undefined,
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
      SELECT u.id, u.name, u.email, u.avatar_url
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
    payers: Payer[];
    splitType: SplitType;
    splits: SplitItem[];
    category?: string;
    isSettlement?: boolean;
    createdAt?: Date;
  }): Expense {
    const expenseId = data.id || randomUUID();
    const currency = data.currency || 'INR';
    const createdAtStr = data.createdAt ? data.createdAt.toISOString() : new Date().toISOString();

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
      data.category || 'General',
      data.isSettlement ? 1 : 0,
      createdAtStr
    );

    const payerStmt = this.db.prepare('INSERT INTO expense_payers (expense_id, user_id, amount) VALUES (?, ?, ?)');
    for (const p of data.payers) {
      payerStmt.run(expenseId, p.userId, p.amount);
    }

    const splitStmt = this.db.prepare(
      'INSERT INTO expense_splits (expense_id, user_id, amount, percentage, shares) VALUES (?, ?, ?, ?, ?)'
    );
    for (const s of data.splits) {
      splitStmt.run(expenseId, s.userId, s.amount, s.percentage || null, s.shares || null);
    }

    return this.getExpenseById(expenseId)!;
  }

  public getExpenseById(id: string): Expense | null {
    const row = this.db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.hydrateExpense(row);
  }

  public getGroupExpenses(groupId: string): Expense[] {
    const rows = this.db.prepare(
      'SELECT * FROM expenses WHERE group_id = ? ORDER BY created_at DESC'
    ).all(groupId) as any[];
    return rows.map((r) => this.hydrateExpense(r));
  }

  public getAllExpenses(): Expense[] {
    const rows = this.db.prepare('SELECT * FROM expenses ORDER BY created_at DESC').all() as any[];
    return rows.map((r) => this.hydrateExpense(r));
  }

  public deleteExpense(id: string): boolean {
    const res = this.db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    return res.changes > 0;
  }

  public recordSettlement(groupId: string, fromUserId: string, toUserId: string, amount: number, currency = 'INR'): Expense {
    const fromUser = this.getUserById(fromUserId);
    const toUser = this.getUserById(toUserId);
    const fromName = fromUser?.name || fromUserId;
    const toName = toUser?.name || toUserId;

    return this.createExpense({
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
  }

  private hydrateExpense(row: any): Expense {
    const payerRows = this.db.prepare('SELECT user_id, amount FROM expense_payers WHERE expense_id = ?').all(row.id) as any[];
    const splitRows = this.db.prepare(
      'SELECT user_id, amount, percentage, shares FROM expense_splits WHERE expense_id = ?'
    ).all(row.id) as any[];

    return {
      id: row.id,
      groupId: row.group_id || undefined,
      description: row.description,
      totalAmount: row.total_amount,
      currency: row.currency,
      splitType: row.split_type as SplitType,
      category: row.category || undefined,
      createdAt: new Date(row.created_at),
      payers: payerRows.map((p) => ({
        userId: p.user_id,
        amount: p.amount,
      })),
      splits: splitRows.map((s) => ({
        userId: s.user_id,
        amount: s.amount,
        percentage: s.percentage !== null ? s.percentage : undefined,
        shares: s.shares !== null ? s.shares : undefined,
      })),
    };
  }

  // --- Friendships & 1-on-1 Expenses ---
  public addFriend(userId1: string, userId2: string): void {
    if (userId1 === userId2) return;
    const [u1, u2] = [userId1, userId2].sort();
    this.db.prepare('INSERT OR IGNORE INTO friendships (user_id1, user_id2) VALUES (?, ?)').run(u1, u2);
  }

  public getFriends(userId: string): User[] {
    const rows = this.db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_url
      FROM users u
      WHERE u.id IN (
        SELECT user_id2 FROM friendships WHERE user_id1 = ?
        UNION
        SELECT user_id1 FROM friendships WHERE user_id2 = ?
      )
      ORDER BY u.name ASC
    `).all(userId, userId) as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || undefined,
      avatarUrl: r.avatar_url || undefined,
    }));
  }

  public getDirectExpenses(userId1: string, userId2: string): Expense[] {
    // Non-group expenses involving both users
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
    `).all(userId1, userId2, userId1, userId2) as any[];

    return rows.map((r) => this.hydrateExpense(r));
  }

  public getFriendBalance(currentUserId: string, friendId: string): number {
    // Computes pairwise balance between currentUserId and friendId across ALL expenses
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

  public clearAllData(): void {
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
}

// Global default singleton instance
export const db = new SplitwiseDB();
