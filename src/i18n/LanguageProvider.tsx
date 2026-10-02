import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import glossary from './glossary.json';

/**
 * Screen translation driven by the master glossary document.
 * glossary.json is generated from the .docx (scripts/glossary_to_json.py); each language
 * column in the document becomes an entry in the language menu. Translation swaps any
 * on-screen text / tooltip that exactly matches an English glossary term.
 */
type Entry = { en: string } & Record<string, string>;
const entries = glossary.entries as Entry[];
export const LANGUAGES = glossary.languages as { code: string; label: string }[];
const STORAGE_KEY = 'codesync-language';
const ATTRS = ['title', 'placeholder', 'aria-label'] as const;

const Ctx = createContext<{ lang: string; setLang: (c: string) => void }>({ lang: 'en', setLang: () => {} });
export const useLanguage = () => useContext(Ctx);

function buildMap(lang: string) {
  const m = new Map<string, string>();
  if (lang === 'en') return m;
  for (const e of entries) if (e[lang]) m.set(e.en.toLowerCase(), e[lang]);
  return m;
}

function translate(text: string, map: Map<string, string>): string | null {
  const t = text.trim();
  if (!t || t.length > 80) return null;
  const hit = map.get(t.toLowerCase());
  if (!hit) return null;
  const out = t === t.toUpperCase() && /[A-Z]/.test(t) ? hit.toUpperCase() : hit;
  return text.replace(t, out);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(() => {
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return s && LANGUAGES.some((l) => l.code === s) ? s : 'en';
  });
  const setLang = (c: string) => { localStorage.setItem(STORAGE_KEY, c); setLangState(c); };

  useEffect(() => {
    document.documentElement.lang = lang;
    const map = buildMap(lang);
    // originals[node] = English text we replaced, so we can restore or re-translate.
    const textOrig = new WeakMap<Text, { en: string; out: string }>();
    const attrOrig = new WeakMap<Element, Record<string, { en: string; out: string }>>();

    const doText = (n: Text) => {
      if (n.parentElement?.closest('[data-no-translate],script,style,textarea,input')) return;
      const rec = textOrig.get(n);
      const cur = n.data;
      const en = rec && cur === rec.out ? rec.en : cur; // text changed by React → new English
      const out = translate(en, map);
      if (out && out !== cur) { textOrig.set(n, { en, out }); n.data = out; }
      else if (!out && rec && cur === rec.out) { n.data = rec.en; textOrig.delete(n); }
    };
    const doEl = (el: Element) => {
      if (el.closest('[data-no-translate]')) return;
      const recs = attrOrig.get(el) ?? {};
      for (const a of ATTRS) {
        const cur = el.getAttribute(a);
        if (cur == null) continue;
        const rec = recs[a];
        const en = rec && cur === rec.out ? rec.en : cur;
        const out = translate(en, map);
        if (out && out !== cur) { recs[a] = { en, out }; el.setAttribute(a, out); }
        else if (!out && rec && cur === rec.out) { el.setAttribute(a, rec.en); delete recs[a]; }
      }
      attrOrig.set(el, recs);
    };
    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      doEl(root as Element);
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n: Node | null;
      while ((n = w.nextNode())) n.nodeType === Node.TEXT_NODE ? doText(n as Text) : doEl(n as Element);
    };

    // Restore everything to English first (handles switching back), then translate.
    const restore = (window as any).__csRestoreLang as (() => void) | undefined;
    restore?.();
    walk(document.body);
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') doText(m.target as Text);
        else if (m.type === 'attributes') doEl(m.target as Element);
        else m.addedNodes.forEach(walk);
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    (window as any).__csRestoreLang = () => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n: Node | null;
      while ((n = w.nextNode())) {
        if (n.nodeType === Node.TEXT_NODE) { const r = textOrig.get(n as Text); if (r && (n as Text).data === r.out) (n as Text).data = r.en; }
        else { const r = attrOrig.get(n as Element); if (r) for (const a in r) if ((n as Element).getAttribute(a) === r[a].out) (n as Element).setAttribute(a, r[a].en); }
      }
    };
    return () => obs.disconnect();
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
