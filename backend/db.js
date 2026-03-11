const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'ravtrader.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            darkex_uid TEXT,
            password TEXT NOT NULL,
            email_verified BOOLEAN DEFAULT 0,
            verification_token TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Error creating users table', err);
        });

        // Signals table
        db.run(`CREATE TABLE IF NOT EXISTS signals (
            id TEXT PRIMARY KEY,
            pair TEXT NOT NULL,
            symbol TEXT NOT NULL,
            type TEXT NOT NULL,
            entry REAL NOT NULL,
            takeProfit REAL NOT NULL,
            stopLoss REAL NOT NULL,
            rsi REAL NOT NULL,
            priceChange REAL NOT NULL,
            volatility TEXT,
            confidence INTEGER,
            timestamp INTEGER NOT NULL,
            status TEXT DEFAULT 'pending'
        )`, (err) => {
            if (err) console.error('Error creating signals table', err);
        });
    }
});

module.exports = db;
