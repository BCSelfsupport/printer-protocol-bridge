/**
 * Export production reports to PDF (via html2canvas + jsPDF) and CSV.
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { ProductionRun } from '@/types/production';
import { calculateOEE } from '@/types/production';
import { downtimeLabel, formatDuration } from './reportAggregation';

export interface PdfExportOptions {
  title: string;
  subtitle?: string;
  /** DOM element holding the rendered report */
  element: HTMLElement;
  filename?: string;
}

export async function exportReportToPDF(opts: PdfExportOptions): Promise<void> {
  const { title, subtitle, element, filename } = opts;

  // Render at 2x for crispness
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const margin = 32;
  const contentW = pageWidth - margin * 2;

  // ---- Header band ----
  pdf.setFillColor(28, 100, 184); // primary-ish blue
  pdf.rect(0, 0, pageWidth, 70, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(title, margin, 32);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  if (subtitle) pdf.text(subtitle, margin, 50);
  pdf.text(`Generated ${new Date().toLocaleString()}`, pageWidth - margin, 50, { align: 'right' });
  pdf.setFontSize(9);
  pdf.text('CodeSync Production Report · BestCode', pageWidth - margin, 32, { align: 'right' });

  // ---- Image (paginated) ----
  const imgW = contentW;
  const imgH = (canvas.height * imgW) / canvas.width;

  const headerOffset = 90;
  const usableH = pageHeight - headerOffset - margin;

  if (imgH <= usableH) {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, headerOffset, imgW, imgH);
  } else {
    // Slice the source canvas vertically and place each slice on its own page
    const ratio = canvas.width / imgW; // px-per-pt
    const sliceHeightPx = Math.floor(usableH * ratio);
    let yPx = 0;
    let pageIdx = 0;

    while (yPx < canvas.height) {
      const remaining = canvas.height - yPx;
      const slicePx = Math.min(sliceHeightPx, remaining);

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = slicePx;
      const ctx = sliceCanvas.getContext('2d');
      if (!ctx) break;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, slicePx);
      ctx.drawImage(canvas, 0, -yPx);

      if (pageIdx > 0) {
        pdf.addPage();
        // mini header on continuation pages
        pdf.setFillColor(28, 100, 184);
        pdf.rect(0, 0, pageWidth, 24, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.text(title, margin, 16);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Page ${pageIdx + 1}`, pageWidth - margin, 16, { align: 'right' });
      }

      const sliceHeightPt = slicePx / ratio;
      const topPad = pageIdx === 0 ? headerOffset : 36;
      pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, topPad, imgW, sliceHeightPt);

      yPx += slicePx;
      pageIdx++;
    }
  }

  // ---- Footer on every page ----
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 14, { align: 'center' });
  }

  pdf.save(filename ?? `${title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`);
}

/* ---------- CSV ---------- */

export function exportRunsToCSV(
  runs: ProductionRun[],
  filename = `production-report-${new Date().toISOString().split('T')[0]}.csv`,
): void {
  const headers = [
    'Run ID', 'Printer', 'Message', 'Start', 'End',
    'Target', 'Actual', 'Attainment %',
    'Run Time (min)', 'Downtime (min)', 'Units / Hour',
    'OEE %', 'Availability %', 'Performance %',
    'Downtime Events', 'Downtime Reasons',
  ];
  const rows = runs.map(r => {
    const oee = calculateOEE(r);
    const reasons = r.downtimeEvents
      .map(e => `${downtimeLabel(e.reason)} (${formatDuration((e.endTime ?? Date.now()) - e.startTime)})`)
      .join(' | ');
    const upe = oee.runTime > 0 ? r.actualCount / (oee.runTime / 3600000) : 0;
    return [
      r.id.substring(0, 8),
      r.printerName,
      r.messageName,
      new Date(r.startTime).toISOString(),
      r.endTime ? new Date(r.endTime).toISOString() : 'Active',
      r.targetCount,
      r.actualCount,
      r.targetCount > 0 ? ((r.actualCount / r.targetCount) * 100).toFixed(1) : '0',
      Math.round(oee.runTime / 60000),
      Math.round(oee.totalDowntime / 60000),
      upe.toFixed(1),
      oee.oee.toFixed(1),
      oee.availability.toFixed(1),
      oee.performance.toFixed(1),
      r.downtimeEvents.length,
      reasons,
    ];
  });
  const csv = [
    headers.join(','),
    ...rows.map(r => r.map(escapeCSV).join(',')),
  ].join('\n');
  download(csv, filename, 'text/csv');
}

function escapeCSV(v: string | number): string {
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
