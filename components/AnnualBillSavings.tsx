import React from 'react';
import type { AnnualBillAdviceResult } from '../src/lib/annual-bill/calculateAnnualBillAdvice';
import { annualBillHasCalculatedSavings } from '../src/lib/annual-bill/annualBillPresentation';
import { formatEuro } from '../src/lib/annual-bill/annualBillUx';

export function AnnualBillSavings({ advice }: { advice: AnnualBillAdviceResult }) {
  const calculated = annualBillHasCalculatedSavings(advice);
  return <div>
    <p className="text-xs text-slate-500">Jaarlijkse eurobesparing (informatief)</p>
    <p className="text-lg font-semibold text-slate-900">{calculated ? formatEuro(advice.annualSavingsRangeEur.expected) : 'Besparing niet berekend'}</p>
    {calculated ? <p className="text-xs text-slate-500">Verwachte bandbreedte: {formatEuro(advice.annualSavingsRangeEur.min)} - {formatEuro(advice.annualSavingsRangeEur.max)}</p>
      : <p className="text-xs text-slate-500">Corrigeer en bevestig fysieke netafname, teruglevering en periode bij je jaargegevens.</p>}
  </div>;
}
