-- Migration: PostgreSQL (Supabase / Railway / Neon)
-- Execute no SQL Editor do Supabase ou psql

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
