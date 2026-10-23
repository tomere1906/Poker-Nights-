export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center">
      <div key={toast.key} className="animate-toast rounded-full bg-white px-5 py-2.5 font-bold text-slate-900 shadow-xl">
        {toast.text}
      </div>
    </div>
  );
}
