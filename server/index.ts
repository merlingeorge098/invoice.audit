import cors from "cors";
import express from "express";
import { platformStore, type InvoiceActionType } from "./store.ts";

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors());
app.use(express.json());

app.post("/api/auth/discover", (request, response) => {
  const email = request.body?.email;

  if (typeof email !== "string" || !email.trim()) {
    response.status(400).json({
      error: "invalid_request",
      message: "A work email is required for organization discovery.",
    });
    return;
  }

  const discovery = platformStore.discoverOrganization(email);

  if (!discovery) {
    response.status(404).json({
      error: "organization_not_found",
      message:
        "No enterprise organization mapping was found for that email domain. Try acme.com, northwind.com, or globex.com.",
    });
    return;
  }

  response.json(discovery);
});

app.post("/api/auth/start", (request, response) => {
  const email = request.body?.email;

  if (typeof email !== "string" || !email.trim()) {
    response.status(400).json({
      error: "invalid_request",
      message: "A work email is required to start enterprise sign-in.",
    });
    return;
  }

  const authStart = platformStore.startEnterpriseAuth(email);

  if (!authStart) {
    response.status(404).json({
      error: "organization_not_found",
      message:
        "No enterprise sign-in path was found for that email domain. Try acme.com, northwind.com, or globex.com.",
    });
    return;
  }

  response.json(authStart);
});

app.post("/api/auth/callback", (request, response) => {
  const authRequestId = request.body?.authRequestId;

  if (typeof authRequestId !== "string" || !authRequestId.trim()) {
    response.status(400).json({
      error: "invalid_request",
      message: "The callback request must include an auth request id.",
    });
    return;
  }

  const session = platformStore.completeEnterpriseAuth(authRequestId);

  if (!session) {
    response.status(400).json({
      error: "invalid_callback",
      message: "The enterprise sign-in request expired or could not be validated.",
    });
    return;
  }

  response.json(session);
});

app.get("/api/auth/session", (request, response) => {
  const sessionTokenHeader = request.header("X-Session-Token");
  const sessionToken =
    typeof sessionTokenHeader === "string"
      ? sessionTokenHeader
      : typeof request.query.sessionToken === "string"
      ? request.query.sessionToken
      : "";

  if (!sessionToken) {
    response.status(400).json({
      error: "invalid_request",
      message: "A session token is required to resolve the enterprise session.",
    });
    return;
  }

  const session = platformStore.getEnterpriseSession(sessionToken);

  if (!session) {
    response.status(404).json({
      error: "session_not_found",
      message: "The enterprise session was not found or has expired.",
    });
    return;
  }

  response.json(session);
});

app.post("/api/auth/logout", (request, response) => {
  const sessionToken = request.header("X-Session-Token");

  if (!sessionToken) {
    response.status(400).json({
      error: "invalid_request",
      message: "A session token is required to end the enterprise session.",
    });
    return;
  }

  platformStore.clearEnterpriseSession(sessionToken);

  response.json({
    success: true,
  });
});

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "invoice-audit-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/dashboard", (_request, response) => {
  response.json(platformStore.getDashboard());
});

app.get("/api/invoices", (_request, response) => {
  response.json({
    items: platformStore.listInvoices(),
  });
});

app.get("/api/invoices/:id", (request, response) => {
  const invoice = platformStore.getInvoice(request.params.id);

  if (!invoice) {
    response.status(404).json({
      error: "not_found",
      message: `Invoice ${request.params.id} was not found.`,
    });
    return;
  }

  response.json(invoice);
});

app.patch("/api/invoices/:id/actions", (request, response) => {
  const action = request.body?.action as InvoiceActionType | undefined;
  const actor = request.body?.actor as string | undefined;
  const note = request.body?.note as string | undefined;

  if (!action) {
    response.status(400).json({
      error: "invalid_request",
      message: "Request body must include an action.",
    });
    return;
  }

  const result = platformStore.applyInvoiceAction(request.params.id, action, actor, note);

  if (!result) {
    response.status(404).json({
      error: "not_found",
      message: `Invoice ${request.params.id} was not found.`,
    });
    return;
  }

  response.json(result);
});

app.patch("/api/invoices/:id/comparisons/:field/apply", (request, response) => {
  const result = platformStore.applyComparisonSuggestion(
    request.params.id,
    decodeURIComponent(request.params.field),
    request.body?.actor as string | undefined,
  );

  if (!result) {
    response.status(404).json({
      error: "not_found",
      message: `Comparison field ${request.params.field} was not found for invoice ${request.params.id}.`,
    });
    return;
  }

  response.json(result);
});

app.get("/api/exceptions", (request, response) => {
  const selectedType =
    typeof request.query.type === "string" ? request.query.type : "All exceptions";

  response.json(platformStore.getExceptions(selectedType));
});

app.get("/api/ingestion", (_request, response) => {
  response.json(platformStore.getIngestion());
});

app.get("/api/processing", (_request, response) => {
  response.json(platformStore.getProcessing());
});

app.get("/api/reports", (_request, response) => {
  response.json(platformStore.getReports());
});

app.get("/api/settings", (_request, response) => {
  response.json(platformStore.getSettings());
});

app.patch("/api/settings/rules/:name", (request, response) => {
  const enabled = Boolean(request.body?.enabled);
  const updated = platformStore.updateRule(decodeURIComponent(request.params.name), enabled);

  if (!updated) {
    response.status(404).json({
      error: "not_found",
      message: `Rule ${request.params.name} was not found.`,
    });
    return;
  }

  response.json(updated);
});

app.patch("/api/settings/notifications/:name", (request, response) => {
  const enabled = Boolean(request.body?.enabled);
  const updated = platformStore.updateNotification(
    decodeURIComponent(request.params.name),
    enabled,
  );

  if (!updated) {
    response.status(404).json({
      error: "not_found",
      message: `Notification ${request.params.name} was not found.`,
    });
    return;
  }

  response.json(updated);
});

app.post("/api/settings/publish", (_request, response) => {
  response.json(platformStore.publishRuleset());
});

app.use((_request, response) => {
  response.status(404).json({
    error: "not_found",
    message: "No API route matched the request.",
  });
});

app.listen(port, () => {
  console.log(`Invoice.Audit API listening on http://localhost:${port}`);
});
