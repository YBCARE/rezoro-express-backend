const crypto = require('crypto');
const session = require('express-session');

const SESSION_COOKIE_NAME = 'rezoro_admin_sid';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 10;

// In-memory session secret fallback: sessions won't survive a server restart if
// SESSION_SECRET isn't set, but that's an acceptable tradeoff for a single-admin
// internal tool rather than a hard requirement to configure.
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('Warning: SESSION_SECRET is not set. Using a random secret generated at startup — admin sessions will not survive a server restart. Set SESSION_SECRET in your environment for persistent sessions.');
}
if (!process.env.ADMIN_PASSWORD) {
  console.warn('Warning: ADMIN_PASSWORD is not set. The admin panel will reject all login attempts until it is configured.');
}

// Very small in-memory brute-force throttle, keyed by IP. Resets on restart; that's fine —
// the goal is just to make password guessing meaningfully slower, not to be a full WAF.
const loginAttempts = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { windowStart: now, count: 0 });
    return false;
  }
  return entry.count >= MAX_ATTEMPTS_PER_WINDOW;
}

function recordLoginAttempt(ip) {
  const entry = loginAttempts.get(ip);
  if (entry) entry.count += 1;
}

function constantTimeEquals(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length to avoid leaking length via timing.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function configureSession(app) {
  app.set('trust proxy', 1); // Render sits behind a proxy; needed for secure cookies to work.
  app.use(session({
    name: SESSION_COOKIE_NAME,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  }));
}

function requireAdminAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

function handleLogin(req, res) {
  const ip = req.ip;
  const { password } = req.body || {};

  if (isRateLimited(ip)) {
    return res.status(429).send(renderLoginError('Too many attempts. Try again in a few minutes.'));
  }
  recordLoginAttempt(ip);

  // Trimmed on both sides: a stray trailing space/newline in an env var (very easy to
  // introduce via copy-paste into a dashboard field) or in what's typed shouldn't be able
  // to cause a silent, hard-to-diagnose login failure.
  const configuredPassword = (process.env.ADMIN_PASSWORD || '').trim();
  const submittedPassword = (password || '').trim();

  if (!configuredPassword || !submittedPassword || !constantTimeEquals(submittedPassword, configuredPassword)) {
    return res.status(401).send(renderLoginError('Incorrect password.'));
  }

  req.session.regenerate((err) => {
    if (err) {
      console.error('Error regenerating session on login:', err);
      return res.status(500).send(renderLoginError('Something went wrong. Please try again.'));
    }
    req.session.isAdmin = true;
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Error saving session on login:', saveErr);
        return res.status(500).send(renderLoginError('Something went wrong. Please try again.'));
      }
      res.redirect('/admin');
    });
  });
}

function handleLogout(req, res) {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE_NAME);
    res.redirect('/admin/login');
  });
}

// Lazily required to avoid a circular require with adminViews.js at module-load time.
function renderLoginError(message) {
  const { renderLoginPage } = require('./adminViews');
  return renderLoginPage({ error: message });
}

module.exports = { configureSession, requireAdminAuth, handleLogin, handleLogout };
