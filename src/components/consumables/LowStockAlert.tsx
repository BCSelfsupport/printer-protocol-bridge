import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
      case 'website': return <ExternalLink className="w-3.5 h-3.5" />;
      case 'email': return <Mail className="w-3.5 h-3.5" />;
      case 'consumables': return <Package className="w-3.5 h-3.5" />;
      default: return null;
    }
  };

  const isInk = alert.label === 'Ink';

  return (
    <div className="fixed right-3 top-3 z-[65] w-[min(92vw,360px)] animate-slide-in-right">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-lg">
        <div
          className={cn(
            'px-3 py-2 flex items-center gap-2',
            isCritical
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-warning text-warning-foreground',
          )}
        >
          <div className="w-7 h-7 rounded-full bg-background/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <p className="text-sm font-semibold leading-tight">
            {alert.label} {alert.level === 'EMPTY' ? 'Empty' : 'Low'} — Reorder Alert
          </p>
        </div>

        <div className="p-3 space-y-2.5 text-sm">
          <p className="text-foreground leading-snug">
            <span className="font-semibold">{alert.printerName}</span> ·
            {' '}{alert.label.toLowerCase()} level{' '}
            <Badge variant={alert.level === 'EMPTY' ? 'destructive' : 'secondary'} className="text-[10px] px-1.5 py-0">
              {alert.level}
            </Badge>
          </p>

          <div className="rounded-md border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-2.5 py-2 bg-muted/40 border-b border-border">
              <div className="w-6 h-6 rounded flex items-center justify-center bg-primary/15 text-primary flex-shrink-0">
                {isInk ? <Droplets className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
              </div>
              <span className="font-semibold text-foreground text-xs">{alert.consumable.partNumber}</span>
            </div>

            <div className="px-2.5 py-2 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Stock</span>
                <span className={cn(
                  'font-semibold',
                  isCritical ? 'text-destructive' : isLow ? 'text-warning' : 'text-foreground',
                )}>
                  {alert.consumable.currentStock} {stockUnit}
                </span>
              </div>
              <Progress
                value={percent}
                className={cn(
                  'h-2 rounded-full',
                  isCritical ? '[&>div]:bg-destructive' : '[&>div]:bg-primary',
                )}
              />
            </div>
          </div>

          {hasReorderUnit && (
            <p className="text-[11px] text-muted-foreground">
              Suggested order: <span className="font-semibold text-foreground">{suggestedReorderQty} {reorderUnit}</span>
              {' '}({bottlesPerCase} {stockUnit}/{reorderUnit.replace(/s$/, '')})
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs flex-1" onClick={onDismiss}>
              Dismiss
            </Button>
            {reorderConfig.action !== 'none' && (
              <Button size="sm" className="h-8 px-3 text-xs flex-1 gap-1.5" onClick={handleReorder}>
                {getReorderIcon()}
                {getReorderLabel()}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
