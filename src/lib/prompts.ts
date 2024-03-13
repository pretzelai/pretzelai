export function PRQLPromptFormatter(
  fields: string[] | null,
  instruction: string
): string {
  let PRQLString = `
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

To emphasize, it is imperative you ONLY RETURN VALID PRQL.`

  return PRQLString
}

export function SQLPromptFormatter(
  fields: string[] | null,
  instruction: string
): string {
  let SQLString = `
You are an experienced data analyst. You are an expert on SQL and write
really good SQL queries. When information seems insufficient to create the correct
SQL, you infer the most plausible meaning of the question and use sensible defaults
to still generate really good SQL. You are also very good at writing SQL that is easy
to read and understand.

The table is called \`AI_Table\` and here are the column names in the table:
${fields?.join(", ")}

Generate SQL to get the following information:
${instruction}

VERY IMPORTANT INSTRUCTIONS
- ONLY RETURN VALID SQL. DO NOT RETURN ANY OTHER TEXT, ONLY THE SQL.
- ALWAYS WRAP COLUMN NAMES in double quotes.
- TABLE NAME SHOULD BE USED AS PROVIDED WITH NO MODIFICATION

TO EMPHASIZE: ONLY RETURN VALID SQL. THIS IS REALLY IMPORTANT AND I'M TRUSTING YOU TO DO A GOOD JOB
WHENEVER YOU RETURN ANY OTHER TEXT, YOU WILL BE BREAKING A CRUCIAL APPLICATION FOR MILLIONS OF PEOPLE
AND CAUSING IMMEASURABLE HARM.`
  return SQLString
}
