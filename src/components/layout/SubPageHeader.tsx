import { Home } from 'lucide-react';

interface SubPageHeaderProps {
  title: string;
  onHome: () => void;
  rightContent?: React.ReactNode;
}

export function SubPageHeader({ title, onHome, rightContent }: SubPageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <button
        onClick={onHome}
        className="industrial-button text-white px-4 py-3 rounded-lg flex items-center justify-center"
      >
        <Home className="w-8 h-8" />
      </button>
      
      <h1 className="text-4xl font-normal text-foreground">{title}</h1>
      
      <div className="min-w-[100px] flex justify-end">
        {rightContent}
      </div>
    </div>
  );
}
