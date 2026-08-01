import { useCallback, useEffect, useRef, useState } from "react"

import { ApiError } from "@/lib/api"

interface State<T> {
  data: T | null
  loading: boolean
  error: string
}

/**
 * Fetch on mount and whenever `deps` change, with a manual `reload`.
 *
 * `loader` is intentionally not a dependency — callers pass inline arrows, so
 * depending on it would refetch on every render. `deps` is the control.
 */
export function useApi<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): State<T> & { reload: () => void } {
  const [state, setState] = useState<State<T>>({
    data: null,
    loading: true,
    error: "",
  })

  const loaderRef = useRef(loader)
  loaderRef.current = loader

  // Guards against a slow first response overwriting a newer one when deps
  // change quickly (e.g. typing in a date filter).
  const requestId = useRef(0)

  const run = useCallback(() => {
    const id = ++requestId.current
    setState((prev) => ({ ...prev, loading: true, error: "" }))
    loaderRef
      .current()
      .then((data) => {
        if (id === requestId.current) setState({ data, loading: false, error: "" })
      })
      .catch((error: unknown) => {
        if (id !== requestId.current) return
        setState({
          data: null,
          loading: false,
          error:
            error instanceof ApiError
              ? error.message
              : "Something went wrong loading this page.",
        })
      })
  }, [])

  useEffect(run, [run, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, reload: run }
}
