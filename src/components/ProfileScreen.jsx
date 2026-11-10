import { signOut } from '../lib/auth.js';
import ProfileForm from './ProfileForm.jsx';

export default function ProfileScreen({ profile, onBack, onSaved }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xl active:scale-90"
        >
          →
        </button>
        <h2 className="text-2xl font-extrabold">הפרופיל שלי</h2>
      </div>

      <ProfileForm profile={profile} submitLabel="שמור" onSaved={onSaved} />

      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={async () => {
            await signOut();
            onBack();
          }}
          className="w-full rounded-2xl bg-slate-800 py-3.5 font-bold text-rose-300 active:scale-[0.98]"
        >
          התנתקות
        </button>
      </div>
    </div>
  );
}
