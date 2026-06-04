(function () {
  'use strict';

  // ─── Configuração ─────────────────────────────────────────────────────────────
  // Lê a URL base do atributo data-base da própria tag <script>.
  // Exemplo de uso no site:
  //   <script src="/vyria_tracker.js" data-base="https://seudominio.com.br"></script>
  // Se não informado, usa a origem da página atual.
  const scriptEl = document.currentScript ||
    document.querySelector('script[src*="vyria_tracker"]');

  const BASE_URL = (scriptEl && scriptEl.getAttribute('data-base'))
    ? scriptEl.getAttribute('data-base').replace(/\/$/, '')
    : window.location.origin;

  // Campanha padrão para links que não tenham campanha definida
  const CAMPANHA_DEFAULT = 'site-organico';

  // ─── Captura UTMs da URL atual ────────────────────────────────────────────────
  function getUtmOrigem() {
    const p = new URLSearchParams(window.location.search);
    const src = p.get('utm_source');
    const medium = p.get('utm_medium');
    if (!src) return 'organico';
    if (src.includes('meta') || src.includes('facebook') || src.includes('instagram')) return 'meta_ads';
    if (src.includes('email') || medium === 'email') return 'email';
    if (src.includes('reativ')) return 'reativacao';
    return 'organico';
  }

  function getUtmParams() {
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source:   p.get('utm_source')   || '',
      utm_medium:   p.get('utm_medium')   || '',
      utm_campaign: p.get('utm_campaign') || '',
    };
  }

  // ─── Construtores de URL de rastreio ──────────────────────────────────────────
  function buildTrackUrl(destino, campanha, tipo, origem) {
    const utms = getUtmParams();
    const params = new URLSearchParams({
      url:      destino,
      campanha: campanha || CAMPANHA_DEFAULT,
      tipo:     tipo     || 'site',
      origem:   origem   || getUtmOrigem(),
    });
    if (utms.utm_source)   params.set('utm_source',   utms.utm_source);
    if (utms.utm_medium)   params.set('utm_medium',   utms.utm_medium);
    if (utms.utm_campaign) params.set('utm_campaign', utms.utm_campaign);
    return BASE_URL + '/track?' + params.toString();
  }

  // ─── Detectores de tipo de link ───────────────────────────────────────────────
  function isWhatsApp(href) {
    return /wa\.me|whatsapp\.com\/send/i.test(href);
  }

  function isInternal(href, anchor) {
    try {
      const dest = new URL(href, window.location.origin);
      const current = new URL(window.location.origin);
      return dest.hostname === current.hostname ||
        dest.hostname === (scriptEl && scriptEl.getAttribute('data-base')
          ? new URL(BASE_URL).hostname : window.location.hostname);
    } catch (_) {
      // hrefs relativos são sempre internos
      return !href.startsWith('http');
    }
  }

  function inferTipo(href) {
    const h = href.toLowerCase();
    if (isWhatsApp(href))         return 'whatsapp';
    if (h.includes('/menu'))      return 'menu';
    if (h.includes('/trial') || h.includes('/teste')) return 'trial';
    if (h.includes('/preco') || h.includes('/plano')) return 'preco';
    if (h.includes('/suporte') || h.includes('/ajuda')) return 'suporte';
    return 'site';
  }

  // ─── Beacon para links internos ───────────────────────────────────────────────
  function beaconClique(href, campanha, tipo, origem) {
    const utms = getUtmParams();
    const data = new URLSearchParams({
      url:      href,
      campanha: campanha || CAMPANHA_DEFAULT,
      tipo:     tipo     || 'site',
      origem:   origem   || getUtmOrigem(),
      ...Object.fromEntries(
        Object.entries(utms).filter(([, v]) => v)
      ),
    });

    // sendBeacon é fire-and-forget — não bloqueia navegação
    if (navigator.sendBeacon) {
      navigator.sendBeacon(BASE_URL + '/track', data);
    } else {
      // Fallback silencioso com fetch keepalive
      fetch(BASE_URL + '/track?' + data.toString(), {
        method: 'GET',
        keepalive: true,
      }).catch(() => {});
    }
  }

  // ─── Reescrita e instrumentação dos links ─────────────────────────────────────
  function instrumentarLinks() {
    const anchors = document.querySelectorAll('a[href]');

    anchors.forEach(function (a) {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

      // Evita reprocessar links já reescritos por esta função
      if (a.dataset.vyriaTracked === '1') return;
      a.dataset.vyriaTracked = '1';

      // Lê atributos opcionais de customização diretamente no elemento:
      // data-campanha="minha-campanha" data-tipo="preco" data-origem="meta_ads"
      const campanha = a.dataset.campanha || CAMPANHA_DEFAULT;
      const tipo = a.dataset.tipo || inferTipo(href);
      const origem = a.dataset.origem || getUtmOrigem();

      if (isWhatsApp(href)) {
        // Reescreve o href para passar pelo redirect tracker
        a.setAttribute('href', buildTrackUrl(href, campanha, tipo, origem));

      } else if (isInternal(href, a)) {
        // Link interno: beacon assíncrono, não altera o href
        a.addEventListener('click', function () {
          beaconClique(href, campanha, tipo, origem);
        });

      }
      // Links externos não-WhatsApp: não rastreados por padrão
    });
  }

  // ─── Observa novos elementos adicionados ao DOM ───────────────────────────────
  // (útil para SPAs ou conteúdos carregados via JS/fetch após o DOMContentLoaded)
  function observarDOM() {
    if (!window.MutationObserver) return;
    const observer = new MutationObserver(function (mutations) {
      let shouldReinstrument = false;
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType === 1 && (n.tagName === 'A' || n.querySelector('a'))) {
            shouldReinstrument = true;
          }
        });
      });
      if (shouldReinstrument) instrumentarLinks();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Inicialização ────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      instrumentarLinks();
      observarDOM();
    });
  } else {
    // Já foi disparado (script carregado de forma assíncrona)
    instrumentarLinks();
    observarDOM();
  }

})();
