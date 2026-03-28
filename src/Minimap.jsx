import { useEffect, useRef, useState, useCallback } from 'react';

const SCALE = 0.12;

export default function Minimap({ editor }) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const viewportRef = useRef(null);
  const [html, setHtml] = useState('');
  const [viewport, setViewport] = useState({ top: 0, height: 20 });
  const [contentOffset, setContentOffset] = useState(0);
  const dragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartScroll = useRef(0);

  // Debounced content sync from editor transactions
  useEffect(() => {
    if (!editor) return;
    let timer;
    const sync = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!editor.isDestroyed) setHtml(editor.getHTML());
      }, 200);
    };
    // Initial sync
    setHtml(editor.getHTML());
    editor.on('transaction', sync);
    return () => {
      clearTimeout(timer);
      editor.off('transaction', sync);
    };
  }, [editor]);

  // Find the scroll container (explicit class-based lookup with fallback)
  const getScrollEl = useCallback(() => {
    if (!editor || editor.isDestroyed) return null;
    const pm = editor.view.dom;
    // Look for our explicit scroll containers first
    const explicit = pm.closest('.editor-scroll-container') || pm.closest('.syl-body');
    if (explicit) return explicit;
    // Fallback: walk up to find any scrollable ancestor
    let el = pm;
    while (el) {
      if (el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0) return el;
      el = el.parentElement;
    }
    return pm;
  }, [editor]);

  // Update viewport indicator from editor scroll position
  const updateViewport = useCallback(() => {
    const scrollEl = getScrollEl();
    const container = containerRef.current;
    if (!scrollEl || !container) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollEl;
    const minimapH = container.clientHeight;
    const contentScaledH = contentRef.current
      ? contentRef.current.scrollHeight * SCALE
      : minimapH;
    // Map scroll position to minimap coordinates
    const ratio = scrollHeight > 0 ? clientHeight / scrollHeight : 1;
    const vpHeight = Math.max(12, ratio * Math.min(minimapH, contentScaledH));
    const scrollRatio = scrollHeight > clientHeight
      ? scrollTop / (scrollHeight - clientHeight)
      : 0;
    const maxTop = Math.min(minimapH, contentScaledH) - vpHeight;
    const vpTop = scrollRatio * maxTop;

    setViewport({ top: Math.max(0, vpTop), height: vpHeight });

    // Scroll minimap content when it's taller than the container
    if (contentScaledH > minimapH) {
      const maxOffset = contentScaledH - minimapH;
      setContentOffset(-scrollRatio * maxOffset);
    } else {
      setContentOffset(0);
    }
  }, [getScrollEl]);

  // Listen to scroll events on the editor
  useEffect(() => {
    const scrollEl = getScrollEl();
    if (!scrollEl) return;
    updateViewport();
    scrollEl.addEventListener('scroll', updateViewport, { passive: true });
    window.addEventListener('resize', updateViewport, { passive: true });
    return () => {
      scrollEl.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, [getScrollEl, updateViewport, html]);

  // ResizeObserver for container size changes (e.g. info panel toggle)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateViewport());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateViewport]);

  // Click on minimap background → scroll editor to that position
  const handleMinimapClick = useCallback((e) => {
    if (dragging.current) return;
    const container = containerRef.current;
    const scrollEl = getScrollEl();
    if (!container || !scrollEl) return;

    const rect = container.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const contentScaledH = contentRef.current
      ? contentRef.current.scrollHeight * SCALE
      : container.clientHeight;
    const mapH = Math.min(container.clientHeight, contentScaledH);
    // Adjust clickY for content offset (when minimap content is scrolled)
    const adjustedClickY = clickY - contentOffset;
    const ratio = mapH > 0 ? adjustedClickY / mapH : 0;
    const target = ratio * scrollEl.scrollHeight - scrollEl.clientHeight / 2;
    scrollEl.scrollTop = Math.max(0, Math.min(target, scrollEl.scrollHeight - scrollEl.clientHeight));
  }, [getScrollEl, contentOffset]);

  // Drag viewport indicator
  const handleViewportDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    dragStartY.current = e.clientY;
    const scrollEl = getScrollEl();
    dragStartScroll.current = scrollEl ? scrollEl.scrollTop : 0;

    const contentScaledH = contentRef.current
      ? contentRef.current.scrollHeight * SCALE
      : containerRef.current?.clientHeight || 1;
    const container = containerRef.current;
    const mapH = container ? Math.min(container.clientHeight, contentScaledH) : 1;
    const scrollEl2 = getScrollEl();
    const scrollRange = scrollEl2 ? scrollEl2.scrollHeight - scrollEl2.clientHeight : 1;
    const vpRange = mapH - viewport.height;

    const onMove = (ev) => {
      const dy = ev.clientY - dragStartY.current;
      const scrollDelta = vpRange > 0 ? (dy / vpRange) * scrollRange : 0;
      if (scrollEl2) {
        scrollEl2.scrollTop = Math.max(0, Math.min(
          dragStartScroll.current + scrollDelta,
          scrollRange
        ));
      }
    };

    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [getScrollEl, viewport.height]);

  if (!editor) return null;

  return (
    <div
      ref={containerRef}
      className="minimap"
      onMouseDown={handleMinimapClick}
    >
      <div
        className="minimap-scroll"
        style={{ transform: `translateY(${contentOffset}px)` }}
      >
        <div
          ref={contentRef}
          className="minimap-content"
          style={{ transform: `scale(${SCALE})` }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <div
        ref={viewportRef}
        className="minimap-viewport"
        style={{ top: viewport.top, height: viewport.height }}
        onMouseDown={handleViewportDown}
      />
    </div>
  );
}
