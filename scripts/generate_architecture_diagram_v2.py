# -*- coding: utf-8 -*-
"""Generates a polished, icon-style architecture diagram — visually similar to common
SaaS reference diagrams, but factually accurate to this codebase (Vite/React, Express,
Supabase Postgres + Storage, GPT-4o Vision, the 6-rule validation engine)."""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Circle, Rectangle
from matplotlib.lines import Line2D

GREEN = "#0F766E"
GREEN_FILL = "#ECFDF5"
BLUE = "#1D4ED8"
BLUE_FILL = "#DBEAFE"
PURPLE = "#7C3AED"
PURPLE_FILL = "#EDE9FE"
AMBER = "#B45309"
AMBER_FILL = "#FEF3C7"
ROSE = "#BE123C"
ROSE_FILL = "#FFE4E6"
GREY = "#475569"
GREY_FILL = "#F1F5F9"
DARK = "#0F172A"

fig, ax = plt.subplots(figsize=(19, 13))
ax.set_xlim(0, 19)
ax.set_ylim(0, 13)
ax.axis("off")
fig.patch.set_facecolor("white")


def box(x, y, w, h, title, items, fill, edge, title_color=None, item_size=8.3, title_size=10.5,
        icon=None, dashed=False):
    style = "round,pad=0.02,rounding_size=0.09"
    rect = FancyBboxPatch(
        (x, y), w, h, boxstyle=style,
        linewidth=1.8, edgecolor=edge, facecolor=fill, zorder=2,
        linestyle="dashed" if dashed else "solid",
    )
    ax.add_patch(rect)
    tc = title_color or edge

    title_y = y + h - 0.32
    if icon == "circle":
        c = Circle((x + 0.28, title_y), 0.13, facecolor=edge, edgecolor="none", zorder=3)
        ax.add_patch(c)
        ax.text(x + 0.5, title_y, title, ha="left", va="center", fontsize=title_size,
                 fontweight="bold", color=tc, zorder=3)
    else:
        ax.text(x + 0.22, title_y, title, ha="left", va="center", fontsize=title_size,
                 fontweight="bold", color=tc, zorder=3)

    for i, item in enumerate(items):
        iy = title_y - 0.36 - i * 0.32
        ax.text(x + 0.3, iy, "•  " + item, ha="left", va="center", fontsize=item_size, color=DARK, zorder=3)
    return (x, y, w, h)


def arrow(b1, b2, side1="right", side2="left", color=GREY, lw=1.8, curve=0.0):
    x1, y1, w1, h1 = b1
    x2, y2, w2, h2 = b2
    pts = {
        "top": (x1 + w1 / 2, y1 + h1), "bottom": (x1 + w1 / 2, y1),
        "left": (x1, y1 + h1 / 2), "right": (x1 + w1, y1 + h1 / 2),
    }
    pts2 = {
        "top": (x2 + w2 / 2, y2 + h2), "bottom": (x2 + w2 / 2, y2),
        "left": (x2, y2 + h2 / 2), "right": (x2 + w2, y2 + h2 / 2),
    }
    p1, p2 = pts[side1], pts2[side2]
    arr = FancyArrowPatch(p1, p2, arrowstyle="-|>", mutation_scale=16, linewidth=lw,
                           color=color, connectionstyle=f"arc3,rad={curve}", zorder=1)
    ax.add_patch(arr)


# ---------------- Title ----------------
ax.text(9.5, 12.55, "INVOICE.AUDIT — SYSTEM ARCHITECTURE", ha="center", fontsize=21,
        fontweight="bold", color=DARK)
ax.text(9.5, 12.15, "What actually runs in this codebase — not a generic template",
        ha="center", fontsize=10.5, color=GREY, style="italic")

# ---------------- Row 1: Users -> Auth -> Frontend -> API ----------------
users = box(0.3, 10.1, 3.0, 1.7, "USERS", [
    "Finance Manager / Controller", "AP Reviewer", "Auditor", "Admin",
], GREEN_FILL, GREEN, icon="circle")

auth = box(3.7, 10.1, 3.5, 1.7, "AUTH & SESSION", [
    "Email OTP (no passwords)", "Session token, server-checked", "RBAC — 5 roles", "Tenant resolution",
], BLUE_FILL, BLUE, icon="circle")

frontend = box(7.6, 10.1, 4.1, 1.7, "FRONTEND", [
    "React + TypeScript + Vite", "Dashboard · Upload · Exceptions", "Reconciliation · Settings",
], GREEN_FILL, GREEN, icon="circle")

api = box(12.1, 10.1, 3.7, 1.7, "API LAYER (Express)", [
    "Tenant + RBAC middleware", "Rate limiting, Helmet headers", "Route mounting, audit logging",
], PURPLE_FILL, PURPLE, icon="circle")

arrow(users, auth)
arrow(auth, frontend)
arrow(frontend, api)

# Right panel: Integrations
integ = box(16.1, 9.9, 2.6, 2.9, "INTEGRATIONS", [
    "ERP webhook sync (built)", "GST/GSTIN validation (built)", "CSV vendor/PO import (built)",
    "— roadmap —", "Live GSTN portal pull", "Payment gateway",
], AMBER_FILL, AMBER, item_size=7.6, title_size=9.5)
arrow(api, integ, "right", "left", color=GREY, curve=-0.1)

# ---------------- Row 2: backend modules ----------------
# All row-2/3/4 content must stay within x=0.3..15.9 so it never collides with the
# right-side panels (Integrations / Cross-cutting / Data In), which start at x=16.1.
ingestion = box(0.3, 7.6, 3.75, 2.0, "INGESTION", [
    "Upload (PDF/PNG/JPEG)", "CSV import — no OCR cost", "API-key intake", "Sample-data seeder",
], BLUE_FILL, BLUE, item_size=7.8, title_size=9.8)

validation = box(4.2, 7.6, 3.75, 2.0, "VALIDATION ENGINE", [
    "6 fixed rules, deterministic", "Same invoice → same result", "No AI call in this step",
], GREEN_FILL, GREEN, item_size=7.8, title_size=9.8)

recon = box(8.1, 7.6, 3.75, 2.0, "RECONCILIATION", [
    "GST classification (in/out)", "GSTIN checksum validation", "Excel (GSTR format) export",
], PURPLE_FILL, PURPLE, item_size=7.8, title_size=9.8)

notif = box(12.0, 7.6, 3.75, 2.0, "NOTIFICATIONS", [
    "Routed by role, not broadcast", "In-app + email (Resend)", "Slack webhook (optional)",
], AMBER_FILL, AMBER, item_size=7.8, title_size=9.8)

arrow(api, ingestion, "bottom", "top", curve=-0.2)
arrow(api, validation, "bottom", "top", curve=-0.05)
arrow(api, recon, "bottom", "top", curve=0.05)
arrow(api, notif, "bottom", "top", curve=0.2)

arrow(ingestion, validation, "right", "left")
arrow(validation, recon, "right", "left")
arrow(validation, notif, "right", "left", curve=0.3)

# ---------------- Row 3: the actual processing pipeline ----------------
pipe_y = 5.3
pipe_h = 1.7
steps = [
    ("READ THE\nINVOICE", "GPT-4o Vision\n→ structured JSON", BLUE_FILL, BLUE),
    ("VENDOR +\nDUPLICATE CHECK", "DB lookup, exact\n+ fuzzy match", GREEN_FILL, GREEN),
    ("PO MATCH +\nTAX MATH", "5% tolerance\nboth checks", GREEN_FILL, GREEN),
    ("RISK SCORE +\nROUTING", "auto-approve /\nreview / block", GREEN_FILL, GREEN),
    ("AUDIT TRAIL\nLOG", "HMAC-chained,\nappend-only", PURPLE_FILL, PURPLE),
]
step_w = 2.96
step_gap = 0.2
x0 = 0.3
pipe_boxes = []
for i, (title, sub, fill, edge) in enumerate(steps):
    x = x0 + i * (step_w + step_gap)
    rect = FancyBboxPatch((x, pipe_y), step_w, pipe_h, boxstyle="round,pad=0.02,rounding_size=0.09",
                           linewidth=1.8, edgecolor=edge, facecolor=fill, zorder=2)
    ax.add_patch(rect)
    ax.text(x + step_w / 2, pipe_y + pipe_h - 0.5, title, ha="center", va="center",
            fontsize=8.3, fontweight="bold", color=edge, zorder=3)
    ax.text(x + step_w / 2, pipe_y + 0.42, sub, ha="center", va="center",
            fontsize=7.3, color=DARK, zorder=3)
    pipe_boxes.append((x, pipe_y, step_w, pipe_h))

for i in range(len(pipe_boxes) - 1):
    arrow(pipe_boxes[i], pipe_boxes[i + 1])

ax.text(0.3, pipe_y + pipe_h + 0.18, "INVOICE PROCESSING PIPELINE — ONE GPT-4o CALL, THEN FIVE DETERMINISTIC STEPS",
        fontsize=10, fontweight="bold", color=DARK)

for b in (ingestion, validation):
    arrow(b, pipe_boxes[0], "bottom", "top", color=GREY, curve=0.0)

# ---------------- Row 4: storage ----------------
storage_y = 3.0
db = box(0.3, storage_y, 7.6, 1.9, "DATABASE — Postgres (Supabase)", [
    "Every table scoped by tenantId", "Vendors, POs, Invoices, Audit events, Users, Roles",
], BLUE_FILL, BLUE, item_size=8.0, title_size=9.8)

obj = box(8.1, storage_y, 7.8, 1.9, "OBJECT STORAGE — Supabase Storage", [
    "Signed, time-limited URLs only", "Invoice files, evidence attachments, GST Excel exports",
], BLUE_FILL, BLUE, item_size=8.0, title_size=9.8)

for b in pipe_boxes[:4]:
    arrow(b, db, "bottom", "top", color=GREY, lw=1.2, curve=0.0)
arrow(pipe_boxes[4], obj, "bottom", "top", color=GREY, lw=1.2, curve=0.0)

# Cross-cutting panel (right, spanning modules + pipeline rows)
cross = box(16.1, 3.0, 2.6, 6.5, "CROSS-CUTTING", [
    "Multi-tenant isolation", "RBAC at API + UI", "HMAC audit chain", "Rate limit + Helmet",
    "AES-256-GCM secrets", "Bcrypt-hashed keys",
], ROSE_FILL, ROSE, item_size=8.2, title_size=10)

# Data input panel (left, spanning modules + pipeline rows)
data_in = box(16.1, 0.25, 2.6, 2.55, "DATA IN", [
    "PDF / photo upload", "CSV spreadsheet", "Sample data (18 inv.)",
], GREEN_FILL, GREEN, item_size=8.2, title_size=10)
arrow(data_in, ingestion, "top", "bottom", color=GREY, curve=0.25)

# ---------------- Key benefits strip ----------------
benefits_y = 0.25
benefits = box(0.3, benefits_y, 15.6, 2.55, "WHAT THIS ACTUALLY CATCHES", [], GREEN_FILL, GREEN, title_size=11.5)
items = [
    ("Duplicate invoices", "blocked automatically —\nexact + fuzzy match"),
    ("Unregistered vendors", "blocked before a human\nsees the invoice"),
    ("PO / amount mismatches", "flagged with the exact\n% variance"),
    ("Every decision logged", "tamper-evident,\nHMAC-chained"),
    ("GST-ready export", "Excel in GSTR format,\nGSTIN-validated"),
]
bw = 15.6 / len(items)
for i, (h, sub) in enumerate(items):
    cx = 0.3 + i * bw + bw / 2
    ax.text(cx, benefits_y + 1.55, h, ha="center", va="center", fontsize=9, fontweight="bold", color=DARK)
    ax.text(cx, benefits_y + 1.0, sub, ha="center", va="center", fontsize=7.8, color=GREY)
    if i > 0:
        ax.plot([0.3 + i * bw, 0.3 + i * bw], [benefits_y + 0.25, benefits_y + 2.1], color="#A7F3D0", lw=1)

plt.tight_layout()
plt.savefig(
    r"c:\Users\Asus\Downloads\invoiceAUDIT\invoice-auditor-pro\architecture_diagram.png",
    dpi=190, bbox_inches="tight", facecolor="white",
)
print("Saved architecture_diagram.png (v2)")
