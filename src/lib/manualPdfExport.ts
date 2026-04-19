/**
 * Generate a branded PDF of the CodeSync User Manual.
 * Pure jsPDF (no html2canvas) for crisp text + embedded screenshots.
 */
import jsPDF from 'jspdf';
import { MANUAL, MANUAL_TITLE, MANUAL_VERSION, type ManualSection } from './userManualContent';

const PAGE_W = 595.28; // A4 width in pt
const PAGE_H = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 56;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

// Brand colors (approx of CodeSync palette)
const BRAND_BLUE: [number, number, number] = [37, 99, 235];   // blue-600
const BRAND_GREEN: [number, number, number] = [16, 185, 129]; // emerald-500
const TEXT_DARK: [number, number, number] = [17, 24, 39];
const TEXT_MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [229, 231, 235];

/** Load an image from /manual-screenshots into a data URL. */
async function loadImage(src: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    return { dataUrl, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

interface RenderState {
  pdf: jsPDF;
  y: number;
  page: number;
  toc: { title: string; page: number; level: 0 | 1 }[];
}

function newPage(s: RenderState) {
  s.pdf.addPage();
  s.page += 1;
  s.y = MARGIN_TOP;
  drawPageChrome(s);
}

function ensureSpace(s: RenderState, needed: number) {
  if (s.y + needed > PAGE_H - MARGIN_BOTTOM) newPage(s);
}

function drawPageChrome(s: RenderState) {
  const { pdf, page } = s;
  // Footer rule
  pdf.setDrawColor(...RULE);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN_X, PAGE_H - 32, PAGE_W - MARGIN_X, PAGE_H - 32);
  // Footer text
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...TEXT_MUTED);
  pdf.text(`${MANUAL_TITLE} · ${MANUAL_VERSION}`, MARGIN_X, PAGE_H - 20);
  pdf.text(`Page ${page}`, PAGE_W - MARGIN_X, PAGE_H - 20, { align: 'right' });
}

function writeWrapped(s: RenderState, text: string, opts: { size: number; bold?: boolean; color?: [number, number, number]; lineHeight?: number; }) {
  const { pdf } = s;
  pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  pdf.setFontSize(opts.size);
  pdf.setTextColor(...(opts.color ?? TEXT_DARK));
  const lh = opts.lineHeight ?? opts.size * 1.35;
  const lines = pdf.splitTextToSize(text, CONTENT_W);
  for (const line of lines) {
    ensureSpace(s, lh);
    pdf.text(line, MARGIN_X, s.y);
    s.y += lh;
  }
}

/** Render markdown-lite body: paragraphs, **bold**, - bullets, ## subheadings. */
function renderBody(s: RenderState, body: string) {
  const blocks = body.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const isList = lines.every(l => l.trim().startsWith('- '));
    const isSub = lines[0]?.startsWith('## ');

    if (isSub) {
      s.y += 6;
      writeWrapped(s, lines[0].replace(/^##\s+/, ''), { size: 12, bold: true });
      s.y += 2;
      continue;
    }
    if (isList) {
      for (const l of lines) {
        const text = l.trim().slice(2);
        const segments = parseInline(text);
        renderInline(s, segments, { bullet: true });
      }
      s.y += 6;
      continue;
    }
    // Paragraph
    for (const line of lines) {
      const segments = parseInline(line);
      renderInline(s, segments, { bullet: false });
    }
    s.y += 6;
  }
}

interface Segment { text: string; bold: boolean; code: boolean; }

function parseInline(text: string): Segment[] {
  const out: Segment[] = [];
  let rest = text;
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)/;
  while (rest.length) {
    const m = rest.match(re);
    if (!m || m.index === undefined) {
      out.push({ text: rest, bold: false, code: false });
      break;
    }
    if (m.index > 0) out.push({ text: rest.slice(0, m.index), bold: false, code: false });
    if (m[2] !== undefined) out.push({ text: m[2], bold: true, code: false });
    else if (m[4] !== undefined) out.push({ text: m[4], bold: false, code: true });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

/** Build a single string with bold-runs by splitting later via custom render. Simpler: collapse to plain. */
function renderInline(s: RenderState, segs: Segment[], opts: { bullet: boolean }) {
  const { pdf } = s;
  const fontSize = 10;
  const lh = fontSize * 1.4;
  const indent = opts.bullet ? 14 : 0;
  const maxW = CONTENT_W - indent;
  pdf.setFontSize(fontSize);
  pdf.setTextColor(...TEXT_DARK);

  // Tokenize into words preserving segment formatting
  type Word = { text: string; bold: boolean; code: boolean; spaceAfter: boolean };
  const words: Word[] = [];
  segs.forEach(seg => {
    const parts = seg.text.split(/(\s+)/);
    parts.forEach(p => {
      if (!p) return;
      if (/^\s+$/.test(p)) {
        if (words.length) words[words.length - 1].spaceAfter = true;
      } else {
        words.push({ text: p, bold: seg.bold, code: seg.code, spaceAfter: false });
      }
    });
  });

  // Build lines respecting maxW
  const lines: Word[][] = [[]];
  let lineW = 0;
  for (const w of words) {
    pdf.setFont('helvetica', w.bold ? 'bold' : 'normal');
    const wWidth = pdf.getTextWidth(w.text + (w.spaceAfter ? ' ' : ''));
    if (lineW + wWidth > maxW && lines[lines.length - 1].length > 0) {
      lines.push([]);
      lineW = 0;
    }
    lines[lines.length - 1].push(w);
    lineW += wWidth;
  }

  let firstLineOfPara = true;
  for (const line of lines) {
    ensureSpace(s, lh);
    let x = MARGIN_X + indent;
    if (opts.bullet && firstLineOfPara) {
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...BRAND_BLUE);
      pdf.text('•', MARGIN_X + 4, s.y);
      pdf.setTextColor(...TEXT_DARK);
    }
    for (const w of line) {
      pdf.setFont('helvetica', w.bold ? 'bold' : 'normal');
      pdf.setTextColor(...(w.code ? BRAND_BLUE : TEXT_DARK));
      const txt = w.text + (w.spaceAfter ? ' ' : '');
      pdf.text(txt, x, s.y);
      x += pdf.getTextWidth(txt);
    }
    s.y += lh;
    firstLineOfPara = false;
  }
}

async function renderSection(s: RenderState, sec: ManualSection) {
  ensureSpace(s, 60);
  s.toc.push({ title: sec.title, page: s.page, level: 1 });

  // Section heading
  s.y += 4;
  writeWrapped(s, sec.title, { size: 14, bold: true, color: BRAND_BLUE });
  s.y += 4;

  renderBody(s, sec.body);

  // Screenshot
  if (sec.screenshot) {
    const img = await loadImage(sec.screenshot);
    if (img) {
      const aspect = img.h / img.w;
      const w = Math.min(CONTENT_W, 460);
      const h = w * aspect;
      ensureSpace(s, h + 24);
      // Frame
      s.pdf.setDrawColor(...RULE);
      s.pdf.setLineWidth(0.75);
      s.pdf.roundedRect(MARGIN_X, s.y, w, h, 4, 4, 'S');
      try {
        s.pdf.addImage(img.dataUrl, 'PNG', MARGIN_X + 1, s.y + 1, w - 2, h - 2, undefined, 'FAST');
      } catch {
        // ignore image errors
      }
      s.y += h + 16;
    }
  }
}

export async function generateUserManualPdf(): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });

  // ====== Cover ======
  // Background gradient stripe
  pdf.setFillColor(...BRAND_BLUE);
  pdf.rect(0, 0, PAGE_W, 280, 'F');
  pdf.setFillColor(...BRAND_GREEN);
  pdf.rect(0, 240, PAGE_W, 6, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(48);
  pdf.text('CodeSync', MARGIN_X, 140);
  pdf.setTextColor(180, 230, 200);
  pdf.text('™', MARGIN_X + pdf.getTextWidth('CodeSync'), 110);

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'normal');
  pdf.text('User Manual', MARGIN_X, 180);

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${MANUAL_VERSION}  ·  BestCode Printer Management`, MARGIN_X, 210);

  // Cover body
  pdf.setTextColor(...TEXT_DARK);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  const coverIntro = 'A complete reference for operating, configuring, and troubleshooting BestCode CIJ printers using the CodeSync application.';
  const wrapped = pdf.splitTextToSize(coverIntro, CONTENT_W);
  pdf.text(wrapped, MARGIN_X, 340);

  pdf.setFontSize(9);
  pdf.setTextColor(...TEXT_MUTED);
  pdf.text(`Generated ${new Date().toLocaleDateString()} · ${MANUAL.length} chapters`, MARGIN_X, PAGE_H - 80);
  pdf.text('© BestCode Marking · All rights reserved.', MARGIN_X, PAGE_H - 64);

  // ====== Body ======
  const state: RenderState = { pdf, y: MARGIN_TOP, page: 1, toc: [] };

  // Reserve TOC page (we'll fill at end)
  pdf.addPage();
  state.page = 2;
  const tocPageNumber = 2;

  // Render chapters starting on page 3
  newPage(state);

  for (let i = 0; i < MANUAL.length; i++) {
    const chapter = MANUAL[i];
    // Each chapter starts on a fresh page
    if (i > 0) newPage(state);

    state.toc.push({ title: chapter.title, page: state.page, level: 0 });

    // Chapter title block
    pdf.setFillColor(...BRAND_BLUE);
    pdf.rect(MARGIN_X, state.y - 14, 4, 28, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.setTextColor(...TEXT_DARK);
    pdf.text(chapter.title, MARGIN_X + 14, state.y + 6);
    state.y += 26;

    // Intro
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(10.5);
    pdf.setTextColor(...TEXT_MUTED);
    const intro = pdf.splitTextToSize(chapter.intro, CONTENT_W);
    for (const line of intro) {
      ensureSpace(state, 14);
      pdf.text(line, MARGIN_X, state.y);
      state.y += 14;
    }
    state.y += 12;

    // Sections
    for (const section of chapter.sections) {
      await renderSection(state, section);
    }
  }

  // ====== Fill in TOC ======
  pdf.setPage(tocPageNumber);
  // Re-draw chrome on TOC page
  const tocState: RenderState = { pdf, y: MARGIN_TOP, page: tocPageNumber, toc: [] };
  drawPageChrome(tocState);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.setTextColor(...TEXT_DARK);
  pdf.text('Table of Contents', MARGIN_X, MARGIN_TOP + 4);

  pdf.setDrawColor(...BRAND_BLUE);
  pdf.setLineWidth(2);
  pdf.line(MARGIN_X, MARGIN_TOP + 12, MARGIN_X + 60, MARGIN_TOP + 12);

  let tocY = MARGIN_TOP + 40;
  for (const entry of state.toc) {
    if (tocY > PAGE_H - MARGIN_BOTTOM - 20) break; // single TOC page; truncate if huge
    if (entry.level === 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...BRAND_BLUE);
      tocY += 6;
    } else {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      pdf.setTextColor(...TEXT_DARK);
    }
    const indent = entry.level === 0 ? 0 : 16;
    const title = entry.title;
    const pageStr = String(entry.page);
    const titleW = pdf.getTextWidth(title);
    const pageW = pdf.getTextWidth(pageStr);
    pdf.text(title, MARGIN_X + indent, tocY);
    pdf.text(pageStr, PAGE_W - MARGIN_X, tocY, { align: 'right' });
    // Dot leader
    const dotsStart = MARGIN_X + indent + titleW + 4;
    const dotsEnd = PAGE_W - MARGIN_X - pageW - 4;
    if (dotsEnd > dotsStart) {
      pdf.setTextColor(...TEXT_MUTED);
      const dotCount = Math.floor((dotsEnd - dotsStart) / 3);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text('.'.repeat(Math.max(0, dotCount)), dotsStart, tocY);
    }
    tocY += entry.level === 0 ? 18 : 14;
  }

  return pdf.output('blob');
}

export function downloadManualPdf(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CodeSync-User-Manual-${MANUAL_VERSION}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
