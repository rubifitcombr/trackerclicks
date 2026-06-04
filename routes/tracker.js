const express = require('express');
const router = express.Router();
const path = require('path');
const crypto = require('crypto');
const db = require('../config/db');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function anonymizeIp(ip) {
  if (!ip) return 'unknown';
  // Remove ::ffff: prefix (IPv4-mapped IPv6)
  const clean = ip.replace(/^::ffff:/, '');
  const parts = clean.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  // IPv6: keep first 3 groups
  const v6parts = clean.split(':');
  return v6parts.slice(0, 3).join(':') + ':xxxx';
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

const VALID_TIPOS = ['whatsapp', 'site', 'menu', 'trial', 'preco', 'suporte'];
const VALID_ORIGENS = ['meta_ads', 'organico', 'email', 'reativacao', 'direto'];

function sanitizeEnum(value, valid, fallback) {
  return valid.includes(value) ? value : fallback;
}

// ─── Auth por cookie de sessão ────────────────────────────────────────────────

function makeSessionToken(user, pass) {
  const secret = process.env.SESSION_SECRET || 'vyria-tracker-secret';
  return crypto.createHmac('sha256', secret).update(user + ':' + pass).digest('hex');
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const found = raw.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

function requireAuth(req, res, next) {
  const user = process.env.PAINEL_USER || 'vyria';
  const pass = process.env.PAINEL_PASS || 'tracker@2025';
  const validToken = makeSessionToken(user, pass);

  // Verifica cookie de sessão
  if (getCookie(req, 'vyria_session') === validToken) return next();

  // Verifica Basic Auth (compatibilidade com chamadas fetch do painel)
  const authHeader = req.headers['authorization'] || '';
  const b64 = authHeader.replace(/^Basic\s+/i, '');
  try {
    const [u, p] = Buffer.from(b64, 'base64').toString('utf8').split(':');
    if (u === user && p === pass) return next();
  } catch (_) {}

  // Redireciona para a página de login
  const next_ = encodeURIComponent(req.originalUrl);
  return res.redirect(`/login?next=${next_}`);
}

// ─── Rotas de Login ───────────────────────────────────────────────────────────

router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/login.html'));
});

router.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  const user = process.env.PAINEL_USER || 'vyria';
  const pass = process.env.PAINEL_PASS || 'tracker@2025';
  const { username, password, next: nextUrl } = req.body;

  if (username === user && password === pass) {
    const token = makeSessionToken(user, pass);
    const cookieOpts = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=86400';
    res.setHeader('Set-Cookie', `vyria_session=${token}; ${cookieOpts}`);
    return res.redirect(nextUrl || '/painel/cliques');
  }

  const safeNext = encodeURIComponent(nextUrl || '/painel/cliques');
  return res.redirect(`/login?erro=1&next=${safeNext}`);
});

router.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'vyria_session=; Path=/; HttpOnly; Max-Age=0');
  res.redirect('/login');
});

// ─── Raiz — redireciona para o painel ────────────────────────────────────────
router.get('/', (req, res) => res.redirect('/painel/cliques'));

// ─── FUNCIONALIDADE 1 — Redirect tracker ──────────────────────────────────────

router.get('/track', async (req, res) => {
  const destino = req.query.url || '';
  const campanha = (req.query.campanha || 'sem-campanha').slice(0, 100);
  const tipo = sanitizeEnum(req.query.tipo, VALID_TIPOS, 'whatsapp');
  const origem = sanitizeEnum(req.query.origem, VALID_ORIGENS, 'direto');
  const utmSource = (req.query.utm_source || '').slice(0, 100);
  const utmMedium = (req.query.utm_medium || '').slice(0, 100);
  const utmCampaign = (req.query.utm_campaign || '').slice(0, 100);

  if (!destino) {
    return res.status(400).send('Parâmetro "url" é obrigatório.');
  }

  // Registrar no banco de forma assíncrona — nunca bloqueia o redirect
  const ip = anonymizeIp(getClientIp(req));
  const ua = (req.headers['user-agent'] || '').slice(0, 255);

  db.execute(
    `INSERT INTO wa_cliques
      (campanha, tipo, origem, url_destino, ip_anonimizado, user_agent, utm_source, utm_medium, utm_campaign)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [campanha, tipo, origem, destino.slice(0, 2048), ip, ua, utmSource, utmMedium, utmCampaign]
  ).catch(err => console.error('[Tracker] Erro ao salvar clique:', err.message));

  // Redireciona imediatamente — independente do resultado do banco
  return res.redirect(302, destino);
});

// ─── FUNCIONALIDADE 4 — API de métricas ───────────────────────────────────────

router.get('/api/metricas/cliques', requireAuth, async (req, res) => {
  const { tipo, origem, de, ate, formato } = req.query;

  const where = [];
  const params = [];

  if (tipo && VALID_TIPOS.includes(tipo)) {
    where.push('tipo = ?');
    params.push(tipo);
  }
  if (origem && VALID_ORIGENS.includes(origem)) {
    where.push('origem = ?');
    params.push(origem);
  }
  if (de) {
    where.push('criado_em >= ?');
    params.push(de + ' 00:00:00');
  }
  if (ate) {
    where.push('criado_em <= ?');
    params.push(ate + ' 23:59:59');
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM wa_cliques ${whereClause}`,
      params
    );

    const [porCampanha] = await db.execute(
      `SELECT campanha, tipo, COUNT(*) AS total, MAX(criado_em) AS ultimo_clique
       FROM wa_cliques ${whereClause}
       GROUP BY campanha, tipo
       ORDER BY total DESC
       LIMIT 100`,
      params
    );

    const [porTipo] = await db.execute(
      `SELECT tipo, COUNT(*) AS total FROM wa_cliques ${whereClause}
       GROUP BY tipo ORDER BY total DESC`,
      params
    );

    const [porOrigem] = await db.execute(
      `SELECT origem, COUNT(*) AS total FROM wa_cliques ${whereClause}
       GROUP BY origem ORDER BY total DESC`,
      params
    );

    // Últimos 30 dias — remove filtros de data mas mantém tipo/origem
    const where30 = [];
    const dias30Params = [];
    if (tipo && VALID_TIPOS.includes(tipo))     { where30.push('tipo = ?');   dias30Params.push(tipo); }
    if (origem && VALID_ORIGENS.includes(origem)) { where30.push('origem = ?'); dias30Params.push(origem); }
    where30.push("criado_em >= CURRENT_DATE - INTERVAL '30 days'");
    const where30Clause = 'WHERE ' + where30.join(' AND ');

    const [porDia] = await db.execute(
      `SELECT TO_CHAR(criado_em::date, 'YYYY-MM-DD') AS data, COUNT(*) AS total
       FROM wa_cliques
       ${where30Clause}
       GROUP BY criado_em::date
       ORDER BY data ASC`,
      dias30Params
    );

    if (formato === 'csv') {
      const rows = [
        'campanha,tipo,origem,url_destino,ip_anonimizado,criado_em',
        ...(await db.execute(
          `SELECT campanha, tipo, origem, url_destino, ip_anonimizado, criado_em
           FROM wa_cliques ${whereClause} ORDER BY criado_em DESC LIMIT 5000`,
          params
        ))[0].map(r =>
          [r.campanha, r.tipo, r.origem, `"${(r.url_destino || '').replace(/"/g, '""')}"`, r.ip_anonimizado, r.criado_em]
            .join(',')
        ),
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="cliques.csv"');
      return res.send('\uFEFF' + rows.join('\r\n'));
    }

    return res.json({
      total,
      por_campanha: porCampanha,
      por_tipo: porTipo,
      por_origem: porOrigem,
      por_dia: porDia,
    });
  } catch (err) {
    console.error('[Métricas] Erro:', err.code || err.message || err);
    return res.status(500).json({ erro: 'Erro interno ao consultar métricas.', detalhe: err.code || err.message });
  }
});

// ─── Encurtador de links ──────────────────────────────────────────────────────

// POST /api/url-curta  { url, campanha, tipo, origem, codigo? }
router.post('/api/url-curta', requireAuth, express.json(), async (req, res) => {
  const { url: destino, campanha, tipo, origem, codigo: codigoSugerido } = req.body || {};

  if (!destino) return res.status(400).json({ erro: 'Campo "url" é obrigatório.' });

  const tipoVal   = sanitizeEnum(tipo,   VALID_TIPOS,   'whatsapp');
  const origemVal = sanitizeEnum(origem, VALID_ORIGENS, 'direto');
  const campanhaVal = (campanha || 'sem-campanha').slice(0, 100);

  // Gera código: usa o sugerido (slug) ou gera aleatório de 6 chars
  let codigo = (codigoSugerido || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 20);

  if (!codigo) {
    codigo = crypto.randomBytes(4).toString('base64url').slice(0, 6);
  }

  try {
    // Tenta inserir; se código já existe, gera um novo aleatório
    let tentativas = 0;
    while (tentativas < 5) {
      try {
        await db.execute(
          `INSERT INTO url_curtas (codigo, url_destino, campanha, tipo, origem)
           VALUES (?, ?, ?, ?, ?)`,
          [codigo, destino.slice(0, 2048), campanhaVal, tipoVal, origemVal]
        );
        break;
      } catch (e) {
        if (e.code === '23505' && !codigoSugerido) {
          codigo = crypto.randomBytes(4).toString('base64url').slice(0, 6);
          tentativas++;
        } else {
          throw e;
        }
      }
    }

    const base = (process.env.SHORT_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    // URL curta sem /r/ — fica https://vyriadelivery-consultores/abc123
    return res.json({ codigo, url_curta: `${base}/${codigo}` });
  } catch (err) {
    console.error('[URL Curta] Erro ao criar:', err.code || err.message || err);
    if (err.code === '23505') {
      return res.status(409).json({ erro: `O código "${codigo}" já está em uso. Escolha outro.` });
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '28P01') {
      return res.status(500).json({ erro: 'Banco de dados não conectado. Verifique as configurações no .env' });
    }
    return res.status(500).json({ erro: 'Erro interno ao criar URL curta.', detalhe: err.code || err.message });
  }
});

// GET /r/:codigo  — registra clique e redireciona
router.get('/r/:codigo', async (req, res) => {
  const { codigo } = req.params;

  let row;
  try {
    const [rows] = await db.execute(
      'SELECT url_destino, campanha, tipo, origem FROM url_curtas WHERE codigo = ? LIMIT 1',
      [codigo]
    );
    row = rows[0];
  } catch (err) {
    console.error('[URL Curta] Erro ao buscar código:', err.message);
  }

  if (!row) return res.status(404).send('Link não encontrado.');

  // Registra o clique de forma assíncrona (não bloqueia o redirect)
  const ip = anonymizeIp(getClientIp(req));
  const ua = (req.headers['user-agent'] || '').slice(0, 255);
  db.execute(
    `INSERT INTO wa_cliques
      (campanha, tipo, origem, url_destino, ip_anonimizado, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [row.campanha, row.tipo, row.origem, row.url_destino, ip, ua]
  ).catch(err => console.error('[URL Curta] Erro ao registrar clique:', err.message));

  return res.redirect(302, row.url_destino);
});

// ─── FUNCIONALIDADE 5 — Painel HTML ───────────────────────────────────────────

router.get('/painel/cliques', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../views/painel_cliques.html'));
});

// ─── Config pública (SHORT_BASE_URL para o painel) ────────────────────────────

router.get('/api/config', (req, res) => {
  res.json({
    short_base_url: (process.env.SHORT_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, ''),
    whatsapp_number: process.env.WHATSAPP_NUMBER || '',
  });
});

// ─── Catch-all: resolve código curto na raiz do domínio ──────────────────────
// Deve ficar SEMPRE como última rota.
// Aceita apenas códigos com letras, números e hífen (evita conflitos com rotas reais).

async function resolverCodigo(req, res) {
  const { codigo } = req.params;

  // Ignora paths que claramente não são códigos curtos
  if (!codigo || !/^[a-zA-Z0-9_-]{2,20}$/.test(codigo)) {
    return res.status(404).send('Página não encontrada.');
  }

  let row;
  try {
    const [rows] = await db.execute(
      'SELECT url_destino, campanha, tipo, origem FROM url_curtas WHERE codigo = ? LIMIT 1',
      [codigo]
    );
    row = rows[0];
  } catch (err) {
    console.error('[Catch-all] Erro ao buscar código:', err.message);
  }

  if (!row) return res.status(404).send('Link não encontrado.');

  const ip = anonymizeIp(getClientIp(req));
  const ua = (req.headers['user-agent'] || '').slice(0, 255);
  db.execute(
    `INSERT INTO wa_cliques (campanha, tipo, origem, url_destino, ip_anonimizado, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [row.campanha, row.tipo, row.origem, row.url_destino, ip, ua]
  ).catch(err => console.error('[Catch-all] Erro ao registrar clique:', err.message));

  return res.redirect(302, row.url_destino);
}

router.get('/r/:codigo', resolverCodigo);   // compatibilidade com links antigos
router.get('/:codigo',   resolverCodigo);   // rota limpa: dominio.com/abc123

module.exports = router;
