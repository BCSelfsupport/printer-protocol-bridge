import { useState } from 'react';
import { ArrowLeft, ChevronUp, ChevronDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface BlockFieldConfig {
  blockLength: number;
  gap: number;
}

interface BlockFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: BlockFieldConfig) => void;
  maxHeight?: number;
}

export function BlockFieldDialog({
  open,
  onOpenChange,
  onSave,
  maxHeight = 32,
}: BlockFieldDialogProps) {
  const [blockLength, setBlockLength] = useState(1);
  const [gap, setGap] = useState(0);

  const handleBlockLengthChange = (delta: number) => {
    setBlockLength((prev) => Math.max(1, Math.min(maxHeight, prev + delta)));
  };

  const handleGapChange = (delta: number) => {
    setGap((prev) => Math.max(0, Math.min(maxHeight, prev + delta)));
  };

  const handleSave = () => {
    onSave({ blockLength, gap });
    onOpenChange(false);
    // Reset for next use
    setBlockLength(1);
    setGap(0);
  };

  const handleCancel = () => {
    onOpenChange(false);
    setBlockLength(1);
    setGap(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 flex items-center gap-3 border-b">
          <button
            onClick={handleCancel}
            className="industrial-button p-2 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <DialogTitle className="flex-1 text-center text-lg font-semibold pr-10">
            Block Field
          </DialogTitle>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Parameters Row */}
          <div className="flex gap-4">
            {/* Block Length */}
            <div className="flex-1 space-y-2">
              <Label className="text-sm font-medium">Block Length</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={blockLength}
                  onChange={(e) => setBlockLength(Math.max(1, Math.min(maxHeight, parseInt(e.target.value) || 1)))}
                  className="text-center"
                  min={1}
                  max={maxHeight}
                />
                <div className="flex flex-col gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleBlockLengthChange(1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleBlockLengthChange(-1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Number of rows of full vertical print
              </p>
            </div>

            {/* Gap */}
            <div className="flex-1 space-y-2">
              <Label className="text-sm font-medium">Gap</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={gap}
                  onChange={(e) => setGap(Math.max(0, Math.min(maxHeight, parseInt(e.target.value) || 0)))}
                  className="text-center"
                  min={0}
                  max={maxHeight}
                />
                <div className="flex flex-col gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleGapChange(1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleGapChange(-1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Number of blank rows after the print
              </p>
            </div>
          </div>

          {/* Visual Preview */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Preview</Label>
            <div className="bg-muted/50 border rounded-lg p-4 flex items-end gap-1 h-24 overflow-hidden">
              {/* Block representation */}
              <div 
                className="bg-primary transition-all duration-200"
                style={{ 
                  width: '16px',
                  height: `${Math.min(100, (blockLength / maxHeight) * 100)}%`,
                  minHeight: '8px'
                }}
              />
              {/* Gap representation */}
              {gap > 0 && (
                <div 
                  className="bg-muted-foreground/20 border border-dashed border-muted-foreground/40 transition-all duration-200"
                  style={{ 
                    width: `${gap * 4}px`,
                    height: `${Math.min(100, (blockLength / maxHeight) * 100)}%`,
                    minWidth: '4px',
                    minHeight: '8px'
                  }}
                />
              )}
              {/* Repeat indication */}
              <div 
                className="bg-primary/50 transition-all duration-200"
                style={{ 
                  width: '16px',
                  height: `${Math.min(100, (blockLength / maxHeight) * 100)}%`,
                  minHeight: '8px'
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Block Length: {blockLength} rows • Gap: {gap} rows
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
