class SignalGenerator {
  constructor() {
    this.binanceAPI = new BinanceAPI();
    this.lastSignalTime = new Map();
    this.signalCooldown = 30 * 60 * 1000;
  }

  async analyzeMarket(symbols, settings) {
    const signals = [];

    const rsiLongThreshold = settings?.rsiLongThreshold || 40;
    const rsiShortThreshold = settings?.rsiShortThreshold || 60;

    for (const symbol of symbols) {
      try {
        const ticker = await this.binanceAPI.fetch24hTicker(symbol);

        if (!ticker) continue;

        const klines = await this.binanceAPI.fetchKlines(symbol, '15m', 20);

        if (!klines || klines.length < 15) {
          continue;
        }

        const rsi = calculateRSI(klines, 14);

        if (rsi === null) {
          continue;
        }

        let signalType = null;

        if (rsi < rsiLongThreshold) {
          signalType = 'LONG';
        } else if (rsi > rsiShortThreshold) {
          signalType = 'SHORT';
        }

        if (signalType) {
          const lastSignal = this.lastSignalTime.get(symbol);
          if (lastSignal && Date.now() - lastSignal < this.signalCooldown) {
            continue;
          }

          const levels = calculateEntryLevels(ticker.currentPrice, signalType);
          const volatility = getVolatilityLevel(ticker.priceChangePercent);

          const signal = {
            id: `${symbol}_${Date.now()}`,
            pair: symbol.replace('USDT', '/USDT'),
            symbol: symbol,
            type: signalType,
            entry: levels.entry,
            takeProfit: levels.takeProfit,
            stopLoss: levels.stopLoss,
            rsi: rsi.toFixed(2),
            priceChange: ticker.priceChangePercent.toFixed(2),
            volatility: volatility,
            timestamp: Date.now(),
            status: 'pending'
          };

          signals.push(signal);
          this.lastSignalTime.set(symbol, Date.now());
        }
      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
      }

      await this.delay(100);
    }

    return signals;
  }

  async generateSignals() {
    try {
      // Get the locally stored token (if user is logged in) to authenticate the request
      const { ravTraderToken } = await chrome.storage.local.get(['ravTraderToken']);

      const headers = {
        'Content-Type': 'application/json'
      };

      if (ravTraderToken) {
        headers['Authorization'] = `Bearer ${ravTraderToken}`;
      }

      // Fetch from your live backend!
      const response = await fetch(`${CONFIG.API_URL}/signals?limit=50`, {
        headers: headers
      });

      if (!response.ok) {
        console.error('Failed to fetch real signals from backend:', response.statusText);
        return [];
      }

      const data = await response.json();

      if (data.success && data.signals) {
        const signals = data.signals;

        // Save to chrome storage for the frontend to consume
        await chrome.storage.local.set({ ravTraderSignals: signals });

        // Provide a quick notification for NEW signals (we can track the last saved ID)
        // For simplicity right now, the bot logic already handles UI updates via storage listener.

        return signals;
      }

      return [];
    } catch (error) {
      console.error('Error generating/fetching signals from API:', error);
      return [];
    }
  }

  sendNotification(signal) {
    const title = `${signal.type} Signal: ${signal.pair}`;
    const message = `Entry: $${formatPrice(signal.entry)} | RSI: ${signal.rsi} | Change: ${signal.priceChange}%`;

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/logo-128.png',
      title: title,
      message: message,
      priority: 2,
      requireInteraction: true
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
