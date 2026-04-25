import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';

export type LicenseTier = 'lite' | 'full' | 'database' | 'demo' | 'dev' | 'twincode';

interface LicenseState {
  tier: LicenseTier;
  isActivated: boolean;
  productKey: string | null;
  error: string | null;
  isLoading: boolean;
  isCompanion: boolean;
  companionSessionId: string | null;
}

interface CompanionDevice {
  id: string;
  companion_machine_id: string;
  paired_at: string | null;
  last_seen: string | null;
  status: string;
}

interface LicenseContextValue extends LicenseState {
  activate: (productKey: string) => Promise<boolean>;
  deactivate: () => void;
  pairAsCompanion: (pairingCode: string) => Promise<boolean>;
  generatePairingCode: () => Promise<{ code: string; expiresAt: string } | null>;
  listPairedCompanions: () => Promise<CompanionDevice[]>;
  revokeCompanion: (sessionId: string) => Promise<boolean>;
  /** Dev-only: override the current tier for testing gating. Pass null to clear. */
  setDevTierOverride: (tier: LicenseTier | null) => void;
  devTierOverride: LicenseTier | null;
  /** Feature gating helpers */
  canNetwork: boolean;
  canDatabase: boolean;
  /** TwinCode (bonded 2-printer mode) — only the dedicated 'twincode' tier or 'dev' unlocks it. */
  canTwinCode: boolean;
  isDemo: boolean;
  /** True if this license key is registered in developer_licenses (dev-mode bypass returns true). */
  isDeveloper: boolean;
  /** True if this license key is the master owner. */
  isOwnerDeveloper: boolean;
}

export type { CompanionDevice };

const LicenseContext = createContext<LicenseContextValue | null>(null);

const LICENSE_STORAGE_KEY = 'codesync-license';
const COMPANION_STORAGE_KEY = 'codesync-companion';
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
      return { tier: 'dev', isActivated: true, productKey: null, error: null, isLoading: false, isCompanion: false, companionSessionId: null };
    }
    
    // Check for companion session first
    try {
      const companionSaved = localStorage.getItem(COMPANION_STORAGE_KEY);
      if (companionSaved) {
        const { sessionId, tier } = JSON.parse(companionSaved);
        return { tier, isActivated: true, productKey: null, error: null, isLoading: true, isCompanion: true, companionSessionId: sessionId };
      }
    } catch {}

    try {
      const saved = localStorage.getItem(LICENSE_STORAGE_KEY);
      if (saved) {
        const { productKey, tier } = JSON.parse(saved);
        return { tier, isActivated: true, productKey, error: null, isLoading: true, isCompanion: false, companionSessionId: null };
      }
    } catch {}
    return { tier: 'lite', isActivated: false, productKey: null, error: null, isLoading: false, isCompanion: false, companionSessionId: null };
  });

  const validate = useCallback(async () => {
    if (import.meta.env.DEV) return;

    // Companion validation
    if (state.isCompanion && state.companionSessionId) {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/license?action=validate-companion`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
            body: JSON.stringify({ session_id: state.companionSessionId, machine_id: getMachineId() }),
          }
        );
        const result = await res.json();
        if (!result.valid) {
          setState(prev => ({ ...prev, isActivated: false, tier: 'lite', isCompanion: false, companionSessionId: null, error: result.error || 'Companion session expired', isLoading: false }));
          localStorage.removeItem(COMPANION_STORAGE_KEY);
          toast.error('Companion Session Ended', { description: result.error || 'Please re-pair from PC' });
        } else {
          setState(prev => ({ ...prev, tier: result.tier, error: null, isLoading: false }));
        }
      } catch {
        setState(prev => ({ ...prev, isLoading: false }));
      }
      return;
    }

    // Standard license validation
    if (!state.productKey) return;

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
        const errorMsg = result.error || 'License validation failed';
        setState(prev => ({
          ...prev,
          isActivated: false,
          tier: 'lite',
          error: errorMsg,
          isLoading: false,
        }));
        localStorage.removeItem(LICENSE_STORAGE_KEY);
        toast.error('License Deactivated', {
          description: errorMsg,
          duration: 10000,
        });
      } else {
        setState(prev => ({ ...prev, tier: result.tier, error: null, isLoading: false }));
      }
    } catch {
      // Offline — allow continued use with cached tier
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.productKey, state.isCompanion, state.companionSessionId]);

  // Validate on mount and periodically
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (state.productKey || (state.isCompanion && state.companionSessionId)) {
      validate();
      const interval = setInterval(validate, VALIDATE_INTERVAL_MS);
      return () => clearInterval(interval);
    }
  }, [state.productKey, state.isCompanion, state.companionSessionId, validate]);

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

      // Clear any companion session when activating with a key
      localStorage.removeItem(COMPANION_STORAGE_KEY);
      localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify({ productKey, tier: result.tier, activatedAt: new Date().toISOString() }));
      setState({
        tier: result.tier,
        isActivated: true,
        productKey,
        error: null,
        isLoading: false,
        isCompanion: false,
        companionSessionId: null,
      });
      return true;
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message || 'Activation failed', isLoading: false }));
      return false;
    }
  };

  const pairAsCompanion = async (pairingCode: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/license?action=pair-companion`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ pairing_code: pairingCode.toUpperCase(), machine_id: getMachineId() }),
        }
      );
      const result = await res.json();

      if (result.error) {
        setState(prev => ({ ...prev, error: result.error, isLoading: false }));
        return false;
      }

      localStorage.removeItem(LICENSE_STORAGE_KEY);
      localStorage.setItem(COMPANION_STORAGE_KEY, JSON.stringify({ sessionId: result.session_id, tier: result.tier, pairedAt: new Date().toISOString() }));
      
      // Sync printer config from PC if available
      if (result.printer_config && Array.isArray(result.printer_config)) {
        // Reset all synced printers to offline (mobile will discover connectivity itself)
        const syncedPrinters = result.printer_config.map((p: any) => ({
          ...p,
          isConnected: false,
          isAvailable: false,
          status: 'offline',
          hasActiveErrors: false,
          inkLevel: undefined,
          makeupLevel: undefined,
          currentMessage: undefined,
          printCount: undefined,
        }));
        localStorage.setItem('codesync-printers', JSON.stringify(syncedPrinters));
        toast.success('Printer configuration synced from PC');
      }

      setState({
        tier: result.tier,
        isActivated: true,
        productKey: null,
        error: null,
        isLoading: false,
        isCompanion: true,
        companionSessionId: result.session_id,
      });
      return true;
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message || 'Pairing failed', isLoading: false }));
      return false;
    }
  };

  const generatePairingCode = async (): Promise<{ code: string; expiresAt: string } | null> => {
    if (!state.productKey) return null;
    try {
      // Gather current printer config to sync to companion
      const printerConfigRaw = localStorage.getItem('codesync-printers');
      const printerConfig = printerConfigRaw ? JSON.parse(printerConfigRaw) : null;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/license?action=generate-pair-code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ product_key: state.productKey, machine_id: getMachineId(), printer_config: printerConfig }),
        }
      );
      const result = await res.json();
      if (result.error) {
        toast.error('Failed to generate pairing code', { description: result.error });
        return null;
      }
      return { code: result.pairing_code, expiresAt: result.expires_at };
    } catch {
      toast.error('Failed to generate pairing code');
      return null;
    }
  };

  const listPairedCompanions = async (): Promise<CompanionDevice[]> => {
    if (!state.productKey) return [];
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/license?action=list-companions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ product_key: state.productKey, machine_id: getMachineId() }),
        }
      );
      const result = await res.json();
      if (result.error) {
        console.error('list-companions error:', result.error);
        return [];
      }
      return result.companions || [];
    } catch (e) {
      console.error('list-companions failed:', e);
      return [];
    }
  };

  const revokeCompanion = async (sessionId: string): Promise<boolean> => {
    if (!state.productKey) return false;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/license?action=revoke-companion`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ product_key: state.productKey, machine_id: getMachineId(), session_id: sessionId }),
        }
      );
      const result = await res.json();
      if (result.error) {
        toast.error('Failed to unpair device', { description: result.error });
        return false;
      }
      return true;
    } catch {
      toast.error('Failed to unpair device');
      return false;
    }
  };

  const deactivate = () => {
    localStorage.removeItem(LICENSE_STORAGE_KEY);
    localStorage.removeItem(COMPANION_STORAGE_KEY);
    setState({ tier: 'lite', isActivated: false, productKey: null, error: null, isLoading: false, isCompanion: false, companionSessionId: null });
  };

  // Dev-only tier override (session-only, not persisted). Lets developers
  // exercise gating logic across all tiers without re-activating licenses.
  const [devTierOverride, setDevTierOverride] = useState<LicenseTier | null>(null);
  const effectiveTier: LicenseTier = devTierOverride ?? state.tier;

  // TwinCode and dev tiers also get full network access (they manage paired printers).
  const canNetwork = effectiveTier !== 'lite';
  const canDatabase = effectiveTier === 'database' || effectiveTier === 'demo' || effectiveTier === 'dev';
  const canTwinCode = effectiveTier === 'twincode' || effectiveTier === 'dev';
  const isDemo = effectiveTier === 'demo';

  // Developer-license probe — quietly check whether this product key is in
  // developer_licenses. Result is cached for the session.
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [isOwnerDeveloper, setIsOwnerDeveloper] = useState(false);
  useEffect(() => {
    // Local dev (vite) always counts as developer.
    if (import.meta.env.DEV) {
      setIsDeveloper(true);
      setIsOwnerDeveloper(true);
      return;
    }
    if (!state.productKey) {
      setIsDeveloper(false);
      setIsOwnerDeveloper(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-dev-access`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
            body: JSON.stringify({ product_key: state.productKey }),
          },
        );
        const data = await res.json();
        if (cancelled) return;
        setIsDeveloper(!!data.is_developer);
        setIsOwnerDeveloper(!!data.is_owner);
      } catch {
        if (!cancelled) {
          setIsDeveloper(false);
          setIsOwnerDeveloper(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [state.productKey]);

  return (
    <LicenseContext.Provider value={{ ...state, tier: effectiveTier, activate, deactivate, pairAsCompanion, generatePairingCode, listPairedCompanions, revokeCompanion, setDevTierOverride, devTierOverride, canNetwork, canDatabase, canTwinCode, isDemo, isDeveloper, isOwnerDeveloper }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error('useLicense must be used within LicenseProvider');
  return ctx;
}
