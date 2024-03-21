import { useState } from "react"
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

export default function userPython({
  db,
  updateQuery,
  prevQuery,
  pyodide,
}: {
  db: AsyncDuckDB | null
  updateQuery: (q: string) => void
  prevQuery: string
  pyodide?: PyodideInterface
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [isPrqlError, setIsPrqlError] = useState(false)
  const [isSqlError, setIsSqlError] = useState(false)
  const [usePrql, setUsePrql] = useState(false)
  const [result, setResult] = useState("waiting")
  const [code, setCode] = useState("# Your python code goes here")

  const runQuery = () => {
    setIsLoading(true)
    if (pyodide && code) {
      try {
        pyodide
          .runPythonAsync(code)
          .then((result) => {
            setResult(result)
            setIsPrqlError(false)
            setIsSqlError(false)
          })
          .catch((error) => {
            console.error("Python execution error:", error)
            setResult("Error executing Python code.")
            setIsPrqlError(true) // Assuming Python errors are treated as PRQL errors for UI purposes
          })
      } catch (error) {
        console.error("Unexpected error:", error)
        setResult("Unexpected error executing Python code.")
        setIsPrqlError(true) // Assuming Python errors are treated as PRQL errors for UI purposes
      }
    } else {
      setResult("No Pyodide instance or Python code provided.")
      setIsPrqlError(true) // Assuming missing Pyodide or Python code is treated as a PRQL error for UI purposes
    }
    setIsLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      runQuery()
    }
  }

  return (
    <Block className="mb-4 w-3/4" title="Python">
      <div className="flex flex-col gap-2 w-full">
        <div className="flex flex-row w-full gap-2">
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
                // Other options are false
                highlightSpecialChars: false,
                history: false,
                drawSelection: false,
                defaultKeymap: false,
                historyKeymap: false,
              }),
            ]}
            value={code}
            onChange={setCode}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                runQuery()
              }
            }}
          />
          {result}
        </div>
      </div>
    </Block>
  )
}
