import React from 'react';
import { WebView } from 'react-native-webview';
import type { RuntimeMessage } from '../core/types';

export interface RuntimeViewProps {
  html: string;
  onMessage: (message: RuntimeMessage) => void;
}

/**
 * Android/iOS host for the runtime document.
 *
 * `source={{ html }}` is a self-contained page: no server, no CORS, no local
 * filesystem. `baseUrl` gives the page a secure-context origin so that
 * `crypto.subtle` is available inside the app.
 */
export default function RuntimeView({ html, onMessage }: RuntimeViewProps) {
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://kailarp.invalid/' }}
      javaScriptEnabled
      domStorageEnabled
      allowFileAccess={false}
      allowUniversalAccessFromFileURLs={false}
      setSupportMultipleWindows={false}
      style={{ width: 240, height: 320, backgroundColor: '#000', borderRadius: 14 }}
      onMessage={(event) => {
        try {
          onMessage(JSON.parse(event.nativeEvent.data) as RuntimeMessage);
        } catch {
          /* not one of ours */
        }
      }}
    />
  );
}
