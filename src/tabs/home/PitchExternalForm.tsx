import React, { useCallback, useMemo, useState } from 'react';
import { trackClientEvent } from '../../utils/telemetry';
import { recordIntent } from '../../utils/recordIntent';
import type { TeamData } from '../../app/functionality/types';
import './PitchExternalForm.css';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface PitchExternalFormProps {
  currentUserInitials?: string;
  currentUserEmail?: string;
  teamData?: TeamData[] | null;
  onClose: () => void;
  onShowToast?: (message: string, type: ToastType, details?: string) => void;
}

interface PitchNewResult {
  enquiryId?: string | number;
  dealId?: number;
  passcode?: string;
  instructionRef?: string;
  instructionsUrl?: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AREA_OF_WORK_OPTIONS = ['Commercial', 'Construction', 'Employment', 'Property'];
const METHOD_OF_CONTACT_OPTIONS = ['Call In', 'Web Form', 'Direct FE Email', 'Direct Firm Email', 'Referral'];
const VALUE_BAND_OPTIONS = [
  '£10,000 or less',
  '£10,000 to £50,000',
  '£50,000 to £100,000',
  '£100,000 to £250,000',
  '£250,000 to £500,000',
  '£500,000 or more',
  'Unsure',
  'Non-monetary claim',
];

function buildSourceOptions(userEmail?: string): Array<{ value: string; label: string }> {
  const initials = (userEmail?.split('@')[0] || 'fe').slice(0, 2).toLowerCase();
  return [
    { value: 'referral', label: 'Referral' },
    { value: 'organic search', label: 'Organic Search' },
    { value: 'paid search', label: 'Paid Search' },
    { value: `${initials} following`, label: `${initials.toUpperCase()} Following` },
    { value: 'tbc', label: 'TBC' },
  ];
}

function cleanAmount(value: string): number {
  const numeric = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

const PitchExternalForm: React.FC<PitchExternalFormProps> = ({
  currentUserInitials,
  currentUserEmail,
  teamData,
  onClose,
  onShowToast,
}) => {
  const teamOptions = useMemo(() => {
    if (!teamData) return [] as Array<{ value: string; label: string }>;
    return teamData
      .filter((member) => (member.status || '').toLowerCase() === 'active' && member.Email)
      .map((member) => ({ value: member.Email as string, label: member['Full Name'] || (member.Email as string) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [teamData]);

  const sourceOptions = useMemo(() => buildSourceOptions(currentUserEmail), [currentUserEmail]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [aow, setAow] = useState('');
  const [tow, setTow] = useState('');
  const [moc, setMoc] = useState('Direct FE Email');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [rep, setRep] = useState<string>(currentUserEmail || '');
  const [source, setSource] = useState('');
  const [referrerFirst, setReferrerFirst] = useState('');
  const [referrerLast, setReferrerLast] = useState('');
  const [companyReferrer, setCompanyReferrer] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [fee, setFee] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PitchNewResult | null>(null);

  const isReferral = moc.trim().toLowerCase() === 'referral';

  const validate = useCallback((): string | null => {
    if (!firstName.trim() || !lastName.trim()) return 'First and last name are required.';
    if (!email.trim() && !phone.trim()) return 'Either email or phone is required.';
    if (email.trim() && !emailPattern.test(email.trim())) return 'Enter a valid email address.';
    if (!aow) return 'Area of work is required.';
    if (!moc) return 'Method of contact is required.';
    if (isReferral && (!referrerFirst.trim() || !referrerLast.trim() || !companyReferrer.trim())) {
      return 'Referrer first name, last name and company are required for referrals.';
    }
    if (!value) return 'Value band is required.';
    if (!rep) return 'Point of contact is required.';
    if (!source && !isReferral) return 'Source is required.';
    if (!serviceDescription.trim()) return 'Short service description is required for the pitch link.';
    return null;
  }, [aow, companyReferrer, email, firstName, isReferral, lastName, moc, phone, referrerFirst, referrerLast, rep, serviceDescription, source, value]);

  const copyLink = useCallback(async () => {
    if (!result?.instructionsUrl) return;
    try {
      await navigator.clipboard.writeText(result.instructionsUrl);
      onShowToast?.('Pitch link copied', 'success', result.instructionsUrl);
      trackClientEvent('pitch-new', 'Link.Copied', { source: 'home-quick-action' });
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

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const trimmedDescription = serviceDescription.trim() || `Pitch for ${trimmedFirst} ${trimmedLast}`;
    const amount = cleanAmount(fee);
    const resolvedSource = isReferral ? 'referral' : source.trim().toLowerCase();
    const contactReferrer = isReferral
      ? [referrerFirst.trim(), referrerLast.trim()].filter(Boolean).join(' ')
      : '';

    try {
      const clientSubmissionId = await recordIntent({
        formKey: 'pitch-new',
        payload: {
          source: 'home-quick-action:pitch-new',
          areaOfWork: aow,
          methodOfContact: moc,
          value,
          hasEmail: Boolean(trimmedEmail),
          hasPhone: Boolean(trimmedPhone),
        },
      });

      setProgress('Creating contact...');
      const contactPayload = {
        data: {
          first: trimmedFirst,
          last: trimmedLast,
          email: trimmedEmail,
          phone: trimmedPhone || undefined,
          aow,
          tow: tow.trim() || undefined,
          moc,
          value,
          notes: notes.trim() || undefined,
          rep: rep || currentUserEmail || undefined,
          contact_referrer: contactReferrer || undefined,
          company_referrer: isReferral ? (companyReferrer.trim() || undefined) : undefined,
          source: resolvedSource || 'manual',
        },
      };

      const contactRes = await fetch('/api/enquiries-unified/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactPayload),
      });
      const contactBody = await contactRes.json().catch(() => ({}));
      if (!contactRes.ok || contactBody?.success === false) {
        throw new Error(contactBody?.error || contactBody?.details || 'Could not create contact.');
      }
      const enquiryId = contactBody.id || contactBody.enquiryId;
      if (!enquiryId) {
        throw new Error('Contact created but no enquiry id was returned.');
      }
      trackClientEvent('pitch-new', 'Contact.Created', { source: 'home-quick-action' });

      setProgress('Issuing pitch link...');
      const dealPayload: Record<string, unknown> = {
        linkOnly: true,
        prospectId: enquiryId,
        serviceDescription: trimmedDescription,
        initialScopeDescription: trimmedDescription,
        amount,
        areaOfWork: aow || 'Misc',
        pitchedBy: currentUserInitials || currentUserEmail || 'Hub',
        firstName: trimmedFirst,
        lastName: trimmedLast,
        clientName: `${trimmedFirst} ${trimmedLast}`.trim(),
        contactEmail: trimmedEmail || undefined,
        leadClientEmail: trimmedEmail || undefined,
        emailRecipients: {
          feeEarnerEmail: currentUserEmail || undefined,
        },
        emailSubject: '',
        emailBody: '',
        emailBodyHtml: '',
        notes: JSON.stringify({
          source: 'home-quick-action:pitch-new',
          clientSubmissionId,
          enquiryId,
          firstName: trimmedFirst,
          lastName: trimmedLast,
          email: trimmedEmail,
          phone: trimmedPhone || null,
        }),
      };
      dealPayload.clientSubmissionId = clientSubmissionId;

      const dealRes = await fetch('/api/deal-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dealPayload),
      });
      const dealBody = await dealRes.json().catch(() => ({}));
      if (!dealRes.ok || dealBody?.ok === false || dealBody?.success === false) {
        throw new Error(dealBody?.error || dealBody?.details || 'Contact created but pitch link could not be issued.');
      }

      const issued: PitchNewResult = {
        enquiryId,
        dealId: dealBody.dealId,
        passcode: dealBody.passcode,
        instructionRef: dealBody.instructionRef,
        instructionsUrl: dealBody.instructionsUrl,
      };
      setResult(issued);
      setProgress('');
      onShowToast?.('Pitch link ready', 'success', issued.instructionsUrl || 'Copy the link from the panel.');
      trackClientEvent('pitch-new', 'Hub.PitchNew.Issued', {
        source: 'home-quick-action',
        hasFee: amount > 0,
        method: moc,
        area: aow,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pitch link could not be created.';
      setError(message);
      setProgress('');
      onShowToast?.('New Pitch failed', 'error', message);
      trackClientEvent('pitch-new', 'Hub.PitchNew.Failed', { source: 'home-quick-action', error: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [aow, companyReferrer, currentUserEmail, currentUserInitials, email, fee, firstName, isReferral, lastName, moc, notes, onShowToast, phone, referrerFirst, referrerLast, rep, serviceDescription, source, tow, validate, value]);

  return (
    <form
      className="pitch-external-form"
      data-helix-region="home/pitch-new"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="pitch-external-form__intro">
        <p className="pitch-external-form__eyebrow">New contact and pitch link</p>
        <p className="pitch-external-form__copy">
          Capture a new prospect contact and issue an Instruct pitch link in one step. The link is attached to the contact you create here.
        </p>
      </div>

      <div className="pitch-external-form__content">
        <section className="pitch-external-form__section">
          <div className="pitch-external-form__section-header">Contact details</div>
          <div className="pitch-external-form__grid">
            <label className="pitch-external-form__field">
              <span className="helix-label">First name</span>
              <input className="helix-input pitch-external-form__input" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required />
            </label>
            <label className="pitch-external-form__field">
              <span className="helix-label">Last name</span>
              <input className="helix-input pitch-external-form__input" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required />
            </label>
            <label className="pitch-external-form__field">
              <span className="helix-label">Email</span>
              <input className="helix-input pitch-external-form__input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="pitch-external-form__field">
              <span className="helix-label">Phone</span>
              <input className="helix-input pitch-external-form__input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07123 456789" autoComplete="tel" />
            </label>
            <label className="pitch-external-form__field">
              <span className="helix-label">Point of contact</span>
              <select className="helix-input pitch-external-form__input" value={rep} onChange={(e) => setRep(e.target.value)} required>
                <option value="">Select team member...</option>
                {teamOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
                {currentUserEmail && !teamOptions.some((o) => o.value === currentUserEmail) && (
                  <option value={currentUserEmail}>{currentUserEmail}</option>
                )}
              </select>
            </label>
            <label className="pitch-external-form__field">
              <span className="helix-label">Source</span>
              <select className="helix-input pitch-external-form__input" value={isReferral ? 'referral' : source} onChange={(e) => setSource(e.target.value)} disabled={isReferral} required={!isReferral}>
                <option value="">Select source...</option>
                {sourceOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="pitch-external-form__section">
          <div className="pitch-external-form__section-header">Intake details</div>
          <div className="pitch-external-form__grid">
            <label className="pitch-external-form__field">
              <span className="helix-label">Area of work</span>
              <select className="helix-input pitch-external-form__input" value={aow} onChange={(e) => setAow(e.target.value)} required>
                <option value="">Select area...</option>
                {AREA_OF_WORK_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <label className="pitch-external-form__field">
              <span className="helix-label">Method of contact</span>
              <select className="helix-input pitch-external-form__input" value={moc} onChange={(e) => setMoc(e.target.value)} required>
                <option value="">Select method...</option>
                {METHOD_OF_CONTACT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <label className="pitch-external-form__field">
              <span className="helix-label">Type of work</span>
              <input className="helix-input pitch-external-form__input" value={tow} onChange={(e) => setTow(e.target.value)} placeholder="Optional" />
            </label>
            <label className="pitch-external-form__field">
              <span className="helix-label">Value band</span>
              <select className="helix-input pitch-external-form__input" value={value} onChange={(e) => setValue(e.target.value)} required>
                <option value="">Select value...</option>
                {VALUE_BAND_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>

            {isReferral && (
              <>
                <label className="pitch-external-form__field">
                  <span className="helix-label">Referrer first name</span>
                  <input className="helix-input pitch-external-form__input" value={referrerFirst} onChange={(e) => setReferrerFirst(e.target.value)} required />
                </label>
                <label className="pitch-external-form__field">
                  <span className="helix-label">Referrer last name</span>
                  <input className="helix-input pitch-external-form__input" value={referrerLast} onChange={(e) => setReferrerLast(e.target.value)} required />
                </label>
                <label className="pitch-external-form__field pitch-external-form__field--wide">
                  <span className="helix-label">Referring company</span>
                  <input className="helix-input pitch-external-form__input" value={companyReferrer} onChange={(e) => setCompanyReferrer(e.target.value)} required />
                </label>
              </>
            )}

            <label className="pitch-external-form__field pitch-external-form__field--wide">
              <span className="helix-label">Notes</span>
              <input className="helix-input pitch-external-form__input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes about the enquiry" />
            </label>
          </div>
        </section>

        <section className="pitch-external-form__section">
          <div className="pitch-external-form__section-header">Pitch link</div>
          <div className="pitch-external-form__grid">
            <label className="pitch-external-form__field pitch-external-form__field--wide">
              <span className="helix-label">Service description</span>
              <input className="helix-input pitch-external-form__input" value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} placeholder="Short scope used on the pitch link" required />
            </label>
            <label className="pitch-external-form__field">
              <span className="helix-label">Estimated fee</span>
              <input className="helix-input pitch-external-form__input" value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="0.00" />
            </label>
          </div>
        </section>

        {progress && !error && <p className="pitch-external-form__copy">{progress}</p>}
        {error && <p className="pitch-external-form__error">{error}</p>}

        {result?.instructionsUrl && (
          <div className="pitch-external-form__result">
            <span className="helix-label">Copyable link</span>
            <div className="pitch-external-form__link-row">
              <input className="helix-input pitch-external-form__input" value={result.instructionsUrl} readOnly aria-label="Pitch link" />
              <button type="button" className="helix-btn-secondary" onClick={() => void copyLink()}>Copy link</button>
            </div>
          </div>
        )}

        <div className="pitch-external-form__actions">
          <button type="button" className="helix-btn-secondary" onClick={onClose} disabled={isSubmitting}>Close</button>
          <button type="submit" className="helix-btn-primary" disabled={isSubmitting}>
            {isSubmitting ? (progress || 'Working...') : 'Create contact + pitch link'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default PitchExternalForm;
