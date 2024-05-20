import { useState, useEffect } from "react"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "./ui/select"
import Block from "./ui/Block"
import { Button } from "./ui/button"
import { mergeQueries, getFieldsQueryBuilder } from "../lib/utils"
import { useCell } from "../store/useStore"

interface SortColumn {
  column: string | null
  order: "asc" | "desc" | null
}

export default function SortBlock({ id }: { id: number }) {
  const { query, prevQuery, updateQuery } = useCell(id)
  const [fields, setFields] = useState<string[]>([])
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([
    { column: null, order: null },
  ])

  useEffect(() => {
    const fetchFields = async () => {
      if (prevQuery) {
        const { rowsJson } = await query(
          mergeQueries(prevQuery, getFieldsQueryBuilder())
        )
        if (rowsJson?.[0]) {
          setFields(Object.keys(rowsJson[0]))
        }
      }
    }
    fetchFields()
  }, [prevQuery])

  useEffect(() => {
    const updateSortQuery = async () => {
      const sortParts = sortColumns
        .filter((col) => col.column && col.order)
        .map((col) => `${col.order === "asc" ? "+" : "-"}\`${col.column}\``)
      let sortQuery =
        sortParts.length > 0 ? `sort {${sortParts.join(", ")}}` : ""
      const q = mergeQueries(prevQuery, sortQuery)
      updateQuery(q)
    }
    updateSortQuery()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortColumns, prevQuery])

  const handleColumnChange = (index: number, column: string | null) => {
    const updatedSortColumns = [...sortColumns]
    updatedSortColumns[index].column = column
    setSortColumns(updatedSortColumns)
  }

  const handleOrderChange = (index: number, order: "asc" | "desc" | null) => {
    const updatedSortColumns = [...sortColumns]
    updatedSortColumns[index].order = order
    setSortColumns(updatedSortColumns)
  }

  const handleAddColumn = () => {
    setSortColumns([...sortColumns, { column: null, order: null }])
  }

  const handleDeleteColumn = (index: number) => {
    const updatedSortColumns = [...sortColumns]
    updatedSortColumns.splice(index, 1)
    setSortColumns(updatedSortColumns)
  }

  return (
    <Block className="mb-4 w-3/4 flex-col" title="Sort">
      {sortColumns.map((col, index) => (
        <div key={index} className="mb-2 flex items-center space-x-2">
          <Select
            value={col.column || undefined}
            onValueChange={(value) => handleColumnChange(index, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a column" />
            </SelectTrigger>
            <SelectContent>
              {fields.map((field) => (
                <SelectItem key={field} value={field}>
                  {field}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={col.order || undefined}
            onValueChange={(value) =>
              handleOrderChange(index, value as "asc" | "desc" | null)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select sort order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Ascending</SelectItem>
              <SelectItem value="desc">Descending</SelectItem>
            </SelectContent>
          </Select>
          <Button
            className="rounded-md bg-red-500 px-3 py-2 text-white hover:bg-red-600"
            onClick={() => handleDeleteColumn(index)}
          >
            Delete
          </Button>
        </div>
      ))}
      <Button
        className="rounded-md bg-blue-500 px-3 py-2 text-white hover:bg-blue-600"
        onClick={handleAddColumn}
      >
        Add Column
      </Button>
    </Block>
  )
}
