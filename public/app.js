/**
 * Splitwise Authentic Full-Stack Web Application
 * Complete with Authentication, Landing Page, Account Settings, Activity Stream & Min-Cash-Flow Engine
 */

// Global State
let currentUser = null;
let authToken = localStorage.getItem('splitwise_auth_token') || null;

let allUsers = [];
let groups = [];
let friends = [];
let currentView = 'dashboard'; // 'dashboard' | 'activity' | 'expenses' | 'group' | 'friend'
let activeGroupId = null;
let activeFriendId = null;
let activeGroup = null;
let activeFriend = null;
let currentExpenses = [];
let groupSettlement = null;
let feedTab = 'expenses'; // 'expenses' | 'simplification'
let simplificationMode = 'simplified'; // 'simplified' | 'unsimplified'

// Category Icons
const CATEGORY_ICONS = {
  Food: '🍽️',
  Transport: '🚗',
  Lodging: '🏠',
  Drinks: '🍸',
  Activities: '🏄',
  Payment: '🤝',
  General: '🛒',
};

function formatCurrency(amount, currency = null) {
  const cur = currency || (currentUser && currentUser.defaultCurrency) || 'USD';
  const sym = cur === 'USD' ? '$' : cur === 'INR' ? '₹' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : cur + ' ';
  const num = Math.abs(Number(amount) || 0);
  const locale = cur === 'INR' ? 'en-IN' : 'en-US';
  return `${sym}${num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseMonthDay(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return {
    month: months[d.getMonth()],
    day: d.getDate(),
  };
}

function formatTimeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Authenticated fetch wrapper
function authFetch(url, options = {}) {
  const headers = options.headers || {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return fetch(url, { ...options, headers });
}

// DOM Elements
const landingView = document.getElementById('landingView');
const authenticatedApp = document.getElementById('authenticatedApp');

// Landing Elements
const btnLandingLogin = document.getElementById('btnLandingLogin');
const btnLandingSignup = document.getElementById('btnLandingSignup');
const btnHeroSignup = document.getElementById('btnHeroSignup');

// Header Elements
const brandHomeLink = document.getElementById('brandHomeLink');
const btnUserMenuToggle = document.getElementById('btnUserMenuToggle');
const userDropdownMenu = document.getElementById('userDropdownMenu');
const headerUserAvatar = document.getElementById('headerUserAvatar');
const headerUserName = document.getElementById('headerUserName');
const dropdownUserName = document.getElementById('dropdownUserName');
const dropdownUserEmail = document.getElementById('dropdownUserEmail');
const btnLogout = document.getElementById('btnLogout');
const btnOpenProfileModal = document.getElementById('btnOpenProfileModal');
const btnExportGroupCSV = document.getElementById('btnExportGroupCSV');

// Nav Items
const navDashboard = document.getElementById('navDashboard');
const navRecentActivity = document.getElementById('navRecentActivity');
const navAllExpenses = document.getElementById('navAllExpenses');

const sidebarGroupsList = document.getElementById('sidebarGroupsList');
const sidebarFriendsList = document.getElementById('sidebarFriendsList');
const btnAddGroupLeft = document.getElementById('btnAddGroupLeft');
const btnAddFriendLeft = document.getElementById('btnAddFriendLeft');
const btnOpenGroupModal = document.getElementById('btnOpenGroupModal');
const btnOpenFriendModal = document.getElementById('btnOpenFriendModal');

// Center Topbar & Ribbon
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

// Center Feed Controls
const feedSubheader = document.getElementById('feedSubheader');
const tabViewExpenses = document.getElementById('tabViewExpenses');
const tabViewSimplification = document.getElementById('tabViewSimplification');
const simplificationToggles = document.getElementById('simplificationToggles');
const btnModeSimplified = document.getElementById('btnModeSimplified');
const btnModeUnsimplified = document.getElementById('btnModeUnsimplified');

const expensesFeed = document.getElementById('expensesFeed');
const activitiesFeed = document.getElementById('activitiesFeed');
const simplificationFeed = document.getElementById('simplificationFeed');
const simplificationTransfersList = document.getElementById('simplificationTransfersList');
const statReductionPct = document.getElementById('statReductionPct');
const statTransfersCount = document.getElementById('statTransfersCount');
const statTotalVolume = document.getElementById('statTotalVolume');

const rightSidebarContent = document.getElementById('rightSidebarContent');

// Modals
const modalLogin = document.getElementById('modalLogin');
const modalSignup = document.getElementById('modalSignup');
const modalGoogleAccount = document.getElementById('modalGoogleAccount');
const modalProfile = document.getElementById('modalProfile');
const modalAddExpense = document.getElementById('modalAddExpense');
const modalSettleUp = document.getElementById('modalSettleUp');
const modalCreateGroup = document.getElementById('modalCreateGroup');
const modalAddFriend = document.getElementById('modalAddFriend');

const btnHeroGoogle = document.getElementById('btnHeroGoogle');
const btnLoginGoogle = document.getElementById('btnLoginGoogle');
const btnSignupGoogle = document.getElementById('btnSignupGoogle');

const formLogin = document.getElementById('formLogin');
const formSignup = document.getElementById('formSignup');
const formProfile = document.getElementById('formProfile');
const formAddExpense = document.getElementById('formAddExpense');
const formSettleUp = document.getElementById('formSettleUp');
const formCreateGroup = document.getElementById('formCreateGroup');
const formAddFriend = document.getElementById('formAddFriend');

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();

  // Fetch Google Client ID from server config or localStorage
  try {
    const configRes = await fetch('/api/config/google-client-id');
    const configData = await configRes.json();
    let effectiveClientId = configData.clientId || localStorage.getItem('splitwise_google_client_id') || '';
    if (effectiveClientId) {
      window.__SPLITWISE_GOOGLE_CLIENT_ID = effectiveClientId;
      if (!configData.clientId) {
        // Sync to server so server knows it
        fetch('/api/config/google-client-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: effectiveClientId }),
        }).catch(() => {});
      }
      if (typeof google !== 'undefined') {
        initializeGoogleSignIn();
      } else {
        window.addEventListener('load', () => setTimeout(initializeGoogleSignIn, 300));
      }
    }
  } catch (e) {
    console.warn('Could not fetch Google Client ID config:', e);
  }

  await checkAuthSession();
});

// Check Session on Page Load
async function checkAuthSession() {
  if (authToken) {
    try {
      const res = await authFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        currentUser = data.data;
        showAuthenticatedUI();
        await loadInitialData();
        return;
      }
    } catch (e) {
      console.warn('Session check failed, reverting to landing page:', e);
    }
  }

  // Not authenticated
  showLandingUI();
}

function showLandingUI() {
  landingView.classList.remove('hidden');
  authenticatedApp.classList.add('hidden');
}

function showAuthenticatedUI() {
  landingView.classList.add('hidden');
  authenticatedApp.classList.remove('hidden');
  updateCurrentUserUI();
}

function updateCurrentUserUI() {
  if (!currentUser) return;
  headerUserAvatar.innerText = currentUser.avatarUrl || '👤';
  headerUserName.innerText = currentUser.name;
  dropdownUserName.innerText = currentUser.name;
  dropdownUserEmail.innerText = currentUser.email || '';
}

// Setup Event Listeners
function setupEventListeners() {
  // Landing Actions
  btnLandingLogin?.addEventListener('click', () => modalLogin.classList.remove('hidden'));
  btnLandingSignup?.addEventListener('click', () => modalSignup.classList.remove('hidden'));
  btnHeroSignup?.addEventListener('click', () => modalSignup.classList.remove('hidden'));

  // Google Sign-in buttons — trigger real Google OAuth
  btnHeroGoogle?.addEventListener('click', () => triggerGoogleSignIn());
  btnLoginGoogle?.addEventListener('click', () => {
    modalLogin.classList.add('hidden');
    triggerGoogleSignIn();
  });
  btnSignupGoogle?.addEventListener('click', () => {
    modalSignup.classList.add('hidden');
    triggerGoogleSignIn();
  });
  document.getElementById('btnLaunchGooglePopup')?.addEventListener('click', () => {
    launchGoogleOAuthPopup();
  });

  document.getElementById('linkSwitchToSignup')?.addEventListener('click', (e) => {
    e.preventDefault();
    modalLogin.classList.add('hidden');
    modalSignup.classList.remove('hidden');
  });

  document.getElementById('linkSwitchToLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    modalSignup.classList.add('hidden');
    modalLogin.classList.remove('hidden');
  });

  // Topbar Dropdown
  btnUserMenuToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdownMenu.classList.toggle('hidden');
  });

  window.addEventListener('click', (e) => {
    if (!userDropdownMenu.contains(e.target) && !btnUserMenuToggle.contains(e.target)) {
      userDropdownMenu.classList.add('hidden');
    }
  });

  // Logout
  btnLogout?.addEventListener('click', async () => {
    userDropdownMenu.classList.add('hidden');
    await authFetch('/api/auth/logout', { method: 'POST' });
    authToken = null;
    currentUser = null;
    localStorage.removeItem('splitwise_auth_token');
    showLandingUI();
  });

  // Profile Modal
  btnOpenProfileModal?.addEventListener('click', () => {
    userDropdownMenu.classList.add('hidden');
    openProfileModal();
  });

  // CSV Export
  btnExportGroupCSV?.addEventListener('click', () => {
    userDropdownMenu.classList.add('hidden');
    if (activeGroupId) {
      window.open(`/api/groups/${activeGroupId}/export.csv`, '_blank');
    } else if (groups.length > 0) {
      window.open(`/api/groups/${groups[0].id}/export.csv`, '_blank');
    } else {
      alert('Please create or select a group to export.');
    }
  });

  // Navigation Links
  brandHomeLink?.addEventListener('click', () => switchView('dashboard'));
  navDashboard?.addEventListener('click', () => switchView('dashboard'));
  navRecentActivity?.addEventListener('click', () => switchView('activity'));
  navAllExpenses?.addEventListener('click', () => switchView('expenses'));

  // Left Sidebar Action buttons
  btnAddGroupLeft?.addEventListener('click', openGroupModal);
  btnAddFriendLeft?.addEventListener('click', openFriendModal);
  btnOpenGroupModal?.addEventListener('click', () => {
    userDropdownMenu.classList.add('hidden');
    openGroupModal();
  });
  btnOpenFriendModal?.addEventListener('click', () => {
    userDropdownMenu.classList.add('hidden');
    openFriendModal();
  });

  // Feed Action Buttons
  btnOpenExpenseModal?.addEventListener('click', () => openExpenseModal());
  btnOpenSettleModal?.addEventListener('click', () => openSettleModal());

  // Center Feed Tab Switching
  tabViewExpenses?.addEventListener('click', () => {
    feedTab = 'expenses';
    tabViewExpenses.classList.add('active');
    tabViewSimplification.classList.remove('active');
    expensesFeed.classList.remove('hidden');
    simplificationFeed.classList.add('hidden');
    simplificationToggles.classList.add('hidden');
  });

  tabViewSimplification?.addEventListener('click', () => {
    feedTab = 'simplification';
    tabViewSimplification.classList.add('active');
    tabViewExpenses.classList.remove('active');
    expensesFeed.classList.add('hidden');
    simplificationFeed.classList.remove('hidden');
    simplificationToggles.classList.remove('hidden');
    renderSimplificationFeed();
  });

  btnModeSimplified?.addEventListener('click', () => {
    simplificationMode = 'simplified';
    btnModeSimplified.classList.add('active');
    btnModeUnsimplified.classList.remove('active');
    renderSimplificationFeed();
  });

  btnModeUnsimplified?.addEventListener('click', () => {
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

  // Split Category Selector
  const expCategorySelect = document.getElementById('expCategorySelect');
  const selectedCategoryIcon = document.getElementById('selectedCategoryIcon');
  const expCategory = document.getElementById('expCategory');

  expCategorySelect?.addEventListener('change', (e) => {
    const cat = e.target.value;
    expCategory.value = cat;
    selectedCategoryIcon.innerText = CATEGORY_ICONS[cat] || '🛒';
  });

  // Expense Split Controls
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

  document.getElementById('modalExpContext')?.addEventListener('change', () => {
    updateExpenseModalParticipants();
  });

  // Form Submissions
  formLogin?.addEventListener('submit', handleLoginSubmit);
  formSignup?.addEventListener('submit', handleSignupSubmit);
  formProfile?.addEventListener('submit', handleProfileSubmit);
  formAddExpense?.addEventListener('submit', handleExpenseSubmit);
  formSettleUp?.addEventListener('submit', handleSettleSubmit);
  formCreateGroup?.addEventListener('submit', handleGroupSubmit);
  formAddFriend?.addEventListener('submit', handleFriendSubmit);

  // Invite Widget
  document.getElementById('btnSendInvite')?.addEventListener('click', () => {
    const input = document.getElementById('inviteEmailInput');
    if (input.value.trim()) {
      alert(`Invitation sent to ${input.value.trim()}!`);
      input.value = '';
    }
  });

  // Settled Accounts Toggle
  document.getElementById('btnToggleSettledAccounts')?.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Showing all accounts settled for more than 30 days.');
  });

  // Dashboard Balances View Toggles (view as list | view chart)
  document.getElementById('btnDashViewList')?.addEventListener('click', () => {
    document.getElementById('btnDashViewList')?.classList.add('active');
    document.getElementById('btnDashViewChart')?.classList.remove('active');
  });
  document.getElementById('btnDashViewChart')?.addEventListener('click', () => {
    document.getElementById('btnDashViewChart')?.classList.add('active');
    document.getElementById('btnDashViewList')?.classList.remove('active');
  });

  // Add Expense Modal Interactive Controls (Matching Screenshot Exact Replica)
  document.getElementById('expAmount')?.addEventListener('input', () => {
    recalcExpensePerPerson();
  });

  document.getElementById('btnTogglePayer')?.addEventListener('click', () => {
    const payerSelect = document.getElementById('expPayer');
    if (payerSelect && payerSelect.options.length > 1) {
      let nextIdx = (payerSelect.selectedIndex + 1) % payerSelect.options.length;
      payerSelect.selectedIndex = nextIdx;
      const opt = payerSelect.options[nextIdx];
      const btn = document.getElementById('btnTogglePayer');
      if (btn) btn.innerText = opt.text;
    }
  });

  document.getElementById('btnExpDatePill')?.addEventListener('click', () => {
    const dateInput = document.getElementById('expDate');
    try {
      if (dateInput?.showPicker) dateInput.showPicker();
      else dateInput?.focus();
    } catch {
      dateInput?.focus();
    }
  });

  document.getElementById('expDate')?.addEventListener('change', (e) => {
    const dateVal = e.target.value;
    if (dateVal) {
      const d = new Date(dateVal + 'T00:00:00');
      const formatted = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const pillText = document.getElementById('expDatePillText');
      if (pillText) pillText.innerText = formatted;
    }
  });

  document.getElementById('btnExpNotesPill')?.addEventListener('click', () => {
    document.getElementById('expNotesDrawer')?.classList.toggle('hidden');
  });

  document.getElementById('btnExpGroupPill')?.addEventListener('click', () => {
    const ctx = document.getElementById('modalExpContext');
    ctx.classList.toggle('hidden');
    ctx.focus();
  });

  document.getElementById('btnRemoveToken')?.addEventListener('click', () => {
    const tokenPill = document.getElementById('tokenSelectedFriend');
    if (tokenPill) tokenPill.style.display = 'none';
    const ctx = document.getElementById('modalExpContext');
    ctx.classList.remove('hidden');
    ctx.focus();
  });
}

// ===== REAL GOOGLE OAUTH via Google Identity Services (GIS) =====
let gisInitialized = false;

function getActiveGoogleClientId() {
  return window.__SPLITWISE_GOOGLE_CLIENT_ID || localStorage.getItem('splitwise_google_client_id') || '';
}

// Complete login session with Google result
async function completeGoogleLogin(bodyPayload) {
  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Google login failed');

  authToken = data.data.token;
  currentUser = data.data.user;
  localStorage.setItem('splitwise_auth_token', authToken);

  modalGoogleAccount?.classList.add('hidden');
  modalLogin?.classList.add('hidden');
  modalSignup?.classList.add('hidden');
  showAuthenticatedUI();
  await loadInitialData();
}

// Called by GIS credential callback (ID Token JWT)
window.handleGoogleCredentialResponse = async function (response) {
  try {
    await completeGoogleLogin({ credential: response.credential });
  } catch (err) {
    alert('Google sign-in error: ' + err.message);
  }
};

// Called when Google OAuth2 Token Client returns an Access Token
async function handleGoogleAccessToken(accessToken) {
  try {
    await completeGoogleLogin({ accessToken });
  } catch (err) {
    alert('Google sign-in error: ' + err.message);
  }
}

// Initialize Google Identity Services
function initializeGoogleSignIn() {
  const clientId = getActiveGoogleClientId();
  if (!clientId || typeof google === 'undefined') return;

  try {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    const container = document.getElementById('gisButtonContainer');
    if (container) {
      container.innerHTML = '';
      google.accounts.id.renderButton(container, {
        theme: 'outline',
        size: 'large',
        width: 300,
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
      });
    }
    gisInitialized = true;
  } catch (e) {
    console.warn('Google Identity Services initialization notice:', e);
  }
}

// Launch Google OAuth popup directly via token client
function launchGoogleOAuthPopup() {
  const clientId = getActiveGoogleClientId();
  if (!clientId) {
    updateGoogleModalUI();
    modalGoogleAccount?.classList.remove('hidden');
    return;
  }

  if (typeof google !== 'undefined' && google.accounts?.oauth2) {
    try {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'email profile openid',
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            console.warn('Google token notice:', tokenResponse.error);
            return;
          }
          if (tokenResponse.access_token) {
            await handleGoogleAccessToken(tokenResponse.access_token);
          }
        },
      });
      tokenClient.requestAccessToken();
      return;
    } catch (err) {
      console.warn('Error launching tokenClient, falling back to ID prompt', err);
    }
  }

  // Fallback: trigger GIS prompt
  if (typeof google !== 'undefined' && google.accounts?.id) {
    try {
      google.accounts.id.prompt();
    } catch (e) {}
  }
}

// Update the Google modal depending on whether client ID is configured
function updateGoogleModalUI() {
  const clientId = getActiveGoogleClientId();
  const setupSection = document.getElementById('googleSetupSection');
  const activeContainer = document.getElementById('googleActiveContainer');
  const originLabel = document.getElementById('currentOriginLabel');

  if (originLabel) {
    originLabel.innerText = window.location.origin;
  }

  if (clientId) {
    setupSection?.classList.add('hidden');
    activeContainer?.classList.remove('hidden');
    if (!gisInitialized) {
      initializeGoogleSignIn();
    }
  } else {
    setupSection?.classList.remove('hidden');
    activeContainer?.classList.add('hidden');
  }
}

// Trigger Google Sign-in from any "Continue with Google" button
window.triggerGoogleSignIn = function () {
  const clientId = getActiveGoogleClientId();
  modalGoogleAccount?.classList.remove('hidden');
  updateGoogleModalUI();

  if (clientId) {
    launchGoogleOAuthPopup();
  }
};

// Handle saving Client ID from UI
window.handleSaveGoogleClientId = async function (e) {
  e.preventDefault();
  const input = document.getElementById('inputGoogleClientId');
  const newClientId = input?.value?.trim();
  if (!newClientId) return;

  try {
    await fetch('/api/config/google-client-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: newClientId }),
    });

    window.__SPLITWISE_GOOGLE_CLIENT_ID = newClientId;
    localStorage.setItem('splitwise_google_client_id', newClientId);
    gisInitialized = false;

    initializeGoogleSignIn();
    updateGoogleModalUI();
    launchGoogleOAuthPopup();
  } catch (err) {
    alert('Error saving Google Client ID: ' + err.message);
  }
};

// Form Handlers: Auth
async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid email or password');

    authToken = data.data.token;
    currentUser = data.data.user;
    localStorage.setItem('splitwise_auth_token', authToken);

    modalLogin.classList.add('hidden');
    formLogin.reset();
    showAuthenticatedUI();
    await loadInitialData();
  } catch (err) {
    alert(err.message);
  }
}

async function handleSignupSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const defaultCurrency = document.getElementById('signupCurrency').value;

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, defaultCurrency }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');

    authToken = data.data.token;
    currentUser = data.data.user;
    localStorage.setItem('splitwise_auth_token', authToken);

    modalSignup.classList.add('hidden');
    formSignup.reset();
    showAuthenticatedUI();
    await loadInitialData();
  } catch (err) {
    alert(err.message);
  }
}

function openProfileModal() {
  if (!currentUser) return;
  document.getElementById('profileName').value = currentUser.name;
  document.getElementById('profileAvatar').value = currentUser.avatarUrl || '👤';
  document.getElementById('profileCurrency').value = currentUser.defaultCurrency || 'USD';
  document.getElementById('profileNewPassword').value = '';
  modalProfile.classList.remove('hidden');
}

async function handleProfileSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('profileName').value.trim();
  const avatarUrl = document.getElementById('profileAvatar').value.trim();
  const defaultCurrency = document.getElementById('profileCurrency').value;
  const password = document.getElementById('profileNewPassword').value;

  try {
    const res = await authFetch('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        avatarUrl,
        defaultCurrency,
        password: password ? password : undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update profile');

    currentUser = data.data;
    updateCurrentUserUI();
    modalProfile.classList.add('hidden');
    await reloadCurrentView();
  } catch (err) {
    alert('Error updating profile: ' + err.message);
  }
}

// Initial Data Fetch
async function loadInitialData() {
  if (!currentUser) return;

  try {
    const [usersRes, groupsRes] = await Promise.all([
      authFetch('/api/users').then((r) => r.json()),
      authFetch('/api/groups').then((r) => r.json()),
    ]);

    allUsers = usersRes.data || [];
    groups = groupsRes.data || [];

    await reloadFriends();
    await switchView('dashboard');
  } catch (err) {
    console.error('Error loading initial Splitwise data:', err);
  }
}

async function reloadFriends() {
  if (!currentUser) return;
  try {
    const res = await authFetch(`/api/friends?userId=${currentUser.id}`).then((r) => r.json());
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

  document.querySelectorAll('.sw-nav-item').forEach((n) => n.classList.remove('active'));
  document.querySelectorAll('.sw-list-item').forEach((l) => l.classList.remove('active'));

  const dashBalancesView = document.getElementById('dashboardBalancesView');

  if (viewName === 'dashboard') {
    dashBalancesView?.classList.remove('hidden');
    feedSubheader?.classList.add('hidden');
    expensesFeed?.classList.add('hidden');
    activitiesFeed?.classList.add('hidden');
    simplificationFeed?.classList.add('hidden');
    simplificationToggles?.classList.add('hidden');
    navDashboard?.classList.add('active');
    await loadDashboardView();
  } else {
    dashBalancesView?.classList.add('hidden');
    feedTab = 'expenses';
    tabViewExpenses?.classList.add('active');
    tabViewSimplification?.classList.remove('active');
    expensesFeed?.classList.remove('hidden');
    activitiesFeed?.classList.add('hidden');
    simplificationFeed?.classList.add('hidden');
    simplificationToggles?.classList.add('hidden');
    feedSubheader?.classList.remove('hidden');

    if (viewName === 'activity') {
      navRecentActivity?.classList.add('active');
      await loadRecentActivityView();
    } else if (viewName === 'expenses') {
      navAllExpenses?.classList.add('active');
      await loadAllExpensesView();
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

// 1. Dashboard View (Exact 2-Column Balance Matrix matching after login page.png)
async function loadDashboardView() {
  const dashBalancesView = document.getElementById('dashboardBalancesView');
  dashBalancesView?.classList.remove('hidden');
  feedSubheader?.classList.add('hidden');
  expensesFeed?.classList.add('hidden');
  activitiesFeed?.classList.add('hidden');
  simplificationFeed?.classList.add('hidden');
  tabViewSimplification?.classList.add('hidden');

  if (topbarViewIcon) topbarViewIcon.innerText = '';
  centerTitle.innerText = 'Dashboard';
  if (centerSubtitle) centerSubtitle.innerText = '';

  const allExpRes = await authFetch('/api/expenses').then((r) => r.json());
  currentExpenses = allExpRes.data || [];

  let totalYouAreOwed = 0;
  let totalYouOwe = 0;
  let oweCount = 0;
  let owedCount = 0;

  const owesYouList = [];
  const youOweList = [];

  for (const f of friends) {
    if (f.netBalance > 0.005) {
      totalYouAreOwed += f.netBalance;
      owedCount++;
      owesYouList.push(f);
    } else if (f.netBalance < -0.005) {
      totalYouOwe += Math.abs(f.netBalance);
      oweCount++;
      youOweList.push(f);
    }
  }

  const netTotal = totalYouAreOwed - totalYouOwe;
  const currency = (currentUser && currentUser.defaultCurrency) || 'USD';

  if (Math.abs(netTotal) < 0.005) {
    ribbonTotalBalance.innerText = formatCurrency(0, currency);
    ribbonTotalBalance.className = 'sw-ribbon-val';
    if (ribbonTotalBalanceSub) ribbonTotalBalanceSub.innerText = 'all settled up';
  } else if (netTotal > 0) {
    ribbonTotalBalance.innerText = `+${formatCurrency(netTotal, currency)}`;
    ribbonTotalBalance.className = 'sw-ribbon-val text-teal';
    if (ribbonTotalBalanceSub) ribbonTotalBalanceSub.innerText = 'you are owed overall';
  } else {
    ribbonTotalBalance.innerText = `-${formatCurrency(Math.abs(netTotal), currency)}`;
    ribbonTotalBalance.className = 'sw-ribbon-val text-orange';
    if (ribbonTotalBalanceSub) ribbonTotalBalanceSub.innerText = 'you owe overall';
  }

  ribbonYouOwe.innerText = formatCurrency(totalYouOwe, currency);
  if (ribbonYouOweSub) ribbonYouOweSub.innerText = oweCount === 1 ? 'to 1 person' : `to ${oweCount} people`;

  ribbonYouAreOwed.innerText = formatCurrency(totalYouAreOwed, currency);
  if (ribbonYouAreOwedSub) ribbonYouAreOwedSub.innerText = owedCount === 1 ? 'from 1 person' : `from ${owedCount} people`;

  // Populate Left Column: YOU OWE
  const emptyYouOwe = document.getElementById('emptyYouOwe');
  const listYouOwe = document.getElementById('listYouOwe');
  if (youOweList.length === 0) {
    emptyYouOwe?.classList.remove('hidden');
    listYouOwe?.classList.add('hidden');
    if (listYouOwe) listYouOwe.innerHTML = '';
  } else {
    emptyYouOwe?.classList.add('hidden');
    listYouOwe?.classList.remove('hidden');
    if (listYouOwe) {
      listYouOwe.innerHTML = youOweList
        .map(
          (f) => `
        <div class="sw-dash-user-row" onclick="switchView('friend', '${f.friend.id}')">
          <div class="sw-dash-user-avatar">
            ${f.friend.avatarUrl ? `<img src="${f.friend.avatarUrl}" alt="${f.friend.name}">` : '👤'}
          </div>
          <div class="sw-dash-user-info">
            <span class="sw-dash-user-name">${f.friend.name}</span>
            <span class="sw-dash-user-balance text-orange">you owe ${formatCurrency(Math.abs(f.netBalance), currency)}</span>
          </div>
        </div>
      `
        )
        .join('');
    }
  }

  // Populate Right Column: YOU ARE OWED (Exact match to after login page.png: e.g. "Anu owes you $1,831.32")
  const emptyYouAreOwed = document.getElementById('emptyYouAreOwed');
  const listYouAreOwed = document.getElementById('listYouAreOwed');
  if (owesYouList.length === 0) {
    emptyYouAreOwed?.classList.remove('hidden');
    listYouAreOwed?.classList.add('hidden');
    if (listYouAreOwed) listYouAreOwed.innerHTML = '';
  } else {
    emptyYouAreOwed?.classList.add('hidden');
    listYouAreOwed?.classList.remove('hidden');
    if (listYouAreOwed) {
      listYouAreOwed.innerHTML = owesYouList
        .map(
          (f) => `
        <div class="sw-dash-user-row" onclick="switchView('friend', '${f.friend.id}')">
          <div class="sw-dash-user-avatar">
            ${f.friend.avatarUrl ? `<img src="${f.friend.avatarUrl}" alt="${f.friend.name}">` : '👤'}
          </div>
          <div class="sw-dash-user-info">
            <span class="sw-dash-user-name">${f.friend.name}</span>
            <span class="sw-dash-user-balance text-teal">owes you ${formatCurrency(f.netBalance, currency)}</span>
          </div>
        </div>
      `
        )
        .join('');
    }
  }

  renderDashboardRightSidebar();
}

// 2. Recent Activity View (Audit Stream)
async function loadRecentActivityView() {
  if (topbarViewIcon) topbarViewIcon.innerText = '⚡';
  centerTitle.innerText = 'Recent activity';
  if (centerSubtitle) centerSubtitle.innerText = 'Live chronological audit stream of all activity';

  feedSubheader.classList.add('hidden');
  expensesFeed.classList.add('hidden');
  activitiesFeed.classList.remove('hidden');

  ribbonTotalBalance.innerText = '⚡ Activity';
  if (ribbonTotalBalanceSub) ribbonTotalBalanceSub.innerText = 'live event logging';
  ribbonYouOwe.innerText = `${friends.length} friends`;
  if (ribbonYouOweSub) ribbonYouOweSub.innerText = 'network';
  ribbonYouAreOwed.innerText = `${groups.length} groups`;
  if (ribbonYouAreOwedSub) ribbonYouAreOwedSub.innerText = 'active ledgers';

  try {
    const res = await authFetch('/api/activities').then((r) => r.json());
    const activities = res.data || [];

    if (activities.length === 0) {
      activitiesFeed.innerHTML = `
        <div class="sw-empty-state">
          <div class="sw-empty-icon">📭</div>
          <h3>No activity recorded yet</h3>
        </div>
      `;
      return;
    }

    activitiesFeed.innerHTML = activities
      .map((a) => {
        let icon = '📝';
        if (a.type === 'expense_created') icon = '💸';
        if (a.type === 'settlement') icon = '🤝';
        if (a.type === 'comment') icon = '💬';
        if (a.type === 'group_created') icon = '👥';

        return `
          <div class="sw-activity-row">
            <div class="sw-activity-avatar">${a.userAvatar || icon}</div>
            <div class="sw-activity-body">
              <span class="sw-activity-desc">${a.description}</span>
              <span class="sw-activity-meta">${formatTimeAgo(a.createdAt)} ${a.groupName ? `• in <strong>${a.groupName}</strong>` : ''}</span>
            </div>
          </div>
        `;
      })
      .join('');
  } catch (err) {
    activitiesFeed.innerHTML = `<div class="sw-empty-state"><p>Error loading activity.</p></div>`;
  }

  renderDashboardRightSidebar();
}

// 3. All Expenses View
async function loadAllExpensesView() {
  if (topbarViewIcon) topbarViewIcon.innerText = '📜';
  centerTitle.innerText = 'All expenses';
  if (centerSubtitle) centerSubtitle.innerText = 'Complete timeline of bills and payments';
  tabViewSimplification?.classList.add('hidden');

  const allExpRes = await authFetch('/api/expenses').then((r) => r.json());
  currentExpenses = allExpRes.data || [];

  renderExpensesFeed();
  renderDashboardRightSidebar();
}

// 4. Group View
async function loadGroupView() {
  if (!activeGroup) return;

  if (topbarViewIcon) topbarViewIcon.innerText = '🌴';
  centerTitle.innerText = activeGroup.name;
  if (centerSubtitle) centerSubtitle.innerText = `${activeGroup.description || 'Shared Ledger'} • ${activeGroup.members.length} members`;
  tabViewSimplification?.classList.remove('hidden');

  try {
    const [expRes, settleRes] = await Promise.all([
      authFetch(`/api/groups/${activeGroup.id}/expenses`).then((r) => r.json()),
      authFetch(`/api/groups/${activeGroup.id}/settlement`).then((r) => r.json()),
    ]);

    currentExpenses = expRes.data || [];
    groupSettlement = settleRes.data || null;

    const myBalanceObj = groupSettlement?.netBalances?.find((b) => b.userId === currentUser.id);
    const myNetInGroup = myBalanceObj ? myBalanceObj.balance : 0;

    if (Math.abs(myNetInGroup) < 0.005) {
      ribbonTotalBalance.innerText = '$0.00';
      ribbonTotalBalance.className = 'sw-ribbon-val';
      if (ribbonTotalBalanceSub) ribbonTotalBalanceSub.innerText = 'settled up in this group';
    } else if (myNetInGroup > 0) {
      ribbonTotalBalance.innerText = `+${formatCurrency(myNetInGroup, activeGroup.currency)}`;
      ribbonTotalBalance.className = 'sw-ribbon-val text-teal';
      if (ribbonTotalBalanceSub) ribbonTotalBalanceSub.innerText = 'you are owed in this group';
    } else {
      ribbonTotalBalance.innerText = `-${formatCurrency(Math.abs(myNetInGroup), activeGroup.currency)}`;
      ribbonTotalBalance.className = 'sw-ribbon-val text-orange';
      if (ribbonTotalBalanceSub) ribbonTotalBalanceSub.innerText = 'you owe in this group';
    }

    const groupSpend = currentExpenses.reduce((sum, e) => sum + (e.category === 'Payment' ? 0 : e.totalAmount), 0);
    ribbonYouOwe.innerText = formatCurrency(groupSpend, activeGroup.currency);
    if (ribbonYouOweSub) ribbonYouOweSub.innerText = `${currentExpenses.length} bills recorded`;

    const stats = groupSettlement?.stats;
    ribbonYouAreOwed.innerText = `${stats?.reductionPercentage || 0}%`;
    if (ribbonYouAreOwedSub) ribbonYouAreOwedSub.innerText = `Min-cash-flow reduction`;

    renderExpensesFeed();
    renderGroupRightSidebar();
  } catch (err) {
    console.error('Error loading group view:', err);
  }
}

// 5. Friend View
async function loadFriendView() {
  if (!activeFriend) return;

  if (topbarViewIcon) topbarViewIcon.innerText = activeFriend.friend.avatarUrl || '👤';
  centerTitle.innerText = activeFriend.friend.name;
  if (centerSubtitle) centerSubtitle.innerText = `Direct 1-on-1 balances and expenses`;
  tabViewSimplification?.classList.add('hidden');

  try {
    const expRes = await authFetch(`/api/friends/${activeFriend.friend.id}/expenses?userId=${currentUser.id}`).then((r) =>
      r.json()
    );
    currentExpenses = expRes.data || [];

    const bal = activeFriend.netBalance || 0;
    if (Math.abs(bal) < 0.005) {
      ribbonTotalBalance.innerText = '$0.00';
      ribbonTotalBalance.className = 'sw-ribbon-val';
      if (ribbonTotalBalanceSub) ribbonTotalBalanceSub.innerText = 'you two are all settled up';
    } else if (bal > 0) {
      ribbonTotalBalance.innerText = `+${formatCurrency(bal)}`;
      ribbonTotalBalance.className = 'sw-ribbon-val text-teal';
      if (ribbonTotalBalanceSub) ribbonTotalBalanceSub.innerText = `${activeFriend.friend.name} owes you`;
    } else {
      ribbonTotalBalance.innerText = `-${formatCurrency(Math.abs(bal))}`;
      ribbonTotalBalance.className = 'sw-ribbon-val text-orange';
      if (ribbonTotalBalanceSub) ribbonTotalBalanceSub.innerText = `you owe ${activeFriend.friend.name}`;
    }

    const directSpend = currentExpenses.reduce((sum, e) => sum + (e.category === 'Payment' ? 0 : e.totalAmount), 0);
    ribbonYouOwe.innerText = formatCurrency(directSpend);
    if (ribbonYouOweSub) ribbonYouOweSub.innerText = 'total direct spend';

    ribbonYouAreOwed.innerText = `${currentExpenses.length}`;
    if (ribbonYouAreOwedSub) ribbonYouAreOwedSub.innerText = 'shared transactions';

    renderExpensesFeed();
    renderFriendRightSidebar();
  } catch (err) {
    console.error('Error loading friend view:', err);
  }
}

// Render Left Sidebar (Groups & Friends lists)
function renderLeftSidebar() {
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

      const isYouPayer = exp.payers.some((p) => p.userId === currentUser?.id);
      const payerNames = exp.payers
        .map((p) => {
          if (p.userId === currentUser?.id) return 'you';
          const u = allUsers.find((user) => user.id === p.userId);
          return u ? u.name : p.userId;
        })
        .join(', ');

      const userSplit = exp.splits.find((s) => s.userId === currentUser?.id);
      const userPaidObj = exp.payers.find((p) => p.userId === currentUser?.id);
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

          <div class="sw-expense-detail-view hidden" id="exp-detail-${exp.id}">
            <div class="sw-detail-breakdown">
              <div class="sw-detail-item" style="margin-bottom:8px;">
                <span>📅 <strong>${new Date(exp.createdAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></span>
              </div>
              ${exp.splits
                .map((s) => {
                  const u = allUsers.find((user) => user.id === s.userId);
                  const name = s.userId === currentUser?.id ? 'You' : u ? u.name : s.userId;
                  return `
                  <div class="sw-detail-item">
                    <span>${u?.avatarUrl || '👤'}</span>
                    <span>${name} owes <strong>${formatCurrency(s.amount, exp.currency)}</strong></span>
                  </div>
                `;
                })
                .join('')}
            </div>

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

// Toggle Expense Details
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

async function loadExpenseComments(expenseId) {
  const container = document.getElementById(`comments-list-${expenseId}`);
  if (!container) return;

  try {
    const res = await authFetch(`/api/expenses/${expenseId}/comments`).then((r) => r.json());
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
    const res = await authFetch(`/api/expenses/${expenseId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, content: input.value.trim() }),
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
      const isFromMe = d.fromUser === currentUser?.id;
      const isToMe = d.toUser === currentUser?.id;

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

// Right Sidebar Renderers
function renderDashboardRightSidebar() {
  rightSidebarContent.innerHTML = `
    <div class="sw-pro-widget" id="proWidget">
      <div class="sw-pro-icon-wrap">
        <svg class="sw-pro-gem-icon" viewBox="0 0 64 64" width="56" height="56">
          <defs>
            <linearGradient id="proGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ab55f7"/>
              <stop offset="100%" stop-color="#6366f1"/>
            </linearGradient>
          </defs>
          <polygon points="32 4, 56 22, 32 60, 8 22" fill="url(#proGrad)"/>
          <polygon points="32 4, 56 22, 32 28, 8 22" fill="#c084fc" opacity="0.6"/>
          <polygon points="32 28, 56 22, 32 60" fill="#7e22ce" opacity="0.5"/>
          <polygon points="32 28, 8 22, 32 60" fill="#9333ea" opacity="0.7"/>
          <circle cx="50" cy="12" r="3" fill="#fbbf24"/>
          <polygon points="12 10, 14 6, 16 10, 20 12, 16 14, 14 18, 12 14, 8 12" fill="#fbbf24"/>
        </svg>
      </div>
      <h4 class="sw-pro-title">GET SPLITWISE PRO!</h4>
      <p class="sw-pro-desc">Never keep track of a receipt again! With Splitwise Pro, you can organize your receipts, scan receipts automatically, and more.</p>
      <button type="button" class="sw-btn-pro-learn" id="btnLearnSplitwisePro" onclick="alert('Splitwise Pro includes receipt scanning, currency conversion, expense search, and charts!')">Learn more</button>
    </div>
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
            const isMe = b.userId === currentUser?.id;
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
      <button class="sw-btn-primary-teal" style="width:100%; margin-top:8px;" onclick="openSettleModal('${activeFriend.friend.id}', '${currentUser.id}', ${bal})">
        Settle up
      </button>
    `;
  } else {
    statusMarkup = `
      <div class="sw-right-header text-orange">YOU OWE ${activeFriend.friend.name.toUpperCase()}</div>
      <div class="sw-right-big-balance text-orange">-${formatCurrency(Math.abs(bal))}</div>
      <button class="sw-btn-primary-orange" style="width:100%; margin-top:8px;" onclick="openSettleModal('${currentUser.id}', '${activeFriend.friend.id}', ${Math.abs(bal)})">
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

// Modals Setup & Openers
function openExpenseModal(targetContext = null) {
  const contextSelect = document.getElementById('modalExpContext');
  const tokenPill = document.getElementById('tokenSelectedFriend');
  const tokenAvatar = document.getElementById('tokenAvatar');
  const tokenName = document.getElementById('tokenName');
  const currencySym = document.getElementById('modalCurrencySymbol');
  const currency = (currentUser && currentUser.defaultCurrency) || 'USD';
  if (currencySym) currencySym.innerText = currency === 'USD' ? '$' : currency === 'INR' ? '₹' : currency === 'EUR' ? '€' : currency;

  let options = '';
  options += `<optgroup label="Groups">`;
  options += groups.map((g) => `<option value="group:${g.id}">🌴 ${g.name}</option>`).join('');
  options += `</optgroup>`;

  options += `<optgroup label="1-on-1 Friends">`;
  options += friends.map((f) => `<option value="friend:${f.friend.id}">👤 ${f.friend.name}</option>`).join('');
  options += `</optgroup>`;

  contextSelect.innerHTML = options;

  let chosenFriend = null;
  let chosenGroup = null;

  if (targetContext) {
    contextSelect.value = targetContext;
    const [t, id] = targetContext.split(':');
    if (t === 'group') chosenGroup = groups.find((g) => g.id === id);
    else chosenFriend = friends.find((f) => f.friend.id === id)?.friend;
  } else if (currentView === 'group' && activeGroupId) {
    contextSelect.value = `group:${activeGroupId}`;
    chosenGroup = activeGroup;
  } else if (currentView === 'friend' && activeFriendId) {
    contextSelect.value = `friend:${activeFriendId}`;
    chosenFriend = activeFriend?.friend;
  } else if (friends.length > 0) {
    contextSelect.value = `friend:${friends[0].friend.id}`;
    chosenFriend = friends[0].friend;
  } else if (groups.length > 0) {
    contextSelect.value = `group:${groups[0].id}`;
    chosenGroup = groups[0];
  }

  // Format today's date for date pill: "November 25, 2026"
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const dateOptions = { month: 'long', day: 'numeric', year: 'numeric' };
  const formattedDate = today.toLocaleDateString('en-US', dateOptions);

  const expDateInput = document.getElementById('expDate');
  if (expDateInput) expDateInput.value = dateStr;
  const expDatePillText = document.getElementById('expDatePillText');
  if (expDatePillText) expDatePillText.innerText = formattedDate;

  // Group Pill
  const expGroupPillText = document.getElementById('expGroupPillText');
  if (chosenGroup) {
    if (expGroupPillText) expGroupPillText.innerText = chosenGroup.name;
  } else {
    if (expGroupPillText) expGroupPillText.innerText = 'No group';
  }

  // Token Pill (matching add expense .png)
  if (chosenFriend) {
    if (tokenPill) tokenPill.style.display = 'inline-flex';
    if (tokenAvatar) tokenAvatar.innerText = chosenFriend.avatarUrl || '👤';
    if (tokenName) tokenName.innerText = chosenFriend.email || chosenFriend.name;
  } else {
    if (tokenPill) tokenPill.style.display = 'none';
  }

  // Reset inputs
  const expDesc = document.getElementById('expDesc');
  if (expDesc) expDesc.value = '';
  const expAmount = document.getElementById('expAmount');
  if (expAmount) expAmount.value = '';

  updateExpenseModalParticipants();
  recalcExpensePerPerson();
  modalAddExpense.classList.remove('hidden');
}

function recalcExpensePerPerson() {
  const amtInput = document.getElementById('expAmount');
  const splitSub = document.getElementById('splitDetailSub');
  const amount = parseFloat(amtInput?.value || '0');
  const checkedUsers = Array.from(document.querySelectorAll('.sw-modal-user-cb:checked'));
  const count = Math.max(checkedUsers.length, 1);
  const perPerson = amount / count;
  const currency = (currentUser && currentUser.defaultCurrency) || 'USD';
  if (splitSub) {
    splitSub.innerText = `(${formatCurrency(perPerson, currency)}/person)`;
  }
}

function updateExpenseModalParticipants() {
  const contextVal = document.getElementById('modalExpContext').value;
  if (!contextVal) return;
  const [type, id] = contextVal.split(':');
  const payerSelect = document.getElementById('expPayer');
  const btnTogglePayer = document.getElementById('btnTogglePayer');

  let participants = [];
  if (type === 'group') {
    const grp = groups.find((g) => g.id === id);
    participants = grp ? grp.members : allUsers;
    const expGroupPillText = document.getElementById('expGroupPillText');
    if (expGroupPillText) expGroupPillText.innerText = grp ? grp.name : 'Group';
    const tokenPill = document.getElementById('tokenSelectedFriend');
    if (tokenPill) tokenPill.style.display = 'none';
  } else {
    const fr = friends.find((f) => f.friend.id === id);
    const me = allUsers.find((u) => u.id === currentUser?.id);
    participants = [me, fr?.friend].filter(Boolean);
    const expGroupPillText = document.getElementById('expGroupPillText');
    if (expGroupPillText) expGroupPillText.innerText = 'No group';
    const tokenPill = document.getElementById('tokenSelectedFriend');
    const tokenAvatar = document.getElementById('tokenAvatar');
    const tokenName = document.getElementById('tokenName');
    if (fr && tokenPill) {
      tokenPill.style.display = 'inline-flex';
      if (tokenAvatar) tokenAvatar.innerText = fr.friend.avatarUrl || '👤';
      if (tokenName) tokenName.innerText = fr.friend.email || fr.friend.name;
    }
  }

  payerSelect.innerHTML = participants
    .map((p) => `<option value="${p.id}">${p.id === currentUser?.id ? 'you' : p.name}</option>`)
    .join('');
  if (currentUser) {
    payerSelect.value = currentUser.id;
    if (btnTogglePayer) btnTogglePayer.innerText = 'you';
  }

  const splitType = document.getElementById('activeSplitType').value || 'EQUAL';
  renderParticipantSplitRows(splitType, participants);
  recalcExpensePerPerson();
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
      const me = allUsers.find((u) => u.id === currentUser?.id);
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
            <span>${p.avatarUrl || '👤'} ${p.id === currentUser?.id ? 'You' : p.name}</span>
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
  const options = memberList
    .map((m) => `<option value="${m.id}">${m.id === currentUser?.id ? 'You' : m.name}</option>`)
    .join('');

  payerSelect.innerHTML = options;
  receiverSelect.innerHTML = options;

  if (fromId) payerSelect.value = fromId;
  else if (currentUser) payerSelect.value = currentUser.id;

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
  if (currentUser) friendIdSet.add(currentUser.id);

  const nonFriends = allUsers.filter((u) => !friendIdSet.has(u.id));
  if (nonFriends.length === 0) {
    select.innerHTML = '<option disabled>All available users are already connected!</option>';
  } else {
    select.innerHTML = nonFriends.map((u) => `<option value="${u.id}">${u.avatarUrl || '👤'} ${u.name}</option>`).join('');
  }

  modalAddFriend.classList.remove('hidden');
}

// Expense & Group Submit Handlers
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
    const res = await authFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: contextType === 'group' ? contextId : '0',
        description: desc,
        totalAmount: amount,
        currency: (currentUser && currentUser.defaultCurrency) || 'USD',
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
    document.getElementById('splitTabsWrap')?.classList.add('hidden');
    document.getElementById('expNotesDrawer')?.classList.add('hidden');

    await reloadFriends();
    if (currentView === 'dashboard') {
      await switchView('dashboard');
    } else if (contextType === 'group') {
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
    const res = await authFetch(`/api/groups/${groupId}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromUserId: payerId,
        toUserId: receiverId,
        amount,
        currency: (currentUser && currentUser.defaultCurrency) || 'USD',
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
    const res = await authFetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc, currency, memberIds }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create group');

    modalCreateGroup.classList.add('hidden');
    formCreateGroup.reset();

    const groupsRes = await authFetch('/api/groups').then((r) => r.json());
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
    const res = await authFetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId1: currentUser.id, userId2: friendId }),
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
    const res = await authFetch(`/api/expenses/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete expense');
    await reloadCurrentView();
  } catch (err) {
    alert('Error: ' + err.message);
  }
};
