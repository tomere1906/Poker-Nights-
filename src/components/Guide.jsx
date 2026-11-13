import { useState } from 'react';
import BottomSheet from './BottomSheet.jsx';

// A step-by-step guide (see src/lib/guide.js): a screenshot with the place to
// tap marked, a short title and text, "הבא" / "הקודם" and dots for progress.
export default function Guide({ guide, onClose }) {
  const [index, setIndex] = useState(0);
  const step = guide.steps[index];
  const last = index === guide.steps.length - 1;
  const { x, y, w, h } = step.spot;

  return (
    <BottomSheet onClose={onClose} title={<h2 className="text-lg font-extrabold">📖 {guide.title}</h2>}>
      <div className="space-y-4 pb-4">
        <div className="relative mx-auto w-fit overflow-hidden rounded-3xl ring-1 ring-white/10">
          <img
            src={`${import.meta.env.BASE_URL}${step.image}`}
            alt={step.title}
            className="block max-h-[52vh] w-auto"
          />
          <span
            aria-hidden
            className="absolute animate-pulse rounded-2xl ring-4 ring-amber-300 shadow-[0_0_24px_rgba(252,211,77,0.7)]"
            style={{ left: `${x - w / 2}%`, top: `${y - h / 2}%`, width: `${w}%`, height: `${h}%` }}
          />
        </div>
        <div>
          <p className="text-sm font-bold text-amber-200">
            שלב {index + 1} מתוך {guide.steps.length}
          </p>
          <h3 className="text-xl font-extrabold">{step.title}</h3>
          <p className="mt-1 text-slate-300">{step.text}</p>
        </div>
        <div className="flex justify-center gap-2" aria-hidden>
          {guide.steps.map((s, i) => (
            <span key={s.image} className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-amber-300' : 'w-2 bg-white/20'}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              className="flex-1 rounded-2xl bg-slate-800 py-3.5 font-bold text-slate-200 active:scale-[0.98]"
            >
              → הקודם
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? onClose() : setIndex(index + 1))}
            className="flex-[2] rounded-2xl bg-emerald-400 py-3.5 font-extrabold text-slate-900 active:scale-[0.98]"
          >
            {last ? 'הבנתי ✓' : 'הבא ←'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
