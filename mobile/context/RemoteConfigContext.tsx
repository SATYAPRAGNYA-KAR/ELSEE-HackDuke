import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type RemoteConfig = {
  /** API base (https://...) — from MongoDB `app_config` when deployed */
  api_base_url: string;
  ws_url: string;
  /** Optional LAN URL for dev sync to Mac */
  dev_sync_url: string;
  from_mongodb: boolean;
  loaded: boolean;
};

const envApi = (process.env.EXPO_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
const envWs = process.env.EXPO_PUBLIC_WS_URL || '';
const envDevSync = (process.env.EXPO_PUBLIC_DEV_SYNC_URL || '').replace(/\/$/, '');

const RemoteConfigContext = createContext<RemoteConfig>({
  api_base_url: envApi,
  ws_url: envWs,
  dev_sync_url: envDevSync,
  from_mongodb: false,
  loaded: false,
});

export function RemoteConfigProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<RemoteConfig>(() => ({
    api_base_url: envApi,
    ws_url: envWs,
    dev_sync_url: envDevSync,
    from_mongodb: false,
    loaded: false,
  }));

  useEffect(() => {
    const bootstrap = envApi;
    if (!bootstrap) {
      setCfg((c) => ({ ...c, loaded: true }));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${bootstrap}/api/public/config`);
        if (!res.ok || cancelled) {
          setCfg((c) => ({ ...c, loaded: true }));
          return;
        }
        const data = (await res.json()) as {
          api_base_url?: string;
          ws_url?: string;
          dev_sync_url?: string;
          from_mongodb?: boolean;
        };
        if (cancelled) return;
        setCfg({
          api_base_url: (data.api_base_url || envApi).replace(/\/$/, ''),
          ws_url: data.ws_url || envWs,
          dev_sync_url: (data.dev_sync_url || envDevSync).replace(/\/$/, ''),
          from_mongodb: !!data.from_mongodb,
          loaded: true,
        });
      } catch {
        setCfg((c) => ({ ...c, loaded: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => cfg, [cfg]);
  return (
    <RemoteConfigContext.Provider value={value}>
      {children}
    </RemoteConfigContext.Provider>
  );
}

export function useRemoteConfig() {
  return useContext(RemoteConfigContext);
}
