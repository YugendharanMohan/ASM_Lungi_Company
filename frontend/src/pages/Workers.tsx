import { useEffect, useState, type FormEvent } from "react"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  EmptyState,
  ErrorNote,
  Loading,
  PageHeader,
  TableScroller,
} from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useApi } from "@/hooks/useApi"
import { api, ApiError } from "@/lib/api"
import { formatCurrency } from "@/lib/format"
import type { Loom, Shed, Worker } from "@/lib/types"

const NONE = "__none__"

interface FormState {
  name: string
  phone: string
  shed_id: string
  loom_id: string
  rate_per_meter: string
  is_active: boolean
}

const EMPTY: FormState = {
  name: "",
  phone: "",
  shed_id: NONE,
  loom_id: NONE,
  rate_per_meter: "",
  is_active: true,
}

export function Workers() {
  const workers = useApi<Worker[]>(() => api.get<Worker[]>("/workers"))
  const sheds = useApi<Shed[]>(() => api.get<Shed[]>("/sheds"))
  const looms = useApi<Loom[]>(() => api.get<Loom[]>("/looms"))

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Worker | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Only looms in the chosen shed — the backend rejects a mismatch, so
  // offering the others would just produce an error the user can't interpret.
  const availableLooms = (looms.data ?? []).filter(
    (loom) => form.shed_id === NONE || String(loom.shed_id) === form.shed_id,
  )

  useEffect(() => {
    if (form.loom_id === NONE) return
    const stillValid = availableLooms.some(
      (loom) => String(loom.id) === form.loom_id,
    )
    if (!stillValid) setForm((prev) => ({ ...prev, loom_id: NONE }))
  }, [form.shed_id, form.loom_id, availableLooms])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setError("")
    setOpen(true)
  }

  function openEdit(worker: Worker) {
    setEditing(worker)
    setForm({
      name: worker.name,
      phone: worker.phone,
      shed_id: worker.shed_id ? String(worker.shed_id) : NONE,
      loom_id: worker.loom_id ? String(worker.loom_id) : NONE,
      rate_per_meter: String(worker.rate_per_meter ?? ""),
      is_active: worker.is_active,
    })
    setError("")
    setOpen(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    setSaving(true)

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      shed_id: form.shed_id === NONE ? null : Number(form.shed_id),
      loom_id: form.loom_id === NONE ? null : Number(form.loom_id),
      rate_per_meter: Number.parseFloat(form.rate_per_meter) || 0,
      is_active: form.is_active,
    }

    try {
      if (editing) {
        await api.patch<Worker>(`/workers/${editing.id}`, payload)
        toast.success(`${payload.name} updated`)
      } else {
        await api.post<Worker>("/workers", payload)
        toast.success(`${payload.name} added`)
      }
      setOpen(false)
      workers.reload()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not save worker.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(worker: Worker) {
    if (!window.confirm(`Delete ${worker.name}?`)) return
    try {
      await api.delete(`/workers/${worker.id}`)
      toast.success(`${worker.name} deleted`)
      workers.reload()
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not delete.",
        { duration: 8000 },
      )
    }
  }

  return (
    <div>
      <PageHeader
        title="Workers"
        description="Names, rates and loom assignments."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add worker
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          {workers.loading ? (
            <Loading />
          ) : workers.error ? (
            <ErrorNote message={workers.error} onRetry={workers.reload} />
          ) : workers.data?.length === 0 ? (
            <EmptyState
              title="No workers yet"
              description="Add your first worker to start recording production."
            />
          ) : (
            <TableScroller>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Shed</TableHead>
                    <TableHead>Loom</TableHead>
                    <TableHead className="text-right">Rate / m</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(workers.data ?? []).map((worker) => (
                    <TableRow key={worker.id}>
                      <TableCell className="font-medium">
                        {worker.name}
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">
                        {worker.phone || "—"}
                      </TableCell>
                      <TableCell>{worker.shed_name || "—"}</TableCell>
                      <TableCell>{worker.loom_number || "—"}</TableCell>
                      <TableCell className="tabular text-right">
                        {formatCurrency(worker.rate_per_meter)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={worker.is_active ? "default" : "secondary"}
                        >
                          {worker.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${worker.name}`}
                            onClick={() => openEdit(worker)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${worker.name}`}
                            onClick={() => void handleDelete(worker)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroller>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${editing.name}` : "Add worker"}
            </DialogTitle>
            <DialogDescription>
              The rate here pre-fills the daily entry form.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="worker-name">Worker name</Label>
              <Input
                id="worker-name"
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="worker-phone">Phone</Label>
                <Input
                  id="worker-phone"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  placeholder="9876543210"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="worker-rate">Rate per meter (₹)</Label>
                <Input
                  id="worker-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.rate_per_meter}
                  onChange={(event) =>
                    setForm({ ...form, rate_per_meter: event.target.value })
                  }
                  placeholder="12.50"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="worker-shed">Assigned shed</Label>
                <Select
                  value={form.shed_id}
                  onValueChange={(value) =>
                    setForm({ ...form, shed_id: value })
                  }
                >
                  <SelectTrigger id="worker-shed" className="w-full">
                    <SelectValue placeholder="No shed" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No shed</SelectItem>
                    {(sheds.data ?? []).map((shed) => (
                      <SelectItem key={shed.id} value={String(shed.id)}>
                        Shed {shed.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="worker-loom">Assigned loom</Label>
                <Select
                  value={form.loom_id}
                  onValueChange={(value) =>
                    setForm({ ...form, loom_id: value })
                  }
                >
                  <SelectTrigger id="worker-loom" className="w-full">
                    <SelectValue placeholder="No loom" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No loom</SelectItem>
                    {availableLooms.map((loom) => (
                      <SelectItem key={loom.id} value={String(loom.id)}>
                        Shed {loom.shed_name} · Loom {loom.loom_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={form.is_active}
                onChange={(event) =>
                  setForm({ ...form, is_active: event.target.checked })
                }
              />
              Active — appears in the daily entry worker list
            </label>

            {error && <ErrorNote message={error} />}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save changes" : "Add worker"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
