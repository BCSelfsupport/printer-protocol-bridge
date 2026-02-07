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
        className="industrial-button text-white px-2 py-2 md:px-4 md:py-3 rounded-lg flex items-center justify-center"
      >
        <Home className="w-5 h-5 md:w-8 md:h-8" />
      </button>
      
      <h1 className="text-lg md:text-4xl font-normal text-foreground truncate max-w-[180px] md:max-w-none">{title}</h1>
      
      <div className="min-w-[100px] flex justify-end">
        {rightContent}
      </div>
    </div>
  );
}
