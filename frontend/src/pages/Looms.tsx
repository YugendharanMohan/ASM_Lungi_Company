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
import type { Loom, Shed } from "@/lib/types"

const ALL = "__all__"

export function Looms() {
  const [shedFilter, setShedFilter] = useState(ALL)
  const sheds = useApi<Shed[]>(() => api.get<Shed[]>("/sheds"))
  const looms = useApi<Loom[]>(
    () =>
      api.get<Loom[]>("/looms", {
        shed_id: shedFilter === ALL ? undefined : shedFilter,
      }),
    [shedFilter],
  )

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Loom | null>(null)
  const [loomNumber, setLoomNumber] = useState("")
  const [shedId, setShedId] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function openCreate() {
    setEditing(null)
    setLoomNumber("")
    setShedId(shedFilter !== ALL ? shedFilter : String(sheds.data?.[0]?.id ?? ""))
    setIsActive(true)
    setError("")
    setOpen(true)
  }

  function openEdit(loom: Loom) {
    setEditing(loom)
    setLoomNumber(loom.loom_number)
    setShedId(String(loom.shed_id))
    setIsActive(loom.is_active)
    setError("")
    setOpen(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!shedId) {
      setError("Choose a shed for this loom.")
      return
    }
    setError("")
    setSaving(true)

    const payload = {
      loom_number: loomNumber.trim(),
      shed_id: Number(shedId),
      is_active: isActive,
    }

    try {
      if (editing) {
        await api.patch<Loom>(`/looms/${editing.id}`, payload)
        toast.success(`Loom ${payload.loom_number} updated`)
      } else {
        await api.post<Loom>("/looms", payload)
        toast.success(`Loom ${payload.loom_number} added`)
      }
      setOpen(false)
      looms.reload()
      sheds.reload()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not save loom.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(loom: Loom) {
    if (
      !window.confirm(
        `Delete loom ${loom.loom_number} from shed ${loom.shed_name}?`,
      )
    ) {
      return
    }
    try {
      await api.delete(`/looms/${loom.id}`)
      toast.success("Loom deleted")
      looms.reload()
      sheds.reload()
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
        title="Looms"
        description="Every loom belongs to one shed. Change the shed to move it."
        actions={
          <>
            <Select value={shedFilter} onValueChange={setShedFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sheds</SelectItem>
                {(sheds.data ?? []).map((shed) => (
                  <SelectItem key={shed.id} value={String(shed.id)}>
                    Shed {shed.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={openCreate}
              disabled={(sheds.data?.length ?? 0) === 0}
            >
              <Plus className="size-4" />
              Add loom
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="pt-6">
          {looms.loading ? (
            <Loading />
          ) : looms.error ? (
            <ErrorNote message={looms.error} onRetry={looms.reload} />
          ) : (sheds.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="Add a shed first"
              description="Looms have to belong to a shed, so create one under Sheds."
            />
          ) : looms.data?.length === 0 ? (
            <EmptyState
              title="No looms here"
              description="Add a loom to this shed to start assigning workers."
            />
          ) : (
            <TableScroller>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loom</TableHead>
                    <TableHead>Shed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(looms.data ?? []).map((loom) => (
                    <TableRow key={loom.id}>
                      <TableCell className="font-medium">
                        Loom {loom.loom_number}
                      </TableCell>
                      <TableCell>Shed {loom.shed_name}</TableCell>
                      <TableCell>
                        <Badge variant={loom.is_active ? "default" : "secondary"}>
                          {loom.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit loom ${loom.loom_number}`}
                            onClick={() => openEdit(loom)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete loom ${loom.loom_number}`}
                            onClick={() => void handleDelete(loom)}
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
              {editing ? `Edit loom ${editing.loom_number}` : "Add loom"}
            </DialogTitle>
            <DialogDescription>
              Loom numbers only need to be unique within their shed.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="loom-shed">Shed</Label>
              <Select value={shedId} onValueChange={setShedId}>
                <SelectTrigger id="loom-shed" className="w-full">
                  <SelectValue placeholder="Select shed" />
                </SelectTrigger>
                <SelectContent>
                  {(sheds.data ?? []).map((shed) => (
                    <SelectItem key={shed.id} value={String(shed.id)}>
                      Shed {shed.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="loom-number">Loom number</Label>
              <Input
                id="loom-number"
                required
                value={loomNumber}
                onChange={(event) => setLoomNumber(event.target.value)}
                placeholder="1"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              Active — currently running
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
                {editing ? "Save changes" : "Add loom"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
