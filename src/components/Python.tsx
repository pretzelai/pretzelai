import { useEffect, useState } from "react"
import { AsyncDuckDB } from "../lib/duckdb"
import { query, mergeQueries } from "../lib/utils"
import { Button } from "./ui/button"
import { Textarea } from "./ui/textarea"
import { Label } from "./ui/label"
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group"
import { loading } from "./ui/loading"
import Block from "./ui/Block"
import { PyodideInterface } from "pyodide"
import CodeMirror, { minimalSetup } from "@uiw/react-codemirror"
import { python } from "@codemirror/lang-python"
import { cn } from "../lib/utils"
import { v4 as uuid } from "uuid"

export default function userPython({
  db,
  updateQuery,
  prevQuery,
}: {
  db: AsyncDuckDB | null
  updateQuery: (q: string) => void
  prevQuery: string
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [isError, setIsError] = useState(false)
  const [result, setResult] = useState("")
  const [code, setCode] = useState("# Your Python, save in df_output to export")
  const [worker, setWorker] = useState<any>(null)
  const [isDfLoaded, setIsDfLoaded] = useState(false)
  const [queue, setQueue] = useState("")
  const [table, setTable] = useState("")

  const exportData = async (data: any) => {
    if (db) {
      const c = await db.connect()
      let t = table
      if (t) {
        await c.query(`DROP TABLE "${t}"`)
      } else {
        t = uuid()
        setTable(t)
      }
      await db.registerFileText(t, data)
      await c.insertCSVFromPath(t, {
        schema: "main",
        name: t,
        detect: true,
        header: true,
      })
      await c.close()
      updateQuery(`from \`${t}\``)
    }
  }

  useEffect(() => {
    const w = new Worker(
      // eslint-disable-next-line unicorn/relative-url-style
      new URL("../lib/worker.ts", import.meta.url),
      {
        type: "module",
      }
    )
    setWorker(w)
    const fetchData = async () => {
      try {
        const { rowsJson, result } = await query(db, prevQuery)
        w.postMessage(`import json
import pandas as pd
df = pd.DataFrame(${JSON.stringify(rowsJson).replace(/null/g, "None")})
'df_loaded'`)
      } catch (error) {
        console.error("Error in useEffect:", error)
      }
    }
    w.onmessage = (event) => {
      if (event.data === "ready") {
        fetchData()
      } else if (event.data === "df_loaded") {
        setIsDfLoaded(true)
      } else if (event.data.startsWith("export")) {
        const data = event.data.substring(6)
        exportData(data)
      } else {
        setResult(event.data)
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (isDfLoaded && queue) {
      setQueue("")
      worker.postMessage(queue)
    }
  }, [isDfLoaded])

  const runQuery = () => {
    setIsLoading(true)
    if (!isDfLoaded) {
      setQueue(code)
    } else {
      worker.postMessage(code)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      setCode((c) => c.slice(0, -1))
      runQuery()
    }
  }

  const handleExport = () => {
    worker.postMessage("export")
  }

  return (
    <Block className="mb-4 w-3/4" title="Python">
      <div className="flex flex-col gap-2 w-full">
        <CodeMirror
          minHeight="10px"
          theme={"light"}
          height="100%"
          className="w-full border h-[200px]"
          editable
          basicSetup={false}
          extensions={[
            python(),
            minimalSetup({
              syntaxHighlighting: true,
            }),
          ]}
          value={code}
          onChange={setCode}
          onKeyDown={handleKeyDown}
        />
        {isLoading ? (
          loading
        ) : isError ? (
          <div className="text-red-500">{String(result)}</div>
        ) : (
          <CodeMirror
            minHeight="10px"
            theme={"light"}
            height="100%"
            className="w-full border h-[200px]"
            editable={false}
            basicSetup={false}
            value={String(result)}
          />
        )}
      </div>
      <Button onClick={handleExport}>Export</Button>
    </Block>
  )
}
