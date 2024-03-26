import { initDb, AsyncDuckDB } from "../lib/duckdb"
import { Cell, CellType } from "../lib/utils"
import { create } from "zustand"

interface AppState {
  db: AsyncDuckDB | null
  cells: Cell[]
  worker: any
  setDb: (db: AsyncDuckDB) => void
  setCells: (cells: Cell[]) => void
  setWorker: (worker: any) => void
  addCell: (type: CellType) => void
  updateQuery: (i: number, q: string) => void
  deleteLastBlock: () => void
}

export const useStore = create<AppState>()((set) => ({
  db: null,
  cells: [{ type: "upload" }],
  worker: null,
  setDb: (db) => set({ db }),
  setCells: (cells) => set({ cells }),
  setWorker: (worker) => set({ worker }),
  addCell: (type) => set((state) => ({ cells: [...state.cells, { type }] })),
  updateQuery: (i, q) =>
    set((state) => ({
      cells: [
        ...state.cells.slice(0, i),
        { ...state.cells[i], query: q },
        ...state.cells.slice(i + 1),
      ],
    })),
  deleteLastBlock: () => set((state) => ({ cells: state.cells.slice(0, -1) })),
}))
