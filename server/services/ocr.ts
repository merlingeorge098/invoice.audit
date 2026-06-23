import OpenAI from "openai";

function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set.");
  return new OpenAI();
}

export interface ExtractedInvoice {
  vendorName: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
  dueDate: string;
  poNumber: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

export async function extractInvoiceDataWithGPT4o(fileBuffer: Buffer, mimeType: string): Promise<ExtractedInvoice> {
  const base64Image = fileBuffer.toString("base64");
  
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert enterprise invoice extraction AI. Extract the fields from the provided invoice image and return them strictly as JSON.
        
        Expected JSON Schema:
        {
          "vendorName": "string",
          "invoiceNumber": "string",
          "amount": 0.00,
          "invoiceDate": "YYYY-MM-DD",
          "dueDate": "YYYY-MM-DD",
          "poNumber": "string or null",
          "lineItems": [
            { "description": "string", "quantity": 1, "unitPrice": 0.00, "total": 0.00 }
          ]
        }`
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Please extract the structured data from this invoice image." },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No content received from OpenAI");

  return JSON.parse(content) as ExtractedInvoice;
}

export interface GstReconciliationData {
  classification: "INWARD" | "OUTWARD";
  partyName: string; // Vendor or Customer Name
  gstNumber: string;
  documentNumber: string; // Bill No or Invoice #
  documentDate: string;
  nonTaxableAmount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
}

export async function extractGstReconciliationData(fileBuffer: Buffer, mimeType: string, tenantName: string): Promise<GstReconciliationData> {
  const base64Image = fileBuffer.toString("base64");
  
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert enterprise invoice extraction AI specializing in GST reconciliation.
        Your task is to extract structured GST tax fields from the provided invoice image.
        
        CRITICAL CLASSIFICATION RULE:
        - If the invoice is billed TO "${tenantName}" (our company is the buyer), classify it as "INWARD".
        - If the invoice is billed FROM "${tenantName}" (our company is the seller), classify it as "OUTWARD".
        - "partyName" should be the name of the OTHER party (not us). If INWARD, partyName = Vendor. If OUTWARD, partyName = Customer.

        Expected JSON Schema:
        {
          "classification": "INWARD" | "OUTWARD",
          "partyName": "string",
          "gstNumber": "string",
          "documentNumber": "string",
          "documentDate": "YYYY-MM-DD",
          "nonTaxableAmount": 0.00,
          "taxableAmount": 0.00,
          "cgst": 0.00,
          "sgst": 0.00,
          "igst": 0.00,
          "totalAmount": 0.00
        }`
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Please extract the structured GST data from this invoice. Our company name is ${tenantName}.` },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No content received from OpenAI");

  return JSON.parse(content) as GstReconciliationData;
}
