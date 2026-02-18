import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type LicenseTier = 'lite' | 'full' | 'database' | 'demo' | 'dev';

interface LicenseState {
  tier: LicenseTier;
  isActivated: boolean;
  productKey: string | null;
  error: string | null;
  isLoading: boolean;
}

interface LicenseContextValue extends LicenseState {
  activate: (productKey: string) => Promise<boolean>;
  deactivate: () => void;
  /** Feature gating helpers */
  canNetwork: boolean;
  canDatabase: boolean;
  isDemo: boolean;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

const LICENSE_STORAGE_KEY = 'codesync-license';
const MACHINE_ID_KEY = 'codesync-machine-id';
const VALIDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function getMachineId(): string {
  let id = localStorage.getItem(MACHINE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(MACHINE_ID_KEY, id);
  }
  return id;
}

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LicenseState>(() => {
    // In dev mode, default to full dev access
    if (import.meta.env.DEV) {
      return { tier: 'dev', isActivated: true, productKey: null, error: null, isLoading: false };
    }
    
    try {
      const saved = localStorage.getItem(LICENSE_STORAGE_KEY);
      if (saved) {
        const { productKey, tier } = JSON.parse(saved);
        return { tier, isActivated: true, productKey, error: null, isLoading: true };
      }
    } catch {}
    return { tier: 'lite', isActivated: false, productKey: null, error: null, isLoading: false };
  });

  const validate = useCallback(async () => {
    if (!state.productKey || import.meta.env.DEV) return;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/license?action=validate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ product_key: state.productKey, machine_id: getMachineId() }),
        }
      );
      const result = await res.json();

      if (!result.valid) {
        setState(prev => ({
          ...prev,
          isActivated: false,
          tier: 'lite',
          error: result.error || 'License validation failed',
          isLoading: false,
        }));
        localStorage.removeItem(LICENSE_STORAGE_KEY);
      } else {
        setState(prev => ({ ...prev, tier: result.tier, error: null, isLoading: false }));
      }
    } catch {
      // Offline — allow continued use with cached tier
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.productKey]);

  // Validate on mount and periodically
  useEffect(() => {
    if (state.productKey && !import.meta.env.DEV) {
      validate();
      const interval = setInterval(validate, VALIDATE_INTERVAL_MS);
      return () => clearInterval(interval);
    }
  }, [state.productKey, validate]);

  const activate = async (productKey: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/license?action=activate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ product_key: productKey, machine_id: getMachineId() }),
        }
      );
      const result = await res.json();

      if (result.error) {
        setState(prev => ({ ...prev, error: result.error, isLoading: false }));
        return false;
      }

      localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify({ productKey, tier: result.tier, activatedAt: new Date().toISOString() }));
      setState({
        tier: result.tier,
        isActivated: true,
        productKey,
        error: null,
        isLoading: false,
      });
      return true;
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message || 'Activation failed', isLoading: false }));
      return false;
    }
  };

  const deactivate = () => {
    localStorage.removeItem(LICENSE_STORAGE_KEY);
    setState({ tier: 'lite', isActivated: false, productKey: null, error: null, isLoading: false });
  };

  const canNetwork = true; // All tiers have full network access
  const canDatabase = true; // All tiers have full database access
  const isDemo = state.tier === 'demo';

  return (
    <LicenseContext.Provider value={{ ...state, activate, deactivate, canNetwork, canDatabase, isDemo }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error('useLicense must be used within LicenseProvider');
  return ctx;
}
