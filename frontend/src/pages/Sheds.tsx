import { useState, type FormEvent } from "react"
import { Cog, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { EmptyState, ErrorNote, Loading, PageHeader } from "@/components/common"
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
import { useApi } from "@/hooks/useApi"
import { api, ApiError } from "@/lib/api"
import type { Shed } from "@/lib/types"

export function Sheds() {
  const sheds = useApi<Shed[]>(() => api.get<Shed[]>("/sheds"))
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Shed | null>(null)
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function openCreate() {
    setEditing(null)
    setName("")
    setLocation("")
    setError("")
    setOpen(true)
  }

  function openEdit(shed: Shed) {
    setEditing(shed)
    setName(shed.name)
    setLocation(shed.location)
    setError("")
    setOpen(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    setSaving(true)
    const payload = { name: name.trim(), location: location.trim() }

    try {
      if (editing) {
        await api.patch<Shed>(`/sheds/${editing.id}`, payload)
        toast.success(`Shed ${payload.name} updated`)
      } else {
        await api.post<Shed>("/sheds", payload)
        toast.success(`Shed ${payload.name} added`)
      }
      setOpen(false)
      sheds.reload()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not save shed.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(shed: Shed) {
    if (!window.confirm(`Delete shed ${shed.name}?`)) return
    try {
      await api.delete(`/sheds/${shed.id}`)
      toast.success(`Shed ${shed.name} deleted`)
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
        title="Sheds"
        description="Each shed holds the looms your workers are assigned to."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add shed
          </Button>
        }
      />

      {sheds.loading ? (
        <Loading />
      ) : sheds.error ? (
        <ErrorNote message={sheds.error} onRetry={sheds.reload} />
      ) : sheds.data?.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="No sheds yet"
              description="Add a shed (A, B, C…) before adding looms."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(sheds.data ?? []).map((shed) => (
            <Card key={shed.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">
                      Shed {shed.name}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {shed.location || "No location set"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit shed ${shed.name}`}
                      onClick={() => openEdit(shed)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete shed ${shed.name}`}
                      onClick={() => void handleDelete(shed)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
                  <Cog className="size-4" />
                  {shed.loom_count} loom{shed.loom_count === 1 ? "" : "s"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit shed ${editing.name}` : "Add shed"}
            </DialogTitle>
            <DialogDescription>
              Sheds are usually single letters — A, B, C.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="shed-name">Shed name</Label>
              <Input
                id="shed-name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="A"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shed-location">Location (optional)</Label>
              <Input
                id="shed-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="North block"
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
                {editing ? "Save changes" : "Add shed"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
