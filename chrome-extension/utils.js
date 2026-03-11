function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return rsi;
}

function calculate24hChange(currentPrice, price24hAgo) {
  if (!price24hAgo || price24hAgo === 0) {
    return 0;
  }
  return ((currentPrice - price24hAgo) / price24hAgo) * 100;
}

function calculateEntryLevels(currentPrice, type, leverage = 25) {
  const entry = currentPrice;
  let takeProfit, stopLoss;

  if (type === 'LONG') {
    takeProfit = currentPrice * 1.04;
    stopLoss = currentPrice * 0.98;
  } else {
    takeProfit = currentPrice * 0.96;
    stopLoss = currentPrice * 1.02;
  }

  return {
    entry: entry.toFixed(8),
    takeProfit: takeProfit.toFixed(8),
    stopLoss: stopLoss.toFixed(8)
  };
}

function getVolatilityLevel(priceChangePercent) {
  const absChange = Math.abs(priceChangePercent);
  if (absChange >= 5) return 'high';
  if (absChange >= 2) return 'medium';
  return 'low';
}

const DARKEX_FUTURES_PAIRS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'ADAUSDT',
  'DOGEUSDT',
  'MATICUSDT',
  'DOTUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'ATOMUSDT',
  'LTCUSDT',
  'UNIUSDT',
  'ETCUSDT',
  'FILUSDT',
  'APTUSDT',
  'ARBUSDT',
  'OPUSDT',
  'INJUSDT'
];

function formatPrice(price, decimals = 2) {
  return parseFloat(price).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
