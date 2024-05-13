import * as monacos from "monaco-editor";

const TRANSFORMS = [
  "aggregate",
  "append",
  "derive",
  "filter",
  "from",
  "group",
  "join",
  "select",
  "sort",
  "take",
  "union",
  "window",
];
const MODULES = ["date", "math", "text"];
const BUILTIN_FUNCTIONS = [
  // Aggregate functions
  "any",
  "average",
  "concat_array",
  "count",
  "every",
  "max",
  "min",
  "stddev",
  "sum",
  // File reading functions
  "read_csv",
  "read_parquet",
  // List functions
  "all",
  "map",
  "zip",
  "_eq",
  "_is_null",
  // Misc functions
  "from_text",
  // Window functions
  "lag",
  "lead",
  "first",
  "last",
  "rank",
  "rank_dense",
  "row_number",
];

const KEYWORDS = ["let", "prql", "into", "case", "in", "as", "module"];
const LITERALS = ["null", "true", "false"];
const DATATYPES = [
  "bool",
  "float",
  "int",
  "int8",
  "int16",
  "int32",
  "int64",
  "text",
  "timestamp",
];

const PRQL_KEYWORDS = [
  ...TRANSFORMS,
  ...MODULES,
  ...BUILTIN_FUNCTIONS,
  ...KEYWORDS,
  ...LITERALS,
  ...DATATYPES,
];

export const customTheme : monacos.editor.IStandaloneThemeData = {
  base: "hc-light",
  inherit: false,
  rules: [
    { token: "keyword.sql", foreground: "#48db40", fontStyle: "bold" },
    { token: "white.sql", foreground: "#c0d218", fontStyle: "bold" },
    { token: "operator.sql", foreground: "#48db40", fontStyle: "bold" },
    { token: "comment.sql", foreground: "#4673e6", fontStyle: "bold" },
    { token: "identifier.sql", foreground: "#db4055", fontStyle: "bold" },

    { token: "keyword.prql", foreground: "#e3c91e", fontStyle: "bold" },
    { token: "white.prql", foreground: "#21f140", fontStyle: "bold" },
    { token: "operator.prql", foreground: "#d8550f", fontStyle: "bold" },
    { token: "identifier.prql", foreground: "#095c94", fontStyle: "bold" },
    { token: "comment.prql", foreground: "#6e0dc9", fontStyle: "bold" },
  ],
  colors: {},
};

export const config = {
  comments: {
    lineComment: "#",
  },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
};

export const prqlLang = {
  keywords: PRQL_KEYWORDS,
  operators: [
    "+",
    "-",
    "*",
    "/",
    "//",
    "%",
    "==",
    "!=",
    "->",
    "=>",
    ">",
    "<",
    ">=",
    "<=",
    "~=",
    "&&",
    "||",
    "??",
  ],
  tokenizer: {
    root: [
      { include: "@comment" },
      [/(\w+)\s*:/, { cases: { $1: "key" } }],
      [/\+\+|--|\*\*|<=?|>=?|==|!=|&&|\|\||[?:~=-]|[*\/%+!^&|]=?/, "operator"],
      [
        new RegExp("\\b(?:" + PRQL_KEYWORDS.join("|") + ")\\b"),
        "keyword.prql",
      ],
      [/[a-z_$][\w$]*/, "identifier.prql"],
      { include: "@whitespace" },
      [/[()[\]]/, "@brackets"],
      [/[+-]?[^\w](([\d_]+(\.[\d_]+])?)|(\.[\d_]+))/, "number"],
      [/"([^"\\]|\\.)*$/, "string.invalid"],
      [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
      [/'[^\\']'/, "string"],
    ],

    comment: [[/#.*/, "comment"]],

    string: [
      [/[^\\"]+/, "string"],
      [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
    ],

    whitespace: [
      [/[ \t\r\n]+/, "white"],
      [/\/\*/, "comment", "@comment"],
      [/\/\/.*$/, "comment"],
    ],
  },
};
