import { useEffect, useState } from "react"
import { AsyncDuckDB } from "../lib/duckdb"
import { query } from "../lib/utils"
import { Button } from "./ui/button"
import { loading } from "./ui/loading"
import Block from "./ui/Block"
import CodeMirror, { minimalSetup } from "@uiw/react-codemirror"
import { python } from "@codemirror/lang-python"
import { v4 as uuid } from "uuid"

export default function userPython({
  db,
  updateQuery,
  prevQuery,
  worker,
}: {
  db: AsyncDuckDB | null
  updateQuery: (q: string) => void
  prevQuery: string
  worker: any
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState("")
  const [code, setCode] = useState(
    "# Data loaded in df, save in df_output to export. Example:\n# df_output = df.head()\ndf.describe()"
  )
  const [isDfLoaded, setIsDfLoaded] = useState(false)
  const [queue, setQueue] = useState("")
  const [table, setTable] = useState("")
  const [executedAt, setExecutedAt] = useState("")
  const [isExporting, setIsExporting] = useState(false)

  const exportData = async (data: any) => {
    if (db) {
      setIsExporting(true)
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
      updateQuery(`from \`${t}\` #${Date.now()}`)
      setIsExporting(false)
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { rowsJson, result } = await query(db, prevQuery)
        worker.postMessage(`df = pd.DataFrame(${JSON.stringify(
          rowsJson,
          (key, value) => (typeof value === "bigint" ? value.toString() : value)
        )
          .replace(/null/g, "None")
          .replace(/false/g, "False")
          .replace(/true/g, "True")})
'df_loaded'`) // output string 'df_loaded'
      } catch (error) {
        console.error("Error in useEffect:", error)
      }
    }

    worker.onmessage = (event: any) => {
      console.log(event.data)
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
        setExecutedAt(
          `Cell executed at ${new Date().toLocaleTimeString()} without output`
        )
      }
    }
    fetchData()
  }, [worker])

  useEffect(() => {
    if (isDfLoaded && queue) {
      worker.postMessage(queue)
      setQueue("")
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
      runQuery()
    }
  }

  return (
    <Block className="mb-4 w-full" title="Python">
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
        <Button
          onClick={runQuery}
          className="w-min"
        >{`Run (Cmd + Enter)`}</Button>
        {isLoading || isExporting ? (
          <div className="flex">
            {loading}
            {isExporting ? "Exporting data" : "Loading in pandas dataframe"}
          </div>
        ) : result.startsWith("Error: ") ? (
          <div className="text-red-500">{result}</div>
        ) : result ? (
          <CodeMirror
            minHeight="10px"
            theme={"light"}
            height="100%"
            className="w-full border h-[200px]"
            editable={false}
            basicSetup={false}
            value={result}
          />
        ) : (
          <div className="text-gray-500">{executedAt}</div>
        )}
      </div>
    </Block>
  )
}
