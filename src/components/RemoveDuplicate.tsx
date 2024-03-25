import { useState, useEffect } from "react";
import { AsyncDuckDB } from "../lib/duckdb";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "./ui/select";
import Block from "./ui/Block";
import { query, mergeQueries, removeQuery } from "../lib/utils";
import { Button } from "./ui/button";

interface DuplicateProps {
  db: AsyncDuckDB | null;
  updateQuery: (q: string) => void;
  prevQuery: string;
  onDelete: () => void; // Function to handle block deletion
}

export default function RemoveDuplicateBlock({
  db,
  updateQuery,
  prevQuery,
  onDelete,
}: DuplicateProps) {
  const [fields, setFields] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>("Full Rows");
  const [tableRows, setTableRows] = useState<number>(0);
  const [currentTableRows, setCurrentTableRows] = useState<number>(0);
  const [numDuplicatesRemoved, setNumDuplicatesRemoved] = useState<number>(0);
  const [pendingColumn, setPendingColumn] = useState<string>("");

  useEffect(() => {
  const fetchFields = async () => {
    if (db && prevQuery) {
      const { rowsJson } = await query(db, mergeQueries(prevQuery, ""));
      if (rowsJson?.[0]) {
        // Include "Full Rows" in the fields state
        setFields(["Full Rows", ...Object.keys(rowsJson[0])]);
        setTableRows(rowsJson.length);
      }
    }
  };
  fetchFields();
}, [db, prevQuery]);


  useEffect(() => {
    const handleRemoveDuplicates = async () => {
      if (pendingColumn) {
        const removeDuplicateQuery = removeQuery(pendingColumn, fields);
        const q = mergeQueries(prevQuery, removeDuplicateQuery);
        const result = await query(db, q);
        if (result.rowsJson && result.rowsJson.length > 0) {
          const numRemoved = result.rowsJson.length;
          setCurrentTableRows(numRemoved);
          setNumDuplicatesRemoved(tableRows - numRemoved);
          updateQuery(q);
        }
        setPendingColumn("");
      }
    };
    const timeoutId = setTimeout(handleRemoveDuplicates, 500);
    return () => clearTimeout(timeoutId);
  }, [db, prevQuery, pendingColumn, tableRows, updateQuery, fields]);

  useEffect(() => {
    // Automatically remove duplicates on mount with the default option "Full Rows"
    if (selectedColumn === "Full Rows") {
      setPendingColumn(selectedColumn);
    }
  }, [selectedColumn]);

  return (
    <Block className="mb-4 w-3/4 flex-col" title="Remove Duplicates">
      <div className="mb-2">
        <span>Rows Length: {tableRows}</span>
      </div>
      <div className="mb-2 flex items-center space-x-2">
        <Select
          value={selectedColumn}
          onValueChange={(value) => {
            setSelectedColumn(value);
            setPendingColumn(value);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Full Rows" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((field) => (
              <SelectItem key={field} value={field}>
                {field}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="rounded-md bg-red-500 px-3 py-2 text-white hover:bg-red-600"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
      {selectedColumn && (
        <div className="mb-2 flex flex-col gap-2">
          <span>Current Row Length: {currentTableRows}</span>
          <span>Duplicates Removed: {numDuplicatesRemoved}</span>
        </div>
      )}
    </Block>
  );
}
