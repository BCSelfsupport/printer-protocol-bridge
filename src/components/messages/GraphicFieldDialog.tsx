import { useState } from 'react';
import { Plus, ArrowLeft, ArrowUp, ArrowDown, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

// Simulated graphics that would be loaded on the printer
const AVAILABLE_GRAPHICS = [
  { number: 1, name: 'TRUPOINT.BMP' },
  { number: 2, name: 'LOGO1.BMP' },
  { number: 3, name: 'BARLOGO.BMP' },
  { number: 4, name: 'WARNING.BMP' },
  { number: 5, name: 'RECYCLE.BMP' },
] as const;

export interface GraphicFieldConfig {
  number: number;
  name: string;
}

interface GraphicFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  onAddGraphic: (config: GraphicFieldConfig) => void;
}

export function GraphicFieldDialog({ 
  open, 
  onOpenChange, 
  onBack,
  onAddGraphic 
}: GraphicFieldDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const graphics = AVAILABLE_GRAPHICS;
  const selectedGraphic = graphics[selectedIndex];

  const handleBack = () => {
    onOpenChange(false);
    onBack();
  };

  const handleMoveUp = () => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  };

  const handleMoveDown = () => {
    setSelectedIndex((prev) => Math.min(graphics.length - 1, prev + 1));
  };

  const handleAdd = () => {
    if (selectedGraphic) {
      onAddGraphic({
        number: selectedGraphic.number,
        name: selectedGraphic.name,
      });
      onOpenChange(false);
    }
  };

  const handleRowClick = (index: number) => {
    setSelectedIndex(index);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-b from-muted to-muted/80 px-4 py-3 flex items-center gap-3 border-b">
          <button
            onClick={handleBack}
            className="industrial-button p-2 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <DialogTitle className="flex-1 text-center text-lg font-semibold pr-10">
            Graphics: {graphics.length}
          </DialogTitle>
        </div>

        {/* Content */}
        <div className="bg-card p-4">
          <div className="flex gap-3">
            {/* Preview area */}
            <div className="flex-1 space-y-3">
              {/* Preview box */}
              <div className="bg-muted border border-border rounded-lg p-4 h-24 flex items-center justify-center">
                <span className="text-foreground font-bold text-xl">
                  {selectedGraphic?.name.replace('.BMP', '')}
                </span>
              </div>

              {/* Graphics list */}
              <div className="border border-border rounded-lg overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[60px_1fr] bg-muted/80 border-b border-border">
                  <div className="px-2 py-1.5 text-xs font-semibold text-foreground border-r border-border">
                    Number
                  </div>
                  <div className="px-2 py-1.5 text-xs font-semibold text-foreground">
                    Name
                  </div>
                </div>

                {/* Graphics rows */}
                <div className="max-h-32 overflow-y-auto">
                  {graphics.map((graphic, index) => (
                    <div
                      key={graphic.number}
                      onClick={() => handleRowClick(index)}
                      className={`grid grid-cols-[60px_1fr] cursor-pointer transition-colors ${
                        index === selectedIndex 
                          ? 'bg-primary/20 text-primary' 
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="px-2 py-1.5 text-sm border-r border-border text-center">
                        {graphic.number}
                      </div>
                      <div className="px-2 py-1.5 text-sm">
                        {graphic.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right side buttons */}
            <div className="flex flex-col gap-2">
              <button
                className="industrial-button p-2 rounded"
                title="Preview"
              >
                <Search className="w-5 h-5" />
              </button>
              <button
                onClick={handleMoveUp}
                className="industrial-button p-2 rounded"
                disabled={selectedIndex === 0}
              >
                <ArrowUp className="w-5 h-5" />
              </button>
              <button
                onClick={handleMoveDown}
                className="industrial-button p-2 rounded"
                disabled={selectedIndex === graphics.length - 1}
              >
                <ArrowDown className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Add button */}
          <div className="flex justify-center mt-4">
            <button
              onClick={handleAdd}
              className="industrial-button px-6 py-2 rounded flex items-center gap-2"
            >
              <Plus className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">Add</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
