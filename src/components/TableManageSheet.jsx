import { useState } from 'react';
import BottomSheet from './BottomSheet.jsx';
import Avatar from './Avatar.jsx';
import { MAX_TABLE_NAME, cleanTableName } from '../lib/onlineTable.js';

const MODES = [
  { id: 'managers', title: 'רק מנהלים', hint: 'רק המנהל והמנהלים המשותפים מוסיפים כניסות' },
  { id: 'self_add', title: 'כל אחד את שלו', hint: 'כל שחקן יכול גם להוסיף כניסות לעצמו. תיקונים רק אצל המנהלים' },
];

// Table management: name, buy-in mode and co-managers (manager only), delete table.
// Co-managers and players see the same information, read-only.
export default function TableManageSheet({ view, actions, onDeleted, onClose, onError }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(view.name ?? '');
  const { isManager } = view;
  const members = view.people.filter((p) => !p.isManager);

  async function run(fn) {
    try {
      await fn();
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <BottomSheet onClose={onClose} title={<h2 className="mb-4 text-xl font-bold">ניהול שולחן ⚙️</h2>}>
      <div className="max-h-[65dvh] space-y-5 overflow-y-auto">
        <section>
          <p className="mb-2 text-sm text-slate-400">שם השולחן</p>
          {isManager ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => actions.setName(name));
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_TABLE_NAME}
                placeholder="בלי שם"
                className="min-w-0 flex-1 rounded-2xl bg-slate-800/70 px-4 py-3 outline-none ring-2 ring-transparent placeholder:text-slate-500 focus:ring-emerald-400"
              />
              <button
                type="submit"
                disabled={cleanTableName(name) === view.name}
                className="rounded-2xl bg-emerald-400 px-4 font-bold text-slate-900 active:scale-95 disabled:bg-slate-800 disabled:text-slate-500"
              >
                שמור
              </button>
            </form>
          ) : (
            <p className="rounded-2xl bg-slate-800/70 p-3 font-bold">{view.name ?? 'בלי שם'}</p>
          )}
        </section>

        <section>
          <p className="mb-2 text-sm text-slate-400">מי מוסיף כניסות?</p>
          <div className="space-y-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={!isManager}
                onClick={() => run(() => actions.setBuyInMode(m.id))}
                aria-pressed={view.buyInMode === m.id}
                className={`w-full rounded-2xl p-3 text-start transition active:scale-[0.99] disabled:active:scale-100 ${
                  view.buyInMode === m.id ? 'bg-emerald-400/15 ring-2 ring-emerald-400' : 'bg-slate-800/70'
                }`}
              >
                <span className="block font-bold">
                  {view.buyInMode === m.id ? '● ' : '○ '}
                  {m.title}
                </span>
                <span className="block text-sm text-slate-400">{m.hint}</span>
              </button>
            ))}
          </div>
          {!isManager && <p className="mt-2 text-xs text-slate-500">רק מנהל השולחן משנה את זה</p>}
        </section>

        <section>
          <p className="mb-2 text-sm text-slate-400">מנהלים משותפים</p>
          {members.length === 0 ? (
            <p className="rounded-2xl bg-slate-800/70 p-3 text-sm text-slate-400">
              עוד אין חברים מחוברים לשולחן. אחרי שיצטרפו בהזמנה, אפשר למנות אותם כאן.
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((p) => (
                <li key={p.userId} className="flex items-center gap-3 rounded-2xl bg-slate-800/70 p-2">
                  <Avatar player={p} size="h-10 w-10 text-sm" />
                  <span className="flex-1 truncate font-bold">
                    {p.name}
                    {p.isMe ? ' (אני)' : ''}
                  </span>
                  {isManager ? (
                    <button
                      type="button"
                      onClick={() => run(() => actions.setCoManager(p.userId, !p.isCoManager))}
                      className={`rounded-xl px-3 py-2 text-sm font-bold active:scale-95 ${
                        p.isCoManager ? 'bg-amber-300 text-slate-900' : 'bg-slate-950/60 text-slate-300'
                      }`}
                    >
                      {p.isCoManager ? 'מנהל משותף ✓' : 'מנה למנהל'}
                    </button>
                  ) : (
                    p.isCoManager && <span className="text-sm font-bold text-amber-300">מנהל משותף</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {isManager && (
          <button
            type="button"
            onClick={() =>
              confirmDelete
                ? run(async () => {
                    await actions.deleteTable();
                    onDeleted();
                  })
                : setConfirmDelete(true)
            }
            className={`w-full rounded-2xl py-3 font-bold transition active:scale-[0.98] ${
              confirmDelete ? 'bg-rose-500 text-white' : 'bg-slate-800 text-rose-300'
            }`}
          >
            {confirmDelete ? 'השולחן והיומן יימחקו לכולם – הקש שוב' : 'מחק את השולחן'}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
