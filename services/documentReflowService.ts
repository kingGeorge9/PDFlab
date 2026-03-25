/**
 * Document Reflow Service — FULLY OFFLINE
 * Generates self-contained reflow HTML that runs entirely inside the WebView.
 * PDF text extraction uses pdf.js (CDN-cached).
 * DOCX conversion uses Mammoth.js (CDN-cached, same as the original viewer).
 * No backend server required.
 */
import type {
    ReaderSettings,
    ReflowResponse,
} from "@/src/types/document-viewer.types";
import * as FileSystem from "expo-file-system/legacy";

// ============================================================================
// THEME PALETTE (mirrors backend reflowService)
// ============================================================================
const THEMES: Record<
  string,
  { bg: string; text: string; link: string; border: string }
> = {
  light: { bg: "#ffffff", text: "#1a1a1a", link: "#0066cc", border: "#e0e0e0" },
  sepia: { bg: "#f4ecd8", text: "#5c4a3a", link: "#8b4513", border: "#d4c4a8" },
  dark: { bg: "#1a1a1a", text: "#e0e0e0", link: "#66b3ff", border: "#333333" },
};

// ============================================================================
// SHARED REFLOW CSS + JS (search, highlight, selection, scroll, style-update)
// These must expose: searchText, searchNext, searchPrev, clearSearch,
// updateStyles, scrollToPosition, applyHighlights — called by MobileRenderer
// ============================================================================

function readerCSS(settings: ReaderSettings): string {
  const t = THEMES[settings.theme] || THEMES.light;
  return `
:root{--fs:${settings.fontSize}px;--lh:${settings.lineHeight};--ff:${settings.fontFamily},-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;--bg:${t.bg};--fg:${t.text};--link:${t.link};--border:${t.border}}
*{margin:0;padding:0;box-sizing:border-box}
html{font-size:var(--fs);-webkit-text-size-adjust:100%}
body{font-family:var(--ff);line-height:var(--lh);color:var(--fg);background:var(--bg);padding:0;margin:0;overflow-x:hidden;-webkit-font-smoothing:antialiased}
.reader-content{max-width:100%;padding:20px 16px;margin:0 auto}
p{margin-bottom:1em;text-align:left;word-wrap:break-word;overflow-wrap:break-word}
h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.5em;font-weight:600;line-height:1.3;color:var(--fg)}
h1{font-size:1.8em}h2{font-size:1.5em}h3{font-size:1.3em}h4{font-size:1.1em}
h1:first-child,h2:first-child,h3:first-child{margin-top:0}
a{color:var(--link);text-decoration:underline;word-break:break-word}
ul,ol{margin-bottom:1em;padding-left:1.5em}
li{margin-bottom:.5em}
strong,b{font-weight:600}em,i{font-style:italic}
code{font-family:'Courier New',Courier,monospace;background:rgba(0,0,0,.05);padding:2px 4px;border-radius:3px;font-size:.9em}
pre{background:rgba(0,0,0,.05);padding:12px;border-radius:4px;overflow-x:auto;margin-bottom:1em}
pre code{background:none;padding:0}
img{max-width:100%;height:auto;display:block;margin:1em auto;border-radius:4px}
table{width:100%;border-collapse:collapse;margin-bottom:1em;display:block;overflow-x:auto}
th,td{border:1px solid var(--border);padding:8px 12px;text-align:left}
th{background:rgba(0,0,0,.05);font-weight:600}
blockquote{border-left:4px solid var(--border);padding-left:1em;margin:1em 0;font-style:italic;opacity:.9}
hr{border:none;border-top:2px solid var(--border);margin:2em 0}
::selection{background:rgba(100,150,255,.3)}
.search-highlight{background:#FFEB3B;color:#000;border-radius:2px;padding:0 1px}
.search-highlight-active{background:#FF9800;color:#000}
.user-highlight{border-radius:2px;padding:0 1px}
#loading-indicator{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;color:var(--fg)}
#loading-indicator .spinner{width:40px;height:40px;border:4px solid var(--border);border-top-color:var(--link);border-radius:50%;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#error-container{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:32px;text-align:center;color:var(--fg)}
#error-container .icon{font-size:48px;margin-bottom:12px}
#error-container .title{font-size:18px;font-weight:700;margin-bottom:8px}
#error-container .message{font-size:14px;opacity:.7}
`;
}

function readerJS(): string {
  // This JS string is injected into the HTML <script>. It MUST expose the
  // window functions that MobileRenderer calls via injectJavaScript.
  return `
(function(){
  var THEMES = ${JSON.stringify(THEMES)};

  // ── Scroll tracking ──
  var scrollTimer;
  window.addEventListener('scroll', function(){
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function(){
      var pct = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'scroll',
        scrollY: window.scrollY,
        scrollPercent: Math.round(pct)
      }));
    }, 150);
  });

  // ── Style update ──
  window.updateStyles = function(fs, lh, th) {
    var r = document.documentElement;
    r.style.setProperty('--fs', fs + 'px');
    r.style.setProperty('--lh', lh);
    var t = THEMES[th] || THEMES.light;
    r.style.setProperty('--bg', t.bg);
    r.style.setProperty('--fg', t.text);
    r.style.setProperty('--link', t.link);
    r.style.setProperty('--border', t.border);
    document.body.className = 'theme-' + th;
  };

  window.scrollToPosition = function(pos) {
    window.scrollTo({ top: pos, behavior: 'smooth' });
  };

  // ── Search ──
  window.__searchHighlights = [];
  window.__searchCurrentIdx = -1;

  window.clearSearch = function() {
    window.__searchHighlights.forEach(function(el) {
      var p = el.parentNode; if (!p) return;
      p.replaceChild(document.createTextNode(el.textContent), el);
      p.normalize();
    });
    window.__searchHighlights = [];
    window.__searchCurrentIdx = -1;
  };

  window.searchText = function(query) {
    window.clearSearch();
    if (!query) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
        JSON.stringify({ type:'search-result', count:0, current:-1 })
      );
      return;
    }
    var q = query.toLowerCase();
    var container = document.getElementById('reader-content');
    if (!container) return;
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    var count = 0;
    nodes.forEach(function(node) {
      var text = node.nodeValue;
      var lower = text.toLowerCase();
      var idx = lower.indexOf(q);
      if (idx === -1) return;
      var frag = document.createDocumentFragment();
      var last = 0;
      while (idx !== -1) {
        frag.appendChild(document.createTextNode(text.substring(last, idx)));
        var span = document.createElement('span');
        span.className = 'search-highlight';
        span.setAttribute('data-search-idx', count);
        span.textContent = text.substring(idx, idx + q.length);
        frag.appendChild(span);
        window.__searchHighlights.push(span);
        count++;
        last = idx + q.length;
        idx = lower.indexOf(q, last);
      }
      frag.appendChild(document.createTextNode(text.substring(last)));
      node.parentNode.replaceChild(frag, node);
    });
    if (window.__searchHighlights.length > 0) {
      window.__searchCurrentIdx = 0;
      window.__searchHighlights[0].classList.add('search-highlight-active');
      window.__searchHighlights[0].scrollIntoView({ behavior:'smooth', block:'center' });
    }
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
      JSON.stringify({ type:'search-result', count:count, current: count > 0 ? 0 : -1 })
    );
  };

  window.searchNext = function() {
    if (window.__searchHighlights.length === 0) return;
    if (window.__searchCurrentIdx >= 0) window.__searchHighlights[window.__searchCurrentIdx].classList.remove('search-highlight-active');
    window.__searchCurrentIdx = (window.__searchCurrentIdx + 1) % window.__searchHighlights.length;
    var el = window.__searchHighlights[window.__searchCurrentIdx];
    el.classList.add('search-highlight-active');
    el.scrollIntoView({ behavior:'smooth', block:'center' });
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
      JSON.stringify({ type:'search-result', count:window.__searchHighlights.length, current:window.__searchCurrentIdx })
    );
  };

  window.searchPrev = function() {
    if (window.__searchHighlights.length === 0) return;
    if (window.__searchCurrentIdx >= 0) window.__searchHighlights[window.__searchCurrentIdx].classList.remove('search-highlight-active');
    window.__searchCurrentIdx = (window.__searchCurrentIdx - 1 + window.__searchHighlights.length) % window.__searchHighlights.length;
    var el = window.__searchHighlights[window.__searchCurrentIdx];
    el.classList.add('search-highlight-active');
    el.scrollIntoView({ behavior:'smooth', block:'center' });
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
      JSON.stringify({ type:'search-result', count:window.__searchHighlights.length, current:window.__searchCurrentIdx })
    );
  };

  // ── Highlight support ──
  window.applyHighlights = function(highlights) {
    if (!highlights || highlights.length === 0) return;
    highlights.forEach(function(h) {
      try {
        var el = document.getElementById('reader-content');
        if (!el) return;
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        var offset = 0; var node;
        while (node = walker.nextNode()) {
          var len = node.nodeValue.length;
          if (offset + len > h.startOffset && offset < h.endOffset) {
            var start = Math.max(0, h.startOffset - offset);
            var end = Math.min(len, h.endOffset - offset);
            var range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, end);
            var span = document.createElement('span');
            span.className = 'user-highlight';
            span.style.backgroundColor = h.color || 'rgba(255,235,59,0.4)';
            span.setAttribute('data-highlight-id', h.id);
            range.surroundContents(span);
          }
          offset += len;
        }
      } catch (e) { /* skip broken highlights */ }
    });
  };

  // ── Text selection for highlighting ──
  document.addEventListener('selectionchange', function() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
    var text = sel.toString();
    try {
      var container = document.getElementById('reader-content');
      var range = sel.getRangeAt(0);
      var preRange = document.createRange();
      preRange.selectNodeContents(container);
      preRange.setEnd(range.startContainer, range.startOffset);
      var startOffset = preRange.toString().length;
      var endOffset = startOffset + text.length;
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'text-selected',
        text: text,
        startOffset: startOffset,
        endOffset: endOffset
      }));
    } catch (e) {}
  });

  // ── Signal ready ──
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
})();
`;
}

// ============================================================================
// PDF REFLOW — fully local, uses pdf.js in the WebView
// ============================================================================

/**
 * Generate a self-contained HTML page that:
 * 1. Loads pdf.js from CDN (cached by WebView after first load)
 * 2. Decodes the base64 PDF data
 * 3. Extracts text from every page
 * 4. Renders reflowed paragraphs inside .reader-content
 * 5. Includes search / highlight / copy JS
 */
export async function reflowPDF(
  fileUri: string,
  settings: ReaderSettings,
): Promise<ReflowResponse> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) throw new Error("File not found");

    // Read the PDF as base64
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const css = readerCSS(settings);
    const js = readerJS();
    const theme = settings.theme || "light";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
<title>Mobile View</title>
<style>${css}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
</head>
<body class="theme-${theme}">
<!-- Loading indicator -->
<div id="loading-indicator">
  <div class="spinner"></div>
  <p style="margin-top:16px;font-size:15px;">Processing…</p>
</div>

<!-- Error container (hidden initially) -->
<div id="error-container" style="display:none">
  <div class="icon">⚠️</div>
  <div class="title" id="error-title">Processing failed</div>
  <div class="message" id="error-message"></div>
</div>

<!-- Reader content populated by JS -->
<article class="reader-content" id="reader-content" style="display:none"></article>

<script>
(function(){
  var BASE64_DATA = ${JSON.stringify(base64)};

  function showError(title, msg) {
    document.getElementById('loading-indicator').style.display = 'none';
    var ec = document.getElementById('error-container');
    ec.style.display = 'flex';
    document.getElementById('error-title').textContent = title;
    document.getElementById('error-message').textContent = msg;
    // Still signal ready so RN doesn't hang
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  }

  // Heading heuristics (same as backend)
  function detectBlockType(text) {
    var trimmed = text.trim();
    if (!trimmed) return 'p';
    var isShort = trimmed.length < 120;
    var isCapitalized = trimmed === trimmed.toUpperCase() && trimmed.length > 2;
    var noEndPunct = !/[.!?,;:]$/.test(trimmed);
    if (isShort && isCapitalized && noEndPunct) return 'h2';
    if (isShort && noEndPunct && /^(chapter|section|part)\\s/i.test(trimmed)) return 'h1';
    if (isShort && noEndPunct && trimmed.length < 60) return 'h3';
    return 'p';
  }

  function escapeHtml(t) {
    return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function renderText(allText) {
    if (!allText || allText.trim().length < 50) {
      showError('Scanned Document', 'This PDF appears to be scanned or image-based. Please use Original view.');
      return;
    }

    var blocks = allText.split(/\\n\\s*\\n/).map(function(p){ return p.trim(); }).filter(function(p){ return p.length > 0; });
    var html = '';
    blocks.forEach(function(block) {
      var clean = block.replace(/\\n/g, ' ').replace(/\\s+/g, ' ');
      var tag = detectBlockType(clean);
      html += '<' + tag + '>' + escapeHtml(clean) + '</' + tag + '>\\n';
    });

    document.getElementById('loading-indicator').style.display = 'none';
    var rc = document.getElementById('reader-content');
    rc.innerHTML = html;
    rc.style.display = 'block';

    // Post extracted text for Read Aloud (fixes race with 'ready' signal)
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'read-aloud-text', text: allText }));
  }

  // Attempt extraction with pdf.js
  if (typeof pdfjsLib === 'undefined') {
    showError('Library not loaded', 'pdf.js could not be loaded. Please check your internet for the first use — it will be cached for offline use afterwards.');
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  try {
    var raw = atob(BASE64_DATA);
    var uint8 = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) uint8[i] = raw.charCodeAt(i);

    var loadingTask = pdfjsLib.getDocument({ data: uint8 });
    loadingTask.promise.then(function(pdf) {
      var total = pdf.numPages;
      var pages = [];
      var done = 0;

      for (var p = 1; p <= total; p++) {
        (function(pageNum) {
          pdf.getPage(pageNum).then(function(page) {
            page.getTextContent().then(function(content) {
              var pageText = content.items.map(function(item) { return item.str; }).join(' ');
              pages[pageNum - 1] = pageText;
              done++;
              if (done === total) {
                var allText = pages.join('\\n\\n');
                renderText(allText);
              }
            });
          });
        })(p);
      }
    }).catch(function(err) {
      showError('PDF Error', err.message || 'Failed to parse PDF');
    });
  } catch (e) {
    showError('PDF Error', e.message || 'Failed to decode PDF data');
  }
})();
<\/script>

<!-- Reflow JS: search, highlight, selection, scroll -->
<script>
${js}
<\/script>
</body>
</html>`;

    return { success: true, html };
  } catch (error: any) {
    console.error("[ReflowService] reflowPDF error:", error);
    return {
      success: false,
      error: error.message || "Failed to process PDF",
      message: "Could not generate Mobile View for this PDF.",
    };
  }
}

// ============================================================================
// DOCX REFLOW — fully local, uses Mammoth.js in the WebView
// ============================================================================

/**
 * Generate a self-contained HTML page that:
 * 1. Loads Mammoth.js from CDN (same CDN the original viewer uses)
 * 2. Decodes the base64 DOCX data
 * 3. Converts DOCX → HTML with Mammoth
 * 4. Renders inside .reader-content with mobile-optimised styles
 * 5. Includes search / highlight / copy JS
 */
export async function reflowDOCX(
  fileUri: string,
  settings: ReaderSettings,
): Promise<ReflowResponse> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) throw new Error("File not found");

    // Read the DOCX as base64
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const css = readerCSS(settings);
    const js = readerJS();
    const theme = settings.theme || "light";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
<title>Mobile View</title>
<style>${css}</style>
<script src="https://cdn.jsdelivr.net/npm/mammoth@1.11.0/mammoth.browser.min.js"><\/script>
</head>
<body class="theme-${theme}">
<!-- Loading indicator -->
<div id="loading-indicator">
  <div class="spinner"></div>
  <p style="margin-top:16px;font-size:15px;">Processing…</p>
</div>

<!-- Error container -->
<div id="error-container" style="display:none">
  <div class="icon">⚠️</div>
  <div class="title" id="error-title">Conversion failed</div>
  <div class="message" id="error-message"></div>
</div>

<!-- Reader content populated by JS -->
<article class="reader-content" id="reader-content" style="display:none"></article>

<script>
(function(){
  var BASE64_DATA = ${JSON.stringify(base64)};

  function showError(title, msg) {
    document.getElementById('loading-indicator').style.display = 'none';
    var ec = document.getElementById('error-container');
    ec.style.display = 'flex';
    document.getElementById('error-title').textContent = title;
    document.getElementById('error-message').textContent = msg;
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  }

  if (typeof mammoth === 'undefined') {
    showError('Library not loaded', 'Mammoth.js could not be loaded. Please check your internet for the first use — it will be cached for offline use afterwards.');
    return;
  }

  try {
    var raw = atob(BASE64_DATA);
    var uint8 = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) uint8[i] = raw.charCodeAt(i);

    mammoth.convertToHtml(
      { arrayBuffer: uint8.buffer },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Title'] => h1.title:fresh",
          "table[style-name='Table Grid'] => table.docx-table",
          "table[style-name='TableGrid']  => table.docx-table",
          "table[style-name='Normal Table'] => table.docx-table",
          "table => table.docx-table",
          "tr => tr",
          "td => td",
          "th => th",
          "b => strong",
          "i => em"
        ],
        includeDefaultStyleMap: true,
        ignoreEmptyParagraphs: false,
        convertImage: mammoth.images.imgElement(function(image) {
          return image.read('base64').then(function(imageData) {
            return {
              src: 'data:' + image.contentType + ';base64,' + imageData
            };
          });
        })
      }
    ).then(function(result) {
      document.getElementById('loading-indicator').style.display = 'none';
      var rc = document.getElementById('reader-content');
      rc.innerHTML = result.value;
      rc.style.display = 'block';

      // Post extracted text for Read Aloud (fixes race with 'ready' signal)
      var raText = rc.innerText || rc.textContent || '';
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'read-aloud-text', text: raText }));
    }).catch(function(err) {
      showError('Conversion Error', err.message || 'Failed to convert DOCX');
    });
  } catch (e) {
    showError('DOCX Error', e.message || 'Failed to decode DOCX data');
  }
})();
<\/script>

<!-- Reflow JS: search, highlight, selection, scroll -->
<script>
${js}
<\/script>
</body>
</html>`;

    return { success: true, html };
  } catch (error: any) {
    console.error("[ReflowService] reflowDOCX error:", error);
    return {
      success: false,
      error: error.message || "Failed to process DOCX",
      message: "Could not generate Mobile View for this document.",
    };
  }
}
