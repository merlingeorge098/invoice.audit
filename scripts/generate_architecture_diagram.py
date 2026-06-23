# -*- coding: utf-8 -*-
"""Generates a clean architecture diagram for the InnovateZ 2026 submission."""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from matplotlib.lines import Line2D

TEAL = "#0F766E"
TEAL_LIGHT = "#CCFBF1"
DARK = "#1E293B"
GREY = "#64748B"
AMBER = "#D97706"
AMBER_LIGHT = "#FEF3C7"
BLUE = "#1D4ED8"
BLUE_LIGHT = "#DBEAFE"
WHITE = "#FFFFFF"

fig, ax = plt.subplots(figsize=(16, 10))
ax.set_xlim(0, 16)
ax.set_ylim(0, 10)
ax.axis("off")
fig.patch.set_facecolor("white")


def box(x, y, w, h, text, face=WHITE, edge=TEAL, text_color=DARK, fontsize=10.5, bold=True, lw=2, sub=None):
    rect = FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.02,rounding_size=0.08",
        linewidth=lw, edgecolor=edge, facecolor=face, zorder=2,
    )
    ax.add_patch(rect)
    if sub:
        ax.text(x + w / 2, y + h / 2 + 0.13, text, ha="center", va="center",
                 fontsize=fontsize, fontweight="bold" if bold else "normal", color=text_color, zorder=3)
        ax.text(x + w / 2, y + h / 2 - 0.16, sub, ha="center", va="center",
                 fontsize=fontsize - 2.3, color=GREY, zorder=3)
    else:
        ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
                 fontsize=fontsize, fontweight="bold" if bold else "normal", color=text_color, zorder=3)
    return (x, y, w, h)


def arrow(b1, b2, side1="bottom", side2="top", color=GREY, label=None, style="-|>", lw=1.6, curve=0.0):
    x1, y1, w1, h1 = b1
    x2, y2, w2, h2 = b2
    pts = {
        "top": (x1 + w1 / 2, y1 + h1),
        "bottom": (x1 + w1 / 2, y1),
        "left": (x1, y1 + h1 / 2),
        "right": (x1 + w1, y1 + h1 / 2),
    }
    pts2 = {
        "top": (x2 + w2 / 2, y2 + h2),
        "bottom": (x2 + w2 / 2, y2),
        "left": (x2, y2 + h2 / 2),
        "right": (x2 + w2, y2 + h2 / 2),
    }
    p1 = pts[side1]
    p2 = pts2[side2]
    arr = FancyArrowPatch(
        p1, p2, arrowstyle=style, mutation_scale=14, linewidth=lw,
        color=color, connectionstyle=f"arc3,rad={curve}", zorder=1,
    )
    ax.add_patch(arr)
    if label:
        mx, my = (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2
        ax.text(mx + 0.15, my + 0.12, label, fontsize=8, color=GREY, style="italic", zorder=4,
                bbox=dict(boxstyle="round,pad=0.15", facecolor="white", edgecolor="none", alpha=0.85))


# Title
ax.text(8, 9.55, "Invoice.Audit — System Architecture", ha="center", fontsize=18, fontweight="bold", color=TEAL)
ax.text(8, 9.15, "Multi-tenant invoice fraud detection & GST compliance platform", ha="center", fontsize=10.5, color=GREY)

# ---- Layer 1: Client ----
client = box(0.6, 7.6, 4.2, 1.0, "React + TypeScript Frontend", face=BLUE_LIGHT, edge=BLUE, text_color=DARK,
             sub="Vite · TanStack Query · Tailwind/shadcn")

# ---- Layer 2: API ----
api = box(0.6, 5.9, 4.2, 1.0, "Express API (Node.js + TS)", face=TEAL_LIGHT, edge=TEAL, text_color=DARK,
          sub="Session auth · RBAC middleware · Rate limiting")

arrow(client, api, "bottom", "top", color=BLUE, label="HTTPS / fetch")

# ---- Layer 3: Core engine boxes (middle row) ----
ocr = box(0.6, 3.9, 2.55, 1.15, "OCR Extraction", face=AMBER_LIGHT, edge=AMBER, text_color=DARK,
          sub="GPT-4o Vision API")
val = box(3.4, 3.9, 2.55, 1.15, "Validation Engine", face=TEAL_LIGHT, edge=TEAL, text_color=DARK,
          sub="6 deterministic rules")
audit = box(6.2, 3.9, 2.55, 1.15, "Audit Trail Service", face=TEAL_LIGHT, edge=TEAL, text_color=DARK,
            sub="HMAC-SHA256 chain")
notif = box(8.95, 3.9, 2.55, 1.15, "Notification Router", face=TEAL_LIGHT, edge=TEAL, text_color=DARK,
            sub="Role-based, email + in-app")

for b in (ocr, val, audit, notif):
    arrow(api, b, "bottom", "top", color=TEAL, lw=1.3)

arrow(ocr, val, "right", "left", color=GREY, lw=1.3)
arrow(val, audit, "right", "left", color=GREY, lw=1.3)
arrow(val, notif, "right", "left", color=GREY, lw=1.3, curve=0.35)

ax.text(2.97, 4.62, "extracted\nJSON", fontsize=7, ha="center", color=GREY, style="italic",
        bbox=dict(boxstyle="round,pad=0.12", facecolor="white", edgecolor="none", alpha=0.9), zorder=4)
ax.text(5.77, 4.62, "status +\nrisk score", fontsize=7, ha="center", color=GREY, style="italic",
        bbox=dict(boxstyle="round,pad=0.12", facecolor="white", edgecolor="none", alpha=0.9), zorder=4)
ax.text(7.6, 5.3, "routes alert", fontsize=7, ha="center", color=GREY, style="italic",
        bbox=dict(boxstyle="round,pad=0.12", facecolor="white", edgecolor="none", alpha=0.9), zorder=4)

# ---- Layer 4: Data + external services ----
db = box(0.6, 2.0, 2.55, 1.0, "PostgreSQL", face=BLUE_LIGHT, edge=BLUE, text_color=DARK,
         sub="via Prisma ORM (Supabase)")
storage = box(3.4, 2.0, 2.55, 1.0, "Object Storage", face=BLUE_LIGHT, edge=BLUE, text_color=DARK,
              sub="Supabase Storage, signed URLs")
openai = box(6.2, 2.0, 2.55, 1.0, "OpenAI GPT-4o", face=AMBER_LIGHT, edge=AMBER, text_color=DARK,
             sub="Vision API (external)")
resend = box(8.95, 2.0, 2.55, 1.0, "Resend API", face=AMBER_LIGHT, edge=AMBER, text_color=DARK,
             sub="Email delivery (external)")

arrow(val, db, "bottom", "top", color=BLUE, lw=1.3)
arrow(audit, db, "bottom", "top", color=BLUE, lw=1.3)
arrow(ocr, storage, "bottom", "top", color=BLUE, lw=1.3)
arrow(ocr, openai, "bottom", "top", color=AMBER, lw=1.3)
arrow(notif, resend, "bottom", "top", color=AMBER, lw=1.3)

ax.text(2.55, 3.45, "image buffer", fontsize=7, ha="center", color=GREY, style="italic",
        bbox=dict(boxstyle="round,pad=0.12", facecolor="white", edgecolor="none", alpha=0.9), zorder=4)

# ---- Right column: tenant + ERP ----
tenant_x, tenant_y, tenant_w, tenant_h = 12.0, 5.9, 3.4, 2.85
rect = FancyBboxPatch((tenant_x, tenant_y), tenant_w, tenant_h,
                       boxstyle="round,pad=0.02,rounding_size=0.08",
                       linewidth=2, edgecolor=GREY, facecolor="#F1F5F9", zorder=2)
ax.add_patch(rect)
ax.text(tenant_x + tenant_w / 2, tenant_y + tenant_h - 0.32, "Multi-Tenant Isolation",
        ha="center", fontsize=10.5, fontweight="bold", color=DARK, zorder=3)
bullets = [
    "Every table scoped by tenantId",
    "Session token validated per request",
    "RBAC: 5 roles enforced at API + UI",
    "AES-256-GCM for stored ERP secrets",
    "Bcrypt-hashed API keys",
]
for i, b in enumerate(bullets):
    ax.text(tenant_x + 0.25, tenant_y + tenant_h - 0.75 - i * 0.42, "•  " + b,
             ha="left", fontsize=8.3, color=GREY, zorder=3)

erp = box(12.0, 3.9, 3.4, 1.15, "ERP Connector", face="#F1F5F9", edge=GREY, text_color=DARK,
          sub="Outbound webhook sync + CSV import")
gst = box(12.0, 2.0, 3.4, 1.0, "GST Reconciliation", face="#F1F5F9", edge=GREY, text_color=DARK,
          sub="GPT-4o extraction + GSTIN regex + Excel export")

arrow(api, (tenant_x, tenant_y, tenant_w, tenant_h), "right", "left", color=GREY, lw=1.3, curve=-0.15)
arrow(audit, erp, "right", "left", color=GREY, lw=1.3)
arrow(val, gst, "right", "left", color=GREY, lw=1.3, curve=-0.3)

# ---- Legend ----
legend_items = [
    mpatches.Patch(facecolor=BLUE_LIGHT, edgecolor=BLUE, label="Frontend / Database layer"),
    mpatches.Patch(facecolor=TEAL_LIGHT, edgecolor=TEAL, label="Core backend logic (your code)"),
    mpatches.Patch(facecolor=AMBER_LIGHT, edgecolor=AMBER, label="External AI / third-party API"),
    mpatches.Patch(facecolor="#F1F5F9", edgecolor=GREY, label="Cross-cutting / integration"),
]
ax.legend(handles=legend_items, loc="lower center", bbox_to_anchor=(0.5, -0.04),
          ncol=4, frameon=False, fontsize=9)

plt.tight_layout()
plt.savefig(
    r"c:\Users\Asus\Downloads\invoiceAUDIT\invoice-auditor-pro\architecture_diagram.png",
    dpi=200, bbox_inches="tight", facecolor="white",
)
print("Saved architecture_diagram.png")
