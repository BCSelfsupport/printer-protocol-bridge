import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Trash2, Loader2, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface FeedbackItem {
  id: string;
  type: string;
  message: string;
  app_version: string | null;
  screenshot_urls: string[];
  signed_screenshot_urls?: string[];
  created_at: string;
}

export function FeedbackPanel() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('feedback-admin', {
        body: null,
        method: 'GET',
      });
      if (error) throw error;
      setItems(data?.feedback || []);
    } catch (err) {
      console.error('Failed to fetch feedback:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke('feedback-admin?action=delete', {
        body: JSON.stringify({ id }),
      });
      if (error) throw error;
      setItems(prev => prev.filter(f => f.id !== id));
      toast.success('Feedback deleted');
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const typeBadge = (type: string) => {
    switch (type) {
      case 'bug': return <Badge variant="destructive" className="text-[10px]">🐛 Bug</Badge>;
      case 'feature': return <Badge className="text-[10px] bg-blue-600">💡 Feature</Badge>;
      default: return <Badge variant="secondary" className="text-[10px]">💬 Feedback</Badge>;
    }
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          User Feedback ({items.length})
        </span>
        <Button variant="ghost" size="icon" onClick={fetchFeedback} disabled={loading} className="h-7 w-7">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>

      <ScrollArea className="flex-1 p-2">
        {items.length === 0 && !loading && (
          <div className="text-center text-xs text-muted-foreground py-8">No feedback yet</div>
        )}
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-muted/50 rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {typeBadge(item.type)}
                  {item.app_version && (
                    <span className="text-[10px] text-muted-foreground font-mono">v{item.app_version}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{formatDate(item.created_at)}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              <p className="text-xs text-foreground whitespace-pre-wrap">{item.message}</p>
              {item.signed_screenshot_urls && item.signed_screenshot_urls.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {item.signed_screenshot_urls.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setExpandedImage(expandedImage === url ? null : url)}
                      className="relative w-16 h-16 rounded border border-border overflow-hidden hover:ring-2 ring-primary transition-all"
                    >
                      <img src={url} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              {expandedImage && item.signed_screenshot_urls?.includes(expandedImage) && (
                <div className="mt-1">
                  <img
                    src={expandedImage}
                    alt="Expanded screenshot"
                    className="w-full max-h-[300px] object-contain rounded border border-border cursor-pointer"
                    onClick={() => setExpandedImage(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
