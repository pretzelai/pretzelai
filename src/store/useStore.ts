import { initDb, AsyncDuckDB } from "../lib/duckdb"
import { Cell, CellType } from "../lib/utils"
import { create } from "zustand"
import { compile, CompileOptions } from "prql-js/dist/bundler"
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
  initDbAndWorker: () => Promise<void>
  query: (modifiedPrql: string) => Promise<{ rowsJson: any; result: any }>
}

export const useStore = create<AppState>()((set, get) => ({
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
  initDbAndWorker: async () => {
    const db = await initDb()
    const con = await db.connect()
    con.query("SET pivot_limit=1000001")
    get().setDb(db)
    const w = new Worker(new URL("../core/worker.ts", import.meta.url), {
      type: "module",
    })
    get().setWorker(w)
  },
  query: async (modifiedPrql: string) => {
    let result
    const db = get().db
    if (db) {
      try {
        const opts = new CompileOptions()
        opts.signature_comment = false
        modifiedPrql = modifiedPrql.trim()
        // Split the modified PRQL into chunks based on pivot and SQL blocks, preserving the blocks
        let allChunks = modifiedPrql
          .split(/(PIVOT\s*{[^}]*}|SQL\s*{[^}]*})/)
          .filter((chunk) => chunk !== "")

        let finalSql: string | undefined = ""

        if (
          allChunks.length === 1 &&
          !allChunks[0].startsWith("PIVOT") &&
          !allChunks[0].startsWith("SQL")
        ) {
          // If there's only one chunk and it's not a special block, compile it directly
          finalSql = compile(modifiedPrql, opts)
        } else {
          const chunkObjects: Array<{ type: string; chunk: string }> = []

          allChunks.forEach((chunk) => {
            // add code to skip empty chunks
            if (chunk.trim() === "") {
              return
            } else if (chunk.startsWith("PIVOT")) {
              chunkObjects.push({ type: "PIVOT", chunk })
            } else if (chunk.startsWith("SQL")) {
              chunkObjects.push({ type: "SQL", chunk })
            } else {
              chunkObjects.push({ type: "PRQL", chunk })
            }
          })

          const ctes: string[] = []
          let currentTable = ""
          chunkObjects.forEach((chunkObject, i) => {
            const { type, chunk } = chunkObject
            let chunkWithTable = chunk
            if (type === "PRQL") {
              if (i > 0) {
                chunkWithTable = `from ${currentTable}\n${chunk}`
              }
              const sql = compile(chunkWithTable, opts)
              currentTable = `table${i + 1}`
              ctes.push(`${currentTable} as (${sql})`)
            } else if (type === "PIVOT") {
              const pivotSql = chunk
                .replace(/PIVOT\s*{/, `PIVOT ${currentTable} `)
                .replace(/}\s*$/, "")
              currentTable = `table${i + 1}`
              ctes.push(`${currentTable} as (${pivotSql})`)
            } else if (type === "SQL") {
              const sql = chunk
                .replace(/SQL\s*{/, "")
                .replace(/}\s*$/, "")
                .replace(/`AI_Table`/g, currentTable) // handle case with backticks
                .replace("AI_Table", currentTable)
                .replace(/`PrevTable`/g, currentTable) // handle case with backticks
                .replace("PrevTable", currentTable)
              currentTable = `table${i + 1}`
              ctes.push(`${currentTable} as (${sql})`)
            }
          })
          finalSql = `with ${ctes.join(", ")}\nSELECT * FROM ${currentTable}`
        }

        const c = await db.connect()
        result = await c.query(finalSql as string)
        await c.close()
      } catch (e) {
        console.error(e)
      }
    }
    return {
      rowsJson: result && result.toArray().map((row: any) => row.toJSON()),
      result,
    }
  },
}))

export const useCell = (id: number) => {
  const cell = useStore((state) => state.cells[id])
  const update = useStore((state) => state.updateQuery)
  const updateQuery = (q: string) => update(id, q)
  const cells = useStore((state) => state.cells)
  const prevQuery = cells[id - 1]?.query || ""
  const query = useStore((state) => state.query)
  return { cell, updateQuery, prevQuery, query }
}
