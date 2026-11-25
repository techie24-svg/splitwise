import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db/database.ts';
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

// Dynamic Google OAuth Client ID
let runtimeGoogleClientId = process.env.GOOGLE_CLIENT_ID || '';
app.get('/api/config/google-client-id', (req, res) => {
  res.json({ clientId: runtimeGoogleClientId });
});

app.post('/api/config/google-client-id', (req, res) => {
  const { clientId } = req.body;
  if (typeof clientId === 'string') {
    runtimeGoogleClientId = clientId.trim();
    process.env.GOOGLE_CLIENT_ID = runtimeGoogleClientId;
    return res.json({ success: true, clientId: runtimeGoogleClientId });
  }
  res.status(400).json({ success: false, error: 'clientId string is required' });
});

// Helper to look up user names for nice client responses
function getUserMap() {
  const users = db.getUsers();
  const map = new Map<string, string>();
  for (const u of users) {
    map.set(u.id, u.name);
  }
  return map;
}

// Auth Helper: extract token from Bearer header or query parameter
function getAuthToken(req: express.Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  if (req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }
  return null;
}

// ==========================================
// Authentication Routes (Prod Ready)
// ==========================================
app.post(['/api/auth/register', '/api/auth/signup'], (req, res) => {
  try {
    const { name, email, password, defaultCurrency, avatarUrl } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Full name is required' });
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid email address is required' });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    // Check if email already registered
    const existing = db.getUsers().find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(400).json({ success: false, error: 'An account with this email already exists. Please log in.' });
    }

    const { user, token } = db.registerUser({
      name: name.trim(),
      email: email.trim(),
      password: password || 'password123',
      defaultCurrency: defaultCurrency || 'USD',
      avatarUrl: avatarUrl || '👤',
    });

    res.status(201).json({ success: true, data: { user, token } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const result = db.loginUser(email.trim(), password);
    if (!result) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    let { name, email, avatarUrl, googleId, credential, accessToken } = req.body;

    // Handle Google OAuth2 Access Token if passed
    if (accessToken && typeof accessToken === 'string') {
      try {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userInfoRes.ok) {
          const userInfo = (await userInfoRes.json()) as any;
          email = userInfo.email || email;
          name = userInfo.name || name;
          avatarUrl = userInfo.picture || avatarUrl;
          googleId = userInfo.sub || googleId;
        }
      } catch (e) {
        console.warn('Error verifying Google accessToken via userinfo API:', e);
      }
    }

    // Handle Google Identity Services JWT credential if passed
    if (credential && typeof credential === 'string') {
      try {
        const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        if (tokenInfoRes.ok) {
          const tokenInfo = (await tokenInfoRes.json()) as any;
          email = tokenInfo.email || email;
          name = tokenInfo.name || name;
          avatarUrl = tokenInfo.picture || avatarUrl;
          googleId = tokenInfo.sub || googleId;
        } else {
          const payloadBase64 = credential.split('.')[1];
          if (payloadBase64) {
            const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
            email = decoded.email || email;
            name = decoded.name || name;
            avatarUrl = decoded.picture || avatarUrl;
            googleId = decoded.sub || googleId;
          }
        }
      } catch (jwtErr) {
        console.warn('Could not verify Google credential:', jwtErr);
      }
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid Google email is required' });
    }

    const resolvedName = name && typeof name === 'string' && name.trim() ? name.trim() : email.split('@')[0];
    const resolvedAvatar = avatarUrl || '👤';

    const result = db.loginOrRegisterGoogleUser({
      name: resolvedName,
      email: email.trim(),
      avatarUrl: resolvedAvatar,
      googleId: googleId || undefined,
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  try {
    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing authentication token' });
    }

    const user = db.getSessionUser(token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Session expired or invalid' });
    }

    res.json({ success: true, data: user });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const token = getAuthToken(req);
    if (token) {
      db.deleteSession(token);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/auth/profile', (req, res) => {
  try {
    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const sessionUser = db.getSessionUser(token);
    if (!sessionUser) {
      return res.status(401).json({ success: false, error: 'Session expired' });
    }

    const { name, avatarUrl, defaultCurrency, password } = req.body;
    const updatedUser = db.updateUserProfile(sessionUser.id, {
      name,
      avatarUrl,
      defaultCurrency,
      password,
    });

    res.json({ success: true, data: updatedUser });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// Activities / Audit Log
// ==========================================
app.get('/api/activities', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const activities = db.getActivities(limit);
    res.json({ success: true, data: activities });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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
    const { name, email, avatarUrl, defaultCurrency } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    const user = db.createUser({ name, email, avatarUrl, defaultCurrency });
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

    // Log activity
    const creatorId = memberIds && memberIds.length > 0 ? memberIds[0] : db.getUsers()[0]?.id;
    if (creatorId) {
      db.logActivity({
        userId: creatorId,
        groupId: group.id,
        type: 'group_created',
        description: `Created group "${group.name}"`,
      });
    }

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

app.get('/api/groups/:id/export.csv', (req, res) => {
  try {
    const csvData = db.exportGroupExpensesCSV(req.params.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="splitwise-group-${req.params.id}.csv"`);
    res.send(csvData);
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
app.get('/api/expenses', (req, res) => {
  try {
    const expenses = db.getAllExpenses();
    res.json({ success: true, data: expenses });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/groups/:id/expenses', (req, res) => {
  try {
    const expenses = db.getGroupExpenses(req.params.id);
    res.json({ success: true, data: expenses });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper to process expense creation
function handleCreateExpense(req: any, res: any, forcedGroupId?: string) {
  try {
    const groupId = forcedGroupId !== undefined ? forcedGroupId : (req.body.groupId === '0' ? undefined : req.body.groupId);
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

    if (!calculatedSplits || calculatedSplits.length === 0) {
      if (splitType === 'EQUAL' && Array.isArray(participants) && participants.length > 0) {
        calculatedSplits = calculateEqualSplit(Number(totalAmount), participants);
      } else {
        return res.status(400).json({ success: false, error: 'Valid split items or participants list is required' });
      }
    }

    // If this is a direct 1-on-1 expense, auto-register friendship
    if (!groupId && participants && participants.length >= 2) {
      db.addFriend(participants[0], participants[1]);
    }

    const expense = db.createExpense({
      groupId: groupId || undefined,
      description,
      totalAmount: Number(totalAmount),
      currency: currency || 'INR',
      category: category || 'General',
      splitType: splitType as SplitType,
      payers,
      splits: calculatedSplits,
    });

    // Log Activity
    const payerName = db.getUserById(payers[0].userId)?.name || 'Someone';
    const currSym = (currency || 'INR') === 'INR' ? '₹' : (currency || 'INR') + ' ';
    db.logActivity({
      userId: payers[0].userId,
      groupId: groupId || undefined,
      type: 'expense_created',
      description: `${payerName} added "${description}" (${currSym}${Number(totalAmount).toFixed(2)})`,
    });

    res.status(201).json({ success: true, data: expense });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
}

app.post('/api/groups/:id/expenses', (req, res) => {
  handleCreateExpense(req, res, req.params.id);
});

app.post('/api/expenses', (req, res) => {
  handleCreateExpense(req, res);
});

app.delete('/api/expenses/:id', (req, res) => {
  try {
    const expense = db.getExpenseById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }

    db.deleteExpense(req.params.id);

    // Log activity
    const firstPayer = expense.payers[0]?.userId || db.getUsers()[0]?.id;
    if (firstPayer) {
      db.logActivity({
        userId: firstPayer,
        groupId: expense.groupId,
        type: 'expense_deleted',
        description: `Deleted expense "${expense.description}"`,
      });
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

    const expense = db.recordSettlement(groupId === '0' ? undefined : groupId, fromUserId, toUserId, Number(amount), currency);
    res.status(201).json({ success: true, data: expense });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 1-on-1 Friends Routes
// ==========================================
app.get('/api/friends', (req, res) => {
  try {
    const currentUserId = (req.query.userId as string) || db.getUsers()[0]?.id;
    if (!currentUserId) {
      return res.json({ success: true, data: [] });
    }
    const friendSummaries = db.getFriendSummaries(currentUserId);
    res.json({ success: true, data: friendSummaries });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/friends', (req, res) => {
  try {
    const { userId1, userId2 } = req.body;
    if (!userId1 || !userId2) {
      return res.status(400).json({ success: false, error: 'Both userId1 and userId2 are required' });
    }
    db.addFriend(userId1, userId2);
    res.status(201).json({ success: true, message: 'Friendship created' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/friends/:id/expenses', (req, res) => {
  try {
    const friendId = req.params.id;
    const currentUserId = (req.query.userId as string) || db.getUsers()[0]?.id;
    const directExpenses = db.getDirectExpenses(currentUserId, friendId);
    res.json({ success: true, data: directExpenses });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/friends/:id/balance', (req, res) => {
  try {
    const friendId = req.params.id;
    const currentUserId = (req.query.userId as string) || db.getUsers()[0]?.id;
    const balance = db.getFriendBalance(currentUserId, friendId);
    res.json({ success: true, data: { userId: currentUserId, friendId, netBalance: balance } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// Expense Comments Routes
// ==========================================
app.get('/api/expenses/:id/comments', (req, res) => {
  try {
    const comments = db.getComments(req.params.id);
    res.json({ success: true, data: comments });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/expenses/:id/comments', (req, res) => {
  try {
    const expenseId = req.params.id;
    const { userId, content } = req.body;
    if (!userId || !content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'userId and non-empty content are required' });
    }
    const comment = db.addComment(expenseId, userId, content.trim());

    // Log Activity
    const expense = db.getExpenseById(expenseId);
    const user = db.getUserById(userId);
    if (expense && user) {
      db.logActivity({
        userId,
        groupId: expense.groupId,
        type: 'comment',
        description: `${user.name} commented on "${expense.description}"`,
      });
    }

    res.status(201).json({ success: true, data: comment });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/comments/:id', (req, res) => {
  try {
    const ok = db.deleteComment(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }
    res.json({ success: true, message: 'Comment deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear Data Endpoint
app.post(['/api/clear-all-data', '/api/seed'], (req, res) => {
  try {
    db.clearAllData();
    res.json({ success: true, message: 'All data cleared successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Server
if (process.argv[1]?.endsWith('server.ts')) {
  app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 Splitwise Server & UI running at http://localhost:${PORT}`);
    console.log(`📡 REST API Documentation available at http://localhost:${PORT}/api/groups`);
    console.log(`=================================================\n`);
  });
}

export default app;
