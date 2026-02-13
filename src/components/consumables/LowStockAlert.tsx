import { AlertDialog, AlertDialogCancel, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Package, ExternalLink } from 'lucide-react';
import { Consumable } from '@/types/consumable';

export interface LowStockAlertData {
  printerName: string;
  label: 'Ink' | 'Makeup';
  level: 'LOW' | 'EMPTY';
  consumable: Consumable;
  deducted: boolean;
}

interface LowStockAlertProps {
  alert: LowStockAlertData | null;
  onDismiss: () => void;
  onNavigateToConsumables: () => void;
}

export function LowStockAlert({ alert, onDismiss, onNavigateToConsumables }: LowStockAlertProps) {
  if (!alert) return null;

  const isCritical = alert.consumable.currentStock <= 0;

  return (
    <AlertDialog open={!!alert} onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className={`w-5 h-5 ${isCritical ? 'text-destructive' : 'text-yellow-500'}`} />
            {alert.label} {alert.level === 'EMPTY' ? 'Empty' : 'Low'} — Stock Alert
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-medium text-foreground">{alert.printerName}</span> reports {alert.label.toLowerCase()} level is{' '}
                <Badge variant={alert.level === 'EMPTY' ? 'destructive' : 'secondary'} className="text-xs">
                  {alert.level}
                </Badge>
              </p>

              <div className="rounded-md border p-3 space-y-1 bg-muted/50">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">{alert.consumable.partNumber}</span>
                </div>
                {alert.consumable.description && (
                  <p className="text-muted-foreground text-xs">{alert.consumable.description}</p>
                )}
                <div className="flex gap-4 mt-1">
                  <span>
                    Stock: <span className={`font-semibold ${isCritical ? 'text-destructive' : 'text-yellow-600'}`}>
                      {alert.consumable.currentStock} {alert.consumable.unit}
                    </span>
                  </span>
                  <span>
                    Min: <span className="font-medium text-foreground">{alert.consumable.minimumStock} {alert.consumable.unit}</span>
                  </span>
                </div>
                {alert.deducted && (
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    1 {alert.consumable.unit} automatically deducted from stock.
                  </p>
                )}
              </div>

              {isCritical ? (
                <p className="text-destructive font-medium">⚠ Stock is depleted — reorder immediately!</p>
              ) : alert.consumable.currentStock <= alert.consumable.minimumStock ? (
                <p className="text-yellow-600 font-medium">Stock is at or below minimum — time to reorder.</p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2">
          <AlertDialogCancel>
            Dismiss
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onDismiss();
              onNavigateToConsumables();
            }}
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            View Consumables
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
