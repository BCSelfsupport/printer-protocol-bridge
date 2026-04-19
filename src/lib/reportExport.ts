/**
 * Export utilities for production reports.
 * - PDF: rasterizes a DOM node (the rendered report) to a multi-page A4 PDF.
 * - CSV: serializes raw underlying rows.
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { ProductionRun } from '@/types/production';
import { calculateOEE } from '@/types/production';

export async function exportNodeToPdf(node: HTMLElement, filename: string, title: string) {
  // Render at 2× scale for crispness
  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // A4: 210 × 297 mm. Reserve 10mm header.
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const headerH = 14;
  const margin = 8;
  const contentW = pageW - margin * 2;

  const imgW = contentW;
  const imgH = (canvas.height * imgW) / canvas.width;

  // How many pages we need
  const usablePerPage = pageH - headerH - margin;
  const pages = Math.max(1, Math.ceil(imgH / usablePerPage));

  for (let i = 0; i < pages; i++) {
    if (i > 0) pdf.addPage();

    // Header
    pdf.setFillColor(15, 23, 42); // slate-900
    pdf.rect(0, 0, pageW, headerH, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('CodeSync™ Production Report', margin, 9);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const stamp = new Date().toLocaleString();
    pdf.text(stamp, pageW - margin, 9, { align: 'right' });

    // Title row (page 1 only)
    if (i === 0) {
      pdf.setTextColor(30, 41, 59);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.text(title, margin, headerH + 6);
    }

    // Image slice
    const sliceY = i * usablePerPage;
    const sliceH = Math.min(usablePerPage, imgH - sliceY);

    // Source slice in canvas pixels
    const srcY = (sliceY / imgH) * canvas.height;
    const srcH = (sliceH / imgH) * canvas.height;

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = srcH;
    const ctx = sliceCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
      const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92);
      const yOffset = i === 0 ? headerH + 10 : headerH + margin / 2;
      pdf.addImage(sliceData, 'JPEG', margin, yOffset, imgW, sliceH);
    }

    // Footer page numbers
    pdf.setTextColor(120, 120, 120);
    pdf.setFontSize(7);
    pdf.text(`Page ${i + 1} of ${pages}`, pageW / 2, pageH - 4, { align: 'center' });
  }

  pdf.save(filename);
}

export function exportRunsToCsv(runs: ProductionRun[], filename: string) {
  const headers = [
    'Run ID', 'Printer', 'Message',
    'Start', 'End', 'Duration (min)',
    'Target', 'Actual', 'Attainment %',
    'OEE %', 'Availability %', 'Performance %',
    'Run Time (min)', 'Downtime (min)',
    'Downtime Events',
  ];
  const now = Date.now();
  const rows = runs.map(r => {
    const o = calculateOEE(r);
    const end = r.endTime ?? now;
    return [
      r.id.substring(0, 8),
      r.printerName,
      r.messageName,
      new Date(r.startTime).toISOString(),
      r.endTime ? new Date(r.endTime).toISOString() : 'Active',
      Math.round((end - r.startTime) / 60_000),
      r.targetCount,
      r.actualCount,
      r.targetCount > 0 ? ((r.actualCount / r.targetCount) * 100).toFixed(1) : '0',
      o.oee.toFixed(1),
      o.availability.toFixed(1),
      o.performance.toFixed(1),
      Math.round(o.runTime / 60_000),
      Math.round(o.totalDowntime / 60_000),
      r.downtimeEvents.length,
    ];
  });

  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
