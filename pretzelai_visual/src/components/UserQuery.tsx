import { useRef, useState } from "react"
import { mergeQueries } from "../lib/utils"
import { Button } from "./ui/button"
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group"
import { loading } from "./ui/loading"
import Block from "./ui/Block"
import { useCell } from "../store/useStore"
import Editor,{loader} from "@monaco-editor/react"
import * as monacos from "monaco-editor"
import { Label } from "@radix-ui/react-label"
import { customTheme ,config, prqlLang} from "./Editors"

loader.init().then((monaco) => {
  monaco.editor.defineTheme("customTheme", customTheme)
  monaco.languages.register({ id: "prql" })
  //@ts-ignore
  monaco.languages.setLanguageConfiguration("prql", config)
  //@ts-ignore
  monaco.languages.setMonarchTokensProvider("prql", prqlLang)
})

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
      setIsPrqlError(usePrql)
      setIsSqlError(!usePrql)
    }
  }
  fetch()
}

// Default values for SQL and PRQL inputs
const defaultSqlInput =
  "SELECT * FROM PrevTable -- Cmd/Ctrl + Enter to run query, Enter for new line"
const defaultPrqlInput = "take 100 # Cmd/Ctrl + Enter to run query, Enter for new line"

export default function UserQuery({ id }: { id: number }) {
  const { updateQuery, prevQuery, query } = useCell(id)
  const [userQuery, setUserQuery] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [isPrqlError, setIsPrqlError] = useState(false)
  const [isSqlError, setIsSqlError] = useState(false)
  const [usePrql, setUsePrql] = useState(false)
  const [ctrlPressed, setCtrlPressed] = useState(false) // Track whether Ctrl key is pressed

  // Separate states for SQL and PRQL user inputs with default values
  const [sqlUserInput, setSqlUserInput] = useState(defaultSqlInput)
  const [prqlUserInput, setPrqlUserInput] = useState(defaultPrqlInput)

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

  const editorRef = useRef<monacos.editor.IStandaloneCodeEditor | null>(null)

  function handleEditorDidMount(editor: monacos.editor.IStandaloneCodeEditor) {
    editorRef.current = editor
  }

  editorRef?.current?.onKeyDown((e: monacos.IKeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.code === "Enter") {
      setCtrlPressed(true) // Set Ctrl key as pressed
    }
  })

  //@ts-ignore
  function handleEditorChange(value) {
    setUserQuery(value)
    // Update respective user input based on mode
    if (usePrql) {
      setPrqlUserInput(value)
    } else {
      setSqlUserInput(value)
    }

    if (ctrlPressed) {
      runQuery() // Trigger runQuery only if Ctrl key is pressed
      setCtrlPressed(false)
      setIsLoading(false) // Reset Ctrl key state after running the query
    }
  }

  return (
    <Block className="mb-4 w-3/4" title="User Query">
      <div className="flex flex-col gap-2 w-full">
        <div className="flex justify-end mt-[-40px]">
          <ToggleGroup
            type="single"
            defaultValue={usePrql ? "prql" : "sql"}
            onValueChange={(value) => {
              setUsePrql(value === "prql")
              // Update user input based on mode
              if (value === "prql") {
                setUserQuery(prqlUserInput)
              } else {
                setUserQuery(sqlUserInput)
              }
            }}
          >
            <ToggleGroupItem value="sql" aria-label="SQL">
              SQL
            </ToggleGroupItem>
            <ToggleGroupItem value="prql" aria-label="PRQL">
              PRQL
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex flex-row w-full h-56 gap-2 relative ">
          <Editor
            className={`absolute border-2 ${
              isPrqlError || isSqlError ? "border-2 border-red-300 h-48 " : "h-48"
            }`}
            options={{
              wordWrap: "on",
              autoIndent: "full",
              lineNumbersMinChars: 2,
              lineDecorationsWidth:"2px",
              autoDetectHighContrast: false,
              autoClosingBrackets: "always",
              autoClosingQuotes: "always",
              autoClosingOvertype: "always",
              selectOnLineNumbers: true,
              minimap: { enabled: false },
              fontSize: 14,
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              scrollbar: {
                  vertical: "auto",
                      verticalHasArrows: false,
                      verticalScrollbarSize: 10,
              },
              overviewRulerBorder: false,
            }}
            language={usePrql ? "prql" : "sql"}
            theme="customTheme"
            onChange={handleEditorChange}
            value={usePrql ? prqlUserInput : sqlUserInput}
            onMount={handleEditorDidMount}
          />

          {isPrqlError && usePrql && (
            <Label className="text-red-300">Invalid PRQL</Label>
          )}
          {isSqlError && !usePrql && (
            <Label className="text-red-300">Invalid SQL</Label>
          )}
          <div className="flex flex-col justify-end pt-60 ">
            <Button
              onClick={runQuery}
              disabled={isLoading}
              variant="ghost"
              className="p-0 ml-[-50px] mr-[18px] mb-[8px] border-2 border-slate-300"
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
