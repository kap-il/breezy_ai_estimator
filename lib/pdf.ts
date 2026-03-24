import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EstimateResult, JobFormData } from './types';

export function generatePDF(estimate: EstimateResult, formData: JobFormData, customPrice: number) {
  const doc = new jsPDF();
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const estimateNumber = `EST-${Date.now().toString().slice(-6)}`;
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(formData.businessName, 20, 25);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  if (formData.ownerPhone) doc.text(formData.ownerPhone, 20, 32);
  if (formData.ownerEmail) doc.text(formData.ownerEmail, 20, 38);

  doc.setTextColor(0);
  doc.text(`Estimate #: ${estimateNumber}`, 140, 25);
  doc.text(`Date: ${today}`, 140, 32);

  // Divider
  doc.setDrawColor(200);
  doc.line(20, 45, 190, 45);

  // Job Summary
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Job Summary', 20, 55);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const summaryLines = doc.splitTextToSize(estimate.job_summary, 170);
  doc.text(summaryLines, 20, 63);

  let y = 63 + summaryLines.length * 6 + 10;

  // Materials Table
  if (estimate.materials.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Materials & Services', 20, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['Item', 'Qty', 'Unit Cost', 'Total']],
      body: estimate.materials.map((m) => {
        const unitAvg = (m.unit_cost_low + m.unit_cost_high) / 2;
        return [
          m.item,
          String(m.quantity),
          fmt(unitAvg),
          fmt(m.quantity * unitAvg),
        ];
      }),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 30, 30] },
      margin: { left: 20, right: 20 },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 12;
  }

  // Labor (skip for project-based jobs with no labor hours)
  if (estimate.labor_hours_low > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Labor', 20, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const avgHours = Math.round((estimate.labor_hours_low + estimate.labor_hours_high) / 2);
    const avgRate = (estimate.hourly_rate_low + estimate.hourly_rate_high) / 2;
    doc.text(`${avgHours} hrs \u00d7 ${fmt(avgRate)}/hr`, 20, y);
    y += 14;
  }

  // Total
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Total', 20, y);
  doc.text(fmt(customPrice), 130, y);
  y += 14;

  // Notes
  if (estimate.notes) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100);
    const noteLines = doc.splitTextToSize(`Note: ${estimate.notes}`, 170);
    doc.text(noteLines, 20, y);
  }

  // Footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150);
  doc.text('Powered by Breezy \u00b7 getbreezy.app', 20, 285);
  doc.text(
    'This estimate is valid for 30 days from the date issued.',
    20,
    290
  );

  doc.save(
    `${formData.businessName.replace(/\s+/g, '_')}_Estimate_${estimateNumber}.pdf`
  );
}
