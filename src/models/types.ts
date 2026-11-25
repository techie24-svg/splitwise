/**
 * Splitwise Core Domain Data Models & Types
 */

export interface User {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  defaultCurrency?: string;
  passwordHash?: string;
  salt?: string;
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface Activity {
  id: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  groupId?: string;
  groupName?: string;
  type: 'expense_created' | 'expense_deleted' | 'settlement' | 'comment' | 'group_created' | 'user_joined';
  description: string;
  createdAt: Date;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  currency: string;
  members: User[];
  createdAt: Date;
}

export type SplitType = 'EQUAL' | 'EXACT' | 'PERCENT' | 'SHARES';

export interface SplitItem {
  userId: string;
  amount: number;         // Computed or specified monetary share in currency units
  percentage?: number;    // Used when splitType === 'PERCENT' (0 to 100)
  shares?: number;        // Used when splitType === 'SHARES' (e.g. 1, 2)
}

export interface Payer {
  userId: string;
  amount: number;         // Amount paid by this user towards the total
}

export interface Expense {
  id: string;
  groupId?: string;
  description: string;
  totalAmount: number;
  currency: string;       // e.g. 'INR', 'USD'
  payers: Payer[];        // Multiple users can contribute to paying a single bill
  splitType: SplitType;
  splits: SplitItem[];    // Breakdown of who owes what
  category?: string;      // e.g. 'Food', 'Transport', 'Lodging'
  createdAt: Date;
}

export interface Debt {
  fromUser: string;       // Debtor (owes money)
  toUser: string;         // Creditor (gets paid)
  amount: number;         // Amount to be settled
  fromUserName?: string;
  toUserName?: string;
}

export interface NetBalance {
  userId: string;
  userName?: string;
  balance: number;        // Positive = is owed money (creditor); Negative = owes money (debtor)
}

export interface SettlementSummary {
  netBalances: Map<string, number>;
  unsimplifiedDebts: Debt[];
  simplifiedDebts: Debt[];
  totalVolume: number;
  reductionPercentage: number;
}

export interface Comment {
  id: string;
  expenseId: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  content: string;
  createdAt: Date;
}

export interface FriendBalance {
  friend: User;
  netBalance: number; // > 0: friend owes you, < 0: you owe friend
  currency: string;
}
