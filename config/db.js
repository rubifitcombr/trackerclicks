const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'vyria_tracker',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '-03:00',
  // Retorna DATE/DATETIME como strings em vez de objetos Date do JS,
  // evitando erros de tipo nas camadas de apresentação.
  dateStrings: true,
});

pool.getConnection()
  .then(async conn => {
    console.log('[DB] Conexão MySQL estabelecida com sucesso.');

    // Garante que as tabelas existam sem precisar rodar migration manualmente
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS wa_cliques (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        campanha       VARCHAR(100),
        tipo           ENUM('whatsapp','site','menu','trial','preco','suporte') DEFAULT 'whatsapp',
        origem         ENUM('meta_ads','organico','email','reativacao','direto') DEFAULT 'direto',
        url_destino    TEXT,
        ip_anonimizado VARCHAR(20),
        user_agent     VARCHAR(255),
        utm_source     VARCHAR(100),
        utm_medium     VARCHAR(100),
        utm_campaign   VARCHAR(100),
        criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_campanha (campanha),
        INDEX idx_tipo     (tipo),
        INDEX idx_origem   (origem),
        INDEX idx_criado   (criado_em)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS url_curtas (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        codigo      VARCHAR(20)  NOT NULL UNIQUE,
        url_destino TEXT         NOT NULL,
        campanha    VARCHAR(100),
        tipo        ENUM('whatsapp','site','menu','trial','preco','suporte') DEFAULT 'whatsapp',
        origem      ENUM('meta_ads','organico','email','reativacao','direto') DEFAULT 'direto',
        criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_codigo (codigo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('[DB] Tabelas verificadas/criadas com sucesso.');
    conn.release();
  })
  .catch(err => {
    console.error('[DB] Falha ao conectar ao MySQL:', err.code || err.message || JSON.stringify(err));
    console.error('[DB] Verifique as variáveis DB_HOST, DB_USER, DB_PASSWORD e DB_NAME no .env');
  });

module.exports = pool;
