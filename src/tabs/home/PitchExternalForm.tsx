import React, { useCallback, useState } from 'react';
import { trackClientEvent } from '../../utils/telemetry';
import './PitchExternalForm.css';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface PitchExternalFormProps {
  currentUserInitials?: string;
  currentUserEmail?: string;
  onClose: () => void;
  onShowToast?: (message: string, type: ToastType, details?: string) => void;
}

interface PitchExternalResult {
  dealId?: number;
  passcode?: string;
  instructionRef?: string;
  instructionsUrl?: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanAmount(value: string): number {
  const numeric = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

const PitchExternalForm: React.FC<PitchExternalFormProps> = ({
  currentUserInitials,
  currentUserEmail,
  onClose,
  onShowToast,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [fee, setFee] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PitchExternalResult | null>(null);

  const validate = useCallback(() => {
    if (!firstName.trim()) return 'First name is required.';
    if (!lastName.trim()) return 'Last name is required.';
    if (!email.trim()) return 'Email is required.';
    if (!emailPattern.test(email.trim())) return 'Enter a valid email address.';
    return null;
  }, [email, firstName, lastName]);

  const copyLink = useCallback(async () => {
    if (!result?.instructionsUrl) return;
    try {
      await navigator.clipboard.writeText(result.instructionsUrl);
      onShowToast?.('Pitch external link copied', 'success', result.instructionsUrl);
      trackClientEvent('pitch-external', 'Link.Copied', { source: 'home-quick-action' });
    } catch {
      onShowToast?.('Copy failed', 'warning', result.instructionsUrl);
    }
  }, [onShowToast, result?.instructionsUrl]);

  const submit = useCallback(async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResult(null);

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedEmail = email.trim();
    const amount = cleanAmount(fee);
    const description = serviceDescription.trim() || `External pitch request for ${trimmedFirstName} ${trimmedLastName}`;

    try {
      const response = await fetch('/api/deal-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'direct-referral',
          dealKind: 'DIRECT_REFERRAL',
          linkOnly: true,
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          contactEmail: trimmedEmail,
          leadClientEmail: trimmedEmail,
          serviceDescription: description,
          initialScopeDescription: description,
          amount,
          areaOfWork: 'Misc',
          pitchedBy: currentUserInitials || currentUserEmail || 'Hub',
          emailSubject: '',
          emailBody: '',
          emailBodyHtml: '',
          notes: JSON.stringify({
            source: 'home-quick-action:pitch-external',
            firstName: trimmedFirstName,
            lastName: trimmedLastName,
            email: trimmedEmail,
          }),
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false || body?.success === false) {
        throw new Error(body?.error || body?.details || 'Pitch external link could not be created.');
      }

      const issued: PitchExternalResult = {
        dealId: body.dealId,
        passcode: body.passcode,
        instructionRef: body.instructionRef,
        instructionsUrl: body.instructionsUrl,
      };
      setResult(issued);
      onShowToast?.('Pitch external link ready', 'success', issued.instructionsUrl || 'Copy the link from the panel.');
      trackClientEvent('pitch-external', 'Hub.PitchExternal.Issued', {
        source: 'home-quick-action',
        hasFee: amount > 0,
        hasDescription: Boolean(serviceDescription.trim()),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pitch external link could not be created.';
      setError(message);
      onShowToast?.('Pitch external failed', 'error', message);
      trackClientEvent('pitch-external', 'Hub.PitchExternal.Failed', { source: 'home-quick-action' }, { error: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [currentUserEmail, currentUserInitials, email, fee, firstName, lastName, onShowToast, serviceDescription, validate]);

  return (
    <form
      className="pitch-external-form"
      data-helix-region="home/pitch-external"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="pitch-external-form__intro">
        <p className="pitch-external-form__eyebrow">Direct or referral intake</p>
        <p className="pitch-external-form__copy">
          Create a deal shell and copy an Instruct link without a pre-existing enquiry. Delivery by email can come later.
        </p>
      </div>

      <div className="pitch-external-form__grid">
        <label className="pitch-external-form__field">
          <span className="helix-label">First name</span>
          <input className="helix-input pitch-external-form__input" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" required />
        </label>
        <label className="pitch-external-form__field">
          <span className="helix-label">Last name</span>
          <input className="helix-input pitch-external-form__input" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" required />
        </label>
        <label className="pitch-external-form__field pitch-external-form__field--wide">
          <span className="helix-label">Email</span>
          <input className="helix-input pitch-external-form__input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </label>
        <label className="pitch-external-form__field pitch-external-form__field--wide">
          <span className="helix-label">Description</span>
          <input className="helix-input pitch-external-form__input" value={serviceDescription} onChange={(event) => setServiceDescription(event.target.value)} placeholder="Scope or short matter description" />
        </label>
        <label className="pitch-external-form__field">
          <span className="helix-label">Fee</span>
          <input className="helix-input pitch-external-form__input" value={fee} onChange={(event) => setFee(event.target.value)} inputMode="decimal" placeholder="0.00" />
        </label>
      </div>

      {error && <p className="pitch-external-form__error">{error}</p>}

      {result?.instructionsUrl && (
        <div className="pitch-external-form__result">
          <span className="helix-label">Copyable link</span>
          <div className="pitch-external-form__link-row">
            <input className="helix-input pitch-external-form__input" value={result.instructionsUrl} readOnly aria-label="Pitch external link" />
            <button type="button" className="helix-btn-secondary" onClick={() => void copyLink()}>Copy link</button>
          </div>
        </div>
      )}

      <div className="pitch-external-form__actions">
        <button type="button" className="helix-btn-secondary" onClick={onClose} disabled={isSubmitting}>Close</button>
        <button type="submit" className="helix-btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Creating link...' : 'Create link'}</button>
      </div>
    </form>
  );
};

export default PitchExternalForm;