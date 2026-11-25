/**
 * Splitwise Core Interactive Dashboard Client
 * Supports: Groups, 1-on-1 Friends, Min-Cash-Flow Simplification, and Expense Comments
 */

// State
let groups = [];
let activeGroup = null;
let allUsers = [];
let friends = [];
let activeFriend = null;
let currentUserId = null;
let expenses = [];
let settlementData = null;
let activeTab = 'groups'; // 'groups' | 'friends'
let viewMode = 'simplified'; // 'simplified' | 'unsimplified'

// Category Icons
const categoryIcons = {
  Food: '🍽️',
  Lodging: '🏠',
  Transport: '🚗',
  Activities: '🏄',
  Drinks: '🍸',
  Payment: '🤝',
  General: '🛒',
};

// Currency Formatter
function formatCurrency(amount, currency = 'INR') {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency + ' ';
  return `${symbol}${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// DOM Elements
const tabGroups = document.getElementById('tabGroups');
const tabFriends = document.getElementById('tabFriends');
const currentUserSelect = document.getElementById('currentUserSelect');
const groupActionsWrapper = document.getElementById('groupActionsWrapper');
const friendActionsWrapper = document.getElementById('friendActionsWrapper');

const groupSelect = document.getElementById('groupSelect');
const friendSelect = document.getElementById('friendSelect');
const btnNewExpense = document.getElementById('btnNewExpense');
const btnNewDirectExpense = document.getElementById('btnNewDirectExpense');
const btnNewGroup = document.getElementById('btnNewGroup');
const btnNewFriend = document.getElementById('btnNewFriend');
const btnReseed = document.getElementById('btnReseed');
const btnQuickSettle = document.getElementById('btnQuickSettle');

const toggleSimplified = document.getElementById('toggleSimplified');
const toggleUnsimplified = document.getElementById('toggleUnsimplified');
const viewToggleWrapper = document.getElementById('viewToggleWrapper');

const metricTotalSpend = document.getElementById('metricTotalSpend');
const metricExpenseCount = document.getElementById('metricExpenseCount');
const metricDebtVolume = document.getElementById('metricDebtVolume');
const metricUnsimplifiedCount = document.getElementById('metricUnsimplifiedCount');
const metricOptimization = document.getElementById('metricOptimization');
const metricSimplifiedCount = document.getElementById('metricSimplifiedCount');
const metricMemberCount = document.getElementById('metricMemberCount');
const metricCurrency = document.getElementById('metricCurrency');

const metricLabel1 = document.getElementById('metricLabel1');
const metricLabel2 = document.getElementById('metricLabel2');
const metricLabel3 = document.getElementById('metricLabel3');
const metricLabel4 = document.getElementById('metricLabel4');

const leftColumnTitle = document.getElementById('leftColumnTitle');
const leftColumnDesc = document.getElementById('leftColumnDesc');
const rightColumnTitle = document.getElementById('rightColumnTitle');
const rightColumnDesc = document.getElementById('rightColumnDesc');

const debtsContainer = document.getElementById('debtsContainer');
const netBalancesContainer = document.getElementById('netBalancesContainer');
const expensesTimeline = document.getElementById('expensesTimeline');

// Modals
const modalExpense = document.getElementById('modalExpense');
const modalSettle = document.getElementById('modalSettle');
const modalGroup = document.getElementById('modalGroup');
const modalFriend = document.getElementById('modalFriend');

// Forms
const formExpense = document.getElementById('formExpense');
const formSettle = document.getElementById('formSettle');
const formGroup = document.getElementById('formGroup');
const formFriend = document.getElementById('formFriend');

// Init
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadInitialData();
});

function setupEventListeners() {
  // Tab Switching: Groups vs Friends
  tabGroups.addEventListener('click', () => {
    activeTab = 'groups';
    tabGroups.classList.add('active');
    tabFriends.classList.remove('active');
    groupActionsWrapper.classList.remove('hidden');
    friendActionsWrapper.classList.add('hidden');
    viewToggleWrapper.classList.remove('hidden');
    refreshActiveView();
  });

  tabFriends.addEventListener('click', () => {
    activeTab = 'friends';
    tabFriends.classList.add('active');
    tabGroups.classList.remove('active');
    groupActionsWrapper.classList.add('hidden');
    friendActionsWrapper.classList.remove('hidden');
    viewToggleWrapper.classList.add('hidden');
    refreshActiveView();
  });

  // User Switcher
  currentUserSelect.addEventListener('change', async (e) => {
    currentUserId = e.target.value;
    await refreshActiveView();
  });

  // Group Switcher
  groupSelect.addEventListener('change', async (e) => {
    const selectedId = e.target.value;
    activeGroup = groups.find((g) => g.id === selectedId) || null;
    await refreshGroupData();
  });

  // Friend Switcher
  friendSelect.addEventListener('change', async (e) => {
    const selectedId = e.target.value;
    activeFriend = friends.find((f) => f.friend.id === selectedId) || null;
    await refreshFriendData();
  });

  // Debt View Toggle
  toggleSimplified.addEventListener('click', () => {
    viewMode = 'simplified';
    toggleSimplified.classList.add('active');
    toggleUnsimplified.classList.remove('active');
    renderDebts();
  });

  toggleUnsimplified.addEventListener('click', () => {
    viewMode = 'unsimplified';
    toggleUnsimplified.classList.add('active');
    toggleSimplified.classList.remove('active');
    renderDebts();
  });

  btnReseed.addEventListener('click', async () => {
    if (confirm('Reset database to the Goa Beach Trip demo dataset?')) {
      await fetch('/api/seed', { method: 'POST' });
      await loadInitialData();
    }
  });

  // Modal Openers
  btnNewExpense.addEventListener('click', () => openExpenseModal('group'));
  btnNewDirectExpense.addEventListener('click', () => openExpenseModal('friend'));
  btnQuickSettle.addEventListener('click', () => openSettleModal());
  btnNewGroup.addEventListener('click', () => openGroupModal());
  btnNewFriend.addEventListener('click', () => openFriendModal());

  // Modal Close buttons
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      document.getElementById(modalId)?.classList.add('hidden');
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.classList.add('hidden');
    }
  });

  document.querySelectorAll('input[name="splitType"]').forEach((radio) => {
    radio.addEventListener('change', () => renderParticipantsSplitInputs(radio.value));
  });

  document.getElementById('expScope')?.addEventListener('change', (e) => {
    updateExpenseModalParticipants(e.target.value);
  });

  // Form Submissions
  formExpense.addEventListener('submit', handleExpenseSubmit);
  formSettle.addEventListener('submit', handleSettleSubmit);
  formGroup.addEventListener('submit', handleGroupSubmit);
  formFriend.addEventListener('submit', handleFriendSubmit);
}

// Initial Data Fetch
async function loadInitialData() {
  try {
    const [usersRes, groupsRes] = await Promise.all([
      fetch('/api/users').then((r) => r.json()),
      fetch('/api/groups').then((r) => r.json()),
    ]);

    allUsers = usersRes.data || [];
    groups = groupsRes.data || [];

    // Current User Selector
    currentUserSelect.innerHTML = allUsers
      .map((u) => `<option value="${u.id}">${u.avatarUrl || '👤'} ${u.name}</option>`)
      .join('');

    if (allUsers.length > 0 && !currentUserId) {
      currentUserId = allUsers[0].id;
      currentUserSelect.value = currentUserId;
    }

    // Group Select
    groupSelect.innerHTML = groups.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
    if (groups.length > 0) {
      activeGroup = groups[0];
      groupSelect.value = activeGroup.id;
    }

    await refreshActiveView();
  } catch (err) {
    console.error('Error loading initial data:', err);
  }
}

async function refreshActiveView() {
  if (activeTab === 'groups') {
    await refreshGroupData();
  } else {
    await refreshFriendData();
  }
}

// Group View Data Refresh
async function refreshGroupData() {
  if (!activeGroup) return;

  leftColumnTitle.innerText = 'Settlement Transfers';
  leftColumnDesc.innerText = 'How to settle all debts with minimum transactions';
  rightColumnTitle.innerText = `Expense History (${activeGroup.name})`;
  rightColumnDesc.innerText = 'Itemized breakdown of group activities, splits & discussions';

  metricLabel1.innerText = 'Total Group Spend';
  metricLabel2.innerText = 'Debt Volume';
  metricLabel3.innerText = 'Min-Cash-Flow Efficiency';
  metricLabel4.innerText = 'Group Members';

  const currency = activeGroup.currency || 'INR';
  metricCurrency.innerText = `Currency: ${currency}`;
  metricMemberCount.innerText = activeGroup.members.length;

  try {
    const [expRes, settleRes] = await Promise.all([
      fetch(`/api/groups/${activeGroup.id}/expenses`).then((r) => r.json()),
      fetch(`/api/groups/${activeGroup.id}/settlement`).then((r) => r.json()),
    ]);

    expenses = expRes.data || [];
    settlementData = settleRes.data || null;

    renderGroupMetrics();
    renderDebts();
    renderNetBalances();
    renderExpenses();
  } catch (err) {
    console.error('Error refreshing group data:', err);
  }
}

function renderGroupMetrics() {
  const currency = activeGroup?.currency || 'INR';
  const totalSpend = expenses.reduce((sum, e) => sum + (e.category === 'Payment' ? 0 : e.totalAmount), 0);
  const expenseCount = expenses.filter((e) => e.category !== 'Payment').length;

  metricTotalSpend.innerText = formatCurrency(totalSpend, currency);
  metricExpenseCount.innerText = `${expenseCount} bills recorded`;

  if (settlementData) {
    const stats = settlementData.stats;
    metricDebtVolume.innerText = formatCurrency(stats.totalVolume, currency);
    metricUnsimplifiedCount.innerText = `${stats.unsimplifiedCount} peer-to-peer transfers`;
    metricOptimization.innerText = `${stats.reductionPercentage}% Reduction`;
    metricSimplifiedCount.innerText = `Optimized to ${stats.simplifiedCount} transfers`;
  }
}

// Friend View Data Refresh
async function refreshFriendData() {
  leftColumnTitle.innerText = '1-on-1 Friends & Balances';
  leftColumnDesc.innerText = 'Direct pairwise balances across all shared expenses';
  rightColumnTitle.innerText = activeFriend ? `1-on-1 History with ${activeFriend.friend.name}` : 'Direct Friend Expenses';
  rightColumnDesc.innerText = 'Itemized shared bills, payments & comments';

  metricLabel1.innerText = 'Direct 1:1 Spend';
  metricLabel2.innerText = 'You Are Owed';
  metricLabel3.innerText = 'You Owe';
  metricLabel4.innerText = 'Connected Friends';

  try {
    const friendsRes = await fetch(`/api/friends?userId=${currentUserId}`).then((r) => r.json());
    friends = friendsRes.data || [];

    // Populate Friend Selector
    friendSelect.innerHTML = friends
      .map((f) => `<option value="${f.friend.id}">${f.friend.name}</option>`)
      .join('');

    if (friends.length > 0) {
      if (!activeFriend || !friends.some((f) => f.friend.id === activeFriend.friend.id)) {
        activeFriend = friends[0];
      }
      friendSelect.value = activeFriend.friend.id;

      // Fetch Direct 1:1 Expenses
      const expRes = await fetch(`/api/friends/${activeFriend.friend.id}/expenses?userId=${currentUserId}`).then((r) =>
        r.json()
      );
      expenses = expRes.data || [];
    } else {
      activeFriend = null;
      expenses = [];
    }

    renderFriendMetrics();
    renderFriendCards();
    renderFriendNetBalances();
    renderExpenses();
  } catch (err) {
    console.error('Error refreshing friend data:', err);
  }
}

function renderFriendMetrics() {
  const currency = 'INR';
  metricMemberCount.innerText = friends.length;
  metricCurrency.innerText = 'Direct 1:1 Mode';

  let totalYouAreOwed = 0;
  let totalYouOwe = 0;

  for (const f of friends) {
    if (f.netBalance > 0.005) {
      totalYouAreOwed += f.netBalance;
    } else if (f.netBalance < -0.005) {
      totalYouOwe += Math.abs(f.netBalance);
    }
  }

  const directSpend = expenses.reduce((sum, e) => sum + (e.category === 'Payment' ? 0 : e.totalAmount), 0);
  metricTotalSpend.innerText = formatCurrency(directSpend, currency);
  metricExpenseCount.innerText = `${expenses.length} 1:1 transactions`;

  metricDebtVolume.innerText = `+${formatCurrency(totalYouAreOwed, currency)}`;
  metricUnsimplifiedCount.innerText = 'Total you are owed';

  metricOptimization.innerText = `-${formatCurrency(totalYouOwe, currency)}`;
  metricSimplifiedCount.innerText = 'Total you owe friends';
}

function renderFriendCards() {
  const currency = 'INR';
  const currentUser = allUsers.find((u) => u.id === currentUserId);

  if (friends.length === 0) {
    debtsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <h3>No friends added yet</h3>
        <p>Click "+ Add Friend" to connect with participants.</p>
      </div>
    `;
    return;
  }

  debtsContainer.innerHTML = friends
    .map((f) => {
      const isSelected = activeFriend && activeFriend.friend.id === f.friend.id;
      let statusText = 'Settled up';
      let statusColor = 'color: var(--text-muted)';
      let fromUser = '';
      let toUser = '';
      let settleAmt = 0;

      if (f.netBalance > 0.005) {
        statusText = `${f.friend.name} owes you ${formatCurrency(f.netBalance, currency)}`;
        statusColor = 'color: var(--success)';
        fromUser = f.friend.id;
        toUser = currentUserId;
        settleAmt = f.netBalance;
      } else if (f.netBalance < -0.005) {
        statusText = `You owe ${f.friend.name} ${formatCurrency(Math.abs(f.netBalance), currency)}`;
        statusColor = 'color: var(--danger)';
        fromUser = currentUserId;
        toUser = f.friend.id;
        settleAmt = Math.abs(f.netBalance);
      }

      return `
        <div class="debt-transfer-card ${isSelected ? 'active-friend-card' : ''}" style="cursor:pointer;" onclick="selectFriend('${f.friend.id}')">
          <div class="party from">
            <div class="avatar">${f.friend.avatarUrl || '👤'}</div>
            <div style="display:flex; flex-direction:column;">
              <span class="party-name">${f.friend.name}</span>
              <span style="font-size:0.75rem; font-weight:700; ${statusColor}">${statusText}</span>
            </div>
          </div>

          <div class="debt-arrow-bridge">
            <span class="transfer-amount" style="font-size:0.95rem;">${formatCurrency(Math.abs(f.netBalance), currency)}</span>
            <div class="arrow-line"></div>
          </div>

          <div class="party to">
            <div class="avatar">${currentUser?.avatarUrl || '👤'}</div>
          </div>

          <div class="debt-actions">
            ${
              settleAmt > 0
                ? `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openDirectSettle('${fromUser}', '${toUser}', ${settleAmt})">Settle</button>`
                : `<span style="font-size:0.75rem; color:var(--text-sub);">✓ Settled</span>`
            }
          </div>
        </div>
      `;
    })
    .join('');
}

window.selectFriend = async function (friendId) {
  activeFriend = friends.find((f) => f.friend.id === friendId) || null;
  if (friendSelect) friendSelect.value = friendId;
  await refreshFriendData();
};

function renderFriendNetBalances() {
  const currency = 'INR';
  netBalancesContainer.innerHTML = friends
    .map((f) => {
      let statusClass = 'zero';
      let formattedVal = formatCurrency(0, currency);

      if (f.netBalance > 0.005) {
        statusClass = 'positive';
        formattedVal = `+${formatCurrency(f.netBalance, currency)}`;
      } else if (f.netBalance < -0.005) {
        statusClass = 'negative';
        formattedVal = `-${formatCurrency(Math.abs(f.netBalance), currency)}`;
      }

      return `
        <div class="balance-chip" style="cursor:pointer;" onclick="selectFriend('${f.friend.id}')">
          <div class="user-info">
            <span class="avatar" style="width:28px;height:28px;font-size:0.9rem;">${f.friend.avatarUrl || '👤'}</span>
            <span style="font-weight:600;font-size:0.88rem;">${f.friend.name}</span>
          </div>
          <span class="balance-val ${statusClass}">${formattedVal}</span>
        </div>
      `;
    })
    .join('');
}

// Render Functions (Shared / Group)
function renderDebts() {
  if (activeTab === 'friends') {
    renderFriendCards();
    return;
  }

  if (!settlementData) return;
  const currency = activeGroup?.currency || 'INR';
  const debtList = viewMode === 'simplified' ? settlementData.simplifiedDebts : settlementData.unsimplifiedDebts;

  if (debtList.length === 0) {
    debtsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎉</div>
        <h3>All balances are settled up!</h3>
        <p>No outstanding debts exist for this group.</p>
      </div>
    `;
    return;
  }

  debtsContainer.innerHTML = debtList
    .map((debt) => {
      const fromUserObj = activeGroup.members.find((m) => m.id === debt.fromUser);
      const toUserObj = activeGroup.members.find((m) => m.id === debt.toUser);

      const fromAvatar = fromUserObj?.avatarUrl || '👤';
      const toAvatar = toUserObj?.avatarUrl || '👤';

      return `
        <div class="debt-transfer-card">
          <div class="party from">
            <div class="avatar">${fromAvatar}</div>
            <span class="party-name">${debt.fromUserName}</span>
          </div>

          <div class="debt-arrow-bridge">
            <span class="transfer-amount">${formatCurrency(debt.amount, currency)}</span>
            <div class="arrow-line"></div>
          </div>

          <div class="party to">
            <span class="party-name">${debt.toUserName}</span>
            <div class="avatar">${toAvatar}</div>
          </div>

          <div class="debt-actions">
            <button class="btn btn-sm btn-primary" onclick="openDirectSettle('${debt.fromUser}', '${debt.toUser}', ${debt.amount})">
              Settle
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderNetBalances() {
  if (activeTab === 'friends') {
    renderFriendNetBalances();
    return;
  }

  if (!settlementData) return;
  const currency = activeGroup?.currency || 'INR';
  const balances = settlementData.netBalances || [];

  netBalancesContainer.innerHTML = balances
    .map((b) => {
      const userObj = activeGroup.members.find((m) => m.id === b.userId);
      const avatar = userObj?.avatarUrl || '👤';

      let statusClass = 'zero';
      let formattedVal = formatCurrency(0, currency);

      if (b.balance > 0.005) {
        statusClass = 'positive';
        formattedVal = `+${formatCurrency(b.balance, currency)}`;
      } else if (b.balance < -0.005) {
        statusClass = 'negative';
        formattedVal = `-${formatCurrency(Math.abs(b.balance), currency)}`;
      }

      return `
        <div class="balance-chip">
          <div class="user-info">
            <span class="avatar" style="width:28px;height:28px;font-size:0.9rem;">${avatar}</span>
            <span style="font-weight:600;font-size:0.88rem;">${b.userName}</span>
          </div>
          <span class="balance-val ${statusClass}">${formattedVal}</span>
        </div>
      `;
    })
    .join('');
}

function renderExpenses() {
  const currency = activeGroup?.currency || 'INR';

  if (expenses.length === 0) {
    expensesTimeline.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <h3>No expenses recorded yet</h3>
        <p>Click "Add Expense" to log shared costs.</p>
      </div>
    `;
    return;
  }

  expensesTimeline.innerHTML = expenses
    .map((exp) => {
      const isSettlement = exp.category === 'Payment';
      const icon = categoryIcons[exp.category || 'General'] || '🛒';
      const payerNames = exp.payers
        .map((p) => {
          const u = allUsers.find((m) => m.id === p.userId);
          return u ? u.name : p.userId;
        })
        .join(', ');

      const formattedDate = new Date(exp.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });

      return `
        <div class="expense-item-wrapper" id="exp-wrapper-${exp.id}">
          <div class="expense-row ${isSettlement ? 'settlement-row' : ''}" style="border:none; border-radius:0;">
            <div class="exp-main">
              <div class="cat-badge">${icon}</div>
              <div class="exp-info">
                <span class="exp-title">${exp.description}</span>
                <span class="exp-sub">Paid by <strong>${payerNames}</strong> • ${formattedDate}</span>
              </div>
            </div>
            <div class="exp-right">
              <span class="exp-amount">${formatCurrency(exp.totalAmount, currency)}</span>
              <button class="btn-comments-toggle" onclick="toggleComments('${exp.id}')" title="Comments thread">
                💬 <span id="comment-count-${exp.id}">Comments</span>
              </button>
              <button class="btn-del" title="Delete expense" onclick="deleteExpense('${exp.id}')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Inline Comments Thread (Hidden by default) -->
          <div id="comments-box-${exp.id}" class="comments-container hidden">
            <div id="comments-list-${exp.id}" class="comments-list">
              <span style="font-size:0.78rem; color:var(--text-sub);">Loading comments...</span>
            </div>
            <form class="comment-form" onsubmit="handleCommentSubmit(event, '${exp.id}')">
              <input type="text" id="comment-input-${exp.id}" class="comment-input" placeholder="Write a comment or note..." required>
              <button type="submit" class="btn-comment-send">Post</button>
            </form>
          </div>
        </div>
      `;
    })
    .join('');
}

// Comments Functions
window.toggleComments = async function (expenseId) {
  const box = document.getElementById(`comments-box-${expenseId}`);
  if (!box) return;

  const isHidden = box.classList.contains('hidden');
  if (isHidden) {
    box.classList.remove('hidden');
    await loadComments(expenseId);
  } else {
    box.classList.add('hidden');
  }
};

async function loadComments(expenseId) {
  const list = document.getElementById(`comments-list-${expenseId}`);
  const countSpan = document.getElementById(`comment-count-${expenseId}`);
  if (!list) return;

  try {
    const res = await fetch(`/api/expenses/${expenseId}/comments`).then((r) => r.json());
    const comments = res.data || [];

    if (countSpan) {
      countSpan.innerText = comments.length > 0 ? `${comments.length}` : 'Comments';
    }

    if (comments.length === 0) {
      list.innerHTML = `<span style="font-size:0.78rem; color:var(--text-sub);">No comments yet. Start the conversation!</span>`;
      return;
    }

    list.innerHTML = comments
      .map(
        (c) => `
        <div class="comment-bubble">
          <div class="comment-avatar">${c.userAvatar || '👤'}</div>
          <div class="comment-body">
            <div class="comment-header">
              <span class="comment-author">${c.userName}</span>
              <span class="comment-date">${new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="comment-text">${c.content}</div>
          </div>
        </div>
      `
      )
      .join('');
  } catch (err) {
    list.innerHTML = `<span style="font-size:0.78rem; color:var(--danger);">Error loading comments</span>`;
  }
}

window.handleCommentSubmit = async function (e, expenseId) {
  e.preventDefault();
  const input = document.getElementById(`comment-input-${expenseId}`);
  if (!input || !input.value.trim()) return;

  const content = input.value.trim();
  try {
    const res = await fetch(`/api/expenses/${expenseId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId, content }),
    });

    if (!res.ok) throw new Error('Failed to post comment');
    input.value = '';
    await loadComments(expenseId);
  } catch (err) {
    alert('Error posting comment: ' + err.message);
  }
};

// Modal Openers
function openExpenseModal(defaultScope = 'group') {
  const scopeSelect = document.getElementById('expScope');
  if (scopeSelect) scopeSelect.value = defaultScope;

  updateExpenseModalParticipants(defaultScope);
  modalExpense.classList.remove('hidden');
}

function updateExpenseModalParticipants(scope) {
  const payerSelect = document.getElementById('expPayer');
  let eligibleUsers = [];

  if (scope === 'friend' && activeFriend) {
    const currentUser = allUsers.find((u) => u.id === currentUserId);
    eligibleUsers = [currentUser, activeFriend.friend].filter(Boolean);
  } else if (activeGroup) {
    eligibleUsers = activeGroup.members;
  } else {
    eligibleUsers = allUsers;
  }

  payerSelect.innerHTML = eligibleUsers.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
  if (currentUserId && eligibleUsers.some((u) => u.id === currentUserId)) {
    payerSelect.value = currentUserId;
  }

  const activeSplitType = document.querySelector('input[name="splitType"]:checked')?.value || 'EQUAL';
  renderParticipantsSplitInputs(activeSplitType, eligibleUsers);
}

function renderParticipantsSplitInputs(splitType, userList = null) {
  const container = document.getElementById('participantsSplitList');
  const scope = document.getElementById('expScope')?.value || 'group';

  let eligibleUsers = userList;
  if (!eligibleUsers) {
    if (scope === 'friend' && activeFriend) {
      const currentUser = allUsers.find((u) => u.id === currentUserId);
      eligibleUsers = [currentUser, activeFriend.friend].filter(Boolean);
    } else if (activeGroup) {
      eligibleUsers = activeGroup.members;
    } else {
      eligibleUsers = allUsers;
    }
  }

  container.innerHTML = eligibleUsers
    .map((m) => {
      let customInput = '';
      if (splitType === 'EXACT') {
        customInput = `<input type="number" step="0.01" class="split-val-input" data-user-id="${m.id}" placeholder="₹ 0.00" required>`;
      } else if (splitType === 'PERCENT') {
        customInput = `<input type="number" step="0.1" class="split-val-input" data-user-id="${m.id}" placeholder="% 0" required>`;
      } else if (splitType === 'SHARES') {
        customInput = `<input type="number" step="1" min="1" value="1" class="split-val-input" data-user-id="${m.id}" required>`;
      }

      return `
        <div class="participant-item">
          <label>
            <input type="checkbox" class="participant-checkbox" value="${m.id}" checked>
            <span>${m.avatarUrl || '👤'} ${m.name}</span>
          </label>
          ${customInput}
        </div>
      `;
    })
    .join('');
}

function openSettleModal(fromId = '', toId = '', amount = '') {
  const payerSelect = document.getElementById('settlePayer');
  const receiverSelect = document.getElementById('settleReceiver');
  const amountInput = document.getElementById('settleAmount');

  let memberList = activeGroup?.members || allUsers;
  const options = memberList.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
  payerSelect.innerHTML = options;
  receiverSelect.innerHTML = options;

  if (fromId) payerSelect.value = fromId;
  if (toId) receiverSelect.value = toId;
  if (amount) amountInput.value = amount;

  modalSettle.classList.remove('hidden');
}

window.openDirectSettle = function (fromId, toId, amount) {
  openSettleModal(fromId, toId, amount);
};

function openGroupModal() {
  const membersList = document.getElementById('groupMembersList');
  membersList.innerHTML = allUsers
    .map(
      (u) => `
      <div class="participant-item">
        <label>
          <input type="checkbox" class="group-user-cb" value="${u.id}" checked>
          <span>${u.avatarUrl || '👤'} ${u.name} (${u.email || 'No email'})</span>
        </label>
      </div>
    `
    )
    .join('');

  modalGroup.classList.remove('hidden');
}

function openFriendModal() {
  const select = document.getElementById('newFriendSelect');
  const currentFriendIds = new Set(friends.map((f) => f.friend.id));
  currentFriendIds.add(currentUserId);

  const nonFriends = allUsers.filter((u) => !currentFriendIds.has(u.id));

  if (nonFriends.length === 0) {
    select.innerHTML = '<option disabled>All available users are already friends!</option>';
  } else {
    select.innerHTML = nonFriends
      .map((u) => `<option value="${u.id}">${u.avatarUrl || '👤'} ${u.name} (${u.email || 'No email'})</option>`)
      .join('');
  }

  modalFriend.classList.remove('hidden');
}

// Form Handlers
async function handleExpenseSubmit(e) {
  e.preventDefault();
  const desc = document.getElementById('expDesc').value;
  const amount = parseFloat(document.getElementById('expAmount').value);
  const category = document.getElementById('expCategory').value;
  const scope = document.getElementById('expScope').value;
  const payerId = document.getElementById('expPayer').value;
  const splitType = document.querySelector('input[name="splitType"]:checked').value;

  const checkedBoxes = Array.from(document.querySelectorAll('.participant-checkbox:checked')).map((cb) => cb.value);

  if (checkedBoxes.length === 0) {
    alert('Please select at least one participant.');
    return;
  }

  let splits = [];
  if (splitType !== 'EQUAL') {
    splits = checkedBoxes.map((uid) => {
      const input = document.querySelector(`.split-val-input[data-user-id="${uid}"]`);
      const val = parseFloat(input?.value || '0');
      if (splitType === 'EXACT') return { userId: uid, amount: val };
      if (splitType === 'PERCENT') return { userId: uid, percentage: val, amount: (amount * val) / 100 };
      if (splitType === 'SHARES') return { userId: uid, shares: val, amount: 0 };
      return { userId: uid, amount: 0 };
    });
  }

  const endpoint = scope === 'group' && activeGroup ? `/api/groups/${activeGroup.id}/expenses` : '/api/expenses';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: scope === 'group' && activeGroup ? activeGroup.id : '0',
        description: desc,
        totalAmount: amount,
        currency: activeGroup?.currency || 'INR',
        category,
        splitType,
        payers: [{ userId: payerId, amount }],
        splits: splitType === 'EQUAL' ? undefined : splits,
        participants: splitType === 'EQUAL' ? checkedBoxes : undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add expense');

    modalExpense.classList.add('hidden');
    formExpense.reset();
    await refreshActiveView();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function handleSettleSubmit(e) {
  e.preventDefault();
  const fromUserId = document.getElementById('settlePayer').value;
  const toUserId = document.getElementById('settleReceiver').value;
  const amount = parseFloat(document.getElementById('settleAmount').value);

  if (fromUserId === toUserId) {
    alert('Payer and receiver cannot be the same user.');
    return;
  }

  const groupId = activeTab === 'groups' && activeGroup ? activeGroup.id : '0';

  try {
    const res = await fetch(`/api/groups/${groupId}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromUserId,
        toUserId,
        amount,
        currency: activeGroup?.currency || 'INR',
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to settle debt');

    modalSettle.classList.add('hidden');
    formSettle.reset();
    await refreshActiveView();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function handleGroupSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('groupName').value;
  const description = document.getElementById('groupDesc').value;
  const currency = document.getElementById('groupCurrency').value;
  const memberIds = Array.from(document.querySelectorAll('.group-user-cb:checked')).map((cb) => cb.value);

  try {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, currency, memberIds }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create group');

    modalGroup.classList.add('hidden');
    formGroup.reset();
    await loadInitialData();
    groupSelect.value = data.data.id;
    activeGroup = data.data;
    await refreshGroupData();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function handleFriendSubmit(e) {
  e.preventDefault();
  const friendId = document.getElementById('newFriendSelect').value;

  try {
    const res = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId1: currentUserId, userId2: friendId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to connect friendship');

    modalFriend.classList.add('hidden');
    formFriend.reset();
    await refreshActiveView();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

window.deleteExpense = async function (id) {
  if (!confirm('Are you sure you want to delete this expense?')) return;
  try {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete');
    await refreshActiveView();
  } catch (err) {
    alert('Error: ' + err.message);
  }
};
