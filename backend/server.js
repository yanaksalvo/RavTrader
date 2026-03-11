const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('./db');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ravtrader_super_secret_key_123';

app.use(cors());
app.use(bodyParser.json());

// --- Email Setup (Ethereal testing service) ---
let transporter;
nodemailer.createTestAccount((err, account) => {
    if (err) {
        console.error('Failed to create a testing account. ' + err.message);
        return process.exit(1);
    }

    console.log('Credentials obtained, listening on the web server...');
    // Create a SMTP transporter object
    transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: {
            user: account.user,
            pass: account.pass
        }
    });
});


// ============================================
//               AUTH ENDPOINTS
// ============================================

// Register User
app.post('/api/auth/register', async (req, res) => {
    const { username, email, darkex_uid, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ success: false, error: 'Username, email and password are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1d' });

        db.run(`INSERT INTO users (username, email, darkex_uid, password, verification_token) VALUES (?, ?, ?, ?, ?)`,
            [username, email, darkex_uid, hashedPassword, verificationToken],
            async function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ success: false, error: 'Username or email already exists' });
                    }
                    return res.status(500).json({ success: false, error: 'Database error' });
                }

                // Send Verification Email
                const verificationUrl = `http://localhost:${PORT}/api/auth/verify?token=${verificationToken}`;

                let message = {
                    from: 'RavTrader <no-reply@ravtrader.com>',
                    to: email,
                    subject: 'Verify your RavTrader Account',
                    text: `Please verify your email by clicking the following link: ${verificationUrl}`,
                    html: `<p>Please verify your email by clicking the following link:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p>`
                };

                transporter.sendMail(message, (err, info) => {
                    if (err) {
                        console.log('Error occurred. ' + err.message);
                        return process.exit(1);
                    }
                    console.log('Message sent: %s', info.messageId);
                    // Preview only available when sending through an Ethereal account
                    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
                });

                res.status(201).json({
                    success: true,
                    message: 'User registered. Please check the console for the Ethereal email verification link (placeholder for real email).'
                });
            });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Verify Email
app.get('/api/auth/verify', (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send('Token is required');
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(400).send('Invalid or expired token');
        }

        db.run(`UPDATE users SET email_verified = 1, verification_token = NULL WHERE email = ? AND verification_token = ?`,
            [decoded.email, token],
            function (err) {
                if (err) return res.status(500).send('Database error');
                if (this.changes === 0) return res.status(400).send('Invalid token or already verified');

                res.send('<h1>Email Verified Successfully!</h1><p>You can now log in to the RavTrader extension.</p>');
            });
    });
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
        return res.status(400).json({ success: false, error: 'Email/Username and password are required' });
    }

    db.get(`SELECT * FROM users WHERE email = ? OR username = ?`, [emailOrUsername, emailOrUsername], async (err, user) => {
        if (err) return res.status(500).json({ success: false, error: 'Database error' });
        if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

        if (!user.email_verified) return res.status(403).json({ success: false, error: 'Please verify your email first' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ success: false, error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                darkex_uid: user.darkex_uid
            }
        });
    });
});

// Middleware to authenticate requests
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(' ')[1];

        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                return res.sendStatus(403);
            }
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

// ============================================
//               SIGNAL ENDPOINTS
// ============================================

// Python Bot Posts New Signal
app.post('/api/signals', (req, res) => {
    const { id, pair, symbol, type, entry, takeProfit, stopLoss, rsi, priceChange, volatility, confidence, timestamp, status } = req.body;

    if (!id || !pair || !type || !entry) {
        return res.status(400).json({ success: false, error: "Missing required signal fields" });
    }

    db.run(
        `INSERT INTO signals (id, pair, symbol, type, entry, takeProfit, stopLoss, rsi, priceChange, volatility, confidence, timestamp, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, pair, symbol || pair, type, entry, takeProfit, stopLoss, rsi, priceChange, volatility, confidence, timestamp || Date.now(), status || 'pending'],
        function (err) {
            if (err) {
                console.error("Error inserting signal", err);
                return res.status(500).json({ success: false, error: 'Database error' });
            }
            res.status(201).json({ success: true, message: 'Signal added' });
        }
    );
});

// Chrome Extension Fetches Signals
app.get('/api/signals', authenticateJWT, (req, res) => {
    const limit = parseInt(req.query.limit) || 50;

    db.all(`SELECT * FROM signals ORDER BY timestamp DESC LIMIT ?`, [limit], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: 'Database error' });

        // Parse numbers that might come back as strings/different types
        const signals = rows.map(r => ({
            ...r,
            rsi: r.rsi.toFixed(2),
            priceChange: parseFloat(r.priceChange).toFixed(2),
            confidence: r.confidence || 0
        }));

        res.json({ success: true, signals });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
