import React from "react"

// Define the props that the TextInput component will accept
type TextInputProps = {
  setFieldValue: (value: string) => void
}

const TextInput: React.FC<TextInputProps> = ({ setFieldValue }) => {
  return (
    <input
      type="text"
      className="border-input ring-offset-background placeholder:text-muted-foreground focus:ring-ring ml-2 flex h-9 w-[180px] items-center justify-between whitespace-nowrap rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
      required
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        setFieldValue(event.target.value)
      }
    />
  )
}

export default TextInput
