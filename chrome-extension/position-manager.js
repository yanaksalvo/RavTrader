let currentSignalForPosition = null;
let currentSignalCard = null;
let priceUpdateInterval = null;
const PRICE_UPDATE_INTERVAL = 15000;

function calculateROI(entryPrice, currentPrice, type) {
  const entry = parseFloat(entryPrice);
  const current = parseFloat(currentPrice);

  if (type === 'LONG') {
    return ((current - entry) / entry) * 100;
  } else {
    return ((entry - current) / entry) * 100;
  }
}

function formatDuration(startTime) {
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now - start;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

async function showPositionEntryModal(signal, signalCard = null) {
  try {
    console.log('showPositionEntryModal called with signal:', signal);

    currentSignalForPosition = signal;
    currentSignalCard = signalCard;

    const modal = document.getElementById('positionEntryModal');
    if (!modal) {
      console.error('Position entry modal not found in DOM');
      showNotification('Error: Modal not found', 'error');
      return;
    }

    const entryPriceInput = document.getElementById('positionEntryPrice');
    const takeProfitInput = document.getElementById('positionTakeProfit');
    const stopLossInput = document.getElementById('positionStopLoss');
    const notesInput = document.getElementById('positionNotes');
    const confirmCheckbox = document.getElementById('positionConfirmCheckbox');

    if (!entryPriceInput || !takeProfitInput || !stopLossInput) {
      console.error('Modal input fields not found');
      showNotification('Error: Modal inputs not found', 'error');
      return;
    }

    entryPriceInput.value = parseFloat(signal.entry || signal.entry_price).toFixed(8);
    takeProfitInput.value = parseFloat(signal.takeProfit || signal.take_profit).toFixed(8);
    stopLossInput.value = parseFloat(signal.stopLoss || signal.stop_loss).toFixed(8);
    notesInput.value = '';
    confirmCheckbox.checked = false;

    console.log('Adding active class to modal');
    modal.classList.add('active');

    console.log('Modal should now be visible');
  } catch (error) {
    console.error('Error in showPositionEntryModal:', error);
    showNotification(`Error opening modal: ${error.message}`, 'error');
  }
}

function closePositionEntryModal() {
  const modal = document.getElementById('positionEntryModal');
  modal.classList.remove('active');
  currentSignalForPosition = null;
  currentSignalCard = null;
}

async function confirmPositionEntry() {
  const entryPrice = document.getElementById('positionEntryPrice').value;
  const takeProfit = document.getElementById('positionTakeProfit').value;
  const stopLoss = document.getElementById('positionStopLoss').value;
  const notes = document.getElementById('positionNotes').value;
  const confirmed = document.getElementById('positionConfirmCheckbox').checked;

  if (!confirmed) {
    showNotification('Please confirm that you have entered the position', 'error');
    return;
  }

  if (!entryPrice || !takeProfit || !stopLoss) {
    showNotification('Please fill in all required fields', 'error');
    return;
  }

  const positionData = {
    signal_id: currentSignalForPosition.id || null,
    pair: currentSignalForPosition.pair,
    type: currentSignalForPosition.type,
    entry_price: parseFloat(entryPrice),
    take_profit: parseFloat(takeProfit),
    stop_loss: parseFloat(stopLoss),
    notes: notes,
  };

  const result = await createPosition(positionData);

  if (result.success) {
    await markSignalAsConsumed(currentSignalForPosition.id);

    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'SIGNAL_APPROVED',
          signalId: currentSignalForPosition.id
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            console.log('Signal removed from Chrome storage:', response);
            resolve(response);
          }
        });
      });
    } catch (error) {
      console.error('Error removing signal from storage:', error);
    }

    await saveSignalHistory({
      ...currentSignalForPosition,
      status: 'approved',
      timestamp: new Date().toISOString()
    });

    removeSignalFromUI(currentSignalForPosition.id);

    closePositionEntryModal();
    showNotification(`${positionData.pair} position added to tracking!`, 'success');
    createConfetti();

    loadActivePositions();
    checkAchievements();
  } else {
    showNotification(`Failed to create position: ${result.error}`, 'error');
  }
}

function removeSignalFromUI(signalId) {
  let signalCard = null;

  if (signalId) {
    signalCard = document.querySelector(`.signal-card[data-signal-id="${signalId}"]`);
  }

  if (!signalCard && currentSignalCard) {
    signalCard = currentSignalCard;
  }

  if (signalCard) {
    signalCard.style.transition = 'all 0.3s ease';
    signalCard.style.opacity = '0';
    signalCard.style.transform = 'scale(0.9)';

    setTimeout(() => {
      signalCard.remove();

      const signalsContainer = document.getElementById('signalsContainer');
      if (signalsContainer && signalsContainer.children.length === 0) {
        document.getElementById('emptyState').style.display = 'flex';
        signalsContainer.style.display = 'none';
      }
    }, 300);
  }

  currentSignalCard = null;
}

function createPositionCard(position, isHistory = false) {
  const card = document.createElement('div');
  card.className = `position-card ${isHistory ? 'closed' : ''}`;
  card.dataset.positionId = position.id;

  const roi = position.roi || 0;
  const roiClass = roi > 0 ? 'positive' : roi < 0 ? 'negative' : 'neutral';
  const duration = formatDuration(position.entry_timestamp);

  const statusText = {
    'active': 'Active',
    'closed': 'Closed',
    'tp_hit': 'TP Hit',
    'sl_hit': 'SL Hit'
  }[position.status] || position.status;

  card.innerHTML = `
    <div class="position-header">
      <div class="position-pair">${position.pair}</div>
      <div class="position-type ${position.type.toLowerCase()}">${position.type}</div>
    </div>

    <div class="position-meta">
      <div class="position-duration">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span>${duration}</span>
      </div>
      <div class="position-status-badge ${position.status}">${statusText}</div>
    </div>

    <div class="position-prices">
      <div class="position-price-item">
        <div class="position-price-label">Entry</div>
        <div class="position-price-value">$${parseFloat(position.entry_price).toFixed(4)}</div>
      </div>
      <div class="position-price-item">
        <div class="position-price-label">Current</div>
        <div class="position-price-value">$${parseFloat(position.current_price || position.entry_price).toFixed(4)}</div>
      </div>
      <div class="position-price-item">
        <div class="position-price-label">TP</div>
        <div class="position-price-value">$${parseFloat(position.take_profit).toFixed(4)}</div>
      </div>
      <div class="position-price-item">
        <div class="position-price-label">SL</div>
        <div class="position-price-value">$${parseFloat(position.stop_loss).toFixed(4)}</div>
      </div>
    </div>

    <div class="position-roi">
      <div class="price-update-indicator"></div>
      <div class="position-roi-label">ROI</div>
      <div class="position-roi-value ${roiClass}">${roi > 0 ? '+' : ''}${roi.toFixed(2)}%</div>
    </div>

    ${!isHistory ? `
      <div class="position-actions">
        <button class="btn-close-position" data-position-id="${position.id}">Close Position</button>
      </div>
    ` : position.notes ? `
      <div style="margin-top: 12px; padding: 10px; background: var(--bg-dark); border-radius: 6px; font-size: 11px; color: var(--text-secondary);">
        <strong>Notes:</strong> ${position.notes}
      </div>
    ` : ''}
  `;

  return card;
}

async function loadActivePositions() {
  const container = document.getElementById('activePositionsContainer');
  const emptyState = document.getElementById('emptyPositionsState');

  const positions = await getActivePositions();

  if (positions.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  container.style.display = 'grid';
  emptyState.style.display = 'none';
  container.innerHTML = '';

  positions.forEach((position, index) => {
    setTimeout(() => {
      const card = createPositionCard(position, false);
      container.appendChild(card);
      card.style.animation = 'fadeInUp 0.4s ease forwards';
    }, index * 100);
  });

  startPriceUpdates();
}

async function loadPositionHistory(statusFilter = 'all') {
  const container = document.getElementById('positionHistoryContainer');
  const emptyState = document.getElementById('emptyHistoryState');

  const positions = await getPositionHistory(50, statusFilter);

  if (positions.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  container.style.display = 'grid';
  emptyState.style.display = 'none';
  container.innerHTML = '';

  positions.forEach((position, index) => {
    setTimeout(() => {
      const card = createPositionCard(position, true);
      container.appendChild(card);
      card.style.animation = 'fadeInUp 0.4s ease forwards';
    }, index * 50);
  });
}

let currentPositionToClose = null;

async function handleClosePosition(positionId) {
  console.log('handleClosePosition called with ID:', positionId);

  const positions = await getActivePositions();
  const position = positions.find(p => p.id === positionId);

  if (!position) {
    console.error('Position not found:', positionId);
    showNotification('Position not found', 'error');
    return;
  }

  console.log('Position found:', position);
  currentPositionToClose = position;
  showClosePositionModal(position);
}

function showClosePositionModal(position) {
  console.log('showClosePositionModal called with:', position);

  const modal = document.getElementById('closePositionModal');
  const pairDisplay = document.getElementById('closePositionPair');
  const typeDisplay = document.getElementById('closePositionType');
  const entryDisplay = document.getElementById('closePositionEntry');
  const closePriceInput = document.getElementById('closePositionPrice');
  const closeNotesInput = document.getElementById('closePositionNotes');

  if (!modal) {
    console.error('closePositionModal not found in DOM');
    showNotification('Error: Modal not found', 'error');
    return;
  }

  if (!pairDisplay || !typeDisplay || !entryDisplay || !closePriceInput || !closeNotesInput) {
    console.error('Modal elements not found');
    showNotification('Error: Modal elements not found', 'error');
    return;
  }

  pairDisplay.textContent = position.pair;
  typeDisplay.textContent = position.type;
  typeDisplay.className = `position-type ${position.type.toLowerCase()}`;
  entryDisplay.textContent = `$${parseFloat(position.entry_price).toFixed(4)}`;
  closePriceInput.value = parseFloat(position.current_price || position.entry_price).toFixed(8);
  closeNotesInput.value = '';

  console.log('Adding active class to modal');
  modal.classList.add('active');
  console.log('Modal should now be visible');
}

function closeClosePositionModal() {
  const modal = document.getElementById('closePositionModal');
  modal.classList.remove('active');
  currentPositionToClose = null;
}

async function confirmClosePosition() {
  if (!currentPositionToClose) {
    return;
  }

  const closePriceInput = document.getElementById('closePositionPrice');
  const closeNotesInput = document.getElementById('closePositionNotes');
  const closeReasonSelect = document.getElementById('closePositionReason');

  const closePrice = parseFloat(closePriceInput.value);
  const closeNotes = closeNotesInput.value;
  const closeReason = closeReasonSelect.value;

  if (!closePrice || closePrice <= 0) {
    showNotification('Please enter a valid close price', 'error');
    return;
  }

  const finalROI = calculateROI(currentPositionToClose.entry_price, closePrice, currentPositionToClose.type);

  const updateData = {
    current_price: closePrice,
    roi: finalROI,
    status: closeReason,
    close_timestamp: new Date().toISOString()
  };

  if (closeNotes) {
    updateData.notes = closeNotes;
  }

  const result = await updatePosition(currentPositionToClose.id, updateData);

  if (result.success) {
    closeClosePositionModal();

    const roiText = finalROI > 0 ? `+${finalROI.toFixed(2)}%` : `${finalROI.toFixed(2)}%`;
    const notificationType = finalROI > 0 ? 'success' : 'error';
    showNotification(`Position closed with ${roiText} ROI`, notificationType);

    if (finalROI > 0) {
      createConfetti();
    }

    loadActivePositions();
    loadPositionHistory();
  } else {
    showNotification(`Failed to close position: ${result.error}`, 'error');
  }
}

async function updatePositionPrices() {
  const activePositions = await getActivePositions();

  if (activePositions.length === 0) {
    return;
  }

  const symbols = [...new Set(activePositions.map(p => {
    const pair = p.pair.replace('/', '');
    return pair.endsWith('USDT') ? pair : pair + 'USDT';
  }))];

  try {
    const pricePromises = symbols.map(async symbol => {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      const data = await response.json();
      return { symbol, price: parseFloat(data.price) };
    });

    const prices = await Promise.all(pricePromises);
    const priceMap = Object.fromEntries(prices.map(p => [p.symbol, p.price]));

    for (const position of activePositions) {
      const symbol = position.pair.replace('/', '').endsWith('USDT')
        ? position.pair.replace('/', '')
        : position.pair.replace('/', '') + 'USDT';

      const currentPrice = priceMap[symbol];
      if (!currentPrice) continue;

      const roi = calculateROI(position.entry_price, currentPrice, position.type);

      await updatePositionPrice(position.id, currentPrice, roi);

      const shouldCloseTP = position.type === 'LONG'
        ? currentPrice >= position.take_profit
        : currentPrice <= position.take_profit;

      const shouldCloseSL = position.type === 'LONG'
        ? currentPrice <= position.stop_loss
        : currentPrice >= position.stop_loss;

      if (shouldCloseTP) {
        await closePosition(position.id, 'tp_hit');
        showNotification(`🎯 ${position.pair} Take Profit hit! ROI: ${roi > 0 ? '+' : ''}${roi.toFixed(2)}%`, 'success');
        sendBrowserNotification('Take Profit Hit!', `${position.pair} position closed with ${roi.toFixed(2)}% profit!`);
        createConfetti();
      } else if (shouldCloseSL) {
        await closePosition(position.id, 'sl_hit');
        showNotification(`⚠️ ${position.pair} Stop Loss hit. ROI: ${roi.toFixed(2)}%`, 'error');
        sendBrowserNotification('Stop Loss Hit', `${position.pair} position closed at stop loss.`);
      }

      const card = document.querySelector(`.position-card[data-position-id="${position.id}"]`);
      if (card) {
        const roiElement = card.querySelector('.position-roi-value');
        const currentPriceElement = card.querySelectorAll('.position-price-value')[1];
        const indicator = card.querySelector('.price-update-indicator');

        if (roiElement) {
          roiElement.textContent = `${roi > 0 ? '+' : ''}${roi.toFixed(2)}%`;
          roiElement.className = `position-roi-value ${roi > 0 ? 'positive' : roi < 0 ? 'negative' : 'neutral'}`;
        }

        if (currentPriceElement) {
          currentPriceElement.textContent = `$${currentPrice.toFixed(4)}`;
        }

        if (indicator) {
          indicator.classList.add('active');
          setTimeout(() => indicator.classList.remove('active'), 1000);
        }
      }
    }

    loadPositionHistory();

  } catch (error) {
    console.error('Error updating position prices:', error);
  }
}

function startPriceUpdates() {
  if (priceUpdateInterval) {
    clearInterval(priceUpdateInterval);
  }

  updatePositionPrices();

  priceUpdateInterval = setInterval(() => {
    updatePositionPrices();
  }, PRICE_UPDATE_INTERVAL);
}

function stopPriceUpdates() {
  if (priceUpdateInterval) {
    clearInterval(priceUpdateInterval);
    priceUpdateInterval = null;
  }
}

// Event delegation for dynamically created close position buttons
document.addEventListener('click', async (e) => {
  const closeBtn = e.target.closest('.btn-close-position');
  if (closeBtn) {
    console.log('Close position button clicked');
    const positionId = closeBtn.getAttribute('data-position-id');
    if (positionId) {
      console.log('Position ID from button:', positionId);
      await handleClosePosition(positionId);
    } else {
      console.error('No position ID found on button');
    }
  }
});

const closeModalBtn = document.getElementById('closePositionModalBtn');
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', closePositionEntryModal);
  console.log('Close position modal button listener attached');
} else {
  console.warn('closePositionModalBtn not found');
}

const cancelBtn = document.getElementById('cancelPositionBtn');
if (cancelBtn) {
  cancelBtn.addEventListener('click', closePositionEntryModal);
  console.log('Cancel position button listener attached');
} else {
  console.warn('cancelPositionBtn not found');
}

const confirmBtn = document.getElementById('confirmPositionBtn');
if (confirmBtn) {
  confirmBtn.addEventListener('click', confirmPositionEntry);
  console.log('Confirm position button listener attached');
} else {
  console.warn('confirmPositionBtn not found');
}

document.getElementById('closePositionModalClose')?.addEventListener('click', closeClosePositionModal);
document.getElementById('cancelClosePositionBtn')?.addEventListener('click', closeClosePositionModal);
document.getElementById('confirmClosePositionBtn')?.addEventListener('click', confirmClosePosition);

document.getElementById('positionEntryModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'positionEntryModal') {
    closePositionEntryModal();
  }
});

document.getElementById('closePositionModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'closePositionModal') {
    closeClosePositionModal();
  }
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const filter = btn.dataset.filter;
    loadPositionHistory(filter);
  });
});
