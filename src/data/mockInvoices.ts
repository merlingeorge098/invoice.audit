export type InvoiceStatus = "verified" | "warning" | "error";
export type RiskLevel = "low" | "medium" | "high";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  gstin: string;
  amount: number;
  status: InvoiceStatus;
  riskLevel: RiskLevel;
  date: string;
  details: {
    address: string;
    email: string;
    phone: string;
    description: string;
  };
  validationResults: {
    field: string;
    status: InvoiceStatus;
    message: string;
  }[];
  excelData: Record<string, string>;
  suggestedFixes: Record<string, string>;
}

export const mockInvoices: Invoice[] = [
  {
    id: "1",
    invoiceNumber: "INV-2024-001",
    vendorName: "Acme Corp",
    gstin: "29ABCDE1234F1Z5",
    amount: 125000,
    status: "verified",
    riskLevel: "low",
    date: "2024-03-15",
    details: { address: "123 Business Ave, Bangalore", email: "billing@acme.com", phone: "+91 80 2345 6789", description: "IT Services Q1 2024" },
    validationResults: [
      { field: "GSTIN", status: "verified", message: "GSTIN is valid and active" },
      { field: "Amount", status: "verified", message: "Amount matches PO" },
      { field: "Date", status: "verified", message: "Invoice date is within expected range" },
    ],
    excelData: { "Invoice No": "INV-2024-001", "Vendor": "Acme Corp", "GSTIN": "29ABCDE1234F1Z5", "Amount": "125000", "Tax": "22500" },
    suggestedFixes: {},
  },
  {
    id: "2",
    invoiceNumber: "INV-2024-002",
    vendorName: "Global Supplies Ltd",
    gstin: "07XYZAB5678C2D4",
    amount: 89500,
    status: "warning",
    riskLevel: "medium",
    date: "2024-03-18",
    details: { address: "456 Commerce St, Delhi", email: "accounts@globalsupplies.in", phone: "+91 11 9876 5432", description: "Office Supplies March 2024" },
    validationResults: [
      { field: "GSTIN", status: "verified", message: "GSTIN is valid" },
      { field: "Amount", status: "warning", message: "Amount differs by ₹1,200 from PO" },
      { field: "Tax Rate", status: "warning", message: "Tax rate appears incorrect (expected 18%, found 12%)" },
    ],
    excelData: { "Invoice No": "INV-2024-002", "Vendor": "Global Supplies Ltd", "GSTIN": "07XYZAB5678C2D4", "Amount": "89500", "Tax": "10740" },
    suggestedFixes: { "Amount": "88300", "Tax": "15894" },
  },
  {
    id: "3",
    invoiceNumber: "INV-2024-003",
    vendorName: "QuickParts Inc",
    gstin: "27MNOPQ9012R3S6",
    amount: 234000,
    status: "error",
    riskLevel: "high",
    date: "2024-03-20",
    details: { address: "789 Industrial Zone, Mumbai", email: "finance@quickparts.co", phone: "+91 22 3456 7890", description: "Machine Parts & Components" },
    validationResults: [
      { field: "GSTIN", status: "error", message: "GSTIN format is invalid — check digit mismatch" },
      { field: "Amount", status: "error", message: "Amount does not match any existing PO" },
      { field: "Vendor", status: "warning", message: "Vendor name not found in approved vendor list" },
    ],
    excelData: { "Invoice No": "INV-2024-003", "Vendor": "QuickParts Inc", "GSTIN": "27MNOPQ9012R3S6", "Amount": "234000", "Tax": "42120" },
    suggestedFixes: { "GSTIN": "27MNOPQ9012R3S7", "Amount": "210000" },
  },
  {
    id: "4",
    invoiceNumber: "INV-2024-004",
    vendorName: "TechServ Solutions",
    gstin: "33HIJKL3456M7N8",
    amount: 67800,
    status: "verified",
    riskLevel: "low",
    date: "2024-03-22",
    details: { address: "321 Tech Park, Chennai", email: "invoices@techserv.com", phone: "+91 44 5678 1234", description: "Software License Renewal" },
    validationResults: [
      { field: "GSTIN", status: "verified", message: "GSTIN is valid and active" },
      { field: "Amount", status: "verified", message: "Amount matches contract" },
    ],
    excelData: { "Invoice No": "INV-2024-004", "Vendor": "TechServ Solutions", "GSTIN": "33HIJKL3456M7N8", "Amount": "67800", "Tax": "12204" },
    suggestedFixes: {},
  },
  {
    id: "5",
    invoiceNumber: "INV-2024-005",
    vendorName: "MetalWorks Co",
    gstin: "24UVWXY7890Z1A2",
    amount: 456000,
    status: "warning",
    riskLevel: "medium",
    date: "2024-03-25",
    details: { address: "567 Factory Rd, Ahmedabad", email: "billing@metalworks.in", phone: "+91 79 8765 4321", description: "Steel Components Order #4521" },
    validationResults: [
      { field: "GSTIN", status: "verified", message: "GSTIN is valid" },
      { field: "Amount", status: "verified", message: "Amount matches PO" },
      { field: "Date", status: "warning", message: "Invoice date is 15 days past due date" },
    ],
    excelData: { "Invoice No": "INV-2024-005", "Vendor": "MetalWorks Co", "GSTIN": "24UVWXY7890Z1A2", "Amount": "456000", "Tax": "82080" },
    suggestedFixes: {},
  },
];
