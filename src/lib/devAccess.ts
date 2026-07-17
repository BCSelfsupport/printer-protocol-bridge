export const PREVIEW_DEV_PASSWORD = 'CITEC';

export const normalizeDevPassword = (password: string) =>
  (password ?? '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toUpperCase();

export const isDevAccessRuntime = () => {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;

  const host = window.location.hostname;
  return (
    window.electronAPI?.isElectron === true ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.lovable.app') ||
    host.endsWith('.lovableproject.com') ||
    host.endsWith('.lovable.dev')
  );
};

export const isPreviewDevPassword = (password: string) => {
  const p = normalizeDevPassword(password);
  // Accept CITEC (dev/emulator) and TEXAS (admin) in preview/Electron so the
  // dev portal opens whether the user recalls the dev or the admin password.
  return p === PREVIEW_DEV_PASSWORD || p === 'TEXAS';
};