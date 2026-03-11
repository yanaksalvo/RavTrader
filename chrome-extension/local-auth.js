const API_URL = CONFIG.API_URL;
const CURRENT_USER_KEY = 'ravTraderCurrentUser';
const USER_TOKEN_KEY = 'ravTraderToken';
const USER_SETTINGS_KEY = 'ravTraderUserSettings';

async function signUp(username, darkexUid, email, password) {
  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, darkex_uid: darkexUid, email, password })
    });

    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function signIn(emailOrUsername, password) {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsername, password })
    });

    const data = await response.json();

    if (data.success) {
      localStorage.setItem(USER_TOKEN_KEY, data.token);
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data.user));
    }

    return data;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function signOut() {
  try {
    localStorage.removeItem(USER_TOKEN_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getCurrentUser() {
  try {
    const userJson = localStorage.getItem(CURRENT_USER_KEY);
    if (!userJson) return null;

    return JSON.parse(userJson);
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

async function getUserSettings() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;

    const allSettings = JSON.parse(localStorage.getItem(USER_SETTINGS_KEY) || '{}');
    return allSettings[currentUser.id] || null;
  } catch (error) {
    console.error('Error getting user settings:', error);
    return null;
  }
}

async function updateUserSettings(settings) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const allSettings = JSON.parse(localStorage.getItem(USER_SETTINGS_KEY) || '{}');

    if (!allSettings[currentUser.id]) {
      allSettings[currentUser.id] = {};
    }

    allSettings[currentUser.id] = {
      ...allSettings[currentUser.id],
      ...settings
    };

    localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(allSettings));

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function saveSignalToHistory(signal) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const history = JSON.parse(localStorage.getItem('ravTraderSignalHistory') || '[]');
    history.unshift({
      ...signal,
      user_id: currentUser.id,
      id: 'signal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      created_at: new Date().toISOString()
    });

    localStorage.setItem('ravTraderSignalHistory', JSON.stringify(history.slice(0, 100)));

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getSignalHistory(limit = 50) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];

    const history = JSON.parse(localStorage.getItem('ravTraderSignalHistory') || '[]');
    return history.filter(s => s.user_id === currentUser.id).slice(0, limit);
  } catch (error) {
    console.error('Error getting signal history:', error);
    return [];
  }
}

async function createPosition(positionData) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const positions = JSON.parse(localStorage.getItem('ravTraderPositions') || '[]');
    const newPosition = {
      id: 'position_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      user_id: currentUser.id,
      signal_id: positionData.signal_id,
      pair: positionData.pair,
      type: positionData.type,
      entry_price: positionData.entry_price,
      take_profit: positionData.take_profit,
      stop_loss: positionData.stop_loss,
      current_price: positionData.entry_price,
      roi: 0,
      status: 'active',
      notes: positionData.notes || null,
      entry_timestamp: new Date().toISOString(),
      close_timestamp: null
    };

    positions.push(newPosition);
    localStorage.setItem('ravTraderPositions', JSON.stringify(positions));

    return { success: true, position: newPosition };
  } catch (error) {
    console.error('Error creating position:', error);
    return { success: false, error: error.message };
  }
}

async function getActivePositions() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];

    const positions = JSON.parse(localStorage.getItem('ravTraderPositions') || '[]');
    return positions
      .filter(p => p.user_id === currentUser.id && p.status === 'active')
      .sort((a, b) => new Date(b.entry_timestamp) - new Date(a.entry_timestamp));
  } catch (error) {
    console.error('Error getting active positions:', error);
    return [];
  }
}

async function getPositionHistory(limit = 50, statusFilter = null) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];

    const positions = JSON.parse(localStorage.getItem('ravTraderPositions') || '[]');
    let filtered = positions.filter(p =>
      p.user_id === currentUser.id &&
      ['closed', 'tp_hit', 'sl_hit'].includes(p.status)
    );

    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === statusFilter);
    }

    return filtered
      .sort((a, b) => new Date(b.close_timestamp) - new Date(a.close_timestamp))
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting position history:', error);
    return [];
  }
}

async function updatePosition(positionId, updates) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const positions = JSON.parse(localStorage.getItem('ravTraderPositions') || '[]');
    const index = positions.findIndex(p => p.id === positionId && p.user_id === currentUser.id);

    if (index === -1) {
      return { success: false, error: 'Position not found' };
    }

    positions[index] = { ...positions[index], ...updates };
    localStorage.setItem('ravTraderPositions', JSON.stringify(positions));

    return { success: true };
  } catch (error) {
    console.error('Error updating position:', error);
    return { success: false, error: error.message };
  }
}

async function closePosition(positionId, closeReason = 'closed') {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const positions = JSON.parse(localStorage.getItem('ravTraderPositions') || '[]');
    const index = positions.findIndex(p => p.id === positionId && p.user_id === currentUser.id);

    if (index === -1) {
      return { success: false, error: 'Position not found' };
    }

    positions[index].status = closeReason;
    positions[index].close_timestamp = new Date().toISOString();
    localStorage.setItem('ravTraderPositions', JSON.stringify(positions));

    return { success: true };
  } catch (error) {
    console.error('Error closing position:', error);
    return { success: false, error: error.message };
  }
}

async function updatePositionPrice(positionId, currentPrice, roi) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const positions = JSON.parse(localStorage.getItem('ravTraderPositions') || '[]');
    const index = positions.findIndex(p => p.id === positionId && p.user_id === currentUser.id);

    if (index === -1) {
      return { success: false, error: 'Position not found' };
    }

    positions[index].current_price = currentPrice;
    positions[index].roi = roi;
    localStorage.setItem('ravTraderPositions', JSON.stringify(positions));

    return { success: true };
  } catch (error) {
    console.error('Error updating position price:', error);
    return { success: false, error: error.message };
  }
}

async function markSignalAsConsumed(signalId) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const consumedSignals = JSON.parse(localStorage.getItem('ravTraderConsumedSignals') || '[]');

    if (!consumedSignals.find(s => s.signal_id === signalId)) {
      consumedSignals.push({
        signal_id: signalId,
        user_id: currentUser.id,
        consumed_at: new Date().toISOString()
      });

      localStorage.setItem('ravTraderConsumedSignals', JSON.stringify(consumedSignals));
    }

    return { success: true };
  } catch (error) {
    console.error('Error marking signal as consumed:', error);
    return { success: false, error: error.message };
  }
}

async function getConsumedSignalIds() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];

    const consumedSignals = JSON.parse(localStorage.getItem('ravTraderConsumedSignals') || '[]');
    return consumedSignals
      .filter(s => s.user_id === currentUser.id)
      .map(s => s.signal_id);
  } catch (error) {
    console.error('Error getting consumed signal IDs:', error);
    return [];
  }
}

async function removeSignalFromStorage(signalId) {
  try {
    return new Promise((resolve) => {
      chrome.storage.local.get(['ravTraderSignals'], (result) => {
        const signals = result.ravTraderSignals || [];
        const filtered = signals.filter(s => s.id !== signalId);

        chrome.storage.local.set({ ravTraderSignals: filtered }, () => {
          resolve({ success: true });
        });
      });
    });
  } catch (error) {
    console.error('Error removing signal from storage:', error);
    return { success: false, error: error.message };
  }
}
