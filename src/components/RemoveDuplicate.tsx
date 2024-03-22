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
import { Button } from "./ui/button";
import { query, mergeQueries, removeQuery } from "../lib/utils";

interface DuplicateProps {
  db: AsyncDuckDB | null;
  updateQuery: (q: string) => void;
  prevQuery: string;
}

export default function RemoveDuplicateBlock({
  db,
  updateQuery,
  prevQuery,
}: DuplicateProps) {
  const [fields, setFields] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>("");
  const [tableRows, setTableRows] = useState<number>(0);
  const [currentTableRows, setCurrentTableRows] = useState<number>(0);
  const [numDuplicatesRemoved, setNumDuplicatesRemoved] = useState<number>(0);
  const [buttonText, setButtonText] = useState<string>("Remove Duplicates");
  const [showRowLength, setShowRowLength] = useState<boolean>(true); // State to control the visibility of row length

  useEffect(() => {
    const fetchFields = async () => {
      if (db && prevQuery) {
        const { rowsJson } = await query(db, mergeQueries(prevQuery, ``));
        if (rowsJson?.[0]) {
          setFields(Object.keys(rowsJson[0]));
          setTableRows(rowsJson.length);
        }
      }
    };
    fetchFields();
  }, [db, prevQuery]);

  const handleAddRemoveDuplicates = async () => {
    if (selectedColumn) {
      if (buttonText === "Remove Duplicates") {
        const removeDuplicateQuery = removeQuery(selectedColumn);
        const q = mergeQueries(prevQuery, removeDuplicateQuery);
        const result = await query(db, q);
        if (result.rowsJson && result.rowsJson.length > 0) {
          const numRemoved = result.rowsJson.length;
          setCurrentTableRows(numRemoved);
          setNumDuplicatesRemoved(tableRows - numRemoved);
          setButtonText("Undo Duplicates");
        }
        updateQuery(q);
        setShowRowLength(false); // Hide row length when Remove Duplicates is clicked
      } else if (buttonText === "Undo Duplicates") {
        updateQuery(prevQuery); // Revert back to the previous query
        setCurrentTableRows(0);
        setNumDuplicatesRemoved(0);
        setButtonText("Remove Duplicates");
        setShowRowLength(true); // Show row length when Undo Duplicates is clicked
      }
    }
  };

  return (
    <Block className="mb-4 w-3/4 flex-col" title="Remove Duplicates">
      {showRowLength && ( // Only display row length if showRowLength is true
        <div className="mb-2">
          <span>Rows Length: {tableRows}</span>
        </div>
      )}
      <div className="mb-2 flex items-center space-x-2">
        <Select
          value={selectedColumn}
          onValueChange={(value) => setSelectedColumn(value)}
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
      </div>

      {buttonText === "Undo Duplicates" && (
        <div className="mb-2 flex flex-col gap-2">
          <span>Current Row Length: {currentTableRows}</span>
          <span>Duplicates Removed: {numDuplicatesRemoved}</span>
        </div>
      )}
      <Button
        className="rounded-md bg-blue-500 px-3 py-2 text-white hover:bg-blue-600 flex flex-col "
        onClick={handleAddRemoveDuplicates}
        disabled={!selectedColumn}
      >
        {buttonText}
      </Button>
      {selectedColumn === "" && (
        <span className="text-red-500">!Please select a column</span>
      )}
    </Block>
  );
}
