import { SubPageHeader } from '@/components/layout/SubPageHeader';

interface CleanScreenProps {
  onHome: () => void;
}

export function CleanScreen({ onHome }: CleanScreenProps) {
  return (
    <div className="flex-1 p-4 flex flex-col">
      <SubPageHeader title="Clean" onHome={onHome} />

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-xl mb-2">Cleaning Functions</p>
          <p>Connect to a printer to access cleaning operations</p>
        </div>
      </div>
    </div>
  );
}
