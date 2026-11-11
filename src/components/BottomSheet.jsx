import { useEffect, useRef, useState } from 'react';

// The part of the screen the keyboard doesn't cover. On iPhone the keyboard
// shrinks the "visual viewport" and Safari may scroll the page under it, so the
// sheet follows it: bottom = right above the keyboard, height = what's left.
function useVisibleArea() {
  const read = () => {
    const vv = window.visualViewport;
    if (!vv) return { bottom: 0, height: window.innerHeight };
    return { bottom: Math.max(0, window.innerHeight - vv.height - vv.offsetTop), height: vv.height };
  };
  const [area, setArea] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => setArea(read());
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return area;
}

// A sheet from the bottom of the screen. The handle, title and ✕ stay at the
// top; only the content scrolls. With the keyboard open it sits right above
// it and never goes under the iPhone's clock (safe area).
export default function BottomSheet({ onClose, title, children }) {
  const { bottom, height } = useVisibleArea();
  const body = useRef(null);

  // The page behind doesn't scroll while the sheet is open.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // A field that gets the keyboard is scrolled into view inside the sheet.
  useEffect(() => {
    const el = body.current;
    if (!el) return undefined;
    const onFocus = (e) => {
      if (!e.target.matches('input, textarea, select')) return;
      setTimeout(() => e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 300);
    };
    el.addEventListener('focusin', onFocus);
    return () => el.removeEventListener('focusin', onFocus);
  }, []);

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="סגור"
        tabIndex={-1}
        className="animate-fade-in absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="animate-sheet-up absolute inset-x-0 mx-auto flex w-full max-w-md flex-col rounded-t-[2rem] bg-slate-900 shadow-2xl ring-1 ring-white/10"
        style={{
          bottom,
          maxHeight: `calc(${height}px - env(safe-area-inset-top) - 0.75rem)`,
        }}
      >
        <div className="shrink-0 px-5 pt-3">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20" />
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">{title}</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              className="-me-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-lg text-slate-300 active:scale-90"
            >
              ✕
            </button>
          </div>
        </div>
        <div
          ref={body}
          className={`min-h-0 overflow-y-auto overscroll-contain px-5 ${
            bottom > 0 ? 'pb-4' : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
