import { useEffect } from "react"
import Upload from "./components/Upload"
import FilterBlock from "./components/FilterBlock"
import Columns from "./components/Columns"
import TableView from "./components/TableView"
import Download from "./components/Download"
import Chart from "./components/Chart"
import UserQuery from "./components/UserQuery"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./components/ui/resizable"
import { initDb, AsyncDuckDB } from "./lib/duckdb"
import { Button } from "./components/ui/button"
import { Cell, CellType } from "./lib/utils"
import PivotTable from "./components/Pivot"
import CreateColumn from "./components/CreateColumn"
import AI from "./components/AI"
import Feedback from "./components/Feedback"
import { POSTHOG_PUBLIC_KEY, POSTHOG_URL } from "./lib/config"
import Sort from "./components/Sort"
import Python from "./components/Python"
import { useStore } from "./store/useStore"

export default function App() {
  const {
    db,
    cells,
    worker,
    setDb,
    setCells,
    setWorker,
    addCell,
    updateQuery,
    deleteLastBlock,
  } = useStore()

  useEffect(() => {
    const initDbAsync = async () => {
      const db = await initDb()
      const con = await db.connect()
      con.query("SET pivot_limit=1000001")
      setDb(db)
    }
    initDbAsync()
    const w = new Worker(
      //eslint-disable-next-line unicorn/relative-url-style
      new URL("./core/worker.ts", import.meta.url),
      {
        type: "module",
      }
    )
    setWorker(w)
  }, [])

  return (
    <ResizablePanelGroup direction="horizontal" className="rounded-lg border">
      <ResizablePanel
        key={1234}
        defaultSize={50}
        className="pr-4"
        style={{
          display: "flex",
          flexDirection: "column",
          paddingRight: "16px",
          paddingLeft: "16px",
        }}
      >
        <div className="h-screen overflow-y-auto">
          <div className="flex flex-col items-center justify-center w-full">
            {POSTHOG_PUBLIC_KEY && POSTHOG_URL && <Feedback />}
            {cells?.map((cell, i) => {
              if (cell.type === "upload") {
                return <Upload key={i} id={i} />
              } else if (cell.type === "filter") {
                return (
                  <FilterBlock
                    key={i}
                    db={db}
                    updateQuery={(q) => updateQuery(i, q)}
                    prevQuery={cells[i - 1].query as string}
                  />
                )
              } else if (cell.type === "pivot") {
                return (
                  <PivotTable
                    key={i}
                    db={db}
                    updateQuery={(q) => updateQuery(i, q)}
                    prevQuery={cells[i - 1].query as string}
                  />
                )
              } else if (cell.type === "userquery") {
                return (
                  <UserQuery
                    key={i}
                    db={db}
                    updateQuery={(q) => updateQuery(i, q)}
                    prevQuery={cells[i - 1].query as string}
                  />
                )
              } else if (cell.type === "table") {
                return (
                  <div className="mb-4 flex max-h-[25vh] max-w-full items-start justify-center overflow-y-scroll rounded-lg border">
                    <TableView
                      key={i}
                      db={db}
                      updateQuery={(q) => updateQuery(i, q)}
                      prevQuery={cells[i - 1].query as string}
                      rowAmount={100}
                    />
                  </div>
                )
              } else if (cell.type === "columns") {
                return <Columns key={i} id={i} />
              } else if (cell.type === "derive") {
                return (
                  <CreateColumn
                    key={i}
                    db={db}
                    updateQuery={(q) => updateQuery(i, q)}
                    prevQuery={cells[i - 1].query as string}
                  />
                )
              } else if (cell.type === "download") {
                return (
                  <Download
                    key={i}
                    db={db}
                    prevQuery={cells[i - 1].query as string}
                  />
                )
              } else if (cell.type === "sort") {
                return (
                  <Sort
                    key={i}
                    db={db}
                    updateQuery={(q) => updateQuery(i, q)}
                    prevQuery={cells[i - 1].query as string}
                  />
                )
              } else if (cell.type === "chart") {
                return (
                  <Chart
                    key={i}
                    db={db}
                    updateQuery={(q) => updateQuery(i, q)}
                    prevQuery={cells[i - 1].query as string}
                  />
                )
              } else if (cell.type === "AI") {
                return (
                  <AI
                    key={i}
                    db={db}
                    updateQuery={(q) => updateQuery(i, q)}
                    prevQuery={cells[i - 1].query as string}
                  />
                )
              } else if (cell.type === "python") {
                return (
                  <Python
                    key={i}
                    db={db}
                    updateQuery={(q) => updateQuery(i, q)}
                    prevQuery={cells[i - 1].query as string}
                    worker={worker}
                  />
                )
              }
              return null
            })}
            <div className="flex items-center flex-wrap max-w-full">
              {cells[cells.length - 1].query && (
                <>
                  <Button
                    onClick={() => addCell("filter")}
                    className="ml-2 mb-2"
                  >
                    Filter
                  </Button>
                  <Button onClick={() => addCell("AI")} className="ml-2 mb-2">
                    Ask AI
                  </Button>
                  <Button
                    onClick={() => addCell("python")}
                    className="ml-2 mb-2"
                  >
                    Python
                  </Button>
                  <Button
                    onClick={() => addCell("pivot")}
                    className="ml-2 mb-2"
                  >
                    Pivot
                  </Button>
                  <Button
                    onClick={() => addCell("userquery")}
                    className="ml-2 mb-2"
                  >
                    SQL / PRQL
                  </Button>
                  <Button
                    onClick={() => addCell("chart")}
                    className="ml-2 mb-2"
                  >
                    Chart
                  </Button>
                  <Button
                    onClick={() => addCell("derive")}
                    className="ml-2 mb-2"
                  >
                    Create column
                  </Button>
                  <Button
                    onClick={() => addCell("columns")}
                    className="ml-2 mb-2"
                  >
                    Remove columns
                  </Button>
                  <Button onClick={() => addCell("sort")} className="ml-2 mb-2">
                    Sort
                  </Button>
                  <Button
                    onClick={() => addCell("table")}
                    className="ml-2 mb-2"
                  >
                    Table
                  </Button>
                  <Button
                    onClick={() => addCell("download")}
                    className="ml-2 mb-2 bg-blue-500 hover:bg-blue-600"
                  >
                    Download
                  </Button>
                </>
              )}
              {cells.length > 1 && (
                <Button
                  onClick={deleteLastBlock}
                  className="ml-2 mb-2 bg-red-500 hover:bg-red-600"
                >
                  Delete last block
                </Button>
              )}
            </div>
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel key={456}>
        <TableView
          key="placeholder123"
          db={db}
          updateQuery={() => {}}
          prevQuery={cells[cells.length - 1].query as string}
          rowAmount={10000}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
