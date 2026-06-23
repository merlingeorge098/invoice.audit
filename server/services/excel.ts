import ExcelJS from "exceljs";
import type { GstReconciliationData } from "./ocr.ts";

export async function generateGstExcel(
  companyName: string,
  inwardData: GstReconciliationData[],
  outwardData: GstReconciliationData[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("GST Reconciliation", {
    views: [{ state: "frozen", ySplit: 4 }]
  });

  // Row 1: Company Name
  sheet.mergeCells("A1:X1");
  const r1 = sheet.getCell("A1");
  r1.value = companyName.toUpperCase();
  r1.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  r1.alignment = { horizontal: "center", vertical: "middle" };

  // Row 2: Title
  sheet.mergeCells("A2:X2");
  const r2 = sheet.getCell("A2");
  r2.value = `GST PARTICULARS FOR THE MONTH ${new Date().toLocaleString("default", { month: "long", year: "numeric" }).toUpperCase()}`;
  r2.font = { bold: true };
  r2.alignment = { horizontal: "center", vertical: "middle" };

  // Row 3: Main Sections
  sheet.getCell("A3").value = "Our Ref";
  sheet.mergeCells("B3:K3");
  sheet.getCell("B3").value = "INWARD";
  sheet.getCell("L3").value = ""; // Separator
  sheet.mergeCells("M3:U3");
  sheet.getCell("M3").value = "OUTWARD";
  sheet.mergeCells("V3:X3");
  sheet.getCell("V3").value = "DIFFERENCE";

  // Row 3 Styling
  const headersR3 = ["A3", "B3", "L3", "M3", "V3"];
  const colorsR3 = ["FFC6E0B4", "FFC6E0B4", "FF92D050", "FFFCE4D6", "FFFF6699"];
  headersR3.forEach((cellId, idx) => {
    const c = sheet.getCell(cellId);
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colorsR3[idx] } };
    c.border = { bottom: { style: "dotted" } };
  });

  // Row 4: Sub Headers
  const subHeaders = [
    { cell: "A4", val: "" }, // Our Ref empty
    { cell: "B4", val: "Vendor" }, { cell: "C4", val: "GST Number" }, { cell: "D4", val: "Bill No" }, { cell: "E4", val: "Date" },
    { cell: "F4", val: "Non Taxable" }, { cell: "G4", val: "Taxable" }, { cell: "H4", val: "CGST" }, { cell: "I4", val: "SGST" },
    { cell: "J4", val: "IGST" }, { cell: "K4", val: "Amount" },
    { cell: "L4", val: "" }, // Separator
    { cell: "M4", val: "Customer" }, { cell: "N4", val: "GST Number" }, { cell: "O4", val: "Invoice #" },
    { cell: "P4", val: "Non Txbl" }, { cell: "Q4", val: "Taxable" }, { cell: "R4", val: "CGST" }, { cell: "S4", val: "SGST" },
    { cell: "T4", val: "IGST" }, { cell: "U4", val: "Amount" },
    { cell: "V4", val: "CGST" }, { cell: "W4", val: "SGST" }, { cell: "X4", val: "IGST" }
  ];

  subHeaders.forEach(col => {
    const c = sheet.getCell(col.cell);
    c.value = col.val;
    c.alignment = { horizontal: "center", vertical: "middle" };
    // Apply background colors matching Row 3
    if (["A4","B4","C4","D4","E4","F4","G4","H4","I4","J4","K4"].includes(col.cell)) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6E0B4" } };
    if (col.cell === "L4") c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
    if (["M4","N4","O4","P4","Q4","R4","S4","T4","U4"].includes(col.cell)) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } };
    if (["V4","W4","X4"].includes(col.cell)) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6699" } };
  });

  // Set Column Widths
  sheet.columns = [
    { key: "ourRef", width: 10 },
    { key: "inVendor", width: 20 }, { key: "inGst", width: 18 }, { key: "inBill", width: 15 }, { key: "inDate", width: 12 },
    { key: "inNonTax", width: 12 }, { key: "inTax", width: 12 }, { key: "inCgst", width: 10 }, { key: "inSgst", width: 10 },
    { key: "inIgst", width: 10 }, { key: "inAmt", width: 15 },
    { key: "sep", width: 5 },
    { key: "outCustomer", width: 20 }, { key: "outGst", width: 18 }, { key: "outInv", width: 15 },
    { key: "outNonTax", width: 12 }, { key: "outTax", width: 12 }, { key: "outCgst", width: 10 }, { key: "outSgst", width: 10 },
    { key: "outIgst", width: 10 }, { key: "outAmt", width: 15 },
    { key: "diffCgst", width: 12 }, { key: "diffSgst", width: 12 }, { key: "diffIgst", width: 12 }
  ];

  // Populate Data Rows
  const maxRows = Math.max(inwardData.length, outwardData.length, 1); // at least 1 empty row

  for (let i = 0; i < maxRows; i++) {
    const inD = inwardData[i] || {} as Partial<GstReconciliationData>;
    const outD = outwardData[i] || {} as Partial<GstReconciliationData>;
    const rowNum = i + 5;

    const row = sheet.getRow(rowNum);
    row.values = [
      "", // A: Our Ref
      inD.partyName || "", inD.gstNumber || "", inD.documentNumber || "", inD.documentDate || "",
      inD.nonTaxableAmount || 0, inD.taxableAmount || 0, inD.cgst || 0, inD.sgst || 0, inD.igst || 0, inD.totalAmount || 0,
      "", // L: Separator
      outD.partyName || "", outD.gstNumber || "", outD.documentNumber || "",
      outD.nonTaxableAmount || 0, outD.taxableAmount || 0, outD.cgst || 0, outD.sgst || 0, outD.igst || 0, outD.totalAmount || 0
    ];

    // Difference formulas
    row.getCell("V").value = { formula: `H${rowNum}-R${rowNum}`, result: (inD.cgst || 0) - (outD.cgst || 0) };
    row.getCell("W").value = { formula: `I${rowNum}-S${rowNum}`, result: (inD.sgst || 0) - (outD.sgst || 0) };
    row.getCell("X").value = { formula: `J${rowNum}-T${rowNum}`, result: (inD.igst || 0) - (outD.igst || 0) };

    // Format numbers
    ["F","G","H","I","J","K","P","Q","R","S","T","U","V","W","X"].forEach(col => {
      row.getCell(col).numFmt = '"₹"#,##0.00';
    });
    
    // Add Borders
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
        left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
        bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
        right: { style: 'thin', color: { argb: 'FFBFBFBF' } }
      };
    });
    
    // Color separator L
    row.getCell("L").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
  }

  // Create an ArrayBuffer, convert to Buffer
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateInvoicesReportExcel(invoices: any[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Invoice Audit Report");

  sheet.columns = [
    { header: "Invoice Number", key: "invoiceNumber", width: 20 },
    { header: "Vendor Name", key: "vendorName", width: 25 },
    { header: "Entity", key: "entity", width: 20 },
    { header: "Amount", key: "amount", width: 15 },
    { header: "Status", key: "status", width: 18 },
    { header: "Risk Level", key: "riskLevel", width: 12 },
    { header: "Risk Score", key: "riskScore", width: 12 },
    { header: "Assigned Reviewer", key: "assignedReviewer", width: 20 },
    { header: "Ingestion Date", key: "createdAt", width: 25 },
    { header: "Anomalies", key: "anomalies", width: 35 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" }
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  sheet.getRow(1).height = 25;

  invoices.forEach((inv) => {
    const anomalies = Array.isArray(inv.anomalyTypes)
      ? inv.anomalyTypes.map((a: any) => a.type).join(", ")
      : (Array.isArray(inv.anomalies) ? inv.anomalies.join(", ") : "");

    const row = sheet.addRow({
      invoiceNumber: inv.invoiceNumber,
      vendorName: inv.vendorName,
      entity: inv.entity,
      amount: inv.amount,
      status: inv.status,
      riskLevel: inv.riskLevel,
      riskScore: inv.riskScore,
      assignedReviewer: inv.assignedReviewer || "Unassigned",
      createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : inv.createdAt,
      anomalies
    });

    row.getCell("amount").numFmt = '"₹"#,##0.00';
    row.getCell("riskScore").alignment = { horizontal: "right" };
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
