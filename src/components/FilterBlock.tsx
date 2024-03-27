import React, { useState, useEffect } from "react"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "./ui/select"
import Block from "./ui/Block"
import { Button } from "./ui/button"
import TextInput from "./ui/textinput"
import {
  mergeQueries,
  getFieldsQueryBuilder,
  getFieldValuesQueryBuilder,
  filterQueryBuilder,
  cn,
} from "../lib/utils"
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group"
import { useCell } from "../store/useStore"

interface FilterSectionProps {
  children: React.ReactNode
  className?: string
}

const FilterSection: React.FC<FilterSectionProps> = ({
  children,
  className,
}) => <div className={cn("mb-2 flex items-center", className)}>{children}</div>

interface Filter {
  column: string | null
  operator: string | null
  value: string | null
  fields: string[]
  fieldTypes: Map<string, string>
}

interface FilterProps {
  filter: Filter
  onFilterChange: (newFilter: Filter) => void
  onFilterDelete: () => void
  accQuery: string
  query: (q: string) => Promise<{ rowsJson: any; result: any }>
}

const isNumeric = (filter: Filter) => {
  const num_types_substr = ["Int", "Float", "Timestamp"]
  return num_types_substr.some((substr) =>
    filter.fieldTypes.get(filter.column!)?.includes(substr)
  )
}

const Filter: React.FC<FilterProps> = ({
  filter,
  onFilterChange,
  onFilterDelete,
  accQuery,
  query,
}) => {
  const [fieldValues, setFieldValues] = useState<string[]>([])

  useEffect(() => {
    const fetchFieldValues = async () => {
      if (filter.column) {
        const { rowsJson } = await query(
          mergeQueries(accQuery, getFieldValuesQueryBuilder(filter.column))
        )
        if (rowsJson) {
          setFieldValues(
            rowsJson.map((row: Record<string, string>) => row[filter.column!])
          )
        }
      }
    }
    fetchFieldValues()
  }, [accQuery, filter.column])

  useEffect(() => {
    if (filter.column) {
      const defaultOperator = isNumeric(filter) ? "==" : "equals"
      onFilterChange({ ...filter, operator: defaultOperator, value: null })
    }
  }, [filter.column])

  useEffect(() => {
    if (filter.operator === "notNull") {
      onFilterChange({ ...filter, value: "notNull" }) // Execute immediately when notNull is selected
    }
  }, [filter.operator])

  return (
    <FilterSection>
      <div className="flex items-center space-x-2 w-full">
        <Select
          //@ts-ignore
          value={filter.column || null}
          onValueChange={(value) =>
            onFilterChange({
              ...filter,
              column: value,
              operator: null,
              value: null,
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a field" />
          </SelectTrigger>
          <SelectContent>
            {filter.fields.map((field) => (
              <SelectItem key={field} value={field}>
                {field}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          //@ts-ignore
          value={filter.operator || null}
          onValueChange={(value) =>
            onFilterChange({ ...filter, operator: value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an operator" />
          </SelectTrigger>
          <SelectContent>
            {isNumeric(filter) ? (
              <>
                <SelectItem value="==">{"="}</SelectItem>
                <SelectItem value="!=">{"!="}</SelectItem>
                <SelectItem value=">=">{">="}</SelectItem>
                <SelectItem value="<=">{"<="}</SelectItem>
                <SelectItem value=">">{">"}</SelectItem>
                <SelectItem value="<">{"<"}</SelectItem>
                <SelectItem value="notNull">Not null</SelectItem>
              </>
            ) : (
              <>
                <SelectItem value="equals">Equals</SelectItem>
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="startsWith">Starts with</SelectItem>
                <SelectItem value="endsWith">Ends with</SelectItem>
                <SelectItem value="notNull">Not null</SelectItem>
                <SelectItem value="not equals">Not equals</SelectItem>
                <SelectItem value="not contains">Doesn't contain</SelectItem>
                <SelectItem value="not startsWith">
                  Doesn't start with
                </SelectItem>
                <SelectItem value="not endsWith">Doesn't ends with</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
        {filter?.operator !== "notNull" &&
          (!filter?.operator?.includes("equals") || fieldValues.length > 100 ? (
            <TextInput
              setFieldValue={(value) => onFilterChange({ ...filter, value })}
            />
          ) : (
            <Select
              value={filter.value ?? undefined}
              onValueChange={(value) => onFilterChange({ ...filter, value })}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    filter.value === null ? "Select a value" : undefined
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {fieldValues.map((value, i) => (
                  <SelectItem key={i} value={String(value)}>
                    {String(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        <Button
          className="ml-2 rounded-md bg-red-500 px-3 py-2 text-white hover:bg-red-600"
          onClick={onFilterDelete}
        >
          Delete
        </Button>
      </div>
    </FilterSection>
  )
}

interface FilterGroup {
  children: Array<Filter | FilterGroup>
  boolOperators: string[]
}

interface FilterGroupProps {
  filterGroup: FilterGroup
  onFilterGroupChange: (newFilterGroup: FilterGroup) => void
  onFilterGroupDelete: () => void
  indent?: number
  query: (q: string) => Promise<{ rowsJson: any; result: any }>
  accQuery: string
}

const FilterGroup: React.FC<FilterGroupProps> = ({
  filterGroup,
  onFilterGroupChange,
  onFilterGroupDelete,
  indent = 0,
  query,
  accQuery,
}) => {
  const [fields, setFields] = useState<string[]>([])
  const [fieldTypes, setFieldTypes] = useState<Map<any, any>>(new Map())

  useEffect(() => {
    const fetchFields = async () => {
      if (accQuery) {
        const { result, rowsJson } = await query(
          mergeQueries(accQuery, getFieldsQueryBuilder())
        )
        if (rowsJson?.[0]) {
          setFields(Object.keys(rowsJson[0]))
          const types = new Map(
            result.schema.fields.map((f: any) => [f.name, String(f.type)])
          )
          setFieldTypes(types)
        }
      }
    }
    fetchFields()
  }, [accQuery])

  const handleAddFilter = () => {
    const newFilter: Filter = {
      column: fields[0],
      operator: null,
      value: "",
      fields: fields,
      fieldTypes: fieldTypes,
    }
    onFilterGroupChange({
      ...filterGroup,
      children: [...filterGroup.children, newFilter],
      boolOperators: [...filterGroup.boolOperators, "&&"],
    })
  }

  const handleAddFilterGroup = () => {
    const newFilterGroup: FilterGroup = { children: [], boolOperators: [] }
    onFilterGroupChange({
      ...filterGroup,
      children: [...filterGroup.children, newFilterGroup],
      boolOperators: [...filterGroup.boolOperators, "&&"],
    })
  }

  const handleFilterChange = (
    index: number,
    newFilter: Filter | FilterGroup
  ) => {
    const updatedChildren = [...filterGroup.children]
    updatedChildren[index] = newFilter
    onFilterGroupChange({ ...filterGroup, children: updatedChildren })
  }

  const handleFilterDelete = (index: number) => {
    const updatedChildren = filterGroup.children.filter((_, i) => i !== index)
    const updatedBoolOperators = filterGroup.boolOperators.filter(
      (_, i) => i !== index
    )
    onFilterGroupChange({
      ...filterGroup,
      children: updatedChildren,
      boolOperators: updatedBoolOperators,
    })
  }

  const handleBoolOperatorChange = (index: number, newOperator: string) => {
    const updatedBoolOperators = [...filterGroup.boolOperators]
    updatedBoolOperators[index] = newOperator
    onFilterGroupChange({ ...filterGroup, boolOperators: updatedBoolOperators })
  }

  return (
    <div style={{ marginLeft: `${indent * 20}px` }}>
      <FilterSection>
        <div
          className="flex items-center space-x-2"
          style={{ width: "fit-content" }}
        >
          <Button
            className="rounded-md bg-blue-500 px-3 py-2 text-white hover:bg-blue-600"
            onClick={handleAddFilter}
          >
            Add Filter
          </Button>
          <Button
            className="rounded-md bg-blue-500 px-3 py-2 text-white hover:bg-blue-600"
            onClick={handleAddFilterGroup}
          >
            Add Filter Group
          </Button>
          {indent !== 0 && onFilterGroupDelete && (
            <Button
              className="rounded-md bg-red-500 px-3 py-2 text-white hover:bg-red-600"
              onClick={onFilterGroupDelete}
            >
              Delete Group
            </Button>
          )}
        </div>
      </FilterSection>
      {filterGroup.children.map((child, index) => (
        <div key={index}>
          {"column" in child ? (
            <Filter
              filter={child}
              onFilterChange={(newFilter) =>
                handleFilterChange(index, newFilter)
              }
              onFilterDelete={() => handleFilterDelete(index)}
              accQuery={accQuery}
              query={query}
            />
          ) : (
            <FilterGroup
              filterGroup={child}
              onFilterGroupChange={(newFilterGroup) =>
                handleFilterChange(index, newFilterGroup)
              }
              onFilterGroupDelete={() => handleFilterDelete(index)}
              indent={indent + 1}
              query={query}
              accQuery={accQuery}
            />
          )}
          {index < filterGroup.children.length - 1 && (
            <ToggleGroup
              className="pb-2"
              type="single"
              defaultValue="&&"
              onValueChange={(value: string) =>
                handleBoolOperatorChange(index, value)
              }
            >
              <ToggleGroupItem value="&&" aria-label="Toggle bold">
                <div>AND</div>
              </ToggleGroupItem>
              <ToggleGroupItem value="||" aria-label="Toggle italic">
                <div>OR</div>
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
      ))}
    </div>
  )
}

const constructSQL = (filterGroup: FilterGroup): string => {
  let sqlParts: string[] = []

  filterGroup.children?.forEach((child, index) => {
    if ("column" in child && child.operator && child.value) {
      // It's a filter
      let operatorStr = child.operator
      let valueStr = `"${child.value}"`
      if (operatorStr === "equals") {
        operatorStr = "=="
      } else if (child.operator === "not equals") {
        operatorStr = "!="
      } else if (child.operator.includes("contains")) {
        operatorStr = "| text.contains"
      } else if (child.operator.includes("startsWith")) {
        operatorStr = "| text.starts_with"
      } else if (child.operator.includes("endsWith")) {
        operatorStr = "| text.ends_with"
      } else {
        // It's a numeric operator
        // Remove quotation marks
        if (child.fieldTypes?.get(child.column!)?.includes("Timestamp"))
          valueStr = `@${child.value}`
        else valueStr = child.value
      }
      if (child.operator === "notNull") {
        sqlParts.push(`(\`${child.column}\` != null)`)
      } else if (child.value !== "null") {
        const NOT = "not "
        sqlParts.push(
          `(${
            child.operator?.includes(NOT) && operatorStr?.includes("|")
              ? NOT
              : ""
          }\`${child.column}\` ${operatorStr} ${valueStr})`
        )
      }
      // handle the null case
      if (
        child.value.toLowerCase() === "null" &&
        (operatorStr.includes("==") || operatorStr.includes("!="))
      ) {
        // It's a filter with a null value
        sqlParts.push(`\`${child.column}\` ${operatorStr} null`)
      }
    } else {
      // It's a filter group
      const groupSql = constructSQL(child as FilterGroup)
      if (groupSql) {
        sqlParts.push(`(${groupSql})`)
      }
    }
    // Append the boolean operator except for the last child
    if (index < filterGroup.children.length - 1) {
      sqlParts.push(filterGroup.boolOperators[index])
    }
  })

  sqlParts = sqlParts.filter(Boolean)

  if (
    sqlParts.length > 0 &&
    (sqlParts[sqlParts.length - 1] === "&&" ||
      sqlParts[sqlParts.length - 1] === "||")
  ) {
    sqlParts.pop()
  }

  return sqlParts.join(" ")
}

export default function FilterBlock({ id }: { id: number }) {
  const { updateQuery, prevQuery, query } = useCell(id)
  const [rootFilterGroup, setRootFilterGroup] = useState<FilterGroup>({
    children: [],
    boolOperators: [],
  })

  useEffect(() => {
    const q = mergeQueries(
      prevQuery,
      filterQueryBuilder(constructSQL(rootFilterGroup))
    )
    updateQuery(q)
  }, [rootFilterGroup, prevQuery])

  return (
    <Block className="mb-3 flex-col" title="Filter">
      <FilterGroup
        filterGroup={rootFilterGroup}
        onFilterGroupChange={setRootFilterGroup}
        accQuery={prevQuery}
        onFilterGroupDelete={() => {}}
        query={query}
      />
    </Block>
  )
}
