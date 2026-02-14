import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Key, Plus, Copy, Loader2, XCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface License {
  id: string;
  product_key: string;
  tier: string;
  is_active: boolean;
  created_at: string;
  customers: { name: string; email: string; company: string | null } | null;
  license_activations: { machine_id: string; last_seen: string; is_current: boolean }[];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function licenseApi(action: string, body?: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/license?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export function LicenseAssignmentPanel() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Form state
  const [tier, setTier] = useState<string>('lite');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');

  const fetchLicenses = async () => {
    setLoading(true);
    try {
      const data = await licenseApi('list');
      setLicenses(data.licenses || []);
    } catch {
      toast.error('Failed to load licenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLicenses(); }, []);

  const handleCreate = async () => {
    if (!email.trim()) {
      toast.error('Customer email is required');
      return;
    }
    setCreating(true);
    try {
      const result = await licenseApi('create', {
        tier,
        customer_name: name,
        customer_email: email,
        customer_company: company,
        expires_in_days: tier === 'demo' ? 30 : undefined,
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`License created: ${result.license.product_key}`);
        setName('');
        setEmail('');
        setCompany('');
        fetchLicenses();
      }
    } catch {
      toast.error('Failed to create license');
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (licenseId: string) => {
    await licenseApi('deactivate', { license_id: licenseId });
    toast.success('License deactivated');
    fetchLicenses();
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('Product key copied');
  };

  const tierColors: Record<string, string> = {
    lite: 'bg-slate-100 text-slate-700 border-slate-300',
    full: 'bg-blue-100 text-blue-700 border-blue-300',
    database: 'bg-purple-100 text-purple-700 border-purple-300',
    demo: 'bg-amber-100 text-amber-700 border-amber-300',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Create License Form */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Key className="w-4 h-4 text-gray-500" />
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Create License
          </h3>
        </div>

        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Tier</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lite">LITE — No Network</SelectItem>
                <SelectItem value="full">FULL — Network Access</SelectItem>
                <SelectItem value="database">DATABASE — Full + Database</SelectItem>
                <SelectItem value="demo">DEMO — Full Access, 30-day Trial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Customer Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Customer Email *</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="john@company.com" className="h-8 text-xs" type="email" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Company</Label>
            <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corp" className="h-8 text-xs" />
          </div>
          <Button onClick={handleCreate} disabled={creating} size="sm" className="w-full">
            {creating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
            Generate Key
          </Button>
        </div>
      </div>

      {/* License List */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Issued Licenses ({licenses.length})
        </h3>
        <button onClick={fetchLicenses} className="p-1 rounded hover:bg-gray-200">
          <RefreshCw className={cn("w-3 h-3 text-gray-500", loading && "animate-spin")} />
        </button>
      </div>

      <ScrollArea className="flex-1 px-4 pb-4">
        {loading && licenses.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-8">Loading...</div>
        )}
        <div className="space-y-2 mt-2">
          {licenses.map(lic => (
            <div key={lic.id} className="bg-gray-50 rounded-lg border border-gray-200 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className={cn("text-[9px]", tierColors[lic.tier])}>
                    {lic.tier.toUpperCase()}
                  </Badge>
                  {lic.is_active ? (
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-500" />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => copyKey(lic.product_key)} className="p-0.5 rounded hover:bg-gray-200" title="Copy key">
                    <Copy className="w-3 h-3 text-gray-400" />
                  </button>
                  {lic.is_active && (
                    <button onClick={() => handleDeactivate(lic.id)} className="p-0.5 rounded hover:bg-red-100" title="Deactivate">
                      <XCircle className="w-3 h-3 text-red-400" />
                    </button>
                  )}
                </div>
              </div>
              <div className="font-mono text-[10px] text-gray-700 bg-white px-1.5 py-0.5 rounded border border-gray-100">
                {lic.product_key}
              </div>
              {lic.customers && (
                <div className="text-[10px] text-gray-500">
                  {lic.customers.name} • {lic.customers.email}
                  {lic.customers.company && ` • ${lic.customers.company}`}
                </div>
              )}
              {lic.license_activations?.filter(a => a.is_current).length > 0 && (
                <div className="text-[10px] text-green-600">
                  Active on {lic.license_activations.filter(a => a.is_current).length} device
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
