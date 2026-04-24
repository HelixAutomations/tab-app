// src/hooks/usePageVisible.ts
//
// Reactive boolean for `document.visibilityState !== 'hidden'`.
//
// Used to pause background work (SSE streams, pollers) while the browser tab
// is hidden so the app doesn't burn CPU + network for no visible benefit.
// On staging the multi-stream + auto-reconnect pattern was a measurable
// contributor to the "PC slows down" report.
//
// Defaults to `true` during SSR or before the first event so consumers don't
// suspend on initial mount.

import { useEffect, useState } from 'react';

function getInitialVisible(): boolean {
    if (typeof document === 'undefined') return true;
    return document.visibilityState !== 'hidden';
}

export function usePageVisible(): boolean {
    const [visible, setVisible] = useState<boolean>(getInitialVisible);

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const handler = () => setVisible(document.visibilityState !== 'hidden');
        document.addEventListener('visibilitychange', handler);
        // Also catch window focus/blur — some browsers don't always fire
        // visibilitychange when the window is alt-tabbed away on Windows.
        window.addEventListener('focus', handler);
        window.addEventListener('blur', handler);
        return () => {
            document.removeEventListener('visibilitychange', handler);
            window.removeEventListener('focus', handler);
            window.removeEventListener('blur', handler);
        };
    }, []);

    return visible;
}

export default usePageVisible;
