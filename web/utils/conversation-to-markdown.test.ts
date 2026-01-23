import { describe, it, expect } from 'vitest'
import { conversationToMarkdown } from './conversation-to-markdown'
import type { ConversationMessage, ContentBlock } from '@claude-run/api'

// Helper to create a basic message
function createMessage(
  type: 'user' | 'assistant' | 'summary' | 'file-history-snapshot',
  content: string | ContentBlock[]
): ConversationMessage {
  return {
    type,
    message: {
      role: type === 'user' ? 'user' : 'assistant',
      content,
    },
  }
}

describe('conversationToMarkdown', () => {
  it('returns just header for empty messages array', () => {
    const result = conversationToMarkdown([])
    expect(result).toBe('# Conversation')
  })

  it('filters out summary message type', () => {
    const messages: ConversationMessage[] = [
      { type: 'summary', summary: 'This is a summary' },
      createMessage('user', 'Hello'),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).not.toContain('summary')
    expect(result).toContain('Hello')
  })

  it('filters out file-history-snapshot message type', () => {
    const messages: ConversationMessage[] = [
      { type: 'file-history-snapshot' as const },
      createMessage('user', 'Hello'),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('Hello')
    // Should only have header and one message
    expect(result.split('---').length).toBe(2)
  })

  it('joins messages with --- separators', () => {
    const messages: ConversationMessage[] = [
      createMessage('user', 'Hello'),
      createMessage('assistant', 'Hi there'),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('\n\n---\n\n')
  })

  it('preserves message order', () => {
    const messages: ConversationMessage[] = [
      createMessage('user', 'First'),
      createMessage('assistant', 'Second'),
      createMessage('user', 'Third'),
    ]
    const result = conversationToMarkdown(messages)
    const firstIndex = result.indexOf('First')
    const secondIndex = result.indexOf('Second')
    const thirdIndex = result.indexOf('Third')
    expect(firstIndex).toBeLessThan(secondIndex)
    expect(secondIndex).toBeLessThan(thirdIndex)
  })
})

describe('formatMessage (via conversationToMarkdown)', () => {
  it('formats user message with string content', () => {
    const messages: ConversationMessage[] = [createMessage('user', 'Hello world')]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('## User')
    expect(result).toContain('Hello world')
  })

  it('formats assistant message with string content', () => {
    const messages: ConversationMessage[] = [createMessage('assistant', 'Hi there')]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('## Assistant')
    expect(result).toContain('Hi there')
  })

  it('formats message with array of ContentBlocks', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'text', text: 'Part one' },
        { type: 'text', text: 'Part two' },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('Part one')
    expect(result).toContain('Part two')
  })

  it('skips messages with no content', () => {
    const messages: ConversationMessage[] = [
      { type: 'user', message: { role: 'user', content: '' } },
      createMessage('assistant', 'Valid message'),
    ]
    const result = conversationToMarkdown(messages)
    // Should only have header and one message (2 parts split by ---)
    expect(result.split('---').length).toBe(2)
    expect(result).toContain('Valid message')
  })

  it('skips messages with undefined message', () => {
    const messages: ConversationMessage[] = [
      { type: 'user' },
      createMessage('assistant', 'Valid message'),
    ]
    const result = conversationToMarkdown(messages)
    expect(result.split('---').length).toBe(2)
  })

  it('skips messages with empty content after formatting', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [{ type: 'tool_result', content: 'success' }]),
      createMessage('user', 'Real content'),
    ]
    const result = conversationToMarkdown(messages)
    // tool_result without error is null, so message should be skipped
    expect(result).not.toContain('## Assistant')
    expect(result).toContain('## User')
  })
})

describe('text blocks', () => {
  it('preserves plain text', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [{ type: 'text', text: 'Plain text content' }]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('Plain text content')
  })

  it('sanitizes system-reminder tags', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'text', text: 'Before <system-reminder>secret stuff</system-reminder> After' },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).not.toContain('system-reminder')
    expect(result).not.toContain('secret stuff')
    expect(result).toContain('Before')
    expect(result).toContain('After')
  })

  it('sanitizes command tags', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'text', text: 'Text <command-name>cmd</command-name> more' },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).not.toContain('command-name')
    expect(result).not.toContain('cmd')
    expect(result).toContain('Text')
    expect(result).toContain('more')
  })

  it('returns null for empty text', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [{ type: 'text', text: '' }]),
      createMessage('user', 'Valid'),
    ]
    const result = conversationToMarkdown(messages)
    // Empty text block results in empty message, which gets skipped
    expect(result).not.toContain('## Assistant')
    expect(result).toContain('## User')
  })

  it('handles text block with undefined text', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [{ type: 'text' }]),
      createMessage('user', 'Valid'),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).not.toContain('## Assistant')
    expect(result).toContain('## User')
  })
})

describe('thinking blocks', () => {
  it('wraps thinking in collapsible details element', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [{ type: 'thinking', thinking: 'My thought process' }]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('<details>')
    expect(result).toContain('<summary>Thinking...</summary>')
    expect(result).toContain('My thought process')
    expect(result).toContain('</details>')
  })

  it('returns null for missing thinking content', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [{ type: 'thinking' }]),
      createMessage('user', 'Valid'),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).not.toContain('Thinking')
  })

  it('returns null for empty thinking content', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [{ type: 'thinking', thinking: '' }]),
      createMessage('user', 'Valid'),
    ]
    const result = conversationToMarkdown(messages)
    // Empty thinking is falsy, so returns null
    expect(result).not.toContain('<details>')
  })
})

describe('tool use blocks', () => {
  it('shows Bash command in bash code block', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('**[Tool: Bash]**')
    expect(result).toContain('```bash')
    expect(result).toContain('ls -la')
    expect(result).toContain('```')
  })

  it('shows Read file_path in inline code', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'tool_use', name: 'Read', input: { file_path: '/path/to/file.ts' } },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('**[Tool: Read]**')
    expect(result).toContain('`/path/to/file.ts`')
  })

  it('shows Write file_path in inline code', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'tool_use', name: 'Write', input: { file_path: '/path/to/output.ts' } },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('**[Tool: Write]**')
    expect(result).toContain('`/path/to/output.ts`')
  })

  it('shows Edit file_path in inline code', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'tool_use', name: 'Edit', input: { file_path: '/path/to/edit.ts' } },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('**[Tool: Edit]**')
    expect(result).toContain('`/path/to/edit.ts`')
  })

  it('shows Glob pattern with label', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'tool_use', name: 'Glob', input: { pattern: '**/*.ts' } },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('**[Tool: Glob]**')
    expect(result).toContain('Pattern: `**/*.ts`')
  })

  it('shows Grep pattern with label', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'tool_use', name: 'Grep', input: { pattern: 'function\\s+\\w+' } },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('**[Tool: Grep]**')
    expect(result).toContain('Pattern: `function\\s+\\w+`')
  })

  it('shows Task prompt truncated at 200 chars', () => {
    const longPrompt = 'A'.repeat(250)
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'tool_use', name: 'Task', input: { prompt: longPrompt } },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('**[Tool: Task]**')
    expect(result).toContain('A'.repeat(200) + '...')
    expect(result).not.toContain('A'.repeat(201))
  })

  it('shows Task prompt without truncation if under 200 chars', () => {
    const shortPrompt = 'Do something simple'
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'tool_use', name: 'Task', input: { prompt: shortPrompt } },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain(shortPrompt)
    expect(result).not.toContain('...')
  })

  it('shows JSON of key fields for other tools', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'tool_use', name: 'WebFetch', input: { url: 'https://example.com', query: 'test' } },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('**[Tool: WebFetch]**')
    expect(result).toContain('```json')
    expect(result).toContain('"url": "https://example.com"')
    expect(result).toContain('"query": "test"')
  })

  it('shows just tool name when no input provided', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [{ type: 'tool_use', name: 'SomeTool' }]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('**[Tool: SomeTool]**')
    // Should not have any additional content after the tool name line
    expect(result).not.toContain('```')
    expect(result).not.toContain('Pattern')
  })

  it('shows Unknown Tool when name is missing', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [{ type: 'tool_use' }]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('**[Tool: Unknown Tool]**')
  })

  it('handles tool with input but no matching key fields', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'tool_use', name: 'CustomTool', input: { customField: 'value' } },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('**[Tool: CustomTool]**')
    // No key fields matched, so no JSON block
    expect(result).not.toContain('```json')
  })
})

describe('tool result blocks', () => {
  it('returns null for non-error results', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'tool_result', content: 'Success output', is_error: false },
      ]),
      createMessage('user', 'Continue'),
    ]
    const result = conversationToMarkdown(messages)
    // Non-error tool results are omitted
    expect(result).not.toContain('Success output')
    expect(result).not.toContain('## Assistant')
  })

  it('returns null for result without is_error flag', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [{ type: 'tool_result', content: 'Output' }]),
      createMessage('user', 'Continue'),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).not.toContain('Output')
  })

  it('shows error results in code block with Error label', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'tool_result', content: 'Command failed with exit code 1', is_error: true },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('**[Error]**')
    expect(result).toContain('```')
    expect(result).toContain('Command failed with exit code 1')
  })

  it('JSON stringifies object error content', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        {
          type: 'tool_result',
          content: { error: 'Not found', code: 404 },
          is_error: true,
        },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('**[Error]**')
    expect(result).toContain('"error":"Not found"')
    expect(result).toContain('"code":404')
  })

  it('handles error with empty content', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [{ type: 'tool_result', content: '', is_error: true }]),
      createMessage('user', 'Continue'),
    ]
    const result = conversationToMarkdown(messages)
    // Empty content with is_error=true but falsy content, so returns null
    expect(result).not.toContain('**[Error]**')
  })
})

describe('mixed content scenarios', () => {
  it('handles message with multiple block types', () => {
    const messages: ConversationMessage[] = [
      createMessage('assistant', [
        { type: 'thinking', thinking: 'Let me think...' },
        { type: 'text', text: 'Here is my response' },
        { type: 'tool_use', name: 'Bash', input: { command: 'echo hello' } },
      ]),
    ]
    const result = conversationToMarkdown(messages)
    expect(result).toContain('<details>')
    expect(result).toContain('Let me think...')
    expect(result).toContain('Here is my response')
    expect(result).toContain('**[Tool: Bash]**')
    expect(result).toContain('echo hello')
  })

  it('handles full conversation flow', () => {
    const messages: ConversationMessage[] = [
      createMessage('user', 'List files in current directory'),
      createMessage('assistant', [
        { type: 'text', text: 'I will list the files for you.' },
        { type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } },
      ]),
      createMessage('user', 'Thanks!'),
      createMessage('assistant', 'You are welcome!'),
    ]
    const result = conversationToMarkdown(messages)

    // Check structure
    expect(result.startsWith('# Conversation')).toBe(true)
    expect(result.split('---').length).toBe(5) // header + 4 messages

    // Check content
    expect(result).toContain('## User\n\nList files')
    expect(result).toContain('## Assistant\n\nI will list')
    expect(result).toContain('**[Tool: Bash]**')
    expect(result).toContain('Thanks!')
    expect(result).toContain('You are welcome!')
  })
})
