import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db/database.ts';
import { seedDatabase } from './db/seed.ts';
import { calculateSplits, calculateEqualSplit } from './engine/splitCalculator.ts';
import { analyzeGroupSettlement } from './engine/simplifyDebts.ts';
import type { SplitType } from './models/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(rootDir, 'public')));

// Helper to look up user names for nice client responses
function getUserMap() {
  const users = db.getUsers();
  const map = new Map<string, string>();
  for (const u of users) {
    map.set(u.id, u.name);
  }
  return map;
}

// ==========================================
// User Routes
// ==========================================
app.get('/api/users', (req, res) => {
  try {
    const users = db.getUsers();
    res.json({ success: true, data: users });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/users', (req, res) => {
  try {
    const { name, email, avatarUrl } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    const user = db.createUser({ name, email, avatarUrl });
    res.status(201).json({ success: true, data: user });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// Group Routes
// ==========================================
app.get('/api/groups', (req, res) => {
  try {
    const groups = db.getGroups();
    res.json({ success: true, data: groups });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/groups', (req, res) => {
  try {
    const { name, description, currency, memberIds } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'Group name is required' });
    }
    const group = db.createGroup({ name, description, currency, memberIds });
    res.status(201).json({ success: true, data: group });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/groups/:id', (req, res) => {
  try {
    const group = db.getGroupById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    res.json({ success: true, data: group });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/groups/:id/members', (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    db.addGroupMember(req.params.id, userId);
    const updated = db.getGroupById(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// Expense Routes
// ==========================================
app.get('/api/groups/:id/expenses', (req, res) => {
  try {
    const expenses = db.getGroupExpenses(req.params.id);
    res.json({ success: true, data: expenses });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/groups/:id/expenses', (req, res) => {
  try {
    const groupId = req.params.id;
    const {
      description,
      totalAmount,
      currency,
      category,
      splitType = 'EQUAL',
      payers,
      splits,
      participants,
    } = req.body;

    if (!description || !totalAmount || Number(totalAmount) <= 0) {
      return res.status(400).json({ success: false, error: 'Valid description and totalAmount are required' });
    }

    if (!payers || !Array.isArray(payers) || payers.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one payer is required' });
    }

    let calculatedSplits = splits;

    // Automatically calculate splits if participants array is passed for EQUAL
    if (!calculatedSplits || calculatedSplits.length === 0) {
      if (splitType === 'EQUAL' && Array.isArray(participants) && participants.length > 0) {
        calculatedSplits = calculateEqualSplit(Number(totalAmount), participants);
      } else {
        return res.status(400).json({ success: false, error: 'Valid split items or participants list is required' });
      }
    }

    const expense = db.createExpense({
      groupId,
      description,
      totalAmount: Number(totalAmount),
      currency: currency || 'INR',
      category: category || 'General',
      splitType: splitType as SplitType,
      payers,
      splits: calculatedSplits,
    });

    res.status(201).json({ success: true, data: expense });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/expenses/:id', (req, res) => {
  try {
    const ok = db.deleteExpense(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// Settlement & Debt Simplification Routes
// ==========================================
app.get('/api/groups/:id/settlement', (req, res) => {
  try {
    const groupId = req.params.id;
    const group = db.getGroupById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    const expenses = db.getGroupExpenses(groupId);
    const summary = analyzeGroupSettlement(expenses);
    const userMap = getUserMap();

    // Map Net Balances to serializable array
    const netBalancesList: { userId: string; userName: string; balance: number }[] = [];
    for (const [userId, balance] of summary.netBalances.entries()) {
      netBalancesList.push({
        userId,
        userName: userMap.get(userId) || userId,
        balance,
      });
    }

    // Sort by balance descending (creditors first, debtors last)
    netBalancesList.sort((a, b) => b.balance - a.balance);

    // Map unsimplified debts with names
    const unsimplifiedWithNames = summary.unsimplifiedDebts.map((d) => ({
      ...d,
      fromUserName: userMap.get(d.fromUser) || d.fromUser,
      toUserName: userMap.get(d.toUser) || d.toUser,
    }));

    // Map simplified debts with names
    const simplifiedWithNames = summary.simplifiedDebts.map((d) => ({
      ...d,
      fromUserName: userMap.get(d.fromUser) || d.fromUser,
      toUserName: userMap.get(d.toUser) || d.toUser,
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
          totalExpenses: expenses.length,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/groups/:id/settle', (req, res) => {
  try {
    const groupId = req.params.id;
    const { fromUserId, toUserId, amount, currency } = req.body;

    if (!fromUserId || !toUserId || !amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'fromUserId, toUserId, and a positive amount are required to settle',
      });
    }

    const expense = db.recordSettlement(groupId, fromUserId, toUserId, Number(amount), currency);
    res.status(201).json({ success: true, data: expense });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reseed Endpoint
app.post('/api/seed', (req, res) => {
  try {
    seedDatabase();
    res.json({ success: true, message: 'Database reseeded with Goa Beach Trip scenario!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Server
if (process.argv[1]?.endsWith('server.ts')) {
  // If database is empty, seed it automatically
  if (db.getGroups().length === 0) {
    console.log('Database is empty. Populating initial seed data...');
    seedDatabase();
  }

  app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 Splitwise Server & UI running at http://localhost:${PORT}`);
    console.log(`📡 REST API Documentation available at http://localhost:${PORT}/api/groups`);
    console.log(`=================================================\n`);
  });
}

export default app;
