import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { useLicense } from '@/contexts/LicenseContext';
import { supabase } from '@/integrations/supabase/client';

const MACHINE_ID_KEY = 'codesync-machine-id';

function getMachineId(): string {
  let id = localStorage.getItem(MACHINE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(MACHINE_ID_KEY, id);
  }
  return id;
}

/**
 * Floating Scan shortcut for paired mobile companions. Pulses when there is a
 * pending scan_request waiting on the PC so the operator knows to tap.
 *
 * Hidden on the /scan page itself and for non-companion devices.
 */
export function CompanionScanFab() {
  const { isCompanion } = useLicense();
  const location = useLocation();
  const navigate = useNavigate();
  const [hasPending, setHasPending] = useState(false);

  // Subscribe to scan_requests inserts so the FAB pulses immediately when the
  // PC asks for a scan. We don't filter by license_id here — the /scan page
  // re-validates ownership before fulfilling.
  useEffect(() => {
    if (!isCompanion) return;
    const channel = supabase
      .channel(`companion-scan-fab-${getMachineId()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scan_requests' },
        (payload) => {
          const row = payload.new as { status?: string };
          if (row.status === 'pending') setHasPending(true);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scan_requests' },
        (payload) => {
          const row = payload.new as { status?: string };
          if (row.status && row.status !== 'pending') setHasPending(false);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isCompanion]);

  // Clear pending flag once the operator opens the scan page
  useEffect(() => {
    if (location.pathname === '/scan') setHasPending(false);
  }, [location.pathname]);

  if (!isCompanion) return null;
  if (location.pathname === '/scan') return null;

  return (
    <button
      onClick={() => navigate('/scan')}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-3 shadow-lg shadow-primary/40 hover:scale-105 transition-transform"
      aria-label="Open scan page"
    >
      {hasPending && (
        <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
      )}
      <ScanLine className="w-5 h-5 relative" />
      <span className="text-sm font-semibold relative">Scan</span>
    </button>
  );
}
