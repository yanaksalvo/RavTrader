# RAV Trader Chrome Extension - Installation Guide

## What's New in v2.0

This version includes major improvements:

- **Real-Time Signal Generation**: Automatically scans Darkex Futures pairs every 2 minutes
- **Smart Analysis**: Uses RSI (Relative Strength Index) and 24h price changes to generate signals
- **Signal Rules**:
  - LONG Signal: When price changes >2% UP and RSI < 30
  - SHORT Signal: When price changes >2% DOWN and RSI > 70
- **Live Price Data**: Real-time price ticker powered by Binance API
- **Optional API Keys**: Add your Darkex API keys in Settings when ready (not required to see signals)
- **Customizable Filters**: Adjust RSI thresholds and minimum price change requirements

## Installation Steps

1. **Download the Extension**
   - Extract `rav-trader-extension-v2.tar.gz` or use the `chrome-extension` folder

2. **Open Chrome Extensions Page**
   - Open Google Chrome
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)

3. **Load the Extension**
   - Click "Load unpacked"
   - Select the `chrome-extension` folder
   - The extension icon should appear in your toolbar

4. **First Time Setup**
   - Click the RAV Trader icon in your toolbar
   - Complete the login process with your Darkex credentials
   - You'll be taken directly to the dashboard

5. **Configure Settings (Optional)**
   - Go to Settings tab
   - Add your Darkex API keys if you want live trading (optional)
   - Adjust signal filters (RSI thresholds, minimum price change)
   - Set your risk management preferences

## How It Works

### Automatic Signal Scanning
- Background worker scans 20+ Darkex Futures pairs every 2 minutes
- Analyzes 24-hour price changes and RSI values
- Generates signals when conditions are met
- Sends browser notifications for new signals

### Signal Generation Rules
The extension uses this logic:
1. Check if coin's 24h price change is >= 2% (configurable)
2. Calculate RSI using last 14 periods (15-minute candles)
3. Generate LONG if price is up and RSI < 30
4. Generate SHORT if price is down and RSI > 70
5. Apply 30-minute cooldown per coin to avoid spam

### Monitored Pairs
- BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT
- XRPUSDT, ADAUSDT, DOGEUSDT, MATICUSDT
- DOTUSDT, AVAXUSDT, LINKUSDT, ATOMUSDT
- LTCUSDT, UNIUSDT, ETCUSDT, FILUSDT
- APTUSDT, ARBUSDT, OPUSDT, INJUSDT

## Settings Explained

### API Configuration
- **API Key**: Your Darkex API key (optional, for live trading)
- **Secret Key**: Your Darkex secret key (optional, for live trading)
- Leave empty to use demo mode

### Signal Filters
- **Minimum 24h Price Change**: Default 2% (only scan coins with this much movement)
- **RSI LONG Threshold**: Default 30 (generate LONG when RSI below this)
- **RSI SHORT Threshold**: Default 70 (generate SHORT when RSI above this)

### Risk Management
- **Leverage**: Choose 10x, 25x, 50x, or 100x
- **Maximum Daily Loss**: Stop trading if you lose this % in a day
- **Position Size**: % of balance to use per trade
- **Maximum Open Trades**: Max number of concurrent positions

## Troubleshooting

### No Signals Appearing
- Wait 2-3 minutes for first automatic scan
- Click "Scan Now" button to trigger manual scan
- Check if market conditions meet the signal criteria
- Markets with low volatility may not generate signals

### Price Ticker Not Loading
- Check your internet connection
- Extension needs permission to access api.binance.com
- Refresh the extension by closing and reopening

### Notifications Not Working
- Grant notification permissions when prompted
- Check Chrome notification settings
- Ensure notifications are enabled in the extension settings

## Data Sources

- **Price Data**: Binance Public API (free, no API key needed)
- **Technical Analysis**: RSI calculated using 15-minute candles
- **24h Statistics**: Real-time from Binance ticker endpoint

## Privacy & Security

- All data is stored locally in Chrome storage
- API keys are encrypted and never shared
- No external servers (except Binance public API for price data)
- Source code is open and transparent

## Support

For issues or questions:
- Check the README.md in the extension folder
- Review the signal generation logic in signal-generator.js
- Verify your settings match your trading strategy

## Version History

**v2.0** (Current)
- Real-time signal generation with RSI + price change analysis
- Binance API integration for live market data
- Customizable signal filters
- Optional API configuration
- Automatic background scanning every 2 minutes

**v1.0**
- Basic UI and demo signals
- Manual trading interface
