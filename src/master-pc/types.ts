import type { Printer, PrinterMetrics } from '@/types/printer';
import type { ProductionRun, ProductionSnapshot } from '@/types/production';
import type { CustomReportTemplate } from '@/types/reportTemplates';
export interface SharedSnapshot { schema: number; observedAt: number; printers: Printer[]; metrics: Record<number, { observedAt: number; values: Partial<PrinterMetrics> }> }
export interface SharedHistory { runs: ProductionRun[]; snapshots: ProductionSnapshot[]; templates: CustomReportTemplate[] }
export interface SharingInfo { mode: 'control' | 'viewer'; enabled: boolean; configured?: boolean; name: string; addresses: string[]; fingerprint: string | null; code: string | null; expiresAt: number | null; pending: { id: string; name: string }[]; viewers: { id: string; name: string; lastSeen: number }[] }
export interface ViewerState { mode: 'control' | 'viewer'; status?: 'pending' | 'approved' | 'offline' | 'revoked'; snapshot?: SharedSnapshot | null; historyRevision?: number; name?: string; error?: string }
export interface MasterCredentials { productKey: string; machineId: string; apiKey: string }
export interface SharingAPI {
  info: () => Promise<SharingInfo>;
  shouldResume: () => Promise<boolean>;
  start: (credentials: MasterCredentials) => Promise<SharingInfo>;
  authorize: (credentials: MasterCredentials) => Promise<void>;
  stop: () => Promise<SharingInfo>;
  newCode: () => Promise<SharingInfo>;
  approve: (id: string) => Promise<SharingInfo>;
  revoke: (id: string) => Promise<SharingInfo>;
  join: (details: { address: string; fingerprint: string; code: string; name: string }) => Promise<{ status: string }>;
  poll: () => Promise<ViewerState>;
  readHistory: (store: keyof SharedHistory, offset: number) => Promise<{ revision: number; records: unknown[]; next: number | null }>;
  leave: () => Promise<{ mode: string }>;
  publish: (snapshot: { printers: Printer[]; metrics: SharedSnapshot['metrics']; history?: SharedHistory }) => Promise<void>;
}
