import { useCallback, useEffect, useRef, useState } from 'react';

type FinancialFormValues = Record<string, unknown>;

type UseFinancialFormSubmitOptions = {
  formType: string;
  initials?: string;
};

export function useFinancialFormSubmit({ formType, initials }: UseFinancialFormSubmitOptions) {
  const [formKey, setFormKey] = useState<number>(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleFinancialSubmit = useCallback(
    async (values: FinancialFormValues) => {
      if (isSubmitting) {
        return;
      }

      setIsSubmitting(true);

      const payload = {
        formType,
        data: values,
        initials: initials || 'N/A',
      };

      console.log('Form submission payload:', payload);
      if (values['Disbursement Upload']) {
        console.log('Disbursement Upload data:', values['Disbursement Upload']);
      }

      try {
        const response = await fetch('/api/financial-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error posting financial task:', errorText);
          setSubmissionSuccess(null);
          return;
        }

        await response.json();
        setSubmissionSuccess('Financial form submitted successfully!');

        if (resetTimerRef.current !== null) {
          window.clearTimeout(resetTimerRef.current);
        }

        resetTimerRef.current = window.setTimeout(() => {
          setSubmissionSuccess(null);
          setFormKey(Date.now());
        }, 3000);
      } catch (error) {
        console.error('Error in financial form submission:', error);
        setSubmissionSuccess(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [formType, initials, isSubmitting]
  );

  return {
    formKey,
    isSubmitting,
    submissionSuccess,
    setSubmissionSuccess,
    handleFinancialSubmit,
  };
}