import Block from "./ui/Block"
import { useState, useEffect } from "react"
import { AsyncDuckDB } from "../lib/duckdb"
import { query, mergeQueries, getFieldsQueryBuilder } from "../lib/utils"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { loading } from "./ui/loading"
import { Textarea } from "./ui/textarea"
import { Label } from "./ui/label"
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group"
import { AI_ENDPOINT } from "../lib/config"

const SettingsIcon = ({ className }: { className: string }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 15 15"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M7.07095 0.650238C6.67391 0.650238 6.32977 0.925096 6.24198 1.31231L6.0039 2.36247C5.6249 2.47269 5.26335 2.62363 4.92436 2.81013L4.01335 2.23585C3.67748 2.02413 3.23978 2.07312 2.95903 2.35386L2.35294 2.95996C2.0722 3.2407 2.0232 3.6784 2.23493 4.01427L2.80942 4.92561C2.62307 5.2645 2.47227 5.62594 2.36216 6.00481L1.31209 6.24287C0.924883 6.33065 0.650024 6.6748 0.650024 7.07183V7.92897C0.650024 8.32601 0.924883 8.67015 1.31209 8.75794L2.36228 8.99603C2.47246 9.375 2.62335 9.73652 2.80979 10.0755L2.2354 10.9867C2.02367 11.3225 2.07267 11.7602 2.35341 12.041L2.95951 12.6471C3.24025 12.9278 3.67795 12.9768 4.01382 12.7651L4.92506 12.1907C5.26384 12.377 5.62516 12.5278 6.0039 12.6379L6.24198 13.6881C6.32977 14.0753 6.67391 14.3502 7.07095 14.3502H7.92809C8.32512 14.3502 8.66927 14.0753 8.75705 13.6881L8.99505 12.6383C9.37411 12.5282 9.73573 12.3773 10.0748 12.1909L10.986 12.7653C11.3218 12.977 11.7595 12.928 12.0403 12.6473L12.6464 12.0412C12.9271 11.7604 12.9761 11.3227 12.7644 10.9869L12.1902 10.076C12.3768 9.73688 12.5278 9.37515 12.638 8.99596L13.6879 8.75794C14.0751 8.67015 14.35 8.32601 14.35 7.92897V7.07183C14.35 6.6748 14.0751 6.33065 13.6879 6.24287L12.6381 6.00488C12.528 5.62578 12.3771 5.26414 12.1906 4.92507L12.7648 4.01407C12.9766 3.6782 12.9276 3.2405 12.6468 2.95975L12.0407 2.35366C11.76 2.07292 11.3223 2.02392 10.9864 2.23565L10.0755 2.80989C9.73622 2.62328 9.37437 2.47229 8.99505 2.36209L8.75705 1.31231C8.66927 0.925096 8.32512 0.650238 7.92809 0.650238H7.07095ZM4.92053 3.81251C5.44724 3.44339 6.05665 3.18424 6.71543 3.06839L7.07095 1.50024H7.92809L8.28355 3.06816C8.94267 3.18387 9.5524 3.44302 10.0794 3.81224L11.4397 2.9547L12.0458 3.56079L11.1882 4.92117C11.5573 5.44798 11.8164 6.0575 11.9321 6.71638L13.5 7.07183V7.92897L11.932 8.28444C11.8162 8.94342 11.557 9.55301 11.1878 10.0798L12.0453 11.4402L11.4392 12.0462L10.0787 11.1886C9.55192 11.5576 8.94241 11.8166 8.28355 11.9323L7.92809 13.5002H7.07095L6.71543 11.932C6.0569 11.8162 5.44772 11.5572 4.92116 11.1883L3.56055 12.046L2.95445 11.4399L3.81213 10.0794C3.4431 9.55266 3.18403 8.94326 3.06825 8.2845L1.50002 7.92897V7.07183L3.06818 6.71632C3.18388 6.05765 3.44283 5.44833 3.81171 4.92165L2.95398 3.561L3.56008 2.95491L4.92053 3.81251ZM9.02496 7.50008C9.02496 8.34226 8.34223 9.02499 7.50005 9.02499C6.65786 9.02499 5.97513 8.34226 5.97513 7.50008C5.97513 6.65789 6.65786 5.97516 7.50005 5.97516C8.34223 5.97516 9.02496 6.65789 9.02496 7.50008ZM9.92496 7.50008C9.92496 8.83932 8.83929 9.92499 7.50005 9.92499C6.1608 9.92499 5.07513 8.83932 5.07513 7.50008C5.07513 6.16084 6.1608 5.07516 7.50005 5.07516C8.83929 5.07516 9.92496 6.16084 9.92496 7.50008Z"
      fill="currentColor"
      fill-rule="evenodd"
      clip-rule="evenodd"
    ></path>
  </svg>
)
export default function AI({
  db,
  updateQuery,
  prevQuery,
}: {
  db: AsyncDuckDB | null
  updateQuery: (q: string) => void
  prevQuery: string
}) {
  const [fields, setFields] = useState<string[] | null>(null)
  const [aiQuery, setAiQuery] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [instruction, setInstruction] = useState("")
  const [isEdit, setIsEdit] = useState(false)
  const [isPrqlError, setIsPrqlError] = useState(false)
  const [isApiKeyChecked, setIsApiKeyChecked] = useState(false)
  const [isServerChecked, setIsServerChecked] = useState(false)

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
    let gen
    try {
      if (isApiKeyChecked) {
        const content = `
PRQL is a SQL pre-processor. The languages flows from top to bottom and is made up of
statements like "select", "filter", "group", "window", "derive", "sort", "take"
Each statement modifies the result of the previous statement. At the end, the PRQL is
processed to SQL and run in an SQL database. The column names in PRQL are surrounded back
backticks

Here are some PRQL snippets as examples. Focus on them to improve your understanding of PRQL
---
Selecting columns:
select {\`column_1\`, \`column_2\`}
select {\`column_1\`, \`col2\` = \`column_2\`} # renaming support

Filtering:
filter \`column_1\` > 10
filter \`column_2\` == "Agriculture"
filter \`column_3\` != null # checking for null values
filter (\`column_1\` | text.contains "university") # piping syntax for function calling
filter (\`column_1\` | text.starts_with "uni")
filter (\`column_1\` | text.lower | text.starts_with "uni")
filter (\`column_1\` | text.ends_with "ity") && (\`column_2\` | text.contains "Agri")

Creating new columns:
derive { \`column_2\` = 2 * \`column1\`}
derive {\`column2\` = (\`column1\` | text.extract 1 3 )} # takes first 3 letters of column1
derive {\`name\` = f"{c.last_name}, {c.first_name}" # F-strings like Python
derive \`distance\` = case [
  \`city\` == "Calgary" => 0,
  \`city\` == "Edmonton" => 300,
  true => "Unknown", # if this line is removed, we get NULL values when no case matches occur
]

Sorting:
sort {\`column_1\`}
sort {\`column_1\`, -\`column_2\`, +\`column_3\`} # "sort" sorts the result; "-" is decreasing order


Taking a few rows from the result:
take 1..10 # takes first 10 rows

Group by (these are multi-line):
group {\`customer_id\`, \`month\`} (
  aggregate {
    sum_income = sum \`income\`,
    ct = count \`total\`
  }
)

group {\`col1\`} (
  aggregate {
    sum_col2 = sum \`col2\`
  }
)

Window functions (multi line):
group {\`employee_id\`} (
  sort {\`month\`}
  window {rolling:12 (
    derive {\`trail_12_m_comp\` = sum \`paycheck\`}
  )
)

window rows:-3..3 (
  derive {\`centered_weekly_average\` = average \`value\`}
)

Standard library of functions:

Window functions:
lag =   offset <int>    column <array> -> internal std.lag
lead =  offset <int>    column <array> -> internal std.lead
first
last
rank
rank_dense
row_number

# Mathematical functions
module math {
    abs
    floor
    ceil
    pi
    exp
    ln
    log10
    log
    sqrt
    degrees
    radians
    cos
    acos
    sin
    asin
    tan
    atan
    pow
    round
}
## Text functions
module text {
  lower
  upper
  ltrim
  rtrim
  trim
  length
  # multiple arguments
  extract = offset<int> length<int> column -> <text> internal std.text.extract
  replace = pattern<text> replacement<text> column -> <text> internal std.text.replace
  starts_with = prefix<text> column -> <bool> internal std.text.starts_with
  contains = substr<text> column -> <bool> internal std.text.contains
  ends_with = suffix<text> column -> <bool> internal std.text.ends_with
}

----
We have a table with the following columns ${fields?.join(", ")}
Now, write good, working PRQL code to get the following information: ${instruction}

NOTE:
- Column names should ALWAYS be in backticks
- Filters should ALWAYS be in parenthesis
- ONLY RETURN the require PRQL snippet, no more
- Return ONLY valid PRQL code - NO 3 backticks, NO code formatting.

To emphasize, it is imperative you ONLY RETURN VALID PRQL.
`
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
              fields: fields?.join(", "),
            }),
          })
          const { message } = await response.json()
          gen = message
        }
      }
      setAiQuery(gen.replace("select *", ""))
    } catch (error) {
      alert("Error in calling AI function. Please check if API key is correct.")
    }
    setIsLoading(false)
  }

  useEffect(() => {
    if (db) {
      const q = mergeQueries(prevQuery, aiQuery || "")
      updateQuery(q)
      const fetch = async () => {
        let rowsJson
        rowsJson = (
          await query(db, mergeQueries(prevQuery, getFieldsQueryBuilder()))
        ).rowsJson
        if (rowsJson?.[0]) {
          const fieldsArray = Object.keys(rowsJson[0])
          setFields(fieldsArray)
        }
      }
      fetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, prevQuery])

  useEffect(() => {
    if (db && !isEdit) {
      const q = mergeQueries(prevQuery, aiQuery || "")
      updateQuery(q)
      const fetch = async () => {
        let rowsJson
        rowsJson = (await query(db, mergeQueries(prevQuery, aiQuery || "")))
          .rowsJson
        if (rowsJson) {
          setIsPrqlError(false)
        } else {
          setIsPrqlError(true)
        }
      }
      fetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, aiQuery, isEdit])

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
          <div className="flex">
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
          {aiQuery !== null && (
            <>
              <Label>Generated PRQL:</Label>
              <div className="flex items-center">
                <div className="flex flex-col w-full">
                  <Textarea
                    className={isPrqlError ? "border-2 border-red-300" : ""}
                    readOnly={!isEdit}
                    value={aiQuery}
                    onChange={(e) => isEdit && setAiQuery(e.target.value)}
                  />
                  {isPrqlError && (
                    <Label className="text-red-300">Invalid PRQL</Label>
                  )}
                </div>
                <Button
                  className="w-min h-10"
                  onClick={() => {
                    setIsEdit(!isEdit)
                  }}
                >
                  {isEdit ? "Save" : "Edit"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Block>
  )
}
