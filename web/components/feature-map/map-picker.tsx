import type { StackMapSummary } from '../../../core/types.ts'
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'

interface MapPickerProps {
  maps: StackMapSummary[]
  value: string | null // the saved map open; null: an unsaved one
  onChange: (name: string) => void
}

export function MapPicker({ maps, value, onChange }: MapPickerProps) {
  const items = maps.map((map) => ({ value: map.name, label: map.title }))
  return (
    <Field className="w-56">
      <FieldLabel htmlFor="stack-map-picker">Map</FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (next !== null && next !== value) onChange(next)
        }}
      >
        <SelectTrigger id="stack-map-picker" className="w-full">
          <SelectValue placeholder="Unsaved map" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
