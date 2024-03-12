import { useState } from "react"
import { Input } from "./ui/input"
import { Button } from "./ui/button"
import posthog from "posthog-js"

export default function Feedback() {
  const [feedback, setFeedback] = useState("")
  const [email, setEmail] = useState("")
  const [sendText, setSendText] = useState("Send")

  const handleSendFeedback = () => {
    setSendText("🎉 Thank you! 🎉 ")
    setTimeout(() => setSendText("Send"), 500)
    if (feedback || email) {
      posthog.capture("feedback_submitted", {
        feedback: feedback,
        email: email,
      })
      setFeedback("")
      setEmail("")
    }
  }

  return (
    <div className="flex rounded-lg w-full">
      <Input
        type="text"
        className="m-2"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Enter your feedback, bugs, etc."
      />
      <Input
        type="text"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="(optional) Email"
        className="w-1/2 m-2"
      />
      <Button
        variant="secondary"
        className="m-2"
        onClick={handleSendFeedback}
        disabled={sendText !== "Send"}
      >
        {sendText}
      </Button>
    </div>
  )
}
