import React, { useEffect } from 'react';
import type { RuntimeMessage } from '../core/types';

export interface RuntimeViewProps {
  html: string;
  onMessage: (message: RuntimeMessage) => void;
}

/**
 * Web host for the runtime document.
 *
 * `srcDoc` keeps the page same-origin with the app, so it is a secure context
 * and `crypto.subtle` is the real thing. The runtime posts messages up with
 * `window.parent.postMessage`.
 */
export default function RuntimeView({ html, onMessage }: RuntimeViewProps) {
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as RuntimeMessage | undefined;
      if (data && typeof data === 'object' && 'type' in data) onMessage(data);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMessage]);

  return (
    <iframe
      title="kailarp-runtime"
      srcDoc={html}
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
      style={{
        width: 240,
        height: 320,
        border: 'none',
        borderRadius: 14,
        background: '#000',
        boxShadow: '0 0 0 1px #22304a, 0 12px 40px rgba(0,0,0,.5)',
      }}
    />
  );
}
