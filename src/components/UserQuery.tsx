import { useState } from "react"
import { mergeQueries } from "../lib/utils"
import { Button } from "./ui/button"
import { Textarea } from "./ui/textarea"
import { Label } from "./ui/label"
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group"
import { loading } from "./ui/loading"
import Block from "./ui/Block"
import { useCell } from "../store/useStore"
import CodeMirror, { minimalSetup, placeholder } from "@uiw/react-codemirror"
import { sql } from "@codemirror/lang-sql"

const dbQuery = (
  userQuery: string | null,
  usePrql: boolean,
  prevQuery: string,
  updateQuery: (q: string) => void,
  query: (q: string) => Promise<{ rowsJson: any; result: any }>,
  setIsPrqlError: (isError: boolean) => void,
  setIsSqlError: (isError: boolean) => void
) => {
  let wrappedUserQuery = ""
  if (userQuery) {
    wrappedUserQuery = usePrql ? userQuery : `SQL {${userQuery}}`
  }
  const q = mergeQueries(prevQuery, wrappedUserQuery || "")
  updateQuery(q)
  const fetch = async () => {
    let rowsJson
    rowsJson = (await query(mergeQueries(prevQuery, wrappedUserQuery || "")))
      .rowsJson
    if (rowsJson) {
      setIsPrqlError(false)
      setIsSqlError(false)
    } else {
      setIsPrqlError(true)
      setIsSqlError(true)
    }
  }
  fetch()
}

export default function UserQuery({ id }: { id: number }) {
  const { updateQuery, prevQuery, query } = useCell(id)
  const [userQuery, setUserQuery] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPrqlError, setIsPrqlError] = useState(false)
  const [isSqlError, setIsSqlError] = useState(false)
  const [usePrql, setUsePrql] = useState(false)

  const runQuery = () => {
    setIsLoading(true)
    dbQuery(
      userQuery,
      usePrql,
      prevQuery,
      updateQuery,
      query,
      setIsPrqlError,
      setIsSqlError
    )
    setIsLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      runQuery()
    }
  }

  return (
    <Block className="mb-4 w-3/4" title="User Query">
      <div className="flex flex-col gap-2 w-full">
        <div className="flex justify-end mt-[-40px]">
          <ToggleGroup
            type="single"
            defaultValue={usePrql ? "prql" : "sql"}
            onValueChange={(value) => setUsePrql(value === "prql")}
          >
            <ToggleGroupItem value="sql" aria-label="SQL">
              SQL
            </ToggleGroupItem>
            <ToggleGroupItem value="prql" aria-label="PRQL">
              PRQL
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex flex-row w-full gap-2">
          <div className="w-full border border-input bg-transparent h-[200px] overflow-hidden">
            <div className="relative">
              <CodeMirror
                minHeight="10px"
                theme="light"
                height="100%"
                className= {`w-full border h-[198px]  ${
                  isPrqlError || isSqlError
                ? "border-2 border-red-300 h-48"
                : "h-48"
                }`}                
                editable
                basicSetup={false}
                extensions={[sql(), minimalSetup({ syntaxHighlighting: true })]}
                value={userQuery || ""}
                onChange={(value) => setUserQuery(value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  usePrql
                    ? "take 100\nCmd/Ctrl + Enter to run query, Enter for new line"
                    : "SELECT * from PrevTable\nCmd/Ctrl + Enter to run query, Enter for new line"
                }
              />
            </div>
          </div>
          <div className="flex flex-col justify-end ml-[-20px]">
            <Button
              onClick={runQuery}
              disabled={isLoading}
              variant="ghost"
              className="p-0 ml-[18px] mb-[8px]"
            >
              {isLoading ? (
                loading
              ) : (
                <svg
                  className="w-6 h-6 text-gray-800 dark:text-white"
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.6 5.2A1 1 0 0 0 7 6v12a1 1 0 0 0 1.6.8l8-6a1 1 0 0 0 0-1.6l-8-6Z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Block>
  )
}
