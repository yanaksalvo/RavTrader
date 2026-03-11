const BINANCE_API_BASE = 'https://api.binance.com/api/v3';

class BinanceAPI {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 10000;
  }

  async fetchKlines(symbol, interval = '1m', limit = 100) {
    const cacheKey = `klines_${symbol}_${interval}_${limit}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const url = `${BINANCE_API_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }

      const data = await response.json();
      const closePrices = data.map(candle => parseFloat(candle[4]));

      this.cache.set(cacheKey, {
        data: closePrices,
        timestamp: Date.now()
      });

      return closePrices;
    } catch (error) {
      console.error('Error fetching klines:', error);
      return null;
    }
  }

  async fetch24hTicker(symbol) {
    const cacheKey = `ticker_${symbol}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const url = `${BINANCE_API_BASE}/ticker/24hr?symbol=${symbol}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }

      const data = await response.json();

      const tickerData = {
        symbol: data.symbol,
        currentPrice: parseFloat(data.lastPrice),
        priceChange: parseFloat(data.priceChange),
        priceChangePercent: parseFloat(data.priceChangePercent),
        highPrice: parseFloat(data.highPrice),
        lowPrice: parseFloat(data.lowPrice),
        volume: parseFloat(data.volume)
      };

      this.cache.set(cacheKey, {
        data: tickerData,
        timestamp: Date.now()
      });

      return tickerData;
    } catch (error) {
      console.error('Error fetching 24h ticker:', error);
      return null;
    }
  }

  async fetchAllTickers(symbols) {
    try {
      const url = `${BINANCE_API_BASE}/ticker/24hr`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }

      const data = await response.json();
      const filtered = data
        .filter(ticker => symbols.includes(ticker.symbol))
        .map(ticker => ({
          symbol: ticker.symbol,
          currentPrice: parseFloat(ticker.lastPrice),
          priceChange: parseFloat(ticker.priceChange),
          priceChangePercent: parseFloat(ticker.priceChangePercent),
          highPrice: parseFloat(ticker.highPrice),
          lowPrice: parseFloat(ticker.lowPrice),
          volume: parseFloat(ticker.volume)
        }));

      return filtered;
    } catch (error) {
      console.error('Error fetching all tickers:', error);
      return [];
    }
  }

  async getCurrentPrice(symbol) {
    try {
      const url = `${BINANCE_API_BASE}/ticker/price?symbol=${symbol}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }

      const data = await response.json();
      return parseFloat(data.price);
    } catch (error) {
      console.error('Error fetching current price:', error);
      return null;
    }
  }

  clearCache() {
    this.cache.clear();
  }
}
