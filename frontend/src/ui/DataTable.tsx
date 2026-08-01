import { useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react"

import { SearchInput } from "@/ui/SearchInput"
import { EmptyState, ErrorNote, TableSkeleton } from "@/ui/Feedback"
import { cn } from "@/lib/utils"

export interface Column<T> {
  key: string
  header: string
  align?: "left" | "right" | "center"
  /** Omit to make the column unsortable (actions, badges). */
  sortValue?: (row: T) => string | number
  render: (row: T) => ReactNode
  headerClassName?: string
  cellClassName?: string
}

interface DataTableProps<T> {
  data: T[] | null
  columns: Column<T>[]
  getRowId: (row: T) => string | number
  loading?: boolean
  error?: string
  onRetry?: () => void

  /** Enables the search box; the predicate decides what "matches" means. */
  searchable?: (row: T, query: string) => boolean
  searchPlaceholder?: string
  filters?: ReactNode
  toolbarEnd?: ReactNode

  pageSize?: number
  emptyTitle?: string
  emptyDescription?: string
  /** Wrapper is omitted when the table already sits inside a card. */
  bare?: boolean
}

const ALIGN = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const

export function DataTable<T>({
  data,
  columns,
  getRowId,
  loading,
  error,
  onRetry,
  searchable,
  searchPlaceholder = "Search",
  filters,
  toolbarEnd,
  pageSize = 12,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  bare = false,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)

  const filtered = useMemo(() => {
    const rows = data ?? []
    if (!searchable || !query.trim()) return rows
    const q = query.trim().toLowerCase()
    return rows.filter((row) => searchable(row, q))
  }, [data, searchable, query])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const column = columns.find((c) => c.key === sort.key)
    if (!column?.sortValue) return filtered
    // Copied before sorting: sorting in place would mutate the array the
    // caller still holds and quietly reorder its state.
    return [...filtered].sort((a, b) => {
      const av = column.sortValue!(a)
      const bv = column.sortValue!(b)
      if (av === bv) return 0
      return (av > bv ? 1 : -1) * sort.dir
    })
  }, [filtered, sort, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  // Clamped rather than stored: filtering down to fewer pages while sitting on
  // the last one would otherwise show an empty table.
  const safePage = Math.min(page, pageCount - 1)
  const rows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  const showToolbar = Boolean(searchable || filters || toolbarEnd)

  function toggleSort(key: string) {
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === 1
          ? { key, dir: -1 }
          : null
        : { key, dir: 1 },
    )
    setPage(0)
  }

  const body = (
    <>
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2.5 pb-4">
          {searchable && (
            <SearchInput
              value={query}
              onChange={(value) => {
                setQuery(value)
                setPage(0)
              }}
              placeholder={searchPlaceholder}
              className="w-full sm:w-64"
            />
          )}
          {filters}
          {toolbarEnd && <div className="ml-auto">{toolbarEnd}</div>}
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} />
      ) : error ? (
        <ErrorNote message={error} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={query ? "No matches" : emptyTitle}
          description={
            query
              ? `Nothing matches “${query}”.`
              : emptyDescription
          }
        />
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1">
            <table className="w-full border-collapse text-[13.5px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  {columns.map((column) => {
                    const sortable = Boolean(column.sortValue)
                    const active = sort?.key === column.key
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        className={cn(
                          "glass whitespace-nowrap border-b border-[var(--border-subtle)] px-3 py-2.5",
                          "text-[11.5px] font-semibold uppercase tracking-[0.055em] text-[var(--text-tertiary)]",
                          "first:pl-1 last:pr-1",
                          ALIGN[column.align ?? "left"],
                          column.headerClassName,
                        )}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(column.key)}
                            className={cn(
                              "inline-flex items-center gap-1 transition-colors hover:text-[var(--text)]",
                              active && "text-[var(--accent)]",
                              column.align === "right" && "flex-row-reverse",
                            )}
                          >
                            {column.header}
                            <ChevronsUpDown className="size-3" />
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false} mode="popLayout">
                  {rows.map((row, index) => (
                    <motion.tr
                      key={getRowId(row)}
                      layout="position"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: 0.22,
                        delay: Math.min(index * 0.012, 0.12),
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="group border-b border-[var(--border-subtle)] transition-colors last:border-0 hover:bg-[var(--surface-sunken)]"
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            "px-3 py-3 text-[var(--text)] first:pl-1 last:pr-1",
                            ALIGN[column.align ?? "left"],
                            column.cellClassName,
                          )}
                        >
                          {column.render(row)}
                        </td>
                      ))}
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 pt-4">
              <p className="text-[12.5px] text-[var(--text-tertiary)]">
                {safePage * pageSize + 1}–
                {Math.min((safePage + 1) * pageSize, sorted.length)} of{" "}
                {sorted.length}
              </p>
              <div className="flex items-center gap-1">
                <PagerButton
                  label="Previous page"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  <ChevronLeft className="size-4" />
                </PagerButton>
                <span className="tabular px-2 text-[12.5px] text-[var(--text-secondary)]">
                  {safePage + 1} / {pageCount}
                </span>
                <PagerButton
                  label="Next page"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  <ChevronRight className="size-4" />
                </PagerButton>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )

  if (bare) return body

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
      {body}
    </div>
  )
}

function PagerButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-[9px] text-[var(--text-secondary)]",
        "transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]",
        "disabled:pointer-events-none disabled:opacity-35",
      )}
    >
      {children}
    </button>
  )
}
