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
import { cn } from "../lib/utils"

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
  const [isError, setIsError] = useState(false)
  const [result, setResult] = useState("")
  const [code, setCode] = useState("# Your python code goes here\n")

  const runQuery = () => {
    setIsLoading(true)
    if (pyodide && code) {
      try {
        pyodide
          .runPythonAsync(code)
          .then((result) => {
            setResult(result)
            setIsError(false)
          })
          .catch((error) => {
            setResult(`Error: ${error.type}`)
            setIsError(true)
          })
      } catch (error) {
        console.error("Unexpected error:", error)
        setResult("Unexpected error executing Python code.")
        setIsError(true)
      }
    } else {
      setResult("No Pyodide instance or Python code provided.")
      setIsError(true)
    }
    setIsLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      setCode((c) => c.slice(0, -1))
      runQuery()
    }
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
        ) : (
          <div
            className={cn(
              isError ? "text-red-500" : "",
              result && "border border-gray-500 rounded p-2",
              "bg-gray-100"
            )}
          >
            {result}
          </div>
        )}
      </div>
    </Block>
  )
}
