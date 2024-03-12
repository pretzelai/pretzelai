import { cn } from "../../lib/utils"
import { Card, CardHeader, CardTitle, CardContent } from "./card"
export default function Block({
  children,
  className,
  title,
}: {
  children: React.ReactNode
  className?: string
  title?: string
}) {
  return (
    <Card className={cn("mt-2", className)}>
      {title && (
        <CardHeader className="pt-4 pb-4">
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  )
}
