import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ImagePlus, X } from 'lucide-react';

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appVersion?: string;
}

export function FeedbackDialog({ open, onOpenChange, appVersion }: FeedbackDialogProps) {
  const [type, setType] = useState('feedback');
  const [message, setMessage] = useState('');
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddScreenshots = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(f => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024);
    if (validFiles.length < files.length) {
      toast.error('Some files were skipped (must be images under 5MB)');
    }
    const combined = [...screenshots, ...validFiles].slice(0, 3);
    setScreenshots(combined);
    setPreviews(combined.map(f => URL.createObjectURL(f)));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeScreenshot = (idx: number) => {
    URL.revokeObjectURL(previews[idx]);
    setScreenshots(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const resetForm = () => {
    setMessage('');
    setType('feedback');
    previews.forEach(p => URL.revokeObjectURL(p));
    setScreenshots([]);
    setPreviews([]);
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error('Please enter a message');
      return;
    }
    if (trimmed.length > 2000) {
      toast.error('Message must be under 2000 characters');
      return;
    }

    setSubmitting(true);
    try {
      // Upload screenshots first
      const uploadedPaths: string[] = [];
      for (const file of screenshots) {
        const ext = file.name.split('.').pop() || 'png';
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('feedback-screenshots')
          .upload(path, file);
        if (uploadErr) {
          console.error('Screenshot upload error:', uploadErr);
        } else {
          uploadedPaths.push(path);
        }
      }

      const { error } = await supabase.from('feedback' as any).insert({
        type,
        message: trimmed,
        app_version: appVersion || null,
        screenshot_urls: uploadedPaths,
      } as any);

      if (error) throw error;

      toast.success('Thank you for your feedback!');
      resetForm();
      onOpenChange(false);
    } catch (err) {
      console.error('Feedback submission error:', err);
      toast.error('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            Help us improve CodeSync! Report a bug or suggest a feature.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">🐛 Bug Report</SelectItem>
                <SelectItem value="feature">💡 Feature Request</SelectItem>
                <SelectItem value="feedback">💬 General Feedback</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                type === 'bug'
                  ? 'Describe what happened and what you expected...'
                  : type === 'feature'
                  ? 'Describe the feature you would like to see...'
                  : 'Tell us what you think...'
              }
              rows={5}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length}/2000
            </p>
          </div>

          {/* Screenshot upload - shown for bug reports */}
          {type === 'bug' && (
            <div className="space-y-2">
              <Label>Screenshots (optional, max 3)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleAddScreenshots}
              />
              <div className="flex gap-2 flex-wrap">
                {previews.map((src, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-md border border-border overflow-hidden group">
                    <img src={src} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeScreenshot(i)}
                      className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {screenshots.length < 3 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-muted-foreground/60 transition-colors"
                  >
                    <ImagePlus className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Add</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={submitting || !message.trim()} className="w-full">
            {submitting ? 'Sending...' : 'Submit Feedback'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
