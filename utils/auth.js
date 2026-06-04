const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const hashVerify = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashVerify, 'hex'));
  } catch (_) {
    return false;
  }
}

function makeSessionToken(userId, email) {
  const secret = process.env.SESSION_SECRET || 'vyria-tracker-secret';
  return crypto.createHmac('sha256', secret).update(`${userId}:${email}`).digest('hex');
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const found = raw.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

module.exports = { hashPassword, verifyPassword, makeSessionToken, getCookie };
