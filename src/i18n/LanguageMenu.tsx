import { Globe, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LANGUAGES, useLanguage } from './LanguageProvider';

export function LanguageMenu() {
  const { lang, setLang } = useLanguage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative w-8 h-8 md:w-12 md:h-12 rounded-full bg-muted-foreground/50 flex items-center justify-center hover:bg-muted-foreground/70 transition-colors flex-shrink-0"
          title="Language"
          data-no-translate
        >
          <Globe className="w-3.5 h-3.5 md:w-5 md:h-5 text-card" />
          <span className="absolute -bottom-1 -right-1 rounded bg-primary px-1 text-[8px] md:text-[10px] font-bold uppercase text-primary-foreground">
            {lang}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-no-translate>
        {LANGUAGES.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => setLang(l.code)} className="gap-2">
            <Check className={`w-4 h-4 ${lang === l.code ? 'opacity-100' : 'opacity-0'}`} />
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
