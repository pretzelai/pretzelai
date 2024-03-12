import React, { useState, useEffect, useRef } from "react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { AsyncDuckDB } from "../lib/duckdb"
import { getFieldsQueryBuilder, mergeQueries, query } from "../lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip"

interface CreateColumnProps {
  db: AsyncDuckDB | null
  prevQuery: string
  updateQuery: (q: string) => void
}

const QuestionMarkCircleIcon = () => {
  return (
    <svg
      className="w-3 h-3 ml-1 text-gray-800 dark:text-white"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9.5 10a2.5 2.5 0 1 1 5 .2 2.4 2.4 0 0 1-2.5 2.4V14m0 3h0m9-5a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  )
}

const CreateColumn: React.FC<CreateColumnProps> = ({
  db,
  prevQuery,
  updateQuery,
}) => {
  const [columns, setColumns] = useState<string[]>([])
  const [newColumnName, setNewColumnName] = useState("")
  const [formula, setFormula] = useState("")
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  // const [validFormula, setValidFormula] = useState(true)
  const [filteredColumns, setFilteredColumns] = useState<string[]>([])
  const [isNewColAdded, setIsNewColAdded] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const fetchAndSetColumns = async () => {
      if (db) {
        try {
          handleCreateColumn()
          const { result } = await query(
            db,
            mergeQueries(prevQuery, getFieldsQueryBuilder())
          )
          setColumns(result.schema.fields.map((f: any) => f.name))
        } catch (error) {
          console.error("Error fetching available columns:", error)
        }
      }
    }
    fetchAndSetColumns()
  }, [db, prevQuery])

  useEffect(() => {
    if (showSuggestions && activeSuggestionIndex >= filteredColumns.length) {
      setActiveSuggestionIndex(filteredColumns.length - 1)
    }
  }, [activeSuggestionIndex, filteredColumns, showSuggestions])

  const handleColumnNameChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setNewColumnName(event.target.value)
  }

  const handleFormulaChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const userInput = event.currentTarget.value
    setFormula(userInput)
    setActiveSuggestionIndex(0)

    const cursorPosition = event.currentTarget.selectionStart || 0
    const formulaBeforeCursor = userInput.slice(0, cursorPosition)
    const lastWordBeforeCursor = formulaBeforeCursor.split(/\s+/).pop() || ""

    const filteredColumns = columns.filter((column) =>
      column.toLowerCase().startsWith(lastWordBeforeCursor.toLowerCase())
    )

    setFilteredColumns(filteredColumns)
    setShowSuggestions(
      lastWordBeforeCursor !== "" && filteredColumns.length > 0
    )
    // setValidFormula(validateFormula(userInput))
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && showSuggestions) {
      event.preventDefault()
      selectSuggestion(activeSuggestionIndex)
    } else if (event.key === "ArrowUp") {
      if (activeSuggestionIndex === 0) return
      setActiveSuggestionIndex(activeSuggestionIndex - 1)
    } else if (event.key === "ArrowDown") {
      if (activeSuggestionIndex - 1 === filteredColumns.length) return
      setActiveSuggestionIndex(activeSuggestionIndex + 1)
    }
  }

  const selectSuggestion = (index: number) => {
    const selectedColumn = filteredColumns[index]
    const cursorPosition = inputRef.current?.selectionStart || 0
    const formulaBeforeCursor = formula.slice(0, cursorPosition)
    const lastWordBeforeCursor = formulaBeforeCursor.split(/\s+/).pop() || ""
    const formulaAfterCursor = formula.slice(cursorPosition)
    const updatedFormula =
      formulaBeforeCursor.slice(0, -lastWordBeforeCursor.length) +
      `\`${selectedColumn}\`` +
      formulaAfterCursor

    setFormula(updatedFormula)
    setShowSuggestions(false)
    setActiveSuggestionIndex(0)
    inputRef.current?.focus()
    setTimeout(() => {
      inputRef.current?.setSelectionRange(
        cursorPosition -
          lastWordBeforeCursor.length +
          selectedColumn.length +
          2,
        cursorPosition - lastWordBeforeCursor.length + selectedColumn.length + 2
      )
    }, 0)
  }

  const handleCreateColumn = () => {
    if (newColumnName && formula) {
      let prqlChunk = `derive {\n\`${newColumnName}\` = ${formula}\n}`
      const q = mergeQueries(prevQuery, prqlChunk)
      updateQuery(q)
      setIsNewColAdded(true)
    }
  }

  const renderSuggestionsList = () => {
    if (showSuggestions && formula) {
      return (
        <ul className="absolute z-10 w-full border border-gray-300 bg-white">
          {filteredColumns.map((column, index) => (
            <li
              key={column}
              onClick={() => selectSuggestion(index)}
              className={`cursor-pointer p-2 ${
                index === activeSuggestionIndex ? "bg-gray-100" : ""
              }`}
            >
              {column}
            </li>
          ))}
        </ul>
      )
    }
    return null
  }

  return (
    <Card className="mb-4 w-full">
      <CardHeader>
        <CardTitle>Create New Column</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="column-name">Column Name</Label>
            <Input
              id="column-name"
              type="text"
              placeholder="Enter column name"
              value={newColumnName}
              onChange={handleColumnNameChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="formula">
              Formula
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <QuestionMarkCircleIcon />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Use simple formulas like <em>column1 + 2 * column2</em>{" "}
                      or&nbsp;
                      {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
                      <a
                        rel="noreferrer"
                        target="_blank"
                        className="underline"
                        href=""
                      >
                        click here
                      </a>
                      &nbsp;to see documenation.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <div className="relative mt-1">
              <div className="border-input flex flex-wrap gap-2 rounded-md border p-2">
                <input
                  ref={inputRef}
                  id="formula"
                  type="text"
                  value={formula}
                  onChange={handleFormulaChange}
                  onKeyDown={handleKeyDown}
                  className="flex-1 outline-none"
                  placeholder="Enter formula..."
                />
              </div>
              {renderSuggestionsList()}
            </div>
          </div>
          {!isNewColAdded ? (
            <Button
              onClick={handleCreateColumn}
              disabled={!newColumnName || !formula}
              className="mt-4"
            >
              Add Column
            </Button>
          ) : (
            <Button
              onClick={handleCreateColumn}
              disabled={!newColumnName || !formula}
              className="mt-4"
            >
              Edit Added Column
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default CreateColumn
