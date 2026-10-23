export default function BottomSheet({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        aria-label="סגור"
        className="animate-fade-in absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="animate-sheet-up relative w-full max-w-md rounded-t-[2rem] bg-slate-900 px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-white/10">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/20" />
        {title}
        {children}
      </div>
    </div>
  );
}
