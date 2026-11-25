/**
 * Splitwise Core Interactive Dashboard Client
 */

// State
let groups = [];
let activeGroup = null;
let allUsers = [];
let expenses = [];
let settlementData = null;
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
const groupSelect = document.getElementById('groupSelect');
const btnNewExpense = document.getElementById('btnNewExpense');
const btnNewGroup = document.getElementById('btnNewGroup');
const btnReseed = document.getElementById('btnReseed');
const btnQuickSettle = document.getElementById('btnQuickSettle');

const toggleSimplified = document.getElementById('toggleSimplified');
const toggleUnsimplified = document.getElementById('toggleUnsimplified');

const metricTotalSpend = document.getElementById('metricTotalSpend');
const metricExpenseCount = document.getElementById('metricExpenseCount');
const metricDebtVolume = document.getElementById('metricDebtVolume');
const metricUnsimplifiedCount = document.getElementById('metricUnsimplifiedCount');
const metricOptimization = document.getElementById('metricOptimization');
const metricSimplifiedCount = document.getElementById('metricSimplifiedCount');
const metricMemberCount = document.getElementById('metricMemberCount');
const metricCurrency = document.getElementById('metricCurrency');

const debtsContainer = document.getElementById('debtsContainer');
const netBalancesContainer = document.getElementById('netBalancesContainer');
const expensesTimeline = document.getElementById('expensesTimeline');

// Modals
const modalExpense = document.getElementById('modalExpense');
const modalSettle = document.getElementById('modalSettle');
const modalGroup = document.getElementById('modalGroup');

// Forms
const formExpense = document.getElementById('formExpense');
const formSettle = document.getElementById('formSettle');
const formGroup = document.getElementById('formGroup');

// Init
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadInitialData();
});

function setupEventListeners() {
  groupSelect.addEventListener('change', async (e) => {
    const selectedId = e.target.value;
    activeGroup = groups.find((g) => g.id === selectedId) || null;
    await refreshGroupData();
  });

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

  // Modal open triggers
  btnNewExpense.addEventListener('click', () => openExpenseModal());
  btnQuickSettle.addEventListener('click', () => openSettleModal());
  btnNewGroup.addEventListener('click', () => openGroupModal());

  // Modal close buttons
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      document.getElementById(modalId)?.classList.add('hidden');
    });
  });

  // Close modals on outside click
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.classList.add('hidden');
    }
  });

  // Split Type Radio changes in Expense modal
  document.querySelectorAll('input[name="splitType"]').forEach((radio) => {
    radio.addEventListener('change', () => renderParticipantsSplitInputs(radio.value));
  });

  // Form Submissions
  formExpense.addEventListener('submit', handleExpenseSubmit);
  formSettle.addEventListener('submit', handleSettleSubmit);
  formGroup.addEventListener('submit', handleGroupSubmit);
}

// Data Loaders
async function loadInitialData() {
  try {
    const [usersRes, groupsRes] = await Promise.all([
      fetch('/api/users').then((r) => r.json()),
      fetch('/api/groups').then((r) => r.json()),
    ]);

    allUsers = usersRes.data || [];
    groups = groupsRes.data || [];

    // Populate Group Select
    groupSelect.innerHTML = groups
      .map((g) => `<option value="${g.id}">${g.name}</option>`)
      .join('');

    if (groups.length > 0) {
      activeGroup = groups[0];
      groupSelect.value = activeGroup.id;
      await refreshGroupData();
    }
  } catch (err) {
    console.error('Error loading initial data:', err);
  }
}

async function refreshGroupData() {
  if (!activeGroup) return;

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

    renderMetrics();
    renderDebts();
    renderNetBalances();
    renderExpenses();
  } catch (err) {
    console.error('Error refreshing group data:', err);
  }
}

// Render Functions
function renderMetrics() {
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

function renderDebts() {
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
        <h3>No expenses yet</h3>
        <p>Click "Add Expense" to start splitting costs.</p>
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
          const u = activeGroup.members.find((m) => m.id === p.userId);
          return u ? u.name : p.userId;
        })
        .join(', ');

      const formattedDate = new Date(exp.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });

      return `
        <div class="expense-row ${isSettlement ? 'settlement-row' : ''}">
          <div class="exp-main">
            <div class="cat-badge">${icon}</div>
            <div class="exp-info">
              <span class="exp-title">${exp.description}</span>
              <span class="exp-sub">Paid by <strong>${payerNames}</strong> • ${formattedDate}</span>
            </div>
          </div>
          <div class="exp-right">
            <span class="exp-amount">${formatCurrency(exp.totalAmount, currency)}</span>
            <button class="btn-del" title="Delete expense" onclick="deleteExpense('${exp.id}')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

// Modal Form Openers
function openExpenseModal() {
  if (!activeGroup) return;
  const payerSelect = document.getElementById('expPayer');
  payerSelect.innerHTML = activeGroup.members
    .map((m) => `<option value="${m.id}">${m.name}</option>`)
    .join('');

  const activeSplitType = document.querySelector('input[name="splitType"]:checked')?.value || 'EQUAL';
  renderParticipantsSplitInputs(activeSplitType);

  modalExpense.classList.remove('hidden');
}

function renderParticipantsSplitInputs(splitType) {
  const container = document.getElementById('participantsSplitList');
  if (!activeGroup) return;

  container.innerHTML = activeGroup.members
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
  if (!activeGroup) return;
  const payerSelect = document.getElementById('settlePayer');
  const receiverSelect = document.getElementById('settleReceiver');
  const amountInput = document.getElementById('settleAmount');

  const options = activeGroup.members.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
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

// Form Handlers
async function handleExpenseSubmit(e) {
  e.preventDefault();
  const desc = document.getElementById('expDesc').value;
  const amount = parseFloat(document.getElementById('expAmount').value);
  const category = document.getElementById('expCategory').value;
  const payerId = document.getElementById('expPayer').value;
  const splitType = document.querySelector('input[name="splitType"]:checked').value;

  const checkedBoxes = Array.from(document.querySelectorAll('.participant-checkbox:checked')).map((cb) => cb.value);

  if (checkedBoxes.length === 0) {
    alert('Please select at least one participant.');
    return;
  }

  let splits = [];
  if (splitType === 'EQUAL') {
    // Calculated server-side with participants
  } else {
    splits = checkedBoxes.map((uid) => {
      const input = document.querySelector(`.split-val-input[data-user-id="${uid}"]`);
      const val = parseFloat(input?.value || '0');
      if (splitType === 'EXACT') return { userId: uid, amount: val };
      if (splitType === 'PERCENT') return { userId: uid, percentage: val, amount: (amount * val) / 100 };
      if (splitType === 'SHARES') return { userId: uid, shares: val, amount: 0 };
      return { userId: uid, amount: 0 };
    });
  }

  try {
    const res = await fetch(`/api/groups/${activeGroup.id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: desc,
        totalAmount: amount,
        currency: activeGroup.currency,
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
    await refreshGroupData();
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

  try {
    const res = await fetch(`/api/groups/${activeGroup.id}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromUserId,
        toUserId,
        amount,
        currency: activeGroup.currency,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to settle debt');

    modalSettle.classList.add('hidden');
    formSettle.reset();
    await refreshGroupData();
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

window.deleteExpense = async function (id) {
  if (!confirm('Are you sure you want to delete this expense?')) return;
  try {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete');
    await refreshGroupData();
  } catch (err) {
    alert('Error: ' + err.message);
  }
};
