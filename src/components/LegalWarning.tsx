import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

export function LegalWarning() {
  const [dismissed, setDismissed] = useState(() =>
    sessionStorage.getItem('bb_legal_dismissed') === 'true'
  );
  if (dismissed) return null;
  return (
    <div className="flex items-start gap-3 bg-severity-high/5 border border-severity-high/30 rounded-lg px-4 py-3">
      <AlertTriangle className="w-4 h-4 text-severity-high flex-shrink-0 mt-0.5" />
      <p className="text-xs font-mono text-severity-high flex-1">
        <strong>AUTHORIZED USE ONLY:</strong> BugBuddy.AI must only be used against targets you own or have written permission to test. Unauthorized scanning is illegal.
      </p>
      <button onClick={() => { setDismissed(true); sessionStorage.setItem('bb_legal_dismissed','true'); }}
        className="text-severity-high/60 hover:text-severity-high transition flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
