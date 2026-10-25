import BottomSheet from './BottomSheet.jsx';
import RoundingPicker from './RoundingPicker.jsx';
import { AmountsForm } from './AmountsEditor.jsx';

// ⚙️ on the local table: the buy-in buttons and the rounding, any time during
// the night. Changes only this table; the saved defaults stay.
export default function LocalSettingsSheet({ settings, onAmounts, onRounding, onClose }) {
  return (
    <BottomSheet onClose={onClose} title={<h2 className="mb-4 text-xl font-bold">הגדרות השולחן ⚙️</h2>}>
      <div className="-mx-1 max-h-[65dvh] space-y-5 overflow-y-auto px-1 py-1">
        <section>
          <p className="mb-2 text-sm text-slate-400">עיגול סכומים</p>
          <RoundingPicker value={settings.rounding} onChange={onRounding} />
        </section>
        <section>
          <p className="mb-2 text-sm text-slate-400">סכומי כניסה</p>
          <AmountsForm settings={settings} onSave={onAmounts} />
        </section>
      </div>
    </BottomSheet>
  );
}
