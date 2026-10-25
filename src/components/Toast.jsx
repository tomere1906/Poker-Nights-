// Shown at the top of the screen so it never covers the action buttons at the bottom.
export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-50 flex justify-center px-4">
      <div key={toast.key} className="animate-toast rounded-full bg-white px-5 py-2.5 font-bold text-slate-900 shadow-xl">
        {toast.text}
      </div>
    </div>
  );
}
