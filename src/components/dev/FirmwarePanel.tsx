import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  FileArchive,
  CheckCircle2,
  HardDrive,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  Usb,
} from 'lucide-react';
import { toast } from 'sonner';
import { unzipSync } from 'fflate';
import { useLicense } from '@/contexts/LicenseContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface PackageFile {
  path: string;
  storage_path: string;
  size: number;
}

interface FirmwarePackage {
  id: string;
  version: string;
  model: string | null;
  notes: string | null;
  files: PackageFile[];
  total_bytes: number;
  is_published: boolean;
  created_at: string;
}

interface UsbDrive {
  path: string;
  label: string;
  removable: boolean;
  freeLabel: string;
}

function formatBytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function FirmwarePanel() {
  const { productKey } = useLicense();
  const electronAPI = (window as any).electronAPI;
  const isElectron = !!electronAPI?.isElectron;

  const [packages, setPackages] = useState<FirmwarePackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [drives, setDrives] = useState<UsbDrive[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<string>('');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [wipeFirst, setWipeFirst] = useState(true);

  // Upload form
  const [newVersion, setNewVersion] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const callApi = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/firmware-library`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          ...(productKey ? { 'x-license-key': productKey } : {}),
        },
        body: JSON.stringify({ product_key: productKey, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      return data;
    },
    [productKey],
  );

  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callApi({ action: 'list' });
      setPackages(data.packages ?? []);
    } catch (err) {
      toast.error('Could not load the firmware library', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [callApi]);

  const refreshDrives = useCallback(async () => {
    if (!isElectron) return;
    const res = await electronAPI.firmware.listDrives();
    const list: UsbDrive[] = res?.drives ?? [];
    setDrives(list);
    setSelectedDrive((current) => {
      if (current && list.some((d) => d.path === current)) return current;
      const removable = list.find((d) => d.removable);
      return removable?.path ?? list[0]?.path ?? '';
    });
  }, [electronAPI, isElectron]);

  useEffect(() => {
    loadPackages();
    refreshDrives();
  }, [loadPackages, refreshDrives]);

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === selectedPackageId) ?? null,
    [packages, selectedPackageId],
  );

  /** Download the package (zip or loose files) and write the extracted layout to the USB drive. */
  const handlePrepareDrive = async () => {
    if (!selectedPackage || !selectedDrive) return;
    setBusy('write');
    setProgress(0);
    try {
      const signed = await callApi({ action: 'sign_download', id: selectedPackage.id });
      const files: Array<{ path: string; url: string; size: number }> = signed.files ?? [];
      const payload: Array<{ path: string; dataBase64: string }> = [];

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`Could not download ${file.path}`);
        const buf = new Uint8Array(await res.arrayBuffer());

        if (isZipName(file.path)) {
          // Extract exactly as "extract here" onto the drive root.
          const entries = unzipSync(buf);
          for (const [name, data] of Object.entries(entries)) {
            if (name.endsWith('/') || data.length === 0) continue;
            payload.push({ path: normaliseZipPath(name), dataBase64: toBase64(data) });
          }
        } else {
          payload.push({ path: file.path, dataBase64: toBase64(buf) });
        }
        setProgress(Math.round(((i + 1) / files.length) * 80));
      }

      if (payload.length === 0) throw new Error('The firmware package is empty');

      // Top-level folders in the package, cleared first so no stale files remain.
      const topFolders = Array.from(
        new Set(payload.map((f) => f.path.split('/')[0]).filter((seg) => seg && f_isFolder(payload, seg))),
      );

      const result = await electronAPI.firmware.writePackage({
        drivePath: selectedDrive,
        files: payload,
        clearPaths: wipeFirst ? topFolders : [],
      });
      setProgress(100);
      if (!result?.success) throw new Error(result?.error || 'Write failed');
      toast.success('USB drive ready', {
        description: `${result.fileCount} files (${result.totalLabel}) written and verified. Plug the drive into the printer and press Update Firmware.`,
      });
    } catch (err) {
      toast.error('Could not prepare the drive', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(null);
      setTimeout(() => setProgress(0), 1500);
    }
  };


  const handleUpload = async () => {
    if (!newVersion.trim() || pendingFiles.length === 0) return;
    setBusy('upload');
    setProgress(0);
    try {
      const relPaths = pendingFiles.map((f) => stripRootFolder((f as any).webkitRelativePath || f.name));
      const signed = await callApi({ action: 'sign_upload', paths: relPaths });
      const uploads: Array<{ path: string; storage_path: string; url: string }> = signed.uploads ?? [];

      for (let i = 0; i < pendingFiles.length; i += 1) {
        const target = uploads[i];
        const res = await fetch(target.url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: pendingFiles[i],
        });
        if (!res.ok) throw new Error(`Upload failed for ${target.path}`);
        setProgress(Math.round(((i + 1) / pendingFiles.length) * 100));
      }

      await callApi({
        action: 'create',
        version: newVersion.trim(),
        model: newModel.trim() || null,
        notes: newNotes.trim() || null,
        files: uploads.map((u, i) => ({
          path: u.path,
          storage_path: u.storage_path,
          size: pendingFiles[i].size,
        })),
      });

      toast.success(`Firmware ${newVersion.trim()} added to the library`);
      setNewVersion('');
      setNewModel('');
      setNewNotes('');
      setPendingFiles([]);
      if (folderInputRef.current) folderInputRef.current.value = '';
      loadPackages();
    } catch (err) {
      toast.error('Upload failed', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(null);
      setTimeout(() => setProgress(0), 1500);
    }
  };

  const handleDelete = async (pkg: FirmwarePackage) => {
    if (!confirm(`Delete firmware ${pkg.version}? This removes the files permanently.`)) return;
    try {
      await callApi({ action: 'delete', id: pkg.id });
      toast.success(`Firmware ${pkg.version} deleted`);
      if (selectedPackageId === pkg.id) setSelectedPackageId('');
      loadPackages();
    } catch (err) {
      toast.error('Delete failed', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Why there is no direct cable flash */}
      <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The printer CPU reads firmware from its own USB host port, and the rear-port protocol has no
          firmware transfer command — so a PC-to-printer cable cannot flash it. This utility removes the
          manual copying instead: pick a version, and CodeSync writes the exact folder layout to the USB
          drive and verifies every file.
        </p>
      </div>

      {/* Prepare a drive */}
      <div className="space-y-2 rounded-md border border-border p-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold">
            <Usb className="h-3.5 w-3.5" /> Prepare USB drive
          </span>
          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={refreshDrives} disabled={!isElectron}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        {!isElectron ? (
          <p className="text-[11px] text-muted-foreground">
            Drive writing is only available in the desktop app — browsers cannot access USB storage.
            You can still manage the library here.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Firmware version</Label>
                <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Choose a version" />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.version}
                        {p.model ? ` · ${p.model}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Target drive</Label>
                <Select value={selectedDrive} onValueChange={setSelectedDrive}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Choose a drive" />
                  </SelectTrigger>
                  <SelectContent>
                    {drives.map((d) => (
                      <SelectItem key={d.path} value={d.path} className="text-xs">
                        {d.path} — {d.label}
                        {d.removable ? '' : ' (fixed disk)'}
                        {d.freeLabel ? ` · ${d.freeLabel} free` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={wipeFirst}
                onChange={(e) => setWipeFirst(e.target.checked)}
                className="h-3 w-3"
              />
              Remove previous firmware folders on the drive first
            </label>

            {selectedPackage && (
              <div className="rounded bg-muted/40 p-1.5 text-[10px] text-muted-foreground">
                {selectedPackage.files.length} files · {formatBytes(selectedPackage.total_bytes)}
                {selectedPackage.notes ? ` · ${selectedPackage.notes}` : ''}
              </div>
            )}

            {busy === 'write' && <Progress value={progress} className="h-1.5" />}

            <Button
              size="sm"
              className="h-8 w-full"
              disabled={!selectedPackage || !selectedDrive || busy !== null}
              onClick={handlePrepareDrive}
            >
              {busy === 'write' ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <HardDrive className="mr-1 h-3.5 w-3.5" />
              )}
              Write &amp; verify firmware to drive
            </Button>
          </>
        )}
      </div>

      {/* Library */}
      <div className="space-y-2 rounded-md border border-border p-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Firmware library</span>
          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={loadPackages} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        </div>
        <ScrollArea className="max-h-44">
          <div className="space-y-1 pr-2">
            {packages.length === 0 && !loading && (
              <p className="text-[11px] text-muted-foreground">No firmware versions uploaded yet.</p>
            )}
            {packages.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono">{p.version}</span>
                    {p.model && (
                      <Badge variant="outline" className="h-4 px-1 text-[9px]">
                        {p.model}
                      </Badge>
                    )}
                    {p.is_published && <CheckCircle2 className="h-3 w-3 text-success" />}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {p.files.length} files · {formatBytes(p.total_bytes)}
                    {p.notes ? ` · ${p.notes}` : ''}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 shrink-0 p-0 text-destructive"
                  onClick={() => handleDelete(p)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Upload */}
      <div className="space-y-2 rounded-md border border-border p-2">
        <span className="font-semibold">Add a firmware version</span>
        <div className="grid grid-cols-2 gap-2">
          <Input
            className="h-8 text-xs"
            placeholder="Version e.g. 2.6.14"
            value={newVersion}
            onChange={(e) => setNewVersion(e.target.value)}
          />
          <Input
            className="h-8 text-xs"
            placeholder="Model (optional) e.g. 88"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
          />
        </div>
        <Textarea
          className="min-h-[48px] text-xs"
          placeholder="Release notes (optional)"
          value={newNotes}
          onChange={(e) => setNewNotes(e.target.value)}
        />
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => setPendingFiles(Array.from(e.target.files ?? []))}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error non-standard but supported in Chromium/Electron
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={(e) => setPendingFiles(Array.from(e.target.files ?? []))}
        />
        <Button
          size="sm"
          className="h-8 w-full"
          variant="outline"
          onClick={() => zipInputRef.current?.click()}
        >
          <FileArchive className="mr-1 h-3.5 w-3.5" />
          {pendingZip ? pendingZip.name : 'Choose firmware .zip'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-full text-[10px] text-muted-foreground"
          onClick={() => folderInputRef.current?.click()}
        >
          <Upload className="mr-1 h-3 w-3" />
          {!pendingZip && pendingFiles.length ? `${pendingFiles.length} files selected` : 'or choose an unzipped folder'}
        </Button>
        {pendingFiles.length > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {pendingZip
              ? 'The zip is stored as-is and extracted straight onto the drive root, so the folder layout stays exactly right.'
              : 'Folder layout is preserved exactly as it appears on a working thumb drive.'}
          </p>
        )}

        {busy === 'upload' && <Progress value={progress} className="h-1.5" />}
        <Button
          size="sm"
          className="h-8 w-full"
          disabled={!newVersion.trim() || pendingFiles.length === 0 || busy !== null}
          onClick={handleUpload}
        >
          {busy === 'upload' && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          Upload to library
        </Button>
      </div>
    </div>
  );
}

/** true when the segment is a folder (i.e. some file lives beneath it). */
function f_isFolder(files: Array<{ path: string }>, segment: string): boolean {
  return files.some((f) => f.path.startsWith(`${segment}/`));
}

/** Drop the folder the user picked, keeping the layout inside it. */
function stripRootFolder(relPath: string): string {
  const parts = relPath.replace(/\\/g, '/').split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : relPath;
}
