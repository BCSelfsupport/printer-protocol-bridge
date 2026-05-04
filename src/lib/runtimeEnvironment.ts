export const isLovablePreviewRuntime = () => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host.startsWith('id-preview--') && host.endsWith('.lovable.app');
};

export const isDevPanelPreviewRuntime = () => import.meta.env.DEV || isLovablePreviewRuntime();