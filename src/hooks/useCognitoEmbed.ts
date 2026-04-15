import { useEffect, useRef, useState } from 'react';

type CognitoEmbedScript = {
  key: string;
  formId: string;
};

type UseCognitoEmbedOptions = {
  embedScript?: CognitoEmbedScript;
  isActive?: boolean;
};

const COGNITO_SCRIPT_ID = 'cognito-seamless-script';
const COGNITO_SCRIPT_SRC = 'https://www.cognitoforms.com/f/seamless.js';

let cognitoScriptPromise: Promise<void> | null = null;

function hasCognitoRuntime() {
  return typeof window !== 'undefined' && typeof (window as Window & { Cognito?: unknown }).Cognito !== 'undefined';
}

function ensureCognitoScript(): Promise<void> {
  if (hasCognitoRuntime()) {
    return Promise.resolve();
  }

  if (cognitoScriptPromise) {
    return cognitoScriptPromise;
  }

  cognitoScriptPromise = new Promise<void>((resolve, reject) => {
    const handleLoad = () => {
      if (hasCognitoRuntime()) {
        resolve();
        return;
      }

      cognitoScriptPromise = null;
      reject(new Error('Cognito script loaded but Cognito is not available'));
    };

    const handleError = () => {
      cognitoScriptPromise = null;
      reject(new Error('Failed to load Cognito script'));
    };

    const existingScript = document.getElementById(COGNITO_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = COGNITO_SCRIPT_ID;
    script.src = COGNITO_SCRIPT_SRC;
    script.async = true;
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    document.body.appendChild(script);
  });

  return cognitoScriptPromise;
}

export function useCognitoEmbed({ embedScript, isActive = true }: UseCognitoEmbedOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCognitoLoaded, setIsCognitoLoaded] = useState<boolean>(false);
  const [cognitoError, setCognitoError] = useState<string | null>(null);

  useEffect(() => {
    if (!embedScript || !isActive) {
      setIsCognitoLoaded(false);
      setCognitoError(null);
      return;
    }

    let isCancelled = false;

    setIsCognitoLoaded(false);
    setCognitoError(null);

    ensureCognitoScript()
      .then(() => {
        if (!isCancelled) {
          setIsCognitoLoaded(true);
        }
      })
      .catch((error: Error) => {
        if (!isCancelled) {
          setCognitoError(error.message);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [embedScript, isActive]);

  useEffect(() => {
    if (!isCognitoLoaded || !embedScript || !containerRef.current) {
      return;
    }

    containerRef.current.innerHTML = '';

    const formScript = document.createElement('script');
    formScript.src = COGNITO_SCRIPT_SRC;
    formScript.async = true;
    formScript.setAttribute('data-key', embedScript.key);
    formScript.setAttribute('data-form', embedScript.formId);
    containerRef.current.appendChild(formScript);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [embedScript, isCognitoLoaded]);

  return {
    containerRef,
    isCognitoLoaded,
    cognitoError,
  };
}