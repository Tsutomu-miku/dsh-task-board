import { createContext, useContext } from "react"

export const BoardPortalContext = createContext<HTMLElement | null>(null)

export function useBoardPortal() {
  return useContext(BoardPortalContext)
}
