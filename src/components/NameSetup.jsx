import ProfileForm from './ProfileForm.jsx';

// First sign-in: confirm the name (prefilled with the Google first name) and pick a color.
export default function NameSetup({ profile, onSaved }) {
  return (
    <div className="flex flex-1 flex-col justify-center py-6">
      <h2 className="text-center text-3xl font-extrabold">ברוכים הבאים! 👋</h2>
      <p className="mt-2 mb-8 text-center text-slate-400">איך יקראו לך בשולחן, ובאיזה צבע?</p>
      <ProfileForm profile={profile} submitLabel="בואו נשחק 🃏" onSaved={onSaved} />
    </div>
  );
}
