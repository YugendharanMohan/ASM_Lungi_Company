import { useMemo, useState, type FormEvent } from "react"
import { motion } from "motion/react"
import { Building2, Cog, MapPin, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useApi } from "@/hooks/useApi"
import { api, ApiError } from "@/lib/api"
import type { Shed } from "@/lib/types"
import { Button } from "@/ui/Button"
import { EmptyState, ErrorNote, Skeleton } from "@/ui/Feedback"
import { Field } from "@/ui/Field"
import { Modal } from "@/ui/Modal"
import { PageHeader } from "@/ui/PageHeader"
import { SearchInput } from "@/ui/SearchInput"
import { SegmentedControl } from "@/ui/SegmentedControl"
import { staggerChild, staggerParent } from "@/ui/motion"

type ShedFilter = "all" | "with-looms" | "empty"

export function Sheds() {
  const sheds = useApi<Shed[]>(() => api.get<Shed[]>("/sheds"))
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<ShedFilter>("all")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Shed | null>(null)
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [nameError, setNameError] = useState("")

  function openCreate() {
    setEditing(null)
    setName("")
    setLocation("")
    setError("")
    setNameError("")
    setOpen(true)
  }

  function openEdit(shed: Shed) {
    setEditing(shed)
    setName(shed.name)
    setLocation(shed.location)
    setError("")
    setNameError("")
    setOpen(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setNameError("Give the shed a name.")
      return
    }
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

  const visible = useMemo(() => {
    const rows = sheds.data ?? []
    const q = query.trim().toLowerCase()
    return rows.filter((shed) => {
      // Matched against the displayed label, not the bare name. The card
      // reads "Shed B" while the stored name is "B", so typing what is on
      // screen would otherwise find nothing.
      const matchesQuery =
        !q ||
        `shed ${shed.name}`.toLowerCase().includes(q) ||
        shed.location.toLowerCase().includes(q)
      const matchesFilter =
        filter === "all" ||
        (filter === "with-looms" ? shed.loom_count > 0 : shed.loom_count === 0)
      return matchesQuery && matchesFilter
    })
  }, [sheds.data, query, filter])

  const hasSheds = (sheds.data?.length ?? 0) > 0
  const filtered = query.trim() !== "" || filter !== "all"

  return (
    <div>
      <PageHeader
        title="Sheds"
        description="Each shed holds the looms your workers are booked to."
        actions={
          <Button onClick={openCreate} icon={<Plus className="size-4" />}>
            Add shed
          </Button>
        }
      />

      {hasSheds && !sheds.loading && !sheds.error && (
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search shed or location"
            className="w-full sm:w-64"
          />
          <SegmentedControl
            aria-label="Filter sheds"
            value={filter}
            onChange={setFilter}
            segments={[
              { value: "all", label: "All" },
              { value: "with-looms", label: "With looms" },
              { value: "empty", label: "Empty" },
            ]}
          />
          {filtered && (
            <p className="text-[12.5px] text-[var(--text-tertiary)]">
              {visible.length} of {sheds.data?.length}
            </p>
          )}
        </div>
      )}

      {sheds.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[132px] rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : sheds.error ? (
        <ErrorNote message={sheds.error} onRetry={sheds.reload} />
      ) : visible.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)]">
          {filtered ? (
            <EmptyState
              title="No matches"
              description="No shed matches the current search and filter."
              icon={<Building2 className="size-5" />}
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("")
                    setFilter("all")
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No sheds yet"
              description="Add a shed (A, B, C…) before adding looms."
              icon={<Building2 className="size-5" />}
              action={
                <Button onClick={openCreate} icon={<Plus className="size-4" />}>
                  Add shed
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <motion.div
          variants={staggerParent}
          initial="hidden"
          animate="visible"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {visible.map((shed) => (
            <motion.article
              key={shed.id}
              variants={staggerChild}
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="group rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--accent-soft)] text-[15px] font-semibold text-[var(--accent)]">
                    {shed.name.slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold tracking-[-0.01em]">
                      Shed {shed.name}
                    </p>
                    <p className="flex items-center gap-1 truncate text-[12.5px] text-[var(--text-tertiary)]">
                      <MapPin className="size-3 shrink-0" />
                      {shed.location || "No location set"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => openEdit(shed)}
                    aria-label={`Edit shed ${shed.name}`}
                    className="rounded-[8px] p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(shed)}
                    aria-label={`Delete shed ${shed.name}`}
                    className="rounded-[8px] p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-[var(--border-subtle)] pt-3 text-[13px] text-[var(--text-secondary)]">
                <Cog className="size-3.5" />
                {shed.loom_count} loom{shed.loom_count === 1 ? "" : "s"}
              </div>
            </motion.article>
          ))}
        </motion.div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit shed ${editing.name}` : "Add shed"}
        description="Sheds are usually short codes — A, B, AA."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="shed-form" loading={saving}>
              {editing ? "Save changes" : "Add shed"}
            </Button>
          </>
        }
      >
        <form id="shed-form" onSubmit={handleSubmit} className="space-y-4 pb-2">
          <Field
            label="Shed name"
            icon={<Building2 className="size-[18px]" />}
            value={name}
            error={nameError}
            onChange={(event) => {
              setName(event.target.value)
              setNameError("")
            }}
          />
          <Field
            label="Location"
            icon={<MapPin className="size-[18px]" />}
            value={location}
            hint="Optional"
            onChange={(event) => setLocation(event.target.value)}
          />
          {error && <ErrorNote message={error} />}
        </form>
      </Modal>
    </div>
  )
}
