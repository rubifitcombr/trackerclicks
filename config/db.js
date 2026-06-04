const { Pool } = require('pg');
const { hashPassword } = require('../utils/auth');

// Suporta DATABASE_URL (Supabase/Railway) ou variáveis individuais (Hostinger/local)
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432'),
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME     || 'vyria_tracker',
      }
);

// Shim de compatibilidade: converte placeholders ? → $1,$2... e retorna [rows]
// para manter a mesma API do mysql2 no resto do código.
pool.execute = async (sql, params = []) => {
  let i = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++i}`);
  const result = await pool.query(pgSql, params);
  return [result.rows];
};

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS usuarios (
    id         SERIAL PRIMARY KEY,
    email      VARCHAR(255) NOT NULL UNIQUE,
    senha_hash TEXT         NOT NULL,
    criado_em  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wa_cliques (
    id             SERIAL PRIMARY KEY,
    campanha       VARCHAR(100),
    tipo           VARCHAR(20)  DEFAULT 'whatsapp'
                   CHECK (tipo IN ('whatsapp','site','menu','trial','preco','suporte')),
    origem         VARCHAR(20)  DEFAULT 'direto'
                   CHECK (origem IN ('meta_ads','organico','email','reativacao','direto')),
    url_destino    TEXT,
    ip_anonimizado VARCHAR(20),
    user_agent     VARCHAR(255),
    utm_source     VARCHAR(100),
    utm_medium     VARCHAR(100),
    utm_campaign   VARCHAR(100),
    criado_em      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_wa_campanha ON wa_cliques (campanha);
  CREATE INDEX IF NOT EXISTS idx_wa_tipo     ON wa_cliques (tipo);
  CREATE INDEX IF NOT EXISTS idx_wa_origem   ON wa_cliques (origem);
  CREATE INDEX IF NOT EXISTS idx_wa_criado   ON wa_cliques (criado_em);

  CREATE TABLE IF NOT EXISTS url_curtas (
    id          SERIAL PRIMARY KEY,
    codigo      VARCHAR(20)  NOT NULL UNIQUE,
    url_destino TEXT         NOT NULL,
    campanha    VARCHAR(100),
    tipo        VARCHAR(20)  DEFAULT 'whatsapp'
                CHECK (tipo IN ('whatsapp','site','menu','trial','preco','suporte')),
    origem      VARCHAR(20)  DEFAULT 'direto'
                CHECK (origem IN ('meta_ads','organico','email','reativacao','direto')),
    criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_url_codigo ON url_curtas (codigo);
`;

pool.connect()
  .then(async client => {
    console.log('[DB] Conexão PostgreSQL estabelecida com sucesso.');
    try {
      await client.query(CREATE_TABLES);
      console.log('[DB] Tabelas verificadas/criadas com sucesso.');

      // Seed do usuário admin se a tabela estiver vazia
      const { rowCount } = await client.query('SELECT 1 FROM usuarios LIMIT 1');
      if (rowCount === 0) {
        const email    = process.env.ADMIN_EMAIL    || 'admin@vyria.com';
        const password = process.env.ADMIN_PASSWORD || 'admin123';
        await client.query(
          'INSERT INTO usuarios (email, senha_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [email, hashPassword(password)]
        );
        console.log(`[DB] Usuário admin criado: ${email}`);
      }
    } finally {
      client.release();
    }
  })
  .catch(err => {
    console.error('[DB] Falha ao conectar:', err.code || err.message || JSON.stringify(err));
    console.error('[DB] Verifique DATABASE_URL (ou DB_HOST/USER/PASSWORD/NAME) no .env');
  });

module.exports = pool;
