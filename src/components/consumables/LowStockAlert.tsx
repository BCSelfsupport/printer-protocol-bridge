import { AlertDialog, AlertDialogCancel, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Package, ExternalLink, Mail, ShoppingCart } from 'lucide-react';
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

  const handleReorder = () => {
    if (reorderConfig.action === 'website') {
      window.open(reorderConfig.websiteUrl, '_blank');
    } else if (reorderConfig.action === 'email') {
      const subject = reorderConfig.emailSubject.replace('{{partNumber}}', alert.consumable.partNumber);
      const body = `Reorder request for:\n\nPart Number: ${alert.consumable.partNumber}\nDescription: ${alert.consumable.description}\nCurrent Stock: ${alert.consumable.currentStock} ${alert.consumable.unit}\n\nPlease send a quote.`;
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

  return (
    <AlertDialog open={!!alert} onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isCritical ? 'bg-destructive/10 text-destructive' : 'bg-yellow-500/10 text-yellow-500'
            }`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            {alert.label} {alert.level === 'EMPTY' ? 'Empty' : 'Low'} — Reorder Alert
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-medium text-foreground">{alert.printerName}</span> reports {alert.label.toLowerCase()} level is{' '}
                <Badge variant={alert.level === 'EMPTY' ? 'destructive' : 'secondary'} className="text-xs">
                  {alert.level}
                </Badge>
              </p>

              <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${
                    alert.consumable.type === 'ink' ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'
                  }`}>
                    <ShoppingCart className="w-3 h-3" />
                  </div>
                  <span className="font-semibold text-foreground">{alert.consumable.partNumber}</span>
                  {alert.consumable.description && (
                    <span className="text-muted-foreground text-xs">— {alert.consumable.description}</span>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Stock Level</span>
                    <span className={`font-bold ${isCritical ? 'text-destructive' : isLow ? 'text-yellow-600' : 'text-foreground'}`}>
                      {alert.consumable.currentStock} {alert.consumable.unit}
                    </span>
                  </div>
                  <Progress
                    value={percent}
                    className={`h-2 ${
                      isCritical ? '[&>div]:bg-destructive' :
                      isLow ? '[&>div]:bg-yellow-500' :
                      '[&>div]:bg-blue-500'
                    }`}
                  />
                  <div className="text-[10px] text-muted-foreground">
                    Minimum: {alert.consumable.minimumStock} {alert.consumable.unit}
                  </div>
                </div>
                {alert.deducted && (
                  <p className="text-xs text-muted-foreground italic border-t pt-1 mt-1">
                    1 {alert.consumable.unit} automatically deducted from stock.
                  </p>
                )}
              </div>

              {isCritical ? (
                <p className="text-destructive font-medium text-center">⚠ Stock depleted — reorder immediately!</p>
              ) : isLow ? (
                <p className="text-yellow-600 font-medium text-center">Stock at or below minimum — time to reorder.</p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2 sm:justify-between">
          <AlertDialogCancel>
            Dismiss
          </AlertDialogCancel>
          {reorderConfig.action !== 'none' && (
            <AlertDialogAction onClick={handleReorder}>
              {getReorderIcon()}
              {getReorderLabel()}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
