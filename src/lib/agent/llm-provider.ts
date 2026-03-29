import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export type LlmProvider = 'claude' | 'gemini' | 'openai';

export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmStreamChunk {
  type: 'text' | 'done' | 'error';
  text?: string;
  error?: string;
}

export async function* streamLlmResponse(
  provider: LlmProvider,
  messages: LlmMessage[],
  systemPrompt: string,
  scheduleContext: string
): AsyncGenerator<LlmStreamChunk> {
  // Filter messages to only user/assistant (strip system from array)
  const conversationMessages = messages.filter((m) => m.role !== 'system');

  // Inject schedule context into the last user message
  const enrichedMessages: LlmMessage[] = conversationMessages.map((m, i) => {
    if (m.role === 'user' && i === conversationMessages.length - 1) {
      return { ...m, content: `${scheduleContext}\n\n---\n\n${m.content}` };
    }
    return m;
  });

  if (provider === 'claude') {
    yield* streamClaude(enrichedMessages, systemPrompt);
  } else if (provider === 'gemini') {
    yield* streamGemini(enrichedMessages, systemPrompt);
  } else if (provider === 'openai') {
    yield* streamOpenAI(enrichedMessages, systemPrompt);
  } else {
    yield { type: 'error', error: `Unknown provider: ${provider}` };
  }
}

async function* streamClaude(
  messages: LlmMessage[],
  systemPrompt: string
): AsyncGenerator<LlmStreamChunk> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield {
      type: 'error',
      error: 'Claude API key not configured. Set ANTHROPIC_API_KEY in environment variables.',
    };
    return;
  }

  const client = new Anthropic({ apiKey });

  const anthropicMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield { type: 'text', text: event.delta.text };
      }
    }
    yield { type: 'done' };
  } catch (err) {
    yield {
      type: 'error',
      error: err instanceof Error ? err.message : 'Claude streaming error',
    };
  }
}

async function* streamGemini(
  messages: LlmMessage[],
  systemPrompt: string
): AsyncGenerator<LlmStreamChunk> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    yield {
      type: 'error',
      error: 'Gemini API key not configured. Set GOOGLE_AI_API_KEY in environment variables.',
    };
    return;
  }

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
  });

  // Convert to Gemini history format
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const lastMessage = messages[messages.length - 1];
  const chat = model.startChat({ history });

  try {
    const result = await chat.sendMessageStream(lastMessage?.content ?? '');
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield { type: 'text', text };
      }
    }
    yield { type: 'done' };
  } catch (err) {
    yield {
      type: 'error',
      error: err instanceof Error ? err.message : 'Gemini streaming error',
    };
  }
}

async function* streamOpenAI(
  messages: LlmMessage[],
  systemPrompt: string
): AsyncGenerator<LlmStreamChunk> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    yield {
      type: 'error',
      error: 'OpenAI API key not configured. Set OPENAI_API_KEY in environment variables.',
    };
    return;
  }

  const client = new OpenAI({ apiKey });

  const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  try {
    const stream = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: openAIMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield { type: 'text', text: delta };
      }
    }
    yield { type: 'done' };
  } catch (err) {
    yield {
      type: 'error',
      error: err instanceof Error ? err.message : 'OpenAI streaming error',
    };
  }
}
