/* Waiver page — builds the Tally form embed from server-provided config.
 *
 * The form ID comes from window.RZ_CONFIG (served by /js/site-config.js, which
 * reads TALLY_WAIVER_FORM_ID on the server). Tally's embed.js handles dynamic
 * iframe height so the long waiver never gets cut off or double-scrolls.
 * If nothing is configured, we show a friendly "not set up yet" panel instead
 * of a broken iframe. */
(function initWaiver() {
  var cfg = (window.RZ_CONFIG && window.RZ_CONFIG.tally) || {};
  var raw = (cfg.waiverFormId || '').trim();

  var embed = document.getElementById('waiver-embed');
  var loading = document.getElementById('waiver-loading');
  var unconfigured = document.getElementById('waiver-unconfigured');
  var fallback = document.getElementById('waiver-fallback');
  var directLink = document.getElementById('waiver-direct-link');

  // Accept either a bare form ID ("wA1bCd") or a full Tally URL pasted in.
  function extractFormId(v) {
    if (!v) return '';
    var m = v.match(/tally\.so\/(?:r|embed)\/([A-Za-z0-9]+)/);
    if (m) return m[1];
    return v.replace(/^https?:\/\/[^/]+\//, '').replace(/[/?#].*$/, '');
  }

  var formId = extractFormId(raw);

  if (!formId) {
    if (embed) embed.style.display = 'none';
    if (unconfigured) unconfigured.style.display = 'block';
    return;
  }

  // Direct-link fallback (shown if the iframe is blocked or slow).
  var publicUrl = 'https://tally.so/r/' + encodeURIComponent(formId);
  if (directLink) directLink.href = publicUrl;

  // Build the Tally iframe. dynamicHeight lets embed.js size it to the content.
  var src =
    'https://tally.so/embed/' +
    encodeURIComponent(formId) +
    '?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1';

  var iframe = document.createElement('iframe');
  iframe.setAttribute('data-tally-src', src);
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('width', '100%');
  iframe.setAttribute('height', '600'); // placeholder until embed.js resizes it
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('marginheight', '0');
  iframe.setAttribute('marginwidth', '0');
  iframe.setAttribute('title', 'The Repair Zone liability waiver');
  iframe.style.border = 'none';
  iframe.addEventListener('load', function () {
    if (loading) loading.style.display = 'none';
    if (fallback) fallback.style.display = 'block';
  });

  if (loading) loading.style.display = 'block';
  embed.appendChild(iframe);

  // Load Tally's embed script AFTER the iframe exists so it initializes it.
  // If it's already present (e.g. back/forward cache), just re-scan.
  if (window.Tally && typeof window.Tally.loadEmbeds === 'function') {
    window.Tally.loadEmbeds();
  } else {
    var s = document.createElement('script');
    s.src = 'https://tally.so/widgets/embed.js';
    s.onload = function () {
      if (window.Tally && typeof window.Tally.loadEmbeds === 'function') {
        window.Tally.loadEmbeds();
      }
    };
    s.onerror = function () {
      // Script blocked/offline: show the loaded iframe's own controls + link.
      if (loading) loading.style.display = 'none';
      if (fallback) fallback.style.display = 'block';
    };
    document.body.appendChild(s);
  }
})();
