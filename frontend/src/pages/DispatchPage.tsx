import { useState, type FormEvent } from "react"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  EmptyState,
  ErrorNote,
  Loading,
  PageHeader,
  TableScroller,
} from "@/components/common"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useApi } from "@/hooks/useApi"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatNumber, todayISO } from "@/lib/format"
import type { Dispatch } from "@/lib/types"

interface FormState {
  company_name: string
  dispatch_date: string
  quantity: string
  remarks: string
}

const EMPTY: FormState = {
  company_name: "",
  dispatch_date: todayISO(),
  quantity: "",
  remarks: "",
}

export function DispatchPage() {
  const dispatches = useApi<Dispatch[]>(() => api.get<Dispatch[]>("/dispatch"))
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Dispatch | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setError("")
    setOpen(true)
  }

  function openEdit(dispatch: Dispatch) {
    setEditing(dispatch)
    setForm({
      company_name: dispatch.company_name,
      dispatch_date: dispatch.dispatch_date,
      quantity: String(dispatch.quantity),
      remarks: dispatch.remarks,
    })
    setError("")
    setOpen(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    setSaving(true)

    const payload = {
      company_name: form.company_name.trim(),
      dispatch_date: form.dispatch_date,
      quantity: Number.parseInt(form.quantity, 10) || 0,
      remarks: form.remarks.trim(),
    }

    try {
      if (editing) {
        await api.patch<Dispatch>(`/dispatch/${editing.id}`, payload)
        toast.success("Dispatch updated")
      } else {
        await api.post<Dispatch>("/dispatch", payload)
        toast.success(
          `${formatNumber(payload.quantity)} lungis to ${payload.company_name}`,
        )
      }
      setOpen(false)
      dispatches.reload()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not save the dispatch.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(dispatch: Dispatch) {
    if (
      !window.confirm(
        `Delete the ${formatDate(dispatch.dispatch_date)} dispatch to ${
          dispatch.company_name
        }?`,
      )
    ) {
      return
    }
    try {
      await api.delete(`/dispatch/${dispatch.id}`)
      toast.success("Dispatch deleted")
      dispatches.reload()
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
        title="Dispatch"
        description="Lungis sent out to customer companies."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Record dispatch
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          {dispatches.loading ? (
            <Loading />
          ) : dispatches.error ? (
            <ErrorNote message={dispatches.error} onRetry={dispatches.reload} />
          ) : dispatches.data?.length === 0 ? (
            <EmptyState
              title="No dispatches recorded"
              description="Record a consignment to build up dispatch history."
            />
          ) : (
            <TableScroller>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead className="text-right">Lungis</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(dispatches.data ?? []).map((dispatch) => (
                    <TableRow key={dispatch.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(dispatch.dispatch_date)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {dispatch.company_name}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatNumber(dispatch.quantity)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {dispatch.remarks || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit dispatch"
                            onClick={() => openEdit(dispatch)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete dispatch"
                            onClick={() => void handleDelete(dispatch)}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit dispatch" : "Record dispatch"}
            </DialogTitle>
            <DialogDescription>
              Track what went out, to whom, and when.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="company">Company name</Label>
              <Input
                id="company"
                required
                value={form.company_name}
                onChange={(event) =>
                  setForm({ ...form, company_name: event.target.value })
                }
                placeholder="Chennai Textiles Ltd"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dispatch-date">Dispatch date</Label>
                <Input
                  id="dispatch-date"
                  type="date"
                  required
                  value={form.dispatch_date}
                  onChange={(event) =>
                    setForm({ ...form, dispatch_date: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Number of lungis</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={form.quantity}
                  onChange={(event) =>
                    setForm({ ...form, quantity: event.target.value })
                  }
                  placeholder="500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="remarks">Remarks (optional)</Label>
              <Input
                id="remarks"
                value={form.remarks}
                onChange={(event) =>
                  setForm({ ...form, remarks: event.target.value })
                }
                placeholder="Priority order"
              />
            </div>

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
                {editing ? "Save changes" : "Record dispatch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
