-- Migration: criação da tabela de rastreamento de cliques
-- Projeto: Vyria Delivery Click Tracker
-- Execute: mysql -u root -p vyria_tracker < migrations/wa_cliques.sql

CREATE DATABASE IF NOT EXISTS vyria_tracker
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE vyria_tracker;

CREATE TABLE IF NOT EXISTS wa_cliques (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  campanha        VARCHAR(100),
  tipo            ENUM('whatsapp','site','menu','trial','preco','suporte') DEFAULT 'whatsapp',
  origem          ENUM('meta_ads','organico','email','reativacao','direto') DEFAULT 'direto',
  url_destino     TEXT,
  ip_anonimizado  VARCHAR(20),
  user_agent      VARCHAR(255),
  utm_source      VARCHAR(100),
  utm_medium      VARCHAR(100),
  utm_campaign    VARCHAR(100),
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_campanha (campanha),
  INDEX idx_tipo     (tipo),
  INDEX idx_origem   (origem),
  INDEX idx_criado   (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de URLs curtas (encurtador rastreado)
CREATE TABLE IF NOT EXISTS url_curtas (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  codigo      VARCHAR(20)  NOT NULL UNIQUE,
  url_destino TEXT         NOT NULL,
  campanha    VARCHAR(100),
  tipo        ENUM('whatsapp','site','menu','trial','preco','suporte') DEFAULT 'whatsapp',
  origem      ENUM('meta_ads','organico','email','reativacao','direto') DEFAULT 'direto',
  criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
