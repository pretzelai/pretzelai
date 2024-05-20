import Block from "./ui/Block"
import { useState, useEffect } from "react"
import { mergeQueries, getFieldsQueryBuilder, debounce } from "../lib/utils"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { loading } from "./ui/loading"
import { Textarea } from "./ui/textarea"
import { Label } from "./ui/label"
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group"
import { AI_ENDPOINT } from "../lib/config"
import { PRQLPromptFormatter, SQLPromptFormatter } from "../lib/prompts"
import { SettingsIcon } from "./ui/settings-icon"
import { useCell } from "../store/useStore"

const aiDbQuery = (
  aiQuery: string | null,
  usePrql: boolean,
  prevQuery: string,
  updateQuery: (q: string) => void,
  query: (q: string) => Promise<{ rowsJson: any }>,
  setIsPrqlError: (isError: boolean) => void,
  setIsSqlError: (isError: boolean) => void
) => {
  let wrappedAiQuery = ""
  if (aiQuery) {
    wrappedAiQuery = usePrql ? aiQuery : `SQL {${aiQuery}}`
  }
  const q = mergeQueries(prevQuery, wrappedAiQuery || "")
  updateQuery(q)
  const fetch = async () => {
    let rowsJson
    rowsJson = (await query(mergeQueries(prevQuery, wrappedAiQuery || "")))
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

const debouncedAiDbQuery = debounce(aiDbQuery, 1000)

export default function AI({ id }: { id: number }) {
  const { query, prevQuery, updateQuery } = useCell(id)
  const [fields, setFields] = useState<string[] | null>(null)
  const [aiQuery, setAiQuery] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [instruction, setInstruction] = useState("")
  const [isEdit, setIsEdit] = useState(false)
  const [isPrqlError, setIsPrqlError] = useState(false)
  const [isSqlError, setIsSqlError] = useState(false)
  const [isApiKeyChecked, setIsApiKeyChecked] = useState(false)
  const [isServerChecked, setIsServerChecked] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [usePrql, setUsePrql] = useState(false)

  useEffect(() => {
    const apiKey = localStorage.getItem("apiKey")
    setApiKey(apiKey || "")
    const isApiKey = !!localStorage.getItem("isApiKey")
    const isServer = !!localStorage.getItem("isServer") && AI_ENDPOINT
    if ((!isApiKey && !isServer) || (isApiKey && !apiKey)) {
      setIsSettingsOpen(true)
    } else {
      setIsSettingsOpen(false)
    }
    if (!AI_ENDPOINT || (isApiKey && !isServer)) {
      setIsApiKeyChecked(true)
    } else {
      setIsServerChecked(true)
    }
  }, [])

  const ai = async (instruction: string) => {
    if (instruction.length === 0) return
    setIsLoading(true)
    setIsEdit(false)
    let gen
    try {
      if (isApiKeyChecked) {
        let content
        if (usePrql) {
          content = PRQLPromptFormatter(fields, instruction)
        } else {
          content = SQLPromptFormatter(fields, instruction)
        }
        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4-turbo-preview",
              messages: [{ role: "user", content }],
            }),
          }
        )
        const data = await response.json()
        gen = data.choices[0].message.content
      } else {
        if (AI_ENDPOINT) {
          const response = await fetch(AI_ENDPOINT, {
            method: "POST",
            body: JSON.stringify({
              instruction,
              fields,
              language: usePrql ? "PRQL" : "SQL",
            }),
          })
          const { message } = await response.json()
          gen = message
        }
      }
      if (usePrql) {
        setAiQuery(gen.replace("select *", ""))
      } else {
        // regex to replace out ```sql and ``` at the start and end of string
        gen = gen
          .replace(/```sql\n/g, "")
          .replace(/```/g, "")
          .replace(";", "")
        setAiQuery(gen)
      }
    } catch (error) {
      alert("Error in calling AI function. Please check if API key is correct.")
    }
    setIsLoading(false)
  }

  useEffect(() => {
    let wrappedAiQuery = ""
    if (aiQuery) {
      wrappedAiQuery = usePrql ? aiQuery : `SQL {${aiQuery}}`
    }
    const q = mergeQueries(prevQuery, wrappedAiQuery || "")

    updateQuery(q)
    const fetch = async () => {
      let rowsJson
      rowsJson = (await query(mergeQueries(prevQuery, getFieldsQueryBuilder())))
        .rowsJson
      if (rowsJson?.[0]) {
        const fieldsArray = Object.keys(rowsJson[0])
        setFields(fieldsArray)
      }
    }
    fetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevQuery])

  useEffect(() => {
    if (isEdit) {
      debouncedAiDbQuery(
        aiQuery,
        usePrql,
        prevQuery,
        updateQuery,
        query,
        setIsPrqlError,
        setIsSqlError
      )
    } else {
      aiDbQuery(
        aiQuery,
        usePrql,
        prevQuery,
        updateQuery,
        query,
        setIsPrqlError,
        setIsSqlError
      )
    }
  }, [aiQuery])

  return (
    <Block className="mb-4 w-3/4" title="AI Query">
      {isSettingsOpen ? (
        <div>
          <div className="w-full flex flex-col">
            <div className="flex items-center space-x-2 mb-4">
              {AI_ENDPOINT && (
                <ToggleGroup
                  className="w-full"
                  type="single"
                  defaultValue={isApiKeyChecked ? "api_key" : "server"}
                  onValueChange={(value) => {
                    if (value === "server") {
                      setIsServerChecked(true)
                      setIsApiKeyChecked(false)
                    } else if (value === "api_key") {
                      setIsServerChecked(false)
                      setIsApiKeyChecked(true)
                    }
                  }}
                >
                  <ToggleGroupItem
                    className="w-1/2"
                    value="server"
                    aria-label="Use our AI Server"
                  >
                    <div>Use our AI Server</div>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    className="w-1/2"
                    value="api_key"
                    aria-label="Use your API Key (local & secure)"
                  >
                    <div>Use your API Key (local & secure)</div>
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
            </div>
            {isApiKeyChecked && (
              <div className="flex mb-2">
                <Input
                  type="text"
                  value={apiKey || ""}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="OpenAI API key"
                />
              </div>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              localStorage.setItem("apiKey", apiKey || "")
              localStorage.setItem("isApiKey", isApiKeyChecked ? "true" : "")
              localStorage.setItem("isServer", isServerChecked ? "true" : "")
              setIsSettingsOpen(false)
            }}
          >
            Save
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 w-full">
          <div className="flex justify-end">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="text-gray-500 hover:text-gray-700 focus:outline-none"
            >
              <SettingsIcon className="w-6 h-6 mt-[-33px] mb-[10px] pr-[5px]" />
            </button>
          </div>
          <div className="flex gap-2">
            <Input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") ai(instruction)
              }}
              placeholder="Instruction"
            />
            <Button onClick={() => ai(instruction)} disabled={isLoading}>
              {isLoading ? loading : "Run"}
            </Button>
          </div>
          {aiQuery !== null &&
            (usePrql ? (
              <>
                <Label>Generated PRQL:</Label>
                <div className="flex items-center">
                  <div className="flex flex-col w-full">
                    <Textarea
                      className={isPrqlError ? "border-2 border-red-300" : ""}
                      value={aiQuery}
                      onChange={(e) => {
                        setIsEdit(true)
                        setAiQuery(e.target.value)
                      }}
                    />
                    {isPrqlError && (
                      <Label className="text-red-300">Invalid PRQL</Label>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <Label>Generated SQL:</Label>
                <div className="flex items-center">
                  <div className="flex flex-col w-full">
                    <Textarea
                      className={isSqlError ? "border-2 border-red-300" : ""}
                      value={aiQuery}
                      onChange={(e) => {
                        setIsEdit(true)
                        setAiQuery(e.target.value)
                      }}
                    />
                    {isSqlError && (
                      <Label className="text-red-300">
                        Invalid SQL, please edit manually
                      </Label>
                    )}
                  </div>
                </div>
              </>
            ))}
        </div>
      )}
    </Block>
  )
}
