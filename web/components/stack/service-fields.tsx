import { ChevronDown, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useWatch, type Control } from 'react-hook-form'

import { Segmented } from '@/components/stack/segmented.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card } from '@/components/ui/card.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import { cn } from '@/lib/utils.ts'
import type { StackFormValues, StatusKind } from '@/lib/stack-form.ts'

const KIND_OPTIONS: { value: StatusKind; label: string }[] = [
  { value: 'port', label: 'A port listens' },
  { value: 'compose', label: 'Containers run' },
  { value: 'process', label: 'A process runs' },
  { value: 'command', label: 'A command passes' },
]

type TextField = Exclude<
  keyof StackFormValues['services'][number],
  'kind' | 'processOwner' | 'oneShot' | 'needs'
>

interface ServiceFieldsProps {
  control: Control<StackFormValues>
  index: number
  otherNames: string[]
  onRemove: () => void
}

export function ServiceFields({
  control,
  index,
  otherNames,
  onRemove,
}: ServiceFieldsProps) {
  const [more, setMore] = useState(false)
  const kind = useWatch({ control, name: `services.${index}.kind` })
  const name = useWatch({ control, name: `services.${index}.name` })

  const text = (
    field: TextField,
    label: string,
    options: {
      placeholder?: string
      description?: string
      mono?: boolean
    } = {},
  ) => (
    <Controller
      control={control}
      name={`services.${index}.${field}`}
      render={({ field: input, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={input.name}>{label}</FieldLabel>
          <Input
            {...input}
            id={input.name}
            autoComplete="off"
            spellCheck={false}
            placeholder={options.placeholder}
            aria-invalid={fieldState.invalid}
            className={cn(options.mono !== false && 'font-mono')}
          />
          {options.description !== undefined && (
            <FieldDescription>{options.description}</FieldDescription>
          )}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )

  return (
    <Card className="gap-4 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr_auto] sm:items-start">
        {text('name', 'Name', { placeholder: 'web' })}
        {text('start', 'Start command', { placeholder: 'npm run dev' })}
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label={`Remove ${name || 'this service'}`}
          className="sm:mt-6"
        >
          <Trash2 />
          Remove
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-strong">Up when</p>
        <Controller
          control={control}
          name={`services.${index}.kind`}
          render={({ field }) => (
            <Segmented
              label="Up when"
              options={KIND_OPTIONS}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        {kind === 'port' && (
          <div className="grid gap-4 sm:grid-cols-3">
            {text('portBase', 'Port', { placeholder: '5173' })}
            {text('portFile', 'or from env file', { placeholder: '.env' })}
            {text('portKey', 'key', { placeholder: 'PORT' })}
          </div>
        )}
        {kind === 'compose' && (
          <div className="grid gap-4 sm:grid-cols-2">
            {text('composeParts', 'Compose services', {
              placeholder: 'postgres, redis',
              description: 'Some of them up reads as partly up.',
            })}
            {text('composeProject', 'Project (optional)', {
              placeholder: 'myapp',
            })}
          </div>
        )}
        {kind === 'process' && (
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            {text('processMatch', 'Its command line contains', {
              placeholder: 'node dist/worker.js',
            })}
            <Controller
              control={control}
              name={`services.${index}.processOwner`}
              render={({ field }) => (
                <Segmented
                  label="Belongs to the checkout by"
                  options={[
                    { value: 'cwd', label: 'Runs inside it' },
                    { value: 'argument', label: 'Names a path in it' },
                  ]}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
        )}
        {kind === 'command' &&
          text('command', 'Command that exits 0 when up', {
            placeholder: 'curl -sf localhost:8000/health',
            description:
              'Runs in the checkout on every refresh, with a 5 second limit.',
          })}
      </div>
      <button
        type="button"
        onClick={() => setMore((open) => !open)}
        aria-expanded={more}
        className="flex items-center gap-1 self-start text-sm font-semibold text-muted-foreground hover:text-strong"
      >
        <ChevronDown
          className={cn('size-4 transition', more && 'rotate-180')}
          aria-hidden="true"
        />
        More: stop, start order, readiness
      </button>
      {more && (
        <div className="grid gap-4 sm:grid-cols-2">
          {text('stop', 'Stop command (optional)', {
            description:
              'Without one, a stop signals what the status check found.',
          })}
          {text('ready', 'Ready when its output shows (optional)', {
            placeholder: 'ready in',
            description:
              'A line in the start output, for a service status alone can’t tell.',
          })}
          <Controller
            control={control}
            name={`services.${index}.oneShot`}
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id={field.name}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <FieldLabel htmlFor={field.name}>
                  Start exits once it’s up (docker compose up -d, say)
                </FieldLabel>
              </Field>
            )}
          />
          {otherNames.length > 0 && (
            <Controller
              control={control}
              name={`services.${index}.needs`}
              render={({ field }) => (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold text-strong">
                    Starts after
                  </p>
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Starts after"
                  >
                    {otherNames.map((other) => {
                      const on = field.value.includes(other)
                      return (
                        <button
                          key={other}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            field.onChange(
                              on
                                ? field.value.filter((need) => need !== other)
                                : [...field.value, other],
                            )
                          }
                          className="h-7 rounded-full border bg-card px-3 text-xs font-semibold text-muted-foreground aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                        >
                          {other}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            />
          )}
        </div>
      )}
    </Card>
  )
}
