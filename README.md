# Vyria Delivery — Click Tracker

Rastreador de cliques para links WhatsApp e demais links do site da Vyria Delivery.

## Stack

- Node.js + Express
- MySQL 8+
- HTML/JS puro (sem framework)

---

## Instalação

```bash
npm install
```

### 1. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite .env com suas credenciais do MySQL
```

### 2. Criar o banco e a tabela

```bash
mysql -u root -p < migrations/wa_cliques.sql
```

Ou execute o SQL manualmente no seu cliente MySQL.

### 3. Iniciar o servidor

```bash
npm start
# ou, para desenvolvimento com hot-reload:
npm run dev
```

---

## Estrutura de arquivos

```
├── app.js                    # Entry point Express
├── config/
│   └── db.js                 # Pool de conexão MySQL
├── routes/
│   └── tracker.js            # Todos os endpoints do tracker
├── views/
│   └── painel_cliques.html   # Painel HTML standalone
├── public/
│   └── vyria_tracker.js      # Script de injeção no site
├── migrations/
│   └── wa_cliques.sql        # Migration da tabela
├── .env                      # Variáveis de ambiente (não versionar)
└── .env.example              # Template das variáveis
```

---

## Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/track` | Não | Registra clique e redireciona |
| `GET` | `/api/metricas/cliques` | Basic Auth | JSON de métricas |
| `GET` | `/painel/cliques` | Basic Auth | Painel HTML |

### GET /track

```
/track?url=<URL_DESTINO>&campanha=<NOME>&tipo=<TIPO>&origem=<ORIGEM>
```

Parâmetros:

| Param | Obrigatório | Valores aceitos |
|-------|-------------|-----------------|
| `url` | Sim | Qualquer URL |
| `campanha` | Não | Texto livre (max 100 chars) |
| `tipo` | Não | `whatsapp` `site` `menu` `trial` `preco` `suporte` |
| `origem` | Não | `meta_ads` `organico` `email` `reativacao` `direto` |

### GET /api/metricas/cliques

Query params opcionais: `tipo`, `origem`, `de` (YYYY-MM-DD), `ate` (YYYY-MM-DD), `formato=csv`

Retorna:
```json
{
  "total": 1234,
  "por_campanha": [{ "campanha": "...", "tipo": "...", "total": 10, "ultimo_clique": "..." }],
  "por_tipo": [{ "tipo": "whatsapp", "total": 900 }],
  "por_origem": [{ "origem": "meta_ads", "total": 400 }],
  "por_dia": [{ "data": "2025-06-01", "total": 42 }]
}
```

---

## Script de injeção no site

Adicione **uma única linha** no `<head>` do site da Vyria:

```html
<script src="https://seudominio.com.br/vyria_tracker.js"
        data-base="https://seudominio.com.br"></script>
```

O script vai automaticamente:

- Reescrever todos os links `wa.me` para passarem pelo `/track`
- Registrar cliques em links internos via `sendBeacon` (sem redirecionar)
- Capturar UTMs da URL atual e repassar como parâmetro `origem`
- Observar novos elementos adicionados ao DOM (SPAs)

### Customização por elemento

Você pode sobrescrever campanha/tipo/origem em qualquer `<a>` usando `data-*`:

```html
<a href="https://wa.me/5562999999999"
   data-campanha="botao-hero"
   data-tipo="whatsapp"
   data-origem="organico">
  Falar no WhatsApp
</a>
```

---

## Painel

Acesse: `http://localhost:3000/painel/cliques`

Credenciais padrão (configure em `.env`):
- **Usuário:** `vyria`
- **Senha:** `tracker@2025`

---

## Segurança / LGPD

- IPs são anonimizados (apenas os 3 primeiros octetos são salvos)
- Nenhum cookie é utilizado
- Rastreio por sessão de clique, sem persistência no cliente
- `/track` é público (sem auth) — necessário para funcionar como href
- `/painel/cliques` e `/api/metricas/cliques` exigem Basic Auth
