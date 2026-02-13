import { AlertDialog, AlertDialogCancel, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, ExternalLink, Mail, Package, ShoppingCart, Droplets } from 'lucide-react';
import { Consumable, ReorderConfig } from '@/types/consumable';

export interface LowStockAlertData {
  printerName: string;
  label: 'Ink' | 'Makeup';
  level: 'LOW' | 'EMPTY';
  consumable: Consumable;
  deducted: boolean;
}

interface LowStockAlertProps {
  alert: LowStockAlertData | null;
  reorderConfig: ReorderConfig;
  onDismiss: () => void;
  onNavigateToConsumables: () => void;
}

export function LowStockAlert({ alert, reorderConfig, onDismiss, onNavigateToConsumables }: LowStockAlertProps) {
  if (!alert) return null;

  const isCritical = alert.consumable.currentStock <= 0;
  const isLow = alert.consumable.currentStock <= alert.consumable.minimumStock;
  const max = Math.max(alert.consumable.minimumStock * 3, alert.consumable.currentStock, 1);
  const percent = Math.min(100, Math.round((alert.consumable.currentStock / max) * 100));

  const stockUnit = alert.consumable.unit || 'bottles';
  const reorderUnit = alert.consumable.reorderUnit || stockUnit;
  const bottlesPerCase = alert.consumable.bottlesPerReorderUnit || 1;
  const hasReorderUnit = alert.consumable.reorderUnit && alert.consumable.reorderUnit !== stockUnit;

  // Calculate how many reorder units to suggest
  const deficit = Math.max(0, alert.consumable.minimumStock * 2 - alert.consumable.currentStock);
  const suggestedReorderQty = hasReorderUnit ? Math.max(1, Math.ceil(deficit / bottlesPerCase)) : deficit;

  const handleReorder = () => {
    if (reorderConfig.action === 'website') {
      window.open(reorderConfig.websiteUrl, '_blank');
    } else if (reorderConfig.action === 'email') {
      const subject = reorderConfig.emailSubject.replace('{{partNumber}}', alert.consumable.partNumber);
      const body = `Reorder request for:\n\nPart Number: ${alert.consumable.partNumber}\nDescription: ${alert.consumable.description}\nCurrent Stock: ${alert.consumable.currentStock} ${stockUnit}\nSuggested Order: ${suggestedReorderQty} ${reorderUnit} (${bottlesPerCase} ${stockUnit} per ${reorderUnit.replace(/s$/, '')})\n\nPlease send a quote.`;
      window.open(`mailto:${reorderConfig.emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    } else if (reorderConfig.action === 'consumables') {
      onNavigateToConsumables();
    }
    onDismiss();
  };

  const getReorderLabel = () => {
    switch (reorderConfig.action) {
      case 'website': return 'Order Online';
      case 'email': return 'Send Email';
      case 'consumables': return 'View Stock';
      default: return '';
    }
  };

  const getReorderIcon = () => {
    switch (reorderConfig.action) {
      case 'website': return <ExternalLink className="w-4 h-4 mr-1" />;
      case 'email': return <Mail className="w-4 h-4 mr-1" />;
      case 'consumables': return <Package className="w-4 h-4 mr-1" />;
      default: return null;
    }
  };

  const isInk = alert.label === 'Ink';

  return (
    <AlertDialog open={!!alert} onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <AlertDialogContent className="sm:max-w-md border-0 p-0 overflow-hidden">
        {/* Warning banner header */}
        <div className={`px-5 py-4 flex items-center gap-3 ${
          isCritical
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-warning text-warning-foreground'
        }`}>
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <AlertDialogTitle className="text-lg font-bold">
              {alert.label} {alert.level === 'EMPTY' ? 'Empty' : 'Low'} — Reorder Alert
            </AlertDialogTitle>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <AlertDialogHeader className="p-0">
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-sm">
                {/* Printer status line */}
                <p className="text-foreground">
                  <span className="font-semibold">{alert.printerName}</span> reports {alert.label.toLowerCase()} level is{' '}
                  <Badge variant={alert.level === 'EMPTY' ? 'destructive' : 'secondary'} className="text-xs font-bold">
                    {alert.level}
                  </Badge>
                </p>

                {/* Consumable detail card */}
                <div className="rounded-lg border-2 overflow-hidden">
                  {/* Part header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
                    <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 ${
                      isInk ? 'bg-primary/15 text-primary' : 'bg-primary/15 text-primary'
                    }`}>
                      {isInk ? <Droplets className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                    </div>
                    <span className="font-bold text-foreground">{alert.consumable.partNumber}</span>
                    {alert.consumable.description && (
                      <span className="text-muted-foreground">— {alert.consumable.description}</span>
                    )}
                  </div>

                  {/* Stock gauge */}
                  <div className="px-3 py-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground font-medium">Stock Level</span>
                      <span className={`font-bold text-base ${
                        isCritical ? 'text-destructive' :
                        isLow ? 'text-warning' : 'text-foreground'
                      }`}>
                        {alert.consumable.currentStock} {stockUnit}
                      </span>
                    </div>
                    <Progress
                      value={percent}
                      className={`h-3 rounded-full ${
                        isCritical ? '[&>div]:bg-destructive' :
                        isLow ? '[&>div]:bg-primary' :
                        '[&>div]:bg-primary'
                      }`}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum: {alert.consumable.minimumStock} {stockUnit}
                    </p>
                  </div>

                  {/* Deduction notice */}
                  {alert.deducted && (
                    <div className="px-3 pb-3">
                      <p className="text-xs text-muted-foreground italic border-t pt-2">
                        1 {stockUnit.replace(/s$/, '')} automatically deducted from stock.
                      </p>
                    </div>
                  )}
                </div>

                {/* Reorder suggestion with unit clarification */}
                {hasReorderUnit && (
                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                    <p className="text-xs text-foreground font-medium flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-primary" />
                      Suggested order: <span className="font-bold text-primary">{suggestedReorderQty} {reorderUnit}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      1 {reorderUnit.replace(/s$/, '')} = {bottlesPerCase} {stockUnit}
                    </p>
                  </div>
                )}

                {/* Critical / low warning */}
                {isCritical && (
                  <p className="text-destructive font-bold text-center text-sm">⚠ Stock depleted — reorder immediately!</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="flex-row gap-2 sm:justify-between pt-2">
            <AlertDialogCancel className="flex-1">
              Dismiss
            </AlertDialogCancel>
            {reorderConfig.action !== 'none' && (
              <AlertDialogAction onClick={handleReorder} className="flex-1">
                {getReorderIcon()}
                {getReorderLabel()}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
