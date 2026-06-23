import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/AppLayout";
import { getVendors, createVendor, updateVendor, deleteVendor, type VendorMaster } from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/workspace-context";

const EMPTY: Partial<VendorMaster> = { vendorCode: "", vendorName: "", gstin: "", email: "", isActive: true };

export default function VendorsPage() {
  const workspace = useCurrentWorkspace();
  const qc = useQueryClient();
  const context = workspace.mode === "enterprise"
    ? { mode: "enterprise" as const, tenantSlug: workspace.tenantSlug ?? undefined, sessionToken: workspace.session?.sessionToken ?? undefined }
    : undefined;

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<VendorMaster>>(EMPTY);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["vendors", workspace.tenantSlug],
    queryFn: () => getVendors(context),
    enabled: workspace.mode === "enterprise",
  });

  const createMutation = useMutation({
    mutationFn: () => createVendor(form, context),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      toast.success("Vendor added.");
      setShowForm(false);
      setForm(EMPTY);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not add vendor."),
  });

  const updateMutation = useMutation({
    mutationFn: () => updateVendor(editId!, form, context),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      toast.success("Vendor updated.");
      setEditId(null);
      setForm(EMPTY);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update vendor."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVendor(id, context),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendors"] }); toast.success("Vendor removed."); },
    onError: () => toast.error("Could not remove vendor."),
  });

  const vendors = data?.vendors ?? [];
  const filtered = search
    ? vendors.filter((v) => v.vendorName.toLowerCase().includes(search.toLowerCase()) || v.vendorCode.toLowerCase().includes(search.toLowerCase()))
    : vendors;

  function startEdit(v: VendorMaster) {
    setEditId(v.id);
    setForm({ vendorCode: v.vendorCode, vendorName: v.vendorName, gstin: v.gstin ?? "", email: v.email ?? "", isActive: v.isActive });
    setShowForm(false);
  }

  function cancelEdit() { setEditId(null); setForm(EMPTY); }

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [key]: e.target.value }));
  }

  return (
    <AppShell
      eyebrow="Settings"
      title="Vendor Master"
      description="Manage your approved vendor registry. Only vendors listed here pass the vendor master check."
    >
      <div className="space-y-6">
        {/* Add vendor form */}
        {showForm ? (
          <Card>
            <CardHeader>
              <CardTitle>Add vendor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Vendor code *</label>
                  <Input className="mt-1" placeholder="VND-001" value={form.vendorCode ?? ""} onChange={field("vendorCode")} />
                </div>
                <div>
                  <label className="text-sm font-medium">Vendor name *</label>
                  <Input className="mt-1" placeholder="Acme Supplies Ltd" value={form.vendorName ?? ""} onChange={field("vendorName")} />
                </div>
                <div>
                  <label className="text-sm font-medium">GSTIN</label>
                  <Input className="mt-1 font-mono uppercase" placeholder="27AABCU9603R1ZM" value={form.gstin ?? ""} onChange={field("gstin")} />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input type="email" className="mt-1" placeholder="accounts@acme.com" value={form.email ?? ""} onChange={field("email")} />
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <Button variant="hero" className="rounded-xl" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Adding…" : "Add vendor"}
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => { setShowForm(false); setForm(EMPTY); }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Vendor list */}
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Vendor registry
                <Badge variant="secondary">{vendors.length}</Badge>
              </span>
              <div className="flex gap-3">
                <Input
                  placeholder="Search vendors…"
                  className="max-w-[220px]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button variant="hero" className="rounded-xl" onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4" /> Add vendor
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading vendors…</p>
            ) : !filtered.length ? (
              <p className="text-sm text-muted-foreground">{search ? "No vendors match your search." : "No vendors added yet. Add your first vendor above."}</p>
            ) : (
              <div className="divide-y">
                {filtered.map((v) => (
                  <div key={v.id} className="py-4">
                    {editId === v.id ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input className="font-mono text-sm" value={form.vendorCode ?? ""} onChange={field("vendorCode")} placeholder="Vendor code" />
                        <Input className="text-sm" value={form.vendorName ?? ""} onChange={field("vendorName")} placeholder="Vendor name" />
                        <Input className="font-mono uppercase text-sm" value={form.gstin ?? ""} onChange={field("gstin")} placeholder="GSTIN" />
                        <Input type="email" className="text-sm" value={form.email ?? ""} onChange={field("email")} placeholder="Email" />
                        <div className="flex gap-2 sm:col-span-2">
                          <Button size="sm" variant="hero" className="rounded-lg" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                            <Check className="h-3.5 w-3.5" /> Save
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-lg" onClick={cancelEdit}>
                            <X className="h-3.5 w-3.5" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{v.vendorCode}</span>
                            <span className="font-medium text-sm">{v.vendorName}</span>
                            {v.isActive ? (
                              <Badge variant="secondary" className="bg-teal-100 text-teal-700 text-xs">Active</Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-slate-100 text-slate-500 text-xs">Inactive</Badge>
                            )}
                          </div>
                          <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                            {v.gstin ? <span>GSTIN: {v.gstin}</span> : null}
                            {v.email ? <span>{v.email}</span> : null}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="rounded-lg" onClick={() => startEdit(v)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg text-rose-600 hover:text-rose-700"
                            onClick={() => {
                              if (confirm(`Remove ${v.vendorName}?`)) deleteMutation.mutate(v.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
