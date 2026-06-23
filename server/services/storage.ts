import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import path from "path";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const BUCKET = "invoices";

export async function uploadInvoiceFile(
  tenantId: string,
  buffer: Buffer,
  mimeType: string,
  originalName: string,
): Promise<{ storagePath: string; sha256Hash: string }> {
  const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const ext = path.extname(originalName).toLowerCase() || ".pdf";
  const now = new Date();
  const storagePath = `${tenantId}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${sha256Hash}${ext}`;

  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error && error.message !== "The resource already exists") {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return { storagePath, sha256Hash };
}

export async function getSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to generate signed URL: ${error?.message}`);
  }

  return data.signedUrl;
}

export async function deleteFile(storagePath: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) {
    console.error(`[Storage] Failed to delete ${storagePath}:`, error.message);
  }
}

export async function uploadEvidenceFile(
  tenantId: string,
  invoiceId: string,
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<{ storagePath: string }> {
  const supabase = getSupabaseClient();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${tenantId}/evidence/${invoiceId}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Evidence upload failed: ${error.message}`);
  }

  return { storagePath };
}

export async function uploadEvidencePackage(
  tenantId: string,
  invoiceId: string,
  buffer: Buffer,
  timestamp: string,
): Promise<{ storagePath: string }> {
  const supabase = getSupabaseClient();
  const storagePath = `${tenantId}/evidence-packages/${invoiceId}-${timestamp}.zip`;

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: "application/zip",
    upsert: true,
  });

  if (error) {
    throw new Error(`Evidence package upload failed: ${error.message}`);
  }

  return { storagePath };
}

export async function deleteAllTenantFiles(tenantId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: files } = await supabase.storage.from(BUCKET).list(tenantId, { limit: 1000 });
  if (files && files.length > 0) {
    const paths = files.map((f) => `${tenantId}/${f.name}`);
    await supabase.storage.from(BUCKET).remove(paths);
  }
}
