import Block from "./ui/Block"
import { useState, useEffect } from "react"
import { AsyncDuckDB } from "../lib/duckdb"
import { Toggle } from "./ui/toggle"
import {
  query,
  columnFilterQueryBuilder,
  mergeQueries,
  getFieldsQueryBuilder,
  columnErrorQueryBuilder,
} from "../lib/utils"
import { Button } from "./ui/button"
import { useCell } from "../store/useStore"
export default function Columns({ id }: { id: number }) {
  const { updateQuery, prevQuery, db } = useCell(id)
  const [fields, setFields] = useState<string[] | null>(null)
  const [selectedFieldsStatus, setSelectedFieldsStatus] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (db) {
      const fetch = async () => {
        let rowsJson
        if (selectedFieldsStatus) {
          setError(null)
          const selectedFields = Object.keys(selectedFieldsStatus).filter(
            (key) => selectedFieldsStatus[key]
          )
          rowsJson = (
            await query(
              db,
              mergeQueries(prevQuery, columnErrorQueryBuilder(selectedFields))
            )
          ).rowsJson
          if (!rowsJson) {
            const row = (
              await query(db, mergeQueries(prevQuery, getFieldsQueryBuilder()))
            )?.rowsJson?.[0]
            if (row) {
              const prevColumns = Object.keys(row)
              const missinFields = selectedFields.filter(
                (f) => !prevColumns.includes(f)
              )
              setError(`MISSING FIELDS:\n${missinFields.join("\n")}`)
            }
          }
        }
        rowsJson = (
          await query(db, mergeQueries(prevQuery, getFieldsQueryBuilder()))
        )?.rowsJson
        if (rowsJson?.[0]) {
          const fieldsArray = Object.keys(rowsJson[0])
          setFields(fieldsArray)
          if (!selectedFieldsStatus) {
            setSelectedFieldsStatus(
              fieldsArray.reduce(
                (acc, field) => ({ ...acc, [field]: true }),
                {}
              )
            )
          }
        }
      }
      fetch()
    }
  }, [db, prevQuery])

  useEffect(() => {
    if (selectedFieldsStatus) {
      const selectedFields = Object.keys(selectedFieldsStatus).filter(
        (key) => selectedFieldsStatus[key]
      )
      if (db) {
        const fetch = async () => {
          const columnQuery = columnFilterQueryBuilder(selectedFields)
          const q = mergeQueries(prevQuery, columnQuery)
          updateQuery(q)
        }
        fetch()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFieldsStatus, fields])

  const onPress = (field: string, pressed: boolean) => {
    setSelectedFieldsStatus((prev: any) => ({ ...prev, [field]: pressed }))
  }
  if (!fields) return null
  return (
    <Block className="mb-4" title="Remove Columns">
      <div className="bg-red-200 font-bold max-w-full">
        {error &&
          error.split("\n").map((line, index) => (
            <span key={index}>
              {line}
              <br />
            </span>
          ))}
      </div>
      <div>
        <Button
          className="mb-2"
          onClick={() => {
            setSelectedFieldsStatus(
              Object.keys(selectedFieldsStatus).reduce(
                (acc, field) => ({ ...acc, [field]: false }),
                {}
              )
            )
          }}
        >
          Remove all
        </Button>
        <div className="flex flex-wrap max-w-full">
          {fields.map((field) => (
            <Toggle
              pressed={selectedFieldsStatus[field]}
              onPressedChange={(pressed) => onPress(field, pressed)}
              className="mr-1 mb-1"
              key={field}
              aria-label={field}
            >
              {field}
            </Toggle>
          ))}
        </div>
      </div>
    </Block>
  )
}
