/**
 * selectionScripts.ts — WebView-injected JavaScript for text selection detection,
 * highlight/underline application, and annotation reapply.
 *
 * Message protocol:
 *   WebView → RN: selection, selection_clear, annotation_applied
 *   RN → WebView: apply_annotation, clear_selection, reapply_annotations
 *
 * Offsets are computed as character indices in the full plain-text of the
 * reflowed HTML body (document.body.innerText). This is stable across
 * font-size / theme / line-height changes as long as the underlying text
 * content remains the same.
 */

export const SELECTION_BRIDGE_JS = `
(function () {
  /* ── helpers ──────────────────────────────────────────────────── */
  var _debounceTimer = null;
  var _lastSentText = '';

  /** Debounce wrapper (default 80ms). */
  function debounce(fn, ms) {
    return function () {
      var args = arguments;
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(function () { fn.apply(null, args); }, ms || 80);
    };
  }

  /** Post JSON to React Native. */
  function post(obj) {
    try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }
    catch (_) {}
  }

  /* ── plain-text offset computation ───────────────────────────── */
  /**
   * Flatten body.innerText into a string and walk the DOM text nodes
   * to map a Range's start/end containers + offsets into plain-text
   * character offsets.
   */
  function getTextNodesBefore(root, target, targetOffset) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var total = 0;
    var node;
    while ((node = walker.nextNode())) {
      if (node === target) return total + targetOffset;
      total += (node.textContent || '').length;
    }
    return total + targetOffset;
  }

  function rangeToOffsets(range) {
    var root = document.body;
    var startOffset = getTextNodesBefore(root, range.startContainer, range.startOffset);
    var endOffset = getTextNodesBefore(root, range.endContainer, range.endOffset);
    return { startOffset: startOffset, endOffset: endOffset };
  }

  /* ── Selection change listener (debounced) ───────────────────── */
  var handleSelectionChange = debounce(function () {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      if (_lastSentText) {
        _lastSentText = '';
        post({ type: 'selection_clear' });
      }
      return;
    }
    var text = sel.toString().trim();
    if (text === _lastSentText) return;
    _lastSentText = text;

    try {
      var range = sel.getRangeAt(0);
      var offsets = rangeToOffsets(range);
      var rect = range.getBoundingClientRect();
      post({
        type: 'selection',
        text: text,
        startOffset: offsets.startOffset,
        endOffset: offsets.endOffset,
        rect: {
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
          width: rect.width,
          height: rect.height
        },
        scrollX: window.scrollX,
        scrollY: window.scrollY
      });
    } catch (_) {}
  }, 80);

  document.addEventListener('selectionchange', handleSelectionChange);

  /* dismiss on scroll (already sends selection_clear via selectionchange) */
  var _scrollTimer = null;
  document.addEventListener('scroll', function () {
    clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(function () {
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        /* Re-emit position with updated scroll offsets */
        handleSelectionChange();
      }
    }, 150);
  }, { passive: true });

  /* ── Offset → Range reconstruction ───────────────────────────── */
  function offsetsToRange(startOff, endOff) {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var charCount = 0;
    var startNode = null, startLocal = 0;
    var endNode = null, endLocal = 0;
    var node;
    while ((node = walker.nextNode())) {
      var len = (node.textContent || '').length;
      if (!startNode && charCount + len > startOff) {
        startNode = node;
        startLocal = startOff - charCount;
      }
      if (!endNode && charCount + len >= endOff) {
        endNode = node;
        endLocal = endOff - charCount;
        break;
      }
      charCount += len;
    }
    if (!startNode || !endNode) return null;
    try {
      var range = document.createRange();
      range.setStart(startNode, Math.min(startLocal, startNode.textContent.length));
      range.setEnd(endNode, Math.min(endLocal, endNode.textContent.length));
      return range;
    } catch (_) { return null; }
  }

  /* ── Wrap a range with a span ────────────────────────────────── */
  function wrapRange(range, tag) {
    // Use extractContents + insertNode for multi-node ranges.
    try {
      var fragment = range.extractContents();
      var wrapper = document.createElement('span');
      wrapper.appendChild(fragment);
      for (var k in tag.attrs) wrapper.setAttribute(k, tag.attrs[k]);
      if (tag.style) wrapper.setAttribute('style', tag.style);
      if (tag.className) wrapper.className = tag.className;
      range.insertNode(wrapper);
      return true;
    } catch (_) { return false; }
  }

  /* ── Public API (called from RN via injectJavaScript) ────────── */

  /** Apply highlight by offsets. */
  window.__selBridge_highlight = function (id, startOff, endOff, color) {
    var range = offsetsToRange(startOff, endOff);
    if (!range) { post({ type: 'annotation_applied', success: false, id: id, kind: 'highlight' }); return; }
    var ok = wrapRange(range, {
      className: 'pdflab-hl',
      attrs: { 'data-hl-id': id },
      style: 'background-color:' + color + ';border-radius:2px;padding:0 1px;'
    });
    window.getSelection() && window.getSelection().removeAllRanges();
    post({ type: 'annotation_applied', success: ok, id: id, kind: 'highlight' });
  };

  /** Apply underline by offsets. */
  window.__selBridge_underline = function (id, startOff, endOff) {
    var range = offsetsToRange(startOff, endOff);
    if (!range) { post({ type: 'annotation_applied', success: false, id: id, kind: 'underline' }); return; }
    var ok = wrapRange(range, {
      className: 'pdflab-ul',
      attrs: { 'data-ul-id': id },
      style: 'text-decoration:underline;text-decoration-color:#1976D2;text-decoration-thickness:2px;text-underline-offset:3px;'
    });
    window.getSelection() && window.getSelection().removeAllRanges();
    post({ type: 'annotation_applied', success: ok, id: id, kind: 'underline' });
  };

  /** Clear browser selection. */
  window.__selBridge_clearSelection = function () {
    window.getSelection() && window.getSelection().removeAllRanges();
    _lastSentText = '';
  };

  /** Re-apply a batch of highlights + underlines. Called on reload. */
  window.__selBridge_reapplyAnnotations = function (annotations) {
    // annotations: [{ id, startOffset, endOffset, kind, color? }]
    if (!annotations || !annotations.length) return;
    // Sort by startOffset descending so earlier insertions don't shift later offsets.
    var sorted = annotations.slice().sort(function (a, b) { return b.startOffset - a.startOffset; });
    for (var i = 0; i < sorted.length; i++) {
      var a = sorted[i];
      if (a.kind === 'highlight') {
        window.__selBridge_highlight(a.id, a.startOffset, a.endOffset, a.color || 'rgba(255,235,59,0.4)');
      } else if (a.kind === 'underline') {
        window.__selBridge_underline(a.id, a.startOffset, a.endOffset);
      }
    }
  };

  /** Remove a single annotation by id. */
  window.__selBridge_removeAnnotation = function (id) {
    var el = document.querySelector('[data-hl-id="' + id + '"]') ||
             document.querySelector('[data-ul-id="' + id + '"]');
    if (el && el.parentNode) {
      var parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize();
    }
  };
})();
`;

/**
 * Injects the selection bridge script into reflow HTML.
 * Call this BEFORE setting the HTML on the WebView.
 */
export function injectSelectionBridge(html: string): string {
  const tag = `<script>${SELECTION_BRIDGE_JS}<\/script>`;
  // Insert before closing </body> or append to end
  if (html.includes("</body>")) {
    return html.replace("</body>", tag + "</body>");
  }
  return html + tag;
}
