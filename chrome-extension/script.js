// Page Navigation System
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(pageId).classList.add('active');

  if (pageId !== 'registerPage') {
    stopDarkexTabMonitoring();
  }
}

// Initialize on page load
window.addEventListener('load', async () => {
  const hasVisited = localStorage.getItem('ravTraderHasVisited');
  const currentUser = await getCurrentUser();

  if (currentUser) {
    showPage('dashboardPage');
    loadUserData();
    loadPriceData();
    localStorage.setItem('ravTraderWelcomeDismissed', 'true');
  } else if (hasVisited) {
    showPage('welcomePage');
  } else {
    showPage('welcomePage');
  }

  loadSettings();
});

// LOGIN FORM
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const emailOrUsername = document.getElementById('loginEmailOrUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!emailOrUsername || !password) {
    showNotification('Please fill in all fields', 'error');
    return;
  }

  showNotification('Signing in...', 'info');

  const result = await signIn(emailOrUsername, password);

  if (result.success) {
    localStorage.setItem('ravTraderWelcomeDismissed', 'true');
    showPage('dashboardPage');
    loadUserData();
    loadPriceData();
    showNotification('Welcome back!', 'success');
  } else {
    showNotification(`Login failed: ${result.error}`, 'error');
  }
});

// GET STARTED BUTTON
document.getElementById('getStartedBtn')?.addEventListener('click', () => {
  localStorage.setItem('ravTraderHasVisited', 'true');
  darkexRegistrationStarted = true;

  const url = 'https://www.darkex.com/register?inviteCode=100BONUS';

  // chrome API kullanılabiliyor mu kontrol et
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    // Eklenti ortamında sekme aç
    chrome.tabs.create({ url }, (tab) => {
      chrome.runtime.sendMessage({
        type: 'DARKEX_TAB_OPENED',
        tabId: tab.id,
        windowId: tab.windowId
      });
      startDarkexTabMonitoring();
    });
  } else {
    // Normal web ortamında sekme aç
    window.open(url, '_blank');
  }

  showPage('registerPage');
});

// SHOW LOGIN BUTTON
document.getElementById('showLoginBtn')?.addEventListener('click', () => {
  localStorage.setItem('ravTraderHasVisited', 'true');
  showPage('loginPage');
});

// BACK TO WELCOME BUTTON
document.getElementById('backToWelcomeBtn')?.addEventListener('click', () => {
  showPage('welcomePage');
});

// GO TO REGISTER PAGE
document.getElementById('backToLoginBtn')?.addEventListener('click', () => {
  showPage('loginPage');
});

// OPEN DARKEX ACCOUNT BUTTON
let darkexRegistrationStarted = false;
let darkexTabCheckInterval = null;

document.getElementById('openDarkexBtn')?.addEventListener('click', () => {
  darkexRegistrationStarted = true;

  const url = 'https://www.darkex.com/register?inviteCode=100BONUS';

  // chrome API mevcutsa (eklenti ortamı)
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url }, (tab) => {
      chrome.runtime.sendMessage({
        type: 'DARKEX_TAB_OPENED',
        tabId: tab.id,
        windowId: tab.windowId
      });
      startDarkexTabMonitoring();
    });
  } else {
    // normal web sayfasında çalışıyorsa
    window.open(url, '_blank');
  }

  showNotification('Opening Darkex registration. Remember to use code BONUS100!', 'info');
});

// REGISTER PAGE NAVIGATION WARNING
window.addEventListener('beforeunload', (e) => {
  const currentPage = document.querySelector('.page.active');

  if (currentPage?.id === 'registerPage' && darkexRegistrationStarted) {
    const confirmationMessage = 'Are you sure you want to leave? Please make sure you have completed your Darkex registration with code BONUS100.';
    e.preventDefault();
    e.returnValue = confirmationMessage;
    return confirmationMessage;
  }
});

// Reset the flag when registration is complete
const originalRegisterSubmit = document.getElementById('registerForm')?.addEventListener;
if (originalRegisterSubmit) {
  const registerFormHandler = document.getElementById('registerForm');
  if (registerFormHandler) {
    registerFormHandler.addEventListener('submit', () => {
      darkexRegistrationStarted = false;
    });
  }
}

// REGISTER FORM
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('regUsername').value.trim();
  const uid = document.getElementById('regUid').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirmPassword = document.getElementById('regConfirmPassword').value;
  const termsAccepted = document.getElementById('termsCheckbox').checked;

  if (!username || !uid || !email || !password || !confirmPassword) {
    showNotification('Please fill in all fields', 'error');
    return;
  }

  if (!termsAccepted) {
    showNotification('Please accept the Terms and Conditions', 'error');
    return;
  }

  if (password !== confirmPassword) {
    showNotification('Passwords do not match!', 'error');
    return;
  }

  if (password.length < 6) {
    showNotification('Password must be at least 6 characters', 'error');
    return;
  }

  showNotification('Creating your account...', 'info');

  const result = await signUp(username, uid, email, password);

  if (result.success) {
    stopDarkexTabMonitoring();
    localStorage.setItem('ravTraderAccountCreated', Date.now().toString());
    showPage('dashboardPage');
    loadUserData();
    loadPriceData();
    showNotification('Account created successfully! Welcome to RAV Trader!', 'success');
    createConfetti();
  } else {
    showNotification(`Registration failed: ${result.error}`, 'error');
  }
});

// DARKEX TAB MONITORING FOR REGISTRATION
function startDarkexTabMonitoring() {
  if (darkexTabCheckInterval) {
    clearInterval(darkexTabCheckInterval);
  }

  const registrationWarning = document.getElementById('tabWarningOverlay');

  darkexTabCheckInterval = setInterval(() => {
    const currentPage = document.querySelector('.page.active');

    if (currentPage?.id !== 'registerPage') {
      stopDarkexTabMonitoring();
      return;
    }

    chrome.runtime.sendMessage({ type: 'CHECK_DARKEX_TAB' }, (response) => {
      if (chrome.runtime.lastError) return;

      if (!response.exists) {
        if (registrationWarning) {
          registrationWarning.classList.add('active');
          registrationWarning.querySelector('.overlay-title').textContent = 'DARKEX TAB CLOSED';
          registrationWarning.querySelector('.overlay-message').textContent = 'Registration Tab Closed';
          registrationWarning.querySelector('.overlay-subtitle').textContent = 'Please reopen Darkex to complete registration with referral code BONUS100';
        }
      } else if (!response.isActive) {
        if (registrationWarning) {
          registrationWarning.classList.add('active');
          registrationWarning.querySelector('.overlay-title').textContent = 'RETURN TO DARKEX';
          registrationWarning.querySelector('.overlay-message').textContent = 'Complete Darkex Registration First';
          registrationWarning.querySelector('.overlay-subtitle').textContent = 'You must register on Darkex with code BONUS100 before creating your RAV Trader account';
        }
      } else {
        if (registrationWarning) {
          registrationWarning.classList.remove('active');
        }
      }
    });
  }, 1000);
}

function stopDarkexTabMonitoring() {
  if (darkexTabCheckInterval) {
    clearInterval(darkexTabCheckInterval);
    darkexTabCheckInterval = null;
  }

  const registrationWarning = document.getElementById('tabWarningOverlay');
  if (registrationWarning) {
    registrationWarning.classList.remove('active');
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'DARKEX_TAB_CLOSED') {
    const currentPage = document.querySelector('.page.active');
    if (currentPage?.id === 'registerPage') {
      const registrationWarning = document.getElementById('tabWarningOverlay');
      if (registrationWarning) {
        registrationWarning.classList.add('active');
        registrationWarning.querySelector('.overlay-title').textContent = 'DARKEX TAB CLOSED';
        registrationWarning.querySelector('.overlay-message').textContent = 'Registration Tab Closed';
        registrationWarning.querySelector('.overlay-subtitle').textContent = 'Please reopen Darkex to complete registration with referral code BONUS100';
      }
    }
  }

  if (request.type === 'TAB_CHANGED') {
    const currentPage = document.querySelector('.page.active');
    if (currentPage?.id === 'registerPage' && darkexRegistrationStarted) {
      const registrationWarning = document.getElementById('tabWarningOverlay');
      if (registrationWarning) {
        if (request.isDarkexActive) {
          registrationWarning.classList.remove('active');
        } else if (request.darkexTabExists) {
          registrationWarning.classList.add('active');
          registrationWarning.querySelector('.overlay-title').textContent = 'RETURN TO DARKEX';
          registrationWarning.querySelector('.overlay-message').textContent = 'Complete Darkex Registration First';
          registrationWarning.querySelector('.overlay-subtitle').textContent = 'You must register on Darkex with code BONUS100 before creating your RAV Trader account';
        }
      }
    }
  }
});

// DASHBOARD TABS
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const tabName = tab.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });

    document.getElementById(`${tabName}Tab`).classList.add('active');

    if (tabName === 'positions') {
      loadActivePositions();
      loadPositionHistory();
    } else if (tabName !== 'positions') {
      stopPriceUpdates();
    }
  });
});

// START LISTENING BUTTON
document.getElementById('startListeningBtn')?.addEventListener('click', () => {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('signalsContainer').style.display = 'flex';

  showNotification('Scanning market for signals...', 'info');

  chrome.runtime.sendMessage({ type: 'MANUAL_SCAN' }, () => {
    loadRealSignals();
  });
});

// GENERATE DEMO SIGNALS
function generateDemoSignals() {
  const signals = [
    {
      pair: 'BTC/USDT',
      type: 'LONG',
      entry: '61,250',
      tp: '61,800',
      sl: '60,500',
      volatility: 'high'
    },
    {
      pair: 'ETH/USDT',
      type: 'SHORT',
      entry: '3,420',
      tp: '3,350',
      sl: '3,480',
      volatility: 'medium'
    },
    {
      pair: 'SOL/USDT',
      type: 'LONG',
      entry: '145.20',
      tp: '148.50',
      sl: '143.00',
      volatility: 'high'
    },
    {
      pair: 'MATIC/USDT',
      type: 'LONG',
      entry: '0.8850',
      tp: '0.9200',
      sl: '0.8600',
      volatility: 'low'
    }
  ];

  const container = document.getElementById('signalsContainer');
  container.innerHTML = '';

  signals.forEach((signal, index) => {
    setTimeout(() => {
      const signalCard = createSignalCard(signal);
      container.appendChild(signalCard);
      signalCard.style.animation = 'fadeInUp 0.4s ease forwards';
    }, index * 200);
  });
}

// CREATE SIGNAL CARD
function createSignalCard(signal) {
  const card = document.createElement('div');
  card.className = 'signal-card';

  card.innerHTML = `
    <div class="signal-header">
      <div class="signal-pair">${signal.pair}</div>
      <div class="signal-type ${signal.type.toLowerCase()}">${signal.type}</div>
    </div>
    <div class="signal-details">
      <div class="signal-detail">
        <div class="signal-detail-label">Entry</div>
        <div class="signal-detail-value">$${signal.entry}</div>
      </div>
      <div class="signal-detail">
        <div class="signal-detail-label">Take Profit</div>
        <div class="signal-detail-value">$${signal.tp}</div>
      </div>
      <div class="signal-detail">
        <div class="signal-detail-label">Stop Loss</div>
        <div class="signal-detail-value">$${signal.sl}</div>
      </div>
      <div class="signal-detail">
        <div class="signal-detail-label">Volatility</div>
        <div class="signal-detail-value">
          <span class="volatility-badge ${signal.volatility}">${signal.volatility}</span>
        </div>
      </div>
    </div>
    <div class="signal-actions">
      <button class="btn btn-approve">Approve Trade</button>
      <button class="btn btn-reject">Reject</button>
    </div>
  `;

  const approveBtn = card.querySelector('.btn-approve');
  const rejectBtn = card.querySelector('.btn-reject');

  approveBtn.addEventListener('click', async () => {
    try {
      console.log('Approve button clicked for signal:', signal);
      showPositionEntryModal(signal, card);
    } catch (error) {
      console.error('Error in approve button handler:', error);
      showNotification(`Error approving trade: ${error.message}`, 'error');
    }
  });

  rejectBtn.addEventListener('click', async () => {
    card.style.transition = 'all 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(100px)';

    showNotification(`${signal.pair} signal rejected`, 'info');

    await markSignalAsConsumed(signal.id);

    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'SIGNAL_REJECTED',
          signalId: signal.id
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      console.error('Error removing signal from storage:', error);
    }

    await saveSignalHistory({
      ...signal,
      status: 'rejected',
      timestamp: new Date().toISOString()
    });

    setTimeout(() => {
      card.remove();
      const signalsContainer = document.getElementById('signalsContainer');
      if (signalsContainer && signalsContainer.children.length === 0) {
        document.getElementById('emptyState').style.display = 'flex';
        signalsContainer.style.display = 'none';
      }
    }, 300);
  });

  return card;
}

// SAVE SIGNAL HISTORY
async function saveSignalHistory(signal) {
  await saveSignalToHistory(signal);
  const history = JSON.parse(localStorage.getItem('ravTraderSignalHistory') || '[]');
  history.unshift(signal);
  localStorage.setItem('ravTraderSignalHistory', JSON.stringify(history.slice(0, 50)));
}

// TOGGLE SETTINGS
document.querySelectorAll('.toggle').forEach(toggle => {
  toggle.addEventListener('click', async () => {
    toggle.classList.toggle('active');
    const setting = toggle.dataset.setting;
    const isActive = toggle.classList.contains('active');

    const settings = JSON.parse(localStorage.getItem('ravTraderSettings') || '{}');
    settings[setting] = isActive;
    localStorage.setItem('ravTraderSettings', JSON.stringify(settings));

    const settingKey = setting.replace(/([A-Z])/g, '_$1').toLowerCase() + '_enabled';
    const updateData = {};
    updateData[settingKey] = isActive;
    await updateUserSettings(updateData);

    showNotification(`${setting} ${isActive ? 'enabled' : 'disabled'}`, 'info');
  });
});

// LEVERAGE QUICK SELECT BUTTONS
document.querySelectorAll('.leverage-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const leverageValue = btn.dataset.leverage;
    const leverageInput = document.getElementById('leverageInput');

    if (leverageInput) {
      leverageInput.value = leverageValue;
    }

    document.querySelectorAll('.leverage-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// UPDATE LEVERAGE BUTTON ACTIVE STATE WHEN INPUT CHANGES
document.getElementById('leverageInput')?.addEventListener('input', (e) => {
  const value = e.target.value;

  document.querySelectorAll('.leverage-btn').forEach(btn => {
    if (btn.dataset.leverage === value) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
});

// POSITION SIZE QUICK SELECT BUTTONS
document.querySelectorAll('.position-size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const positionSizeValue = btn.dataset.positionSize;
    const positionSizeInput = document.getElementById('positionSize');

    if (positionSizeInput) {
      positionSizeInput.value = positionSizeValue;
    }

    document.querySelectorAll('.position-size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// UPDATE POSITION SIZE BUTTON ACTIVE STATE WHEN INPUT CHANGES
document.getElementById('positionSize')?.addEventListener('input', (e) => {
  const value = e.target.value;

  document.querySelectorAll('.position-size-btn').forEach(btn => {
    if (btn.dataset.positionSize === value) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
});

// SAVE SETTINGS BUTTON
document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey')?.value.trim() || '';
  const secretKey = document.getElementById('secretKey')?.value.trim() || '';
  const leverage = document.getElementById('leverageInput')?.value || 25;
  const positionSize = document.getElementById('positionSize')?.value || 2;

  const settingsToSave = {
    leverage: parseInt(leverage),
    position_size: parseFloat(positionSize)
  };

  if (apiKey) settingsToSave.api_key = apiKey;
  if (secretKey) settingsToSave.secret_key = secretKey;

  const result = await updateUserSettings(settingsToSave);

  const btn = document.getElementById('saveSettingsBtn');
  const originalText = btn.textContent;

  if (result.success) {
    btn.textContent = 'Settings Saved ✓';
    btn.style.background = '#00ff64';
    showNotification('Settings saved successfully!', 'success');
    sendBrowserNotification('Settings Updated', 'Your trading preferences have been saved successfully.');
  } else {
    showNotification(`Failed to save settings: ${result.error}`, 'error');
  }

  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '';
  }, 2000);

  const settings = JSON.parse(localStorage.getItem('ravTraderSettings') || '{}');
  chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings: settings });
});

// LOAD SETTINGS
async function loadSettings() {
  const settings = await getUserSettings();
  const localSettings = JSON.parse(localStorage.getItem('ravTraderSettings') || '{}');

  document.querySelectorAll('.toggle').forEach(toggle => {
    const setting = toggle.dataset.setting;
    const settingKey = setting.replace(/([A-Z])/g, '_$1').toLowerCase();

    let isActive = false;
    if (settings && settings[settingKey + '_enabled'] !== undefined) {
      isActive = settings[settingKey + '_enabled'];
    } else if (localSettings[setting] !== undefined) {
      isActive = localSettings[setting];
    }

    if (isActive) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  });

  if (settings) {
    const apiKeyInput = document.getElementById('apiKey');
    if (apiKeyInput && settings.api_key) {
      apiKeyInput.value = settings.api_key;
    }

    const secretKeyInput = document.getElementById('secretKey');
    if (secretKeyInput && settings.secret_key) {
      secretKeyInput.value = settings.secret_key;
    }

    const leverageInput = document.getElementById('leverageInput');
    if (leverageInput && settings.leverage) {
      leverageInput.value = settings.leverage;

      document.querySelectorAll('.leverage-btn').forEach(btn => {
        if (btn.dataset.leverage === String(settings.leverage)) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    const positionSizeInput = document.getElementById('positionSize');
    if (positionSizeInput && settings.position_size) {
      positionSizeInput.value = settings.position_size;

      document.querySelectorAll('.position-size-btn').forEach(btn => {
        if (btn.dataset.positionSize === String(settings.position_size)) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  }
}

// LOAD REAL SIGNALS
async function loadRealSignals() {
  const consumedSignalIds = await getConsumedSignalIds();
  const coinType = getSelectedCoinType();

  chrome.runtime.sendMessage({ type: 'GET_SIGNALS' }, (response) => {
    let signals = response?.signals || [];

    signals = signals.filter(signal => !consumedSignalIds.includes(signal.id));

    if (coinType === 'cashback') {
      signals = signals.filter(signal => isCashbackEligible(signal.pair));
    }

    if (signals.length === 0) {
      document.getElementById('emptyState').style.display = 'flex';
      document.getElementById('signalsContainer').style.display = 'none';
      const emptyMessage = coinType === 'cashback'
        ? 'No cashback-eligible signals found. Market will be scanned automatically.'
        : 'No signals found. Market will be scanned automatically.';
      showNotification(emptyMessage, 'info');
      return;
    }

    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('signalsContainer').style.display = 'flex';

    const container = document.getElementById('signalsContainer');
    container.innerHTML = '';

    signals.slice(0, 10).forEach((signal, index) => {
      setTimeout(() => {
        const signalCard = createRealSignalCard(signal);
        container.appendChild(signalCard);
        signalCard.style.animation = 'fadeInUp 0.4s ease forwards';
      }, index * 100);
    });

    if (signals.length > 0) {
      const message = coinType === 'cashback'
        ? `${signals.length} cashback-eligible signal(s) loaded!`
        : `${signals.length} active signal(s) loaded!`;
      showNotification(message, 'success');
    }
  });
}

// CREATE REAL SIGNAL CARD
function createRealSignalCard(signal) {
  const card = document.createElement('div');
  card.className = 'signal-card';
  card.dataset.signalId = signal.id;

  const timestamp = new Date(signal.timestamp).toLocaleString();
  const isCashback = isCashbackEligible(signal.pair);
  const cashbackBadge = isCashback
    ? '<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: linear-gradient(135deg, rgba(0, 255, 100, 0.2) 0%, rgba(201, 253, 6, 0.2) 100%); border: 1px solid rgba(0, 255, 100, 0.3); border-radius: 6px; font-size: 10px; font-weight: 700; color: #00ff64; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px;">💰 20% Cashback</span>'
    : '';

  card.innerHTML = `
    <div class="signal-header">
      <div class="signal-pair">${signal.pair}${cashbackBadge}</div>
      <div class="signal-type ${signal.type.toLowerCase()}">${signal.type}</div>
    </div>
    <div class="signal-meta" style="font-size: 11px; color: var(--text-muted); margin-top: 8px; display: flex; gap: 12px;">
      <span>RSI: ${signal.rsi}</span>
      <span>Change: ${signal.priceChange}%</span>
      <span>${timestamp}</span>
    </div>
    <div class="signal-details">
      <div class="signal-detail">
        <div class="signal-detail-label">Entry</div>
        <div class="signal-detail-value">$${parseFloat(signal.entry).toFixed(4)}</div>
      </div>
      <div class="signal-detail">
        <div class="signal-detail-label">Take Profit</div>
        <div class="signal-detail-value">$${parseFloat(signal.takeProfit).toFixed(4)}</div>
      </div>
      <div class="signal-detail">
        <div class="signal-detail-label">Stop Loss</div>
        <div class="signal-detail-value">$${parseFloat(signal.stopLoss).toFixed(4)}</div>
      </div>
      <div class="signal-detail">
        <div class="signal-detail-label">Volatility</div>
        <div class="signal-detail-value">
          <span class="volatility-badge ${signal.volatility}">${signal.volatility}</span>
        </div>
      </div>
    </div>
    <div class="signal-actions">
      <button class="btn btn-approve">Approve Trade</button>
      <button class="btn btn-reject">Reject</button>
    </div>
  `;

  const approveBtn = card.querySelector('.btn-approve');
  const rejectBtn = card.querySelector('.btn-reject');

  approveBtn.addEventListener('click', async () => {
    try {
      console.log('Approve button clicked for signal:', signal);
      showPositionEntryModal(signal, card);
    } catch (error) {
      console.error('Error in approve button handler:', error);
      showNotification(`Error approving trade: ${error.message}`, 'error');
    }
  });

  rejectBtn.addEventListener('click', async () => {
    card.style.transition = 'all 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(100px)';

    showNotification(`${signal.pair} signal rejected`, 'info');

    await markSignalAsConsumed(signal.id);

    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'SIGNAL_REJECTED',
          signalId: signal.id
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      console.error('Error removing signal from storage:', error);
    }

    await saveSignalHistory({
      ...signal,
      status: 'rejected',
      timestamp: new Date().toISOString()
    });

    setTimeout(() => {
      card.remove();
      const signalsContainer = document.getElementById('signalsContainer');
      if (signalsContainer && signalsContainer.children.length === 0) {
        document.getElementById('emptyState').style.display = 'flex';
        signalsContainer.style.display = 'none';
      }
    }, 300);
  });

  return card;
}

// LOAD USER DATA
async function loadUserData() {
  const userData = await getCurrentUser();
  const usernameDisplay = document.getElementById('usernameDisplay');

  if (usernameDisplay && userData && userData.username) {
    usernameDisplay.textContent = userData.username;
  }

  loadRealSignals();
}

// TAB VISIBILITY DETECTION
document.addEventListener('visibilitychange', () => {
  const overlay = document.getElementById('tabWarningOverlay');
  const currentPage = document.querySelector('.page.active');

  if (document.hidden && currentPage?.id === 'dashboardPage') {
    overlay.classList.add('active');
  } else {
    overlay.classList.remove('active');
  }
});

// NOTIFICATION SYSTEM
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;

  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'success' ? '#00ff64' : type === 'error' ? '#ff5050' : '#c9fd06'};
    color: #0a0a0a;
    border-radius: 8px;
    font-weight: 600;
    font-size: 13px;
    z-index: 10000;
    animation: slideInRight 0.3s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// LOAD PRICE DATA (REAL) with retry logic
let priceDataRetryCount = 0;
const MAX_RETRIES = 3;

async function loadPriceData() {
  const tickerContainer = document.getElementById('priceTickerContainer');
  if (!tickerContainer) return;

  try {
    const topCoins = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const allTickers = await response.json();

    const prices = allTickers
      .filter(ticker => topCoins.includes(ticker.symbol))
      .map(ticker => ({
        symbol: ticker.symbol.replace('USDT', ''),
        price: parseFloat(ticker.lastPrice).toFixed(2),
        change: ticker.priceChangePercent,
        positive: parseFloat(ticker.priceChangePercent) > 0
      }));

    if (prices.length > 0) {
      tickerContainer.innerHTML = prices.map(p => `
        <div class="ticker-item">
          <div class="ticker-symbol">${p.symbol}</div>
          <div class="ticker-price">$${parseFloat(p.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="ticker-change ${p.positive ? 'positive' : 'negative'}">${p.positive ? '+' : ''}${parseFloat(p.change).toFixed(2)}%</div>
        </div>
      `).join('');

      priceDataRetryCount = 0;
    }

    setTimeout(() => {
      loadPriceData();
    }, 30000);
  } catch (error) {
    console.error('Error loading price data:', error);

    if (priceDataRetryCount < MAX_RETRIES) {
      priceDataRetryCount++;
      tickerContainer.innerHTML = `<div style="padding: 12px; color: var(--text-muted);">Loading market data... (${priceDataRetryCount}/${MAX_RETRIES})</div>`;
      setTimeout(() => loadPriceData(), 2000 * priceDataRetryCount);
    } else {
      tickerContainer.innerHTML = '<div style="padding: 12px; color: var(--text-muted);">Unable to load price data. Retrying in 30s...</div>';
      setTimeout(() => {
        priceDataRetryCount = 0;
        loadPriceData();
      }, 30000);
    }
  }
}


// CONFETTI CELEBRATION
function createConfetti() {
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.animationDelay = Math.random() * 3 + 's';
    confetti.style.background = ['#c9fd06', '#00ff64', '#ff9600', '#ffc800'][Math.floor(Math.random() * 4)];
    document.body.appendChild(confetti);

    setTimeout(() => {
      confetti.classList.add('active');
    }, 10);

    setTimeout(() => {
      confetti.remove();
    }, 3000);
  }
}

// BROWSER NOTIFICATIONS
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendBrowserNotification(title, message, icon = 'assets/logo-128.png') {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body: message,
      icon: icon,
      badge: icon,
      tag: 'rav-trader',
      requireInteraction: false
    });
  }
}

// ACHIEVEMENTS SYSTEM
const achievements = [
  { id: 'first_trade', icon: '🎯', name: 'First Trade', description: 'Complete your first trade', unlocked: false },
  { id: 'profitable_day', icon: '💰', name: 'Profitable Day', description: 'End a day with profit', unlocked: false },
  { id: 'win_streak_3', icon: '🔥', name: 'Hot Streak', description: 'Win 3 trades in a row', unlocked: false },
  { id: 'win_streak_5', icon: '⚡', name: 'Unstoppable', description: 'Win 5 trades in a row', unlocked: false },
  { id: 'trades_10', icon: '📈', name: 'Getting Started', description: 'Complete 10 trades', unlocked: false },
  { id: 'trades_50', icon: '🎖️', name: 'Experienced Trader', description: 'Complete 50 trades', unlocked: false },
  { id: 'profit_1000', icon: '💎', name: 'Big Winner', description: 'Earn $1000 profit', unlocked: false },
  { id: 'perfect_week', icon: '👑', name: 'Perfect Week', description: 'Win all trades in a week', unlocked: false }
];

function loadAchievements() {
  const container = document.getElementById('achievementsContainer');
  if (!container) return;

  const savedAchievements = JSON.parse(localStorage.getItem('ravTraderAchievements') || '[]');

  container.innerHTML = achievements.map(achievement => {
    const isUnlocked = savedAchievements.includes(achievement.id);
    return `
      <div class="achievement-card ${!isUnlocked ? 'locked' : ''}">
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-name">${achievement.name}</div>
        <div class="achievement-description">${achievement.description}</div>
        ${isUnlocked ? '<div class="achievement-badge">Unlocked</div>' : ''}
      </div>
    `;
  }).join('');
}

function unlockAchievement(achievementId) {
  const savedAchievements = JSON.parse(localStorage.getItem('ravTraderAchievements') || '[]');

  if (!savedAchievements.includes(achievementId)) {
    savedAchievements.push(achievementId);
    localStorage.setItem('ravTraderAchievements', JSON.stringify(savedAchievements));

    const achievement = achievements.find(a => a.id === achievementId);
    if (achievement) {
      showNotification(`Achievement Unlocked: ${achievement.name}!`, 'success');
      sendBrowserNotification('Achievement Unlocked!', `${achievement.icon} ${achievement.name}: ${achievement.description}`);
      createConfetti();
    }

    loadAchievements();
  }
}

function checkAchievements() {
  const history = JSON.parse(localStorage.getItem('ravTraderSignalHistory') || '[]');
  const approvedTrades = history.filter(h => h.status === 'approved');

  if (approvedTrades.length >= 1) unlockAchievement('first_trade');
  if (approvedTrades.length >= 10) unlockAchievement('trades_10');
  if (approvedTrades.length >= 50) unlockAchievement('trades_50');
}

function showWelcome() {
  const overlay = document.getElementById('onboardingOverlay');
  if (overlay) {
    overlay.classList.add('active');
  }
}

function hideWelcome() {
  const overlay = document.getElementById('onboardingOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

function dismissWelcome() {
  localStorage.setItem('ravTraderWelcomeDismissed', 'true');
  hideWelcome();
}

window.dismissWelcome = dismissWelcome;

// Listen for new signals from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'NEW_SIGNALS') {
    loadRealSignals();
    showNotification(`${request.signals.length} new signal(s) detected!`, 'success');
  }
});

window.addEventListener('load', async () => {
  requestNotificationPermission();
  loadAchievements();

  const welcomeDismissed = localStorage.getItem('ravTraderWelcomeDismissed');
  const currentUser = await getCurrentUser();
  const currentPage = document.querySelector('.page.active');

  if (!welcomeDismissed && currentPage?.id === 'dashboardPage' && currentUser) {
    const accountCreatedRecently = localStorage.getItem('ravTraderAccountCreated');
    const now = Date.now();

    if (accountCreatedRecently && (now - parseInt(accountCreatedRecently)) < 60000) {
      setTimeout(() => {
        showWelcome();
      }, 500);
      localStorage.removeItem('ravTraderAccountCreated');
    }
  }
});

// Add notification animations to document
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOutRight {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// TERMS AND CONDITIONS MODAL HANDLERS
const termsModal = document.getElementById('termsModal');
const showTermsLink = document.getElementById('showTermsLink');
const closeTermsModal = document.getElementById('closeTermsModal');
const acceptTermsBtn = document.getElementById('acceptTermsBtn');
const declineTermsBtn = document.getElementById('declineTermsBtn');
const termsCheckbox = document.getElementById('termsCheckbox');

if (showTermsLink) {
  showTermsLink.addEventListener('click', (e) => {
    e.preventDefault();
    termsModal.classList.add('active');
  });
}

if (closeTermsModal) {
  closeTermsModal.addEventListener('click', () => {
    termsModal.classList.remove('active');
  });
}

if (acceptTermsBtn) {
  acceptTermsBtn.addEventListener('click', () => {
    termsCheckbox.checked = true;
    termsModal.classList.remove('active');
    showNotification('Terms and Conditions accepted', 'success');
  });
}

if (declineTermsBtn) {
  declineTermsBtn.addEventListener('click', () => {
    termsCheckbox.checked = false;
    termsModal.classList.remove('active');
    showNotification('You must accept the Terms and Conditions to register', 'info');
  });
}

if (termsModal) {
  termsModal.addEventListener('click', (e) => {
    if (e.target === termsModal) {
      termsModal.classList.remove('active');
    }
  });
}

// CASHBACK COINS SELECTION AND CAMPAIGNS MODAL
const CASHBACK_ELIGIBLE_PAIRS = [
  'ADA/USDT', 'ADAUSDT',
  'AVAX/USDT', 'AVAXUSDT',
  'BNB/USDT', 'BNBUSDT',
  'BTC/USDT', 'BTCUSDT',
  'DOGE/USDT', 'DOGEUSDT',
  'ETH/USDT', 'ETHUSDT',
  'TRX/USDT', 'TRXUSDT',
  'LINK/USDT', 'LINKUSDT',
  'SOL/USDT', 'SOLUSDT',
  'XRP/USDT', 'XRPUSDT'
];

function isCashbackEligible(pair) {
  const normalizedPair = pair.toUpperCase().replace('/', '');
  return CASHBACK_ELIGIBLE_PAIRS.some(eligible => {
    const normalizedEligible = eligible.toUpperCase().replace('/', '');
    return normalizedPair === normalizedEligible;
  });
}

function getSelectedCoinType() {
  const selectedRadio = document.querySelector('input[name="coinType"]:checked');
  return selectedRadio ? selectedRadio.value : 'cashback';
}

function saveCoinTypePreference(coinType) {
  localStorage.setItem('ravTraderCoinType', coinType);
}

function loadCoinTypePreference() {
  const saved = localStorage.getItem('ravTraderCoinType');
  if (saved) {
    const radio = document.querySelector(`input[name="coinType"][value="${saved}"]`);
    if (radio) {
      radio.checked = true;
    }
  }
}

document.querySelectorAll('input[name="coinType"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const coinType = e.target.value;
    saveCoinTypePreference(coinType);

    if (coinType === 'cashback') {
      showNotification('Showing 20% Cashback eligible coins only', 'success');
    } else {
      showNotification('Showing all available coins', 'info');
    }

    loadRealSignals();
  });
});

const cashbackInfoBtn = document.getElementById('cashbackInfoBtn');
const campaignsModal = document.getElementById('campaignsModal');
const closeCampaignsModal = document.getElementById('closeCampaignsModal');

if (cashbackInfoBtn) {
  cashbackInfoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (campaignsModal) {
      campaignsModal.classList.add('active');
    }
  });
}

if (closeCampaignsModal) {
  closeCampaignsModal.addEventListener('click', () => {
    if (campaignsModal) {
      campaignsModal.classList.remove('active');
    }
  });
}

if (campaignsModal) {
  campaignsModal.addEventListener('click', (e) => {
    if (e.target === campaignsModal) {
      campaignsModal.classList.remove('active');
    }
  });
}

window.addEventListener('load', () => {
  loadCoinTypePreference();
});

// TRADING MODE TOGGLE
document.querySelectorAll('.mode-option').forEach(option => {
  option.addEventListener('click', async () => {
    const mode = option.dataset.mode;

    document.querySelectorAll('.mode-option').forEach(o => o.classList.remove('active'));
    option.classList.add('active');

    const apiConfigSection = document.getElementById('apiConfigSection');
    const modeNoteText = document.getElementById('modeNoteText');

    if (mode === 'manual') {
      apiConfigSection.classList.add('hidden');
      modeNoteText.textContent = 'Manual mode allows you to track positions without API credentials';
    } else {
      apiConfigSection.classList.remove('hidden');
      modeNoteText.textContent = 'Auto mode executes trades automatically using your Darkex API';
    }

    const result = await updateUserSettings({ trading_mode: mode });

    if (result.success) {
      showNotification(`Trading mode set to ${mode}`, 'success');
    }
  });
});

async function loadTradingMode() {
  try {
    const settings = await getUserSettings();
    const tradingMode = settings?.trading_mode || 'manual';

    console.log('Loading trading mode:', tradingMode);
    console.log('User settings:', settings);

    const apiConfigSection = document.getElementById('apiConfigSection');
    const modeNoteText = document.getElementById('modeNoteText');

    document.querySelectorAll('.mode-option').forEach(option => {
      if (option.dataset.mode === tradingMode) {
        option.classList.add('active');
      } else {
        option.classList.remove('active');
      }
    });

    if (tradingMode === 'manual') {
      apiConfigSection.classList.add('hidden');
      if (modeNoteText) {
        modeNoteText.textContent = 'Manual mode allows you to track positions without API credentials';
      }
    } else {
      apiConfigSection.classList.remove('hidden');
      if (modeNoteText) {
        modeNoteText.textContent = 'Auto mode executes trades automatically using your Darkex API';
      }
    }

    console.log('Trading mode loaded successfully');
  } catch (error) {
    console.error('Error loading trading mode:', error);
  }
}

window.addEventListener('load', () => {
  loadTradingMode();
});

window.debugRAVTrader = async function() {
  console.log('=== RAV Trader Debug Info ===');
  const currentUser = await getCurrentUser();
  console.log('Current User:', currentUser);

  const settings = await getUserSettings();
  console.log('User Settings:', settings);
  console.log('Trading Mode:', settings?.trading_mode || 'NOT SET (defaulting to manual)');

  const modal = document.getElementById('positionEntryModal');
  console.log('Position Entry Modal exists:', !!modal);

  const activePositions = await getActivePositions();
  console.log('Active Positions:', activePositions.length);

  console.log('=== End Debug Info ===');
  console.log('To test the modal manually, run: testModal()');
};

window.testModal = function() {
  const testSignal = {
    id: 'test_123',
    pair: 'BTC/USDT',
    type: 'LONG',
    entry: 61250,
    takeProfit: 61800,
    stopLoss: 60500
  };

  console.log('Testing modal with signal:', testSignal);
  showPositionEntryModal(testSignal);
};
