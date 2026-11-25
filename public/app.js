/**
 * Splitwise Web Authentic Client
 * Built via REA (Reverse-Engineer-Anything) on Splitwise Web Application
 * Features:
 * - 3-Column Splitwise Desktop UI (Left nav, Center feed, Right balances)
 * - Greedy Min-Cash-Flow Debt Simplification (O(N) vs O(N^2))
 * - Dynamic Group & 1-on-1 Friend Ledgers
 * - Split Modes: Equal, Exact, Percent, Shares
 * - Live Expense Comments Thread & Realtime Balances
 */

// Global State
let allUsers = [];
let groups = [];
let friends = [];
let currentUserId = null;
let currentView = 'dashboard'; // 'dashboard' | 'activity' | 'expenses' | 'group' | 'friend'
let activeGroupId = null;
let activeFriendId = null;
let activeGroup = null;
let activeFriend = null;
let currentExpenses = [];
let groupSettlement = null;
let feedTab = 'expenses'; // 'expenses' | 'simplification'
let simplificationMode = 'simplified'; // 'simplified' | 'unsimplified'

// Category Icons & Helpers
const CATEGORY_ICONS = {
  Food: '🍽️',
  Transport: '🚗',
  Lodging: '🏠',
  Drinks: '🍸',
  Activities: '🏄',
  Payment: '🤝',
  General: '🛒',
};

function formatCurrency(amount, currency = 'INR') {
  const sym = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency + ' ';
  const num = Math.abs(Number(amount) || 0);
  return `${sym}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseMonthDay(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return {
    month: months[d.getMonth()],
    day: d.getDate(),
  };
}

// DOM Elements
const brandHomeLink = document.getElementById('brandHomeLink');
const btnUserMenuToggle = document.getElementById('btnUserMenuToggle');
const userDropdownMenu = document.getElementById('userDropdownMenu');
const headerUserAvatar = document.getElementById('headerUserAvatar');
const headerUserName = document.getElementById('headerUserName');
const currentUserSelect = document.getElementById('currentUserSelect');

const navDashboard = document.getElementById('navDashboard');
const navRecentActivity = document.getElementById('navRecentActivity');
const navAllExpenses = document.getElementById('navAllExpenses');

const sidebarGroupsList = document.getElementById('sidebarGroupsList');
const sidebarFriendsList = document.getElementById('sidebarFriendsList');
const btnAddGroupLeft = document.getElementById('btnAddGroupLeft');
const btnAddFriendLeft = document.getElementById('btnAddFriendLeft');
const btnOpenGroupModal = document.getElementById('btnOpenGroupModal');
const btnOpenFriendModal = document.getElementById('btnOpenFriendModal');
const btnReseedDemo = document.getElementById('btnReseedDemo');

const topbarViewIcon = document.getElementById('topbarViewIcon');
const centerTitle = document.getElementById('centerTitle');
const centerSubtitle = document.getElementById('centerSubtitle');
const btnOpenExpenseModal = document.getElementById('btnOpenExpenseModal');
const btnOpenSettleModal = document.getElementById('btnOpenSettleModal');

const ribbonTotalBalance = document.getElementById('ribbonTotalBalance');
const ribbonTotalBalanceSub = document.getElementById('ribbonTotalBalanceSub');
const ribbonYouOwe = document.getElementById('ribbonYouOwe');
const ribbonYouOweSub = document.getElementById('ribbonYouOweSub');
const ribbonYouAreOwed = document.getElementById('ribbonYouAreOwed');
const ribbonYouAreOwedSub = document.getElementById('ribbonYouAreOwedSub');

const tabViewExpenses = document.getElementById('tabViewExpenses');
const tabViewSimplification = document.getElementById('tabViewSimplification');
const simplificationToggles = document.getElementById('simplificationToggles');
const btnModeSimplified = document.getElementById('btnModeSimplified');
const btnModeUnsimplified = document.getElementById('btnModeUnsimplified');

const expensesFeed = document.getElementById('expensesFeed');
const simplificationFeed = document.getElementById('simplificationFeed');
const simplificationTransfersList = document.getElementById('simplificationTransfersList');
const statReductionPct = document.getElementById('statReductionPct');
const statTransfersCount = document.getElementById('statTransfersCount');
const statTotalVolume = document.getElementById('statTotalVolume');

const rightSidebarContent = document.getElementById('rightSidebarContent');

// Modals
const modalAddExpense = document.getElementById('modalAddExpense');
const modalSettleUp = document.getElementById('modalSettleUp');
const modalCreateGroup = document.getElementById('modalCreateGroup');
const modalAddFriend = document.getElementById('modalAddFriend');

const formAddExpense = document.getElementById('formAddExpense');
const formSettleUp = document.getElementById('formSettleUp');
const formCreateGroup = document.getElementById('formCreateGroup');
const formAddFriend = document.getElementById('formAddFriend');

// Init
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadInitialData();
});

// Event Listeners
function setupEventListeners() {
  // Brand Logo Click -> Return to Dashboard
  brandHomeLink.addEventListener('click', () => switchView('dashboard'));

  // User Profile Dropdown
  btnUserMenuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdownMenu.classList.toggle('hidden');
  });

  window.addEventListener('click', (e) => {
    if (!userDropdownMenu.contains(e.target) && !btnUserMenuToggle.contains(e.target)) {
      userDropdownMenu.classList.add('hidden');
    }
  });

  // Switch User
  currentUserSelect.addEventListener('change', async (e) => {
    currentUserId = e.target.value;
    updateCurrentUserUI();
    await reloadCurrentView();
  });

  // Primary Nav
  navDashboard.addEventListener('click', () => switchView('dashboard'));
  navRecentActivity.addEventListener('click', () => switchView('activity'));
  navAllExpenses.addEventListener('click', () => switchView('expenses'));

  // Left Sidebar Action buttons
  btnAddGroupLeft.addEventListener('click', openGroupModal);
  btnAddFriendLeft.addEventListener('click', openFriendModal);
  btnOpenGroupModal.addEventListener('click', () => {
    userDropdownMenu.classList.add('hidden');
    openGroupModal();
  });
  btnOpenFriendModal.addEventListener('click', () => {
    userDropdownMenu.classList.add('hidden');
    openFriendModal();
  });

  // Reseed Demo Data
  btnReseedDemo.addEventListener('click', async () => {
    userDropdownMenu.classList.add('hidden');
    if (confirm('Reset database to the official Goa Beach Trip Splitwise demo?')) {
      await fetch('/api/seed', { method: 'POST' });
      await loadInitialData();
    }
  });

  // Main Topbar Action Buttons
  btnOpenExpenseModal.addEventListener('click', () => openExpenseModal());
  btnOpenSettleModal.addEventListener('click', () => openSettleModal());

  // Center Feed Tab Switching
  tabViewExpenses.addEventListener('click', () => {
    feedTab = 'expenses';
    tabViewExpenses.classList.add('active');
    tabViewSimplification.classList.remove('active');
    expensesFeed.classList.remove('hidden');
    simplificationFeed.classList.add('hidden');
    simplificationToggles.classList.add('hidden');
  });

  tabViewSimplification.addEventListener('click', () => {
    feedTab = 'simplification';
    tabViewSimplification.classList.add('active');
    tabViewExpenses.classList.remove('active');
    expensesFeed.classList.add('hidden');
    simplificationFeed.classList.remove('hidden');
    simplificationToggles.classList.remove('hidden');
    renderSimplificationFeed();
  });

  // Simplification Mode Toggle
  btnModeSimplified.addEventListener('click', () => {
    simplificationMode = 'simplified';
    btnModeSimplified.classList.add('active');
    btnModeUnsimplified.classList.remove('active');
    renderSimplificationFeed();
  });

  btnModeUnsimplified.addEventListener('click', () => {
    simplificationMode = 'unsimplified';
    btnModeUnsimplified.classList.add('active');
    btnModeSimplified.classList.remove('active');
    renderSimplificationFeed();
  });

  // Modal Closers
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      document.getElementById(modalId)?.classList.add('hidden');
    });
  });

  document.querySelectorAll('.sw-modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
      }
    });
  });

  // Expense Modal Category Selector
  const expCategorySelect = document.getElementById('expCategorySelect');
  const selectedCategoryIcon = document.getElementById('selectedCategoryIcon');
  const expCategory = document.getElementById('expCategory');

  expCategorySelect?.addEventListener('change', (e) => {
    const cat = e.target.value;
    expCategory.value = cat;
    selectedCategoryIcon.innerText = CATEGORY_ICONS[cat] || '🛒';
  });

  // Expense Modal Split Options
  const btnToggleSplitType = document.getElementById('btnToggleSplitType');
  const splitTabsWrap = document.getElementById('splitTabsWrap');
  btnToggleSplitType?.addEventListener('click', () => {
    splitTabsWrap.classList.toggle('hidden');
  });

  document.querySelectorAll('.sw-split-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sw-split-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const type = tab.getAttribute('data-type');
      document.getElementById('activeSplitType').value = type;
      btnToggleSplitType.innerText = type === 'EQUAL' ? 'equally' : type.toLowerCase();
      renderParticipantSplitRows(type);
    });
  });

  document.getElementById('modalExpContext')?.addEventListener('change', (e) => {
    updateExpenseModalParticipants();
  });

  // Form Submissions
  formAddExpense.addEventListener('submit', handleExpenseSubmit);
  formSettleUp.addEventListener('submit', handleSettleSubmit);
  formCreateGroup.addEventListener('submit', handleGroupSubmit);
  formAddFriend.addEventListener('submit', handleFriendSubmit);

  // Invite Button
  document.getElementById('btnSendInvite')?.addEventListener('click', () => {
    const input = document.getElementById('inviteEmailInput');
    if (input.value.trim()) {
      alert(`Invitation sent to ${input.value.trim()}!`);
      input.value = '';
    }
  });
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

    // Setup Current User
    if (allUsers.length > 0) {
      if (!currentUserId || !allUsers.some((u) => u.id === currentUserId)) {
        currentUserId = allUsers[0].id;
      }
    }

    // Populate Current User Selector
    currentUserSelect.innerHTML = allUsers
      .map((u) => `<option value="${u.id}">${u.avatarUrl || '👤'} ${u.name}</option>`)
      .join('');
    currentUserSelect.value = currentUserId;

    updateCurrentUserUI();

    // Fetch Friends for Current User
    await reloadFriends();

    // Default to Dashboard
    await switchView('dashboard');
  } catch (err) {
    console.error('Error loading initial Splitwise data:', err);
  }
}

function updateCurrentUserUI() {
  const user = allUsers.find((u) => u.id === currentUserId);
  if (user) {
    headerUserAvatar.innerText = user.avatarUrl || '👤';
    headerUserName.innerText = user.name;
    currentUserSelect.value = user.id;
  }
}

async function reloadFriends() {
  if (!currentUserId) return;
  try {
    const res = await fetch(`/api/friends?userId=${currentUserId}`).then((r) => r.json());
    friends = res.data || [];
  } catch (err) {
    console.error('Error fetching friends:', err);
  }
}

// View Switching
async function switchView(viewName, targetId = null) {
  currentView = viewName;
  activeGroupId = null;
  activeFriendId = null;

  // Clear sidebar active highlights
  document.querySelectorAll('.sw-nav-item').forEach((n) => n.classList.remove('active'));
  document.querySelectorAll('.sw-list-item').forEach((l) => l.classList.remove('active'));

  // Reset feed tab to expenses
  feedTab = 'expenses';
  tabViewExpenses.classList.add('active');
  tabViewSimplification.classList.remove('active');
  expensesFeed.classList.remove('hidden');
  simplificationFeed.classList.add('hidden');
  simplificationToggles.classList.add('hidden');

  if (viewName === 'dashboard') {
    navDashboard.classList.add('active');
    await loadDashboardView();
  } else if (viewName === 'activity' || viewName === 'expenses') {
    if (viewName === 'activity') navRecentActivity.classList.add('active');
    else navAllExpenses.classList.add('active');
    await loadAllExpensesView(viewName);
  } else if (viewName === 'group') {
    activeGroupId = targetId;
    activeGroup = groups.find((g) => g.id === targetId) || null;
    const groupEl = document.querySelector(`[data-group-id="${targetId}"]`);
    if (groupEl) groupEl.classList.add('active');
    await loadGroupView();
  } else if (viewName === 'friend') {
    activeFriendId = targetId;
    activeFriend = friends.find((f) => f.friend.id === targetId) || null;
    const friendEl = document.querySelector(`[data-friend-id="${targetId}"]`);
    if (friendEl) friendEl.classList.add('active');
    await loadFriendView();
  }

  renderLeftSidebar();
}

async function reloadCurrentView() {
  await reloadFriends();
  if (currentView === 'group' && activeGroupId) {
    await switchView('group', activeGroupId);
  } else if (currentView === 'friend' && activeFriendId) {
    await switchView('friend', activeFriendId);
  } else {
    await switchView(currentView);
  }
}

// 1. Dashboard View
async function loadDashboardView() {
  topbarViewIcon.innerText = '📊';
  centerTitle.innerText = 'Dashboard';
  centerSubtitle.innerText = 'Overall balance and recent activity';
  tabViewSimplification.classList.add('hidden');

  // Fetch all user expenses
  const allExpRes = await fetch('/api/expenses').then((r) => r.json());
  currentExpenses = allExpRes.data || [];

  // Compute Overall Balances across all friends
  let totalYouAreOwed = 0;
  let totalYouOwe = 0;
  let oweCount = 0;
  let owedCount = 0;

  for (const f of friends) {
    if (f.netBalance > 0.005) {
      totalYouAreOwed += f.netBalance;
      owedCount++;
    } else if (f.netBalance < -0.005) {
      totalYouOwe += Math.abs(f.netBalance);
      oweCount++;
    }
  }

  const netTotal = totalYouAreOwed - totalYouOwe;

  if (Math.abs(netTotal) < 0.005) {
    ribbonTotalBalance.innerText = '₹0.00';
    ribbonTotalBalance.className = 'sw-ribbon-val';
    ribbonTotalBalanceSub.innerText = 'all settled up';
  } else if (netTotal > 0) {
    ribbonTotalBalance.innerText = `+${formatCurrency(netTotal)}`;
    ribbonTotalBalance.className = 'sw-ribbon-val text-teal';
    ribbonTotalBalanceSub.innerText = 'you are owed overall';
  } else {
    ribbonTotalBalance.innerText = `-${formatCurrency(Math.abs(netTotal))}`;
    ribbonTotalBalance.className = 'sw-ribbon-val text-orange';
    ribbonTotalBalanceSub.innerText = 'you owe overall';
  }

  ribbonYouOwe.innerText = formatCurrency(totalYouOwe);
  ribbonYouOweSub.innerText = oweCount === 1 ? 'to 1 person' : `to ${oweCount} people`;

  ribbonYouAreOwed.innerText = formatCurrency(totalYouAreOwed);
  ribbonYouAreOwedSub.innerText = owedCount === 1 ? 'from 1 person' : `from ${owedCount} people`;

  renderExpensesFeed();
  renderDashboardRightSidebar(netTotal, totalYouOwe, totalYouAreOwed);
}

// 2. All Expenses View
async function loadAllExpensesView(mode = 'expenses') {
  topbarViewIcon.innerText = mode === 'activity' ? '⚡' : '📜';
  centerTitle.innerText = mode === 'activity' ? 'Recent activity' : 'All expenses';
  centerSubtitle.innerText = 'Complete timeline of bills and payments';
  tabViewSimplification.classList.add('hidden');

  const allExpRes = await fetch('/api/expenses').then((r) => r.json());
  currentExpenses = allExpRes.data || [];

  renderExpensesFeed();
  renderDashboardRightSidebar(0, 0, 0);
}

// 3. Group View
async function loadGroupView() {
  if (!activeGroup) return;

  topbarViewIcon.innerText = '🌴';
  centerTitle.innerText = activeGroup.name;
  centerSubtitle.innerText = `${activeGroup.description || 'Shared Ledger'} • ${activeGroup.members.length} members`;
  tabViewSimplification.classList.remove('hidden');

  try {
    const [expRes, settleRes] = await Promise.all([
      fetch(`/api/groups/${activeGroup.id}/expenses`).then((r) => r.json()),
      fetch(`/api/groups/${activeGroup.id}/settlement`).then((r) => r.json()),
    ]);

    currentExpenses = expRes.data || [];
    groupSettlement = settleRes.data || null;

    // Calculate user's net position in this group
    const myBalanceObj = groupSettlement?.netBalances?.find((b) => b.userId === currentUserId);
    const myNetInGroup = myBalanceObj ? myBalanceObj.balance : 0;

    if (Math.abs(myNetInGroup) < 0.005) {
      ribbonTotalBalance.innerText = '₹0.00';
      ribbonTotalBalance.className = 'sw-ribbon-val';
      ribbonTotalBalanceSub.innerText = 'settled up in this group';
    } else if (myNetInGroup > 0) {
      ribbonTotalBalance.innerText = `+${formatCurrency(myNetInGroup, activeGroup.currency)}`;
      ribbonTotalBalance.className = 'sw-ribbon-val text-teal';
      ribbonTotalBalanceSub.innerText = 'you are owed in this group';
    } else {
      ribbonTotalBalance.innerText = `-${formatCurrency(Math.abs(myNetInGroup), activeGroup.currency)}`;
      ribbonTotalBalance.className = 'sw-ribbon-val text-orange';
      ribbonTotalBalanceSub.innerText = 'you owe in this group';
    }

    const groupSpend = currentExpenses.reduce((sum, e) => sum + (e.category === 'Payment' ? 0 : e.totalAmount), 0);
    ribbonYouOwe.innerText = formatCurrency(groupSpend, activeGroup.currency);
    ribbonYouOweSub.innerText = `${currentExpenses.length} bills recorded`;

    const stats = groupSettlement?.stats;
    ribbonYouAreOwed.innerText = `${stats?.reductionPercentage || 0}%`;
    ribbonYouAreOwedSub.innerText = `Min-cash-flow reduction`;

    renderExpensesFeed();
    renderGroupRightSidebar();
  } catch (err) {
    console.error('Error loading group view:', err);
  }
}

// 4. Friend View
async function loadFriendView() {
  if (!activeFriend) return;

  topbarViewIcon.innerText = activeFriend.friend.avatarUrl || '👤';
  centerTitle.innerText = activeFriend.friend.name;
  centerSubtitle.innerText = `Direct 1-on-1 balances and expenses`;
  tabViewSimplification.classList.add('hidden');

  try {
    const expRes = await fetch(`/api/friends/${activeFriend.friend.id}/expenses?userId=${currentUserId}`).then((r) =>
      r.json()
    );
    currentExpenses = expRes.data || [];

    const bal = activeFriend.netBalance || 0;
    if (Math.abs(bal) < 0.005) {
      ribbonTotalBalance.innerText = '₹0.00';
      ribbonTotalBalance.className = 'sw-ribbon-val';
      ribbonTotalBalanceSub.innerText = 'you two are all settled up';
    } else if (bal > 0) {
      ribbonTotalBalance.innerText = `+${formatCurrency(bal)}`;
      ribbonTotalBalance.className = 'sw-ribbon-val text-teal';
      ribbonTotalBalanceSub.innerText = `${activeFriend.friend.name} owes you`;
    } else {
      ribbonTotalBalance.innerText = `-${formatCurrency(Math.abs(bal))}`;
      ribbonTotalBalance.className = 'sw-ribbon-val text-orange';
      ribbonTotalBalanceSub.innerText = `you owe ${activeFriend.friend.name}`;
    }

    const directSpend = currentExpenses.reduce((sum, e) => sum + (e.category === 'Payment' ? 0 : e.totalAmount), 0);
    ribbonYouOwe.innerText = formatCurrency(directSpend);
    ribbonYouOweSub.innerText = 'total direct spend';

    ribbonYouAreOwed.innerText = `${currentExpenses.length}`;
    ribbonYouAreOwedSub.innerText = 'shared transactions';

    renderExpensesFeed();
    renderFriendRightSidebar();
  } catch (err) {
    console.error('Error loading friend view:', err);
  }
}

// Render Left Sidebar (Groups & Friends lists)
function renderLeftSidebar() {
  // Groups List
  sidebarGroupsList.innerHTML = groups
    .map(
      (g) => `
      <div class="sw-list-item ${currentView === 'group' && activeGroupId === g.id ? 'active' : ''}"
           data-group-id="${g.id}"
           onclick="switchView('group', '${g.id}')">
        <div class="sw-list-item-left">
          <span class="sw-item-icon">🏷️</span>
          <span class="sw-item-name">${g.name}</span>
        </div>
      </div>
    `
    )
    .join('');

  // Friends List with Balance indicator
  sidebarFriendsList.innerHTML = friends
    .map((f) => {
      const isSelected = currentView === 'friend' && activeFriendId === f.friend.id;
      let balMarkup = '';

      if (f.netBalance > 0.005) {
        balMarkup = `<span class="sw-item-balance text-teal">+${formatCurrency(f.netBalance)}</span>`;
      } else if (f.netBalance < -0.005) {
        balMarkup = `<span class="sw-item-balance text-orange">-${formatCurrency(Math.abs(f.netBalance))}</span>`;
      }

      return `
        <div class="sw-list-item ${isSelected ? 'active' : ''}"
             data-friend-id="${f.friend.id}"
             onclick="switchView('friend', '${f.friend.id}')">
          <div class="sw-list-item-left">
            <span class="sw-item-icon">${f.friend.avatarUrl || '👤'}</span>
            <span class="sw-item-name">${f.friend.name}</span>
          </div>
          ${balMarkup}
        </div>
      `;
    })
    .join('');
}

// Render Center Expenses Feed
function renderExpensesFeed() {
  if (currentExpenses.length === 0) {
    expensesFeed.innerHTML = `
      <div class="sw-empty-state">
        <div class="sw-empty-icon">📝</div>
        <h3>No expenses here yet</h3>
        <p>Click the orange "Add an expense" button above to log a new bill!</p>
      </div>
    `;
    return;
  }

  expensesFeed.innerHTML = currentExpenses
    .map((exp) => {
      const { month, day } = parseMonthDay(exp.createdAt);
      const icon = CATEGORY_ICONS[exp.category] || '🛒';
      const isPayment = exp.category === 'Payment';

      // Payer description string
      const isYouPayer = exp.payers.some((p) => p.userId === currentUserId);
      const payerNames = exp.payers
        .map((p) => {
          if (p.userId === currentUserId) return 'you';
          const u = allUsers.find((user) => user.id === p.userId);
          return u ? u.name : p.userId;
        })
        .join(', ');

      // Split impact on current user
      const userSplit = exp.splits.find((s) => s.userId === currentUserId);
      const userPaidObj = exp.payers.find((p) => p.userId === currentUserId);
      const userPaidAmt = userPaidObj ? userPaidObj.amount : 0;
      const userOwedAmt = userSplit ? userSplit.amount : 0;
      const netImpact = userPaidAmt - userOwedAmt;

      let shareBadge = '';
      if (isPayment) {
        if (isYouPayer) {
          shareBadge = `
            <div class="sw-share-badge">
              <span class="sw-share-label text-teal">you paid</span>
              <span class="sw-share-amount text-teal">${formatCurrency(exp.totalAmount, exp.currency)}</span>
            </div>
          `;
        } else {
          shareBadge = `
            <div class="sw-share-badge">
              <span class="sw-share-label text-teal">you received</span>
              <span class="sw-share-amount text-teal">${formatCurrency(exp.totalAmount, exp.currency)}</span>
            </div>
          `;
        }
      } else if (netImpact > 0.005) {
        shareBadge = `
          <div class="sw-share-badge">
            <span class="sw-share-label text-teal">you lent</span>
            <span class="sw-share-amount text-teal">${formatCurrency(netImpact, exp.currency)}</span>
          </div>
        `;
      } else if (netImpact < -0.005) {
        shareBadge = `
          <div class="sw-share-badge">
            <span class="sw-share-label text-orange">you borrowed</span>
            <span class="sw-share-amount text-orange">${formatCurrency(Math.abs(netImpact), exp.currency)}</span>
          </div>
        `;
      } else if (userPaidAmt > 0 && userOwedAmt === userPaidAmt) {
        shareBadge = `
          <div class="sw-share-badge">
            <span class="sw-share-label" style="color:#888;">no balance</span>
            <span class="sw-share-amount" style="color:#888;">₹0.00</span>
          </div>
        `;
      } else {
        shareBadge = `
          <div class="sw-share-badge">
            <span class="sw-share-label" style="color:#aaa;">not involved</span>
          </div>
        `;
      }

      return `
        <div class="sw-expense-item" id="exp-item-${exp.id}">
          <div class="sw-expense-row" onclick="toggleExpenseDetails('${exp.id}')">
            <div class="sw-expense-left">
              <div class="sw-date-box">
                <span class="sw-date-month">${month}</span>
                <span class="sw-date-day">${day}</span>
              </div>
              <div class="sw-cat-icon">${icon}</div>
              <div class="sw-exp-desc-wrap">
                <span class="sw-exp-desc">${exp.description}</span>
                <span class="sw-exp-payer">${payerNames} paid ${formatCurrency(exp.totalAmount, exp.currency)}</span>
              </div>
            </div>

            <div class="sw-expense-right">
              ${shareBadge}
              <button class="sw-btn-delete-row" title="Delete expense" onclick="event.stopPropagation(); deleteExpense('${exp.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Expanded Detail & Comments Section -->
          <div class="sw-expense-detail-view hidden" id="exp-detail-${exp.id}">
            <div class="sw-detail-breakdown">
              <div class="sw-detail-item" style="margin-bottom:8px;">
                <span>📅 <strong>${new Date(exp.createdAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></span>
              </div>
              ${exp.splits
                .map((s) => {
                  const u = allUsers.find((user) => user.id === s.userId);
                  const name = s.userId === currentUserId ? 'You' : u ? u.name : s.userId;
                  return `
                  <div class="sw-detail-item">
                    <span>${u?.avatarUrl || '👤'}</span>
                    <span>${name} owes <strong>${formatCurrency(s.amount, exp.currency)}</strong></span>
                  </div>
                `;
                })
                .join('')}
            </div>

            <!-- Comments Section -->
            <div class="sw-comments-section">
              <div class="sw-comments-title">COMMENTS</div>
              <div class="sw-comments-list" id="comments-list-${exp.id}">
                <span style="font-size:11px; color:#999;">Loading comments...</span>
              </div>
              <form class="sw-comment-form" onsubmit="handleCommentSubmit(event, '${exp.id}')">
                <input type="text" id="comment-input-${exp.id}" class="sw-comment-input" placeholder="Write a comment..." required>
                <button type="submit" class="sw-btn-comment-post">Post</button>
              </form>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

// Toggle Expense Details Dropdown
window.toggleExpenseDetails = async function (expenseId) {
  const detailEl = document.getElementById(`exp-detail-${expenseId}`);
  if (!detailEl) return;

  const isHidden = detailEl.classList.contains('hidden');
  if (isHidden) {
    detailEl.classList.remove('hidden');
    await loadExpenseComments(expenseId);
  } else {
    detailEl.classList.add('hidden');
  }
};

// Comments
async function loadExpenseComments(expenseId) {
  const container = document.getElementById(`comments-list-${expenseId}`);
  if (!container) return;

  try {
    const res = await fetch(`/api/expenses/${expenseId}/comments`).then((r) => r.json());
    const comments = res.data || [];

    if (comments.length === 0) {
      container.innerHTML = `<span style="font-size:11px; color:#aaa;">No comments yet on this expense.</span>`;
      return;
    }

    container.innerHTML = comments
      .map(
        (c) => `
        <div class="sw-comment-card">
          <div class="sw-comment-avatar">${c.userAvatar || '👤'}</div>
          <div class="sw-comment-bubble">
            <div class="sw-comment-meta">
              <span class="sw-comment-author">${c.userName}</span>
              <span>${new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="sw-comment-text">${c.content}</div>
          </div>
        </div>
      `
      )
      .join('');
  } catch (err) {
    container.innerHTML = `<span style="font-size:11px; color:#e53935;">Error loading comments.</span>`;
  }
}

window.handleCommentSubmit = async function (e, expenseId) {
  e.preventDefault();
  const input = document.getElementById(`comment-input-${expenseId}`);
  if (!input || !input.value.trim()) return;

  try {
    const res = await fetch(`/api/expenses/${expenseId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUserId, content: input.value.trim() }),
    });

    if (!res.ok) throw new Error('Failed to post comment');
    input.value = '';
    await loadExpenseComments(expenseId);
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

// Render Simplification Feed
function renderSimplificationFeed() {
  if (!groupSettlement) {
    simplificationFeed.innerHTML = `<div class="sw-empty-state"><p>No settlement data available.</p></div>`;
    return;
  }

  const currency = activeGroup?.currency || 'INR';
  const stats = groupSettlement.stats;
  statReductionPct.innerText = `${stats.reductionPercentage}%`;
  statTransfersCount.innerText = `${simplificationMode === 'simplified' ? stats.simplifiedCount : stats.unsimplifiedCount}`;
  statTotalVolume.innerText = formatCurrency(stats.totalVolume, currency);

  const debts =
    simplificationMode === 'simplified' ? groupSettlement.simplifiedDebts : groupSettlement.unsimplifiedDebts;

  if (debts.length === 0) {
    simplificationTransfersList.innerHTML = `
      <div class="sw-empty-state">
        <div class="sw-empty-icon">🎉</div>
        <h3>All group debts are completely settled!</h3>
      </div>
    `;
    return;
  }

  simplificationTransfersList.innerHTML = debts
    .map((d) => {
      const fromUserObj = allUsers.find((u) => u.id === d.fromUser);
      const toUserObj = allUsers.find((u) => u.id === d.toUser);
      const isFromMe = d.fromUser === currentUserId;
      const isToMe = d.toUser === currentUserId;

      return `
        <div class="sw-transfer-card">
          <div class="sw-transfer-left">
            <span style="font-size:20px;">${fromUserObj?.avatarUrl || '👤'}</span>
            <span style="font-weight:700;">${isFromMe ? 'You' : d.fromUserName}</span>
            <span class="sw-transfer-arrow">➔ pays ➔</span>
            <span style="font-size:20px;">${toUserObj?.avatarUrl || '👤'}</span>
            <span style="font-weight:700;">${isToMe ? 'You' : d.toUserName}</span>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <span class="sw-transfer-amt">${formatCurrency(d.amount, currency)}</span>
            <button class="sw-btn-transfer-settle" onclick="openSettleModal('${d.fromUser}', '${d.toUser}', ${d.amount})">
              Settle
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

// 5. Right Sidebar Renderers
function renderDashboardRightSidebar(netTotal, totalYouOwe, totalYouAreOwed) {
  const owesYouList = friends.filter((f) => f.netBalance > 0.005);
  const youOweList = friends.filter((f) => f.netBalance < -0.005);

  let netMarkup = '';
  if (Math.abs(netTotal) < 0.005) {
    netMarkup = `<span class="sw-right-big-balance" style="color:#888;">₹0.00</span>`;
  } else if (netTotal > 0) {
    netMarkup = `<span class="sw-right-big-balance text-teal">+${formatCurrency(netTotal)}</span>`;
  } else {
    netMarkup = `<span class="sw-right-big-balance text-orange">-${formatCurrency(Math.abs(netTotal))}</span>`;
  }

  rightSidebarContent.innerHTML = `
    <div>
      <div class="sw-right-header">YOUR TOTAL BALANCE</div>
      ${netMarkup}
    </div>

    ${
      youOweList.length > 0
        ? `
      <div>
        <div class="sw-right-header text-orange">YOU OWE</div>
        <div class="sw-balance-user-list">
          ${youOweList
            .map(
              (f) => `
            <div class="sw-balance-user-row" style="cursor:pointer;" onclick="switchView('friend', '${f.friend.id}')">
              <div class="sw-balance-user-info">
                <span>${f.friend.avatarUrl || '👤'}</span>
                <span class="sw-balance-user-name">${f.friend.name}</span>
              </div>
              <span class="sw-balance-user-val text-orange">you owe ${formatCurrency(Math.abs(f.netBalance))}</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
        : ''
    }

    ${
      owesYouList.length > 0
        ? `
      <div>
        <div class="sw-right-header text-teal">YOU ARE OWED</div>
        <div class="sw-balance-user-list">
          ${owesYouList
            .map(
              (f) => `
            <div class="sw-balance-user-row" style="cursor:pointer;" onclick="switchView('friend', '${f.friend.id}')">
              <div class="sw-balance-user-info">
                <span>${f.friend.avatarUrl || '👤'}</span>
                <span class="sw-balance-user-name">${f.friend.name}</span>
              </div>
              <span class="sw-balance-user-val text-teal">owes you ${formatCurrency(f.netBalance)}</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
        : ''
    }

    ${
      owesYouList.length === 0 && youOweList.length === 0
        ? `
      <div style="font-size:12px; color:#888;">
        You do not owe anything and no one owes you! 🎉
      </div>
    `
        : ''
    }
  `;
}

function renderGroupRightSidebar() {
  if (!activeGroup || !groupSettlement) return;
  const currency = activeGroup.currency || 'INR';

  rightSidebarContent.innerHTML = `
    <div>
      <div class="sw-right-header">GROUP BALANCES</div>
      <div class="sw-balance-user-list">
        ${groupSettlement.netBalances
          .map((b) => {
            const user = allUsers.find((u) => u.id === b.userId);
            const isMe = b.userId === currentUserId;
            let valClass = 'color:#888';
            let valText = 'settled';

            if (b.balance > 0.005) {
              valClass = 'color:var(--sw-teal)';
              valText = `gets back ${formatCurrency(b.balance, currency)}`;
            } else if (b.balance < -0.005) {
              valClass = 'color:var(--sw-orange)';
              valText = `owes ${formatCurrency(Math.abs(b.balance), currency)}`;
            }

            return `
            <div class="sw-balance-user-row">
              <div class="sw-balance-user-info">
                <span>${user?.avatarUrl || '👤'}</span>
                <span class="sw-balance-user-name">${isMe ? 'You' : b.userName}</span>
              </div>
              <span class="sw-balance-user-val" style="${valClass}; font-weight:700;">${valText}</span>
            </div>
          `;
          })
          .join('')}
      </div>
    </div>

    <div>
      <div class="sw-right-header">MIN-CASH-FLOW TRANSFERS</div>
      <div style="font-size:12px; color:#666; margin-bottom:8px;">
        Optimized by greedy bipartite matching:
      </div>
      <div class="sw-balance-user-list">
        ${groupSettlement.simplifiedDebts
          .map(
            (d) => `
          <div class="sw-balance-user-row" style="padding:6px 0;">
            <div style="display:flex; flex-direction:column;">
              <span style="font-weight:700; font-size:12px;">${d.fromUserName} pays ${d.toUserName}</span>
              <span style="font-size:11px; color:var(--sw-teal); font-weight:800;">${formatCurrency(d.amount, currency)}</span>
            </div>
            <button class="sw-btn-transfer-settle" onclick="openSettleModal('${d.fromUser}', '${d.toUser}', ${d.amount})">
              Settle
            </button>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderFriendRightSidebar() {
  if (!activeFriend) return;

  const bal = activeFriend.netBalance || 0;
  let statusMarkup = '';

  if (Math.abs(bal) < 0.005) {
    statusMarkup = `<div style="font-size:13px; color:#666;">You and ${activeFriend.friend.name} are completely settled up!</div>`;
  } else if (bal > 0) {
    statusMarkup = `
      <div class="sw-right-header text-teal">${activeFriend.friend.name.toUpperCase()} OWES YOU</div>
      <div class="sw-right-big-balance text-teal">+${formatCurrency(bal)}</div>
      <button class="sw-btn-primary-teal" style="width:100%; margin-top:8px;" onclick="openSettleModal('${activeFriend.friend.id}', '${currentUserId}', ${bal})">
        Settle up
      </button>
    `;
  } else {
    statusMarkup = `
      <div class="sw-right-header text-orange">YOU OWE ${activeFriend.friend.name.toUpperCase()}</div>
      <div class="sw-right-big-balance text-orange">-${formatCurrency(Math.abs(bal))}</div>
      <button class="sw-btn-primary-orange" style="width:100%; margin-top:8px;" onclick="openSettleModal('${currentUserId}', '${activeFriend.friend.id}', ${Math.abs(bal)})">
        Settle up
      </button>
    `;
  }

  rightSidebarContent.innerHTML = `
    <div>
      <div class="sw-right-header">1-ON-1 BALANCE</div>
      ${statusMarkup}
    </div>
  `;
}

// 6. Modals
function openExpenseModal() {
  const contextSelect = document.getElementById('modalExpContext');

  // Populate groups and friends
  let options = '';
  options += `<optgroup label="Groups">`;
  options += groups.map((g) => `<option value="group:${g.id}">🌴 ${g.name}</option>`).join('');
  options += `</optgroup>`;

  options += `<optgroup label="1-on-1 Friends">`;
  options += friends.map((f) => `<option value="friend:${f.friend.id}">👤 ${f.friend.name}</option>`).join('');
  options += `</optgroup>`;

  contextSelect.innerHTML = options;

  if (currentView === 'group' && activeGroupId) {
    contextSelect.value = `group:${activeGroupId}`;
  } else if (currentView === 'friend' && activeFriendId) {
    contextSelect.value = `friend:${activeFriendId}`;
  }

  // Set date to today
  document.getElementById('expDate').value = new Date().toISOString().split('T')[0];

  updateExpenseModalParticipants();
  modalAddExpense.classList.remove('hidden');
}

function updateExpenseModalParticipants() {
  const contextVal = document.getElementById('modalExpContext').value;
  const [type, id] = contextVal.split(':');
  const payerSelect = document.getElementById('expPayer');

  let participants = [];
  if (type === 'group') {
    const grp = groups.find((g) => g.id === id);
    participants = grp ? grp.members : allUsers;
  } else {
    const fr = friends.find((f) => f.friend.id === id);
    const me = allUsers.find((u) => u.id === currentUserId);
    participants = [me, fr?.friend].filter(Boolean);
  }

  payerSelect.innerHTML = participants.map((p) => `<option value="${p.id}">${p.id === currentUserId ? 'You' : p.name}</option>`).join('');
  payerSelect.value = currentUserId;

  const splitType = document.getElementById('activeSplitType').value || 'EQUAL';
  renderParticipantSplitRows(splitType, participants);
}

function renderParticipantSplitRows(splitType, userList = null) {
  const container = document.getElementById('participantsSplitBox');
  let participants = userList;

  if (!participants) {
    const contextVal = document.getElementById('modalExpContext').value;
    const [type, id] = contextVal.split(':');
    if (type === 'group') {
      const grp = groups.find((g) => g.id === id);
      participants = grp ? grp.members : allUsers;
    } else {
      const fr = friends.find((f) => f.friend.id === id);
      const me = allUsers.find((u) => u.id === currentUserId);
      participants = [me, fr?.friend].filter(Boolean);
    }
  }

  container.innerHTML = participants
    .map((p) => {
      let customInput = '';
      if (splitType === 'EXACT') {
        customInput = `<input type="number" step="0.01" class="sw-split-val-input" data-user-id="${p.id}" placeholder="₹0.00" required>`;
      } else if (splitType === 'PERCENT') {
        customInput = `<input type="number" step="0.1" class="sw-split-val-input" data-user-id="${p.id}" placeholder="%0" required>`;
      } else if (splitType === 'SHARES') {
        customInput = `<input type="number" step="1" min="1" value="1" class="sw-split-val-input" data-user-id="${p.id}" required>`;
      }

      return `
        <div class="sw-split-user-row">
          <label style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" class="sw-modal-user-cb" value="${p.id}" checked>
            <span>${p.avatarUrl || '👤'} ${p.id === currentUserId ? 'You' : p.name}</span>
          </label>
          ${customInput}
        </div>
      `;
    })
    .join('');
}

function openSettleModal(fromId = null, toId = null, amount = null) {
  const payerSelect = document.getElementById('settlePayer');
  const receiverSelect = document.getElementById('settleReceiver');
  const amountInput = document.getElementById('settleAmount');
  const dateInput = document.getElementById('settleDate');

  let memberList = currentView === 'group' && activeGroup ? activeGroup.members : allUsers;
  const options = memberList.map((m) => `<option value="${m.id}">${m.id === currentUserId ? 'You' : m.name}</option>`).join('');

  payerSelect.innerHTML = options;
  receiverSelect.innerHTML = options;

  if (fromId) payerSelect.value = fromId;
  else payerSelect.value = currentUserId;

  if (toId) receiverSelect.value = toId;
  else if (memberList.length > 1) {
    receiverSelect.value = memberList.find((m) => m.id !== payerSelect.value)?.id || memberList[0].id;
  }

  if (amount) amountInput.value = amount;
  else amountInput.value = '';

  dateInput.value = new Date().toISOString().split('T')[0];

  modalSettleUp.classList.remove('hidden');
}

function openGroupModal() {
  const container = document.getElementById('groupMembersChecklist');
  container.innerHTML = allUsers
    .map(
      (u) => `
      <label style="display:flex; align-items:center; gap:8px; padding:4px 0; font-size:13px;">
        <input type="checkbox" class="sw-group-member-cb" value="${u.id}" checked>
        <span>${u.avatarUrl || '👤'} ${u.name}</span>
      </label>
    `
    )
    .join('');

  modalCreateGroup.classList.remove('hidden');
}

function openFriendModal() {
  const select = document.getElementById('newFriendSelect');
  const friendIdSet = new Set(friends.map((f) => f.friend.id));
  friendIdSet.add(currentUserId);

  const nonFriends = allUsers.filter((u) => !friendIdSet.has(u.id));
  if (nonFriends.length === 0) {
    select.innerHTML = '<option disabled>All available users are already connected!</option>';
  } else {
    select.innerHTML = nonFriends.map((u) => `<option value="${u.id}">${u.avatarUrl || '👤'} ${u.name}</option>`).join('');
  }

  modalAddFriend.classList.remove('hidden');
}

// 7. Form Handlers
async function handleExpenseSubmit(e) {
  e.preventDefault();
  const contextVal = document.getElementById('modalExpContext').value;
  const [contextType, contextId] = contextVal.split(':');
  const desc = document.getElementById('expDesc').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const category = document.getElementById('expCategory').value;
  const payerId = document.getElementById('expPayer').value;
  const splitType = document.getElementById('activeSplitType').value || 'EQUAL';

  const checkedUsers = Array.from(document.querySelectorAll('.sw-modal-user-cb:checked')).map((cb) => cb.value);
  if (checkedUsers.length === 0) {
    alert('Please select at least one person to split the expense with.');
    return;
  }

  let splits = [];
  if (splitType !== 'EQUAL') {
    splits = checkedUsers.map((uid) => {
      const input = document.querySelector(`.sw-split-val-input[data-user-id="${uid}"]`);
      const val = parseFloat(input?.value || '0');
      if (splitType === 'EXACT') return { userId: uid, amount: val };
      if (splitType === 'PERCENT') return { userId: uid, percentage: val, amount: (amount * val) / 100 };
      if (splitType === 'SHARES') return { userId: uid, shares: val, amount: 0 };
      return { userId: uid, amount: 0 };
    });
  }

  const endpoint = contextType === 'group' ? `/api/groups/${contextId}/expenses` : '/api/expenses';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: contextType === 'group' ? contextId : '0',
        description: desc,
        totalAmount: amount,
        currency: 'INR',
        category,
        splitType,
        payers: [{ userId: payerId, amount }],
        splits: splitType === 'EQUAL' ? undefined : splits,
        participants: splitType === 'EQUAL' ? checkedUsers : undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add expense');

    modalAddExpense.classList.add('hidden');
    formAddExpense.reset();
    document.getElementById('splitTabsWrap').classList.add('hidden');

    if (contextType === 'group') {
      await switchView('group', contextId);
    } else {
      await switchView('friend', contextId);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function handleSettleSubmit(e) {
  e.preventDefault();
  const payerId = document.getElementById('settlePayer').value;
  const receiverId = document.getElementById('settleReceiver').value;
  const amount = parseFloat(document.getElementById('settleAmount').value);

  if (payerId === receiverId) {
    alert('Payer and receiver cannot be the same user.');
    return;
  }

  const groupId = currentView === 'group' && activeGroup ? activeGroup.id : '0';

  try {
    const res = await fetch(`/api/groups/${groupId}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromUserId: payerId,
        toUserId: receiverId,
        amount,
        currency: 'INR',
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to record payment');

    modalSettleUp.classList.add('hidden');
    formSettleUp.reset();
    await reloadCurrentView();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function handleGroupSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('groupName').value.trim();
  const desc = document.getElementById('groupDesc').value;
  const currency = document.getElementById('groupCurrency').value;
  const memberIds = Array.from(document.querySelectorAll('.sw-group-member-cb:checked')).map((cb) => cb.value);

  try {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc, currency, memberIds }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create group');

    modalCreateGroup.classList.add('hidden');
    formCreateGroup.reset();

    // Reload groups and navigate to new group
    const groupsRes = await fetch('/api/groups').then((r) => r.json());
    groups = groupsRes.data || [];
    await switchView('group', data.data.id);
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
    if (!res.ok) throw new Error(data.error || 'Failed to connect friend');

    modalAddFriend.classList.add('hidden');
    formAddFriend.reset();
    await reloadFriends();
    await switchView('friend', friendId);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

window.deleteExpense = async function (id) {
  if (!confirm('Are you sure you want to delete this expense? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete expense');
    await reloadCurrentView();
  } catch (err) {
    alert('Error: ' + err.message);
  }
};
