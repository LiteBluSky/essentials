import { useForm, useStore } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRingIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { SETTINGS, SETTING_KEYS } from '@/lib/settings'
import type { SettingKey, SettingsInput, SettingsView } from '@/lib/settings'
import { assistantEnabledQueryOptions } from '@/server/assistant.functions'
import {
  settingsQueryOptions,
  testReminder,
  updateSettings,
} from '@/server/settings.functions'

const GROUPS: Array<{
  legend: string
  description: string
  keys: Array<SettingKey>
}> = [
  {
    legend: 'Assistant',
    description:
      'The “Tell me…” field. Needs an API key: from openrouter.ai (or any OpenAI-compatible API), or from Anthropic (console.anthropic.com). Only what you type in the field is sent.',
    keys: ['LLM_PROVIDER', 'LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL'],
  },
  {
    legend: 'Phone reminders',
    description:
      'Due tasks are pushed through ntfy: install the ntfy app and subscribe to the same topic. On ntfy.sh anyone who knows the topic can read it, so make it long and random.',
    keys: ['NTFY_TOPIC', 'NTFY_URL', 'NTFY_TOKEN', 'PUBLIC_URL'],
  },
]

/**
 * Settings… (every app's ⋮ menu): the assistant's LLM and the ntfy reminder
 * target, stored in the database. An empty field falls back to the env var /
 * default. Secrets are write-only: leave them empty to keep what's saved.
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const settings = useQuery({ ...settingsQueryOptions, enabled: open })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Optional extras. Saved on this server; everything works without
            them.
          </DialogDescription>
        </DialogHeader>
        {settings.data ? (
          <SettingsForm
            // Fresh form state each time it opens with new data.
            key={settings.dataUpdatedAt}
            view={settings.data}
            onDone={() => onOpenChange(false)}
          />
        ) : settings.error ? (
          <p className="text-sm text-destructive">{settings.error.message}</p>
        ) : (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SettingsForm({
  view,
  onDone,
}: {
  view: SettingsView
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  // Saved secrets the user asked to remove.
  const [removed, setRemoved] = useState<ReadonlySet<SettingKey>>(new Set())

  const save = useMutation({
    mutationFn: (data: SettingsInput) => updateSettings({ data }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries(settingsQueryOptions),
        queryClient.invalidateQueries(assistantEnabledQueryOptions),
      ])
      toast.add({ title: 'Settings saved', type: 'success' })
      onDone()
    },
    onError: (error) =>
      toast.add({
        title: "Couldn't save settings",
        description: error.message,
        type: 'error',
      }),
  })

  const test = useMutation({
    mutationFn: () => testReminder(),
    onSuccess: () =>
      toast.add({
        title: 'Test reminder sent',
        description: 'It should be on your phone now.',
        type: 'success',
      }),
    onError: (error) =>
      toast.add({
        title: "Couldn't send a reminder",
        description: error.message,
        type: 'error',
      }),
  })

  const form = useForm({
    // Only saved values; env values show as placeholders. Secrets start
    // empty (= keep).
    defaultValues: Object.fromEntries(
      SETTING_KEYS.map((key) => [
        key,
        !SETTINGS[key].secret && view[key].source === 'saved'
          ? view[key].value
          : '',
      ]),
    ) as Record<SettingKey, string>,
    onSubmit: ({ value }) => {
      const data: SettingsInput = {}
      for (const key of SETTING_KEYS) {
        if (!SETTINGS[key].secret) data[key] = value[key]
        else if (removed.has(key)) data[key] = ''
        else if (value[key].trim()) data[key] = value[key]
      }
      return save.mutateAsync(data)
    },
  })

  // The provider picked (or saved, or from the env): it changes the hints
  // and hides the base URL for Anthropic.
  const picked = useStore(form.store, (state) => state.values.LLM_PROVIDER)
  const provider =
    picked ||
    (view.LLM_PROVIDER.source === 'env' ? view.LLM_PROVIDER.value : '') ||
    'openai'
  const anthropic = provider === 'anthropic'
  const hint = (key: SettingKey) =>
    anthropic && key === 'LLM_MODEL'
      ? 'claude-opus-5-5'
      : anthropic && key === 'LLM_API_KEY'
        ? 'sk-ant-…'
        : SETTINGS[key].placeholder

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
      className="flex flex-col gap-6"
    >
      {GROUPS.map((group) => (
        <FieldSet key={group.legend}>
          <FieldLegend>{group.legend}</FieldLegend>
          <FieldDescription>{group.description}</FieldDescription>
          <FieldGroup>
            {group.keys.map((key) => (
              <form.Field
                key={key}
                name={key}
                children={(field) => {
                  const meta = SETTINGS[key]
                  const current = view[key]
                  const id = `setting-${key}`
                  if (key === 'LLM_BASE_URL' && anthropic) return null
                  if ('options' in meta) {
                    return (
                      <Field>
                        <FieldLabel htmlFor={id}>{meta.label}</FieldLabel>
                        <Select
                          items={meta.options}
                          value={provider}
                          onValueChange={(value) =>
                            field.handleChange(value ?? '')
                          }
                        >
                          <SelectTrigger id={id} className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {meta.options.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    )
                  }
                  if (!meta.secret) {
                    return (
                      <Field>
                        <FieldLabel htmlFor={id}>{meta.label}</FieldLabel>
                        <Input
                          id={id}
                          value={field.state.value}
                          placeholder={
                            current.source === 'env' ? current.value : hint(key)
                          }
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                        {current.source === 'env' && !field.state.value && (
                          <FieldDescription>
                            From the server’s environment. Type a value to
                            override it.
                          </FieldDescription>
                        )}
                      </Field>
                    )
                  }
                  const isRemoved = removed.has(key)
                  const saved = current.source !== null && !isRemoved
                  return (
                    <Field>
                      <FieldLabel htmlFor={id}>{meta.label}</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id={id}
                          type="password"
                          autoComplete="new-password"
                          value={field.state.value}
                          placeholder={
                            saved
                              ? `•••• ${current.hint ?? ''} (saved, type to replace)`
                              : hint(key)
                          }
                          onBlur={field.handleBlur}
                          onChange={(e) => {
                            field.handleChange(e.target.value)
                            if (isRemoved) {
                              setRemoved((prev) => {
                                const next = new Set(prev)
                                next.delete(key)
                                return next
                              })
                            }
                          }}
                        />
                        {current.source === 'saved' && !isRemoved && (
                          <InputGroupAddon align="inline-end">
                            <InputGroupButton
                              size="icon-xs"
                              aria-label={`Remove the saved ${meta.label}`}
                              title="Remove"
                              onClick={() => {
                                field.handleChange('')
                                setRemoved((prev) => new Set(prev).add(key))
                              }}
                            >
                              <XIcon />
                            </InputGroupButton>
                          </InputGroupAddon>
                        )}
                      </InputGroup>
                      {isRemoved ? (
                        <FieldDescription>
                          Removed when you save.
                        </FieldDescription>
                      ) : current.source === 'env' ? (
                        <FieldDescription>
                          Set in the server’s environment. Type a value to
                          override it.
                        </FieldDescription>
                      ) : null}
                    </Field>
                  )
                }}
              />
            ))}
          </FieldGroup>
          {group.keys.includes('NTFY_TOPIC') && (
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={test.isPending || view.NTFY_TOPIC.source === null}
                title={
                  view.NTFY_TOPIC.source === null
                    ? 'Save a topic first'
                    : 'Uses the saved settings'
                }
                onClick={() => test.mutate()}
              >
                {test.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <BellRingIcon data-icon="inline-start" />
                )}
                Send test reminder
              </Button>
            </div>
          )}
        </FieldSet>
      ))}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              Save
            </Button>
          )}
        />
      </DialogFooter>
    </form>
  )
}
