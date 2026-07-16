export const PREVIEW_DEV_PASSWORD = 'CITEC';

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

export const isPreviewDevPassword = (password: string) =>
  password.trim().toUpperCase() === PREVIEW_DEV_PASSWORD;