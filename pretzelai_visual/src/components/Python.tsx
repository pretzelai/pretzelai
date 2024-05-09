import { useEffect, useState } from "react"
import { Button } from "./ui/button"
import { loading } from "./ui/loading"
import Block from "./ui/Block"
import CodeMirror, { minimalSetup } from "@uiw/react-codemirror"
import { python } from "@codemirror/lang-python"
import { v4 as uuid } from "uuid"
import { useCell, useStore } from "../store/useStore"
import { AI_ENDPOINT } from "../lib/config"
import { PythonPromptFormatter } from "../lib/prompts"
import { Input } from "./ui/input"
import { SettingsIcon } from "./ui/settings-icon"
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group"

export default function userPython({ id }: { id: number }) {
  const { db, worker } = useStore()
  const { query, prevQuery, updateQuery } = useCell(id)
  const [isDataframeLoading, setIsDataframeLoading] = useState(false)
  const [isAiGeneraring, setIsAiGeneraring] = useState(false)
  const [result, setResult] = useState("")
  const [code, setCode] = useState(
    "# Data loaded in df, save in df_output to export. Example:\n# df_output = df.head()\ndf.describe()"
  )
  const [isDfLoaded, setIsDfLoaded] = useState(false)
  const [queue, setQueue] = useState("")
  const [table, setTable] = useState("")
  const [executedAt, setExecutedAt] = useState("")
  const [isExporting, setIsExporting] = useState(false)
  const [htmlString, setHtmlString] = useState("")
  const [isApiKeyChecked, setIsApiKeyChecked] = useState(false)
  const [isServerChecked, setIsServerChecked] = useState(false)
  const [fields, setFields] = useState<string[] | null>(null)
  const [aiQuery, setAiQuery] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [instruction, setInstruction] = useState("")

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
    setIsAiGeneraring(true)
    let gen
    try {
      if (isApiKeyChecked) {
        const content = PythonPromptFormatter(fields, instruction)
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
              language: "python",
            }),
          })
          const { message } = await response.json()
          gen = message
        }
      }
      gen = gen.replace("```python", "")
      gen = gen.replace("```", "")
      setAiQuery(gen)
      runQuery(gen)
    } catch (error) {
      alert("Error in calling AI function. Please check if API key is correct.")
    }
    setIsAiGeneraring(false)
  }

  useEffect(() => {
    if (aiQuery) {
      setCode(aiQuery)
    }
  }, [aiQuery])

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
        const { rowsJson, result } = await query(prevQuery)
        setFields(Object.keys(rowsJson[0]))
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
      if (event.data === "ready") {
        fetchData()
      } else if (event.data === "df_loaded") {
        setIsDfLoaded(true)
      } else if (event.data.startsWith("export")) {
        const data = event.data.substring(6)
        exportData(data)
      } else if (event.data.includes("html")) {
        setHtmlString(event.data)
        setIsDataframeLoading(false)
        return
      } else {
        setResult(event.data)
        setIsDataframeLoading(false)
        setExecutedAt(
          `Cell executed at ${new Date().toLocaleTimeString()} without output`
        )
        return
      }
      setResult("")
      setHtmlString("")
    }
    fetchData()
  }, [worker])

  useEffect(() => {
    if (isDfLoaded && queue) {
      worker.postMessage(queue)
      setQueue("")
    }
  }, [isDfLoaded])

  const runQuery = (c: string) => {
    setIsDataframeLoading(true)
    if (!isDfLoaded) {
      setQueue(c)
    } else {
      worker.postMessage(c)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      runQuery(code)
    }
  }

  return (
    <Block className="mb-4 w-full" title="Python">
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
          <div className="flex gap-2 mb-2">
            <Input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") ai(instruction)
              }}
              placeholder="(optional) E.g. chart of top 5, export 100 random"
            />
            <Button onClick={() => ai(instruction)} disabled={isAiGeneraring}>
              {isAiGeneraring ? loading : "Generate with AI"}
            </Button>
          </div>
        </div>
      )}
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
          onClick={() => runQuery(code)}
          className="w-min"
        >{`Run (Cmd + Enter)`}</Button>
        {isDataframeLoading || isExporting ? (
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
        {htmlString && (
          <div>
            <iframe srcDoc={htmlString} width="100%" height="500px" />
          </div>
        )}
      </div>
    </Block>
  )
}
