import type { SkillInfo } from '../../../core/types.ts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'

// A Select's value is a string. This one stands for "no skill", and isn't a name a skill can have.
const NONE = '__none__'

interface SkillSelectProps {
  id: string
  skills: SkillInfo[]
  value: string | null // null: no skill
  onChange: (skill: string | null) => void
}

// Which of the repo's skills a session is told to use, or none.
export function SkillSelect({ id, skills, value, onChange }: SkillSelectProps) {
  const items = [
    { value: NONE, label: 'No skill', description: null },
    ...skills.map((skill) => ({
      value: skill.name,
      label: skill.name,
      description: skill.description,
    })),
  ]
  return (
    <Select
      items={items}
      value={value ?? NONE}
      onValueChange={(next) => {
        if (next !== null) onChange(next === NONE ? null : next)
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            <span className="flex max-w-96 min-w-0 flex-col">
              <span className="truncate">{item.label}</span>
              {item.description !== null && (
                <span className="truncate text-muted-foreground">
                  {item.description}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
