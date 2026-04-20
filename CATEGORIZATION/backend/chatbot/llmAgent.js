/**
 * LLM Agent — Handles complex / real-time queries
 *
 * Uses its OWN dedicated Gemini config (CHATBOT_*) from .env
 * so it is completely isolated from the rest of the app's LLM setup.
 *
 * For queries that need:
 *   - Real-time data (gold rates, tax rules, market info)
 *   - Complex reasoning / anomaly detection
 *   - Financial advice / planning
 */

const supabase = require('../config/supabaseClient');
const logger   = require('../utils/logger');
require('dotenv').config();

// ─── Chatbot-specific config (won't affect any other service) ────────
const CHATBOT_API_KEY = process.env.CHATBOT_GEMINI_API_KEY;
const CHATBOT_MODEL   = process.env.CHATBOT_LLM_MODEL || 'gemini-2.5-flash';

const { getFinancialPersona } = require('./statisticalAgent');

const SYSTEM_PROMPT = `You are LedgerBuddy, an intelligent AI financial assistant built into LedgerAI — a personal finance management app.

Your CORE mission is to provide personalized, data-driven financial insights. 

When user financial data is provided in the context:
1. **Analyze for tax savings**: If you see rent paid but few investments, suggest HRA and 80C options. If investments are low, remind about the ₹1.5L limit.
2. **Detect anomalies**: Mention if spending in a category is unusually high or if Recurring patterns look like unnecessary subscriptions.
3. **Be Specific**: Don't just give general tips. Say "I notice you've spent ₹X on Y, try Z to save."
4. **Disclaimers**: Always add: "This is for informational purposes only. Consult a certified financial advisor."

General Responsibilities:
- Real-time market info (Gold, Stocks, etc.)
- Indian Tax rules & Banking regulations
- Explaining complex financial concepts

Formatting:
- Use emojis (📊💰🔥📈🏦)
- **Bold** important numbers and terms
- Concise, bullet-pointed lists
- Currency: ₹ with Indian comma format (₹1,00,000)`;

/**
 * Call Google Gemini directly using the chatbot-dedicated API key.
 * This does NOT use llmService.js or any shared config.
 */
async function callChatbotLLM(messages, temperature = 0.4) {
  if (!CHATBOT_API_KEY || CHATBOT_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
    throw new Error('CHATBOT_GEMINI_API_KEY is not configured in .env');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHATBOT_MODEL}:generateContent?key=${CHATBOT_API_KEY}`;

  // Convert OpenAI-style messages → Google Gemini format
  const systemMsg  = messages.find(m => m.role === 'system');
  const userMsgs   = messages.filter(m => m.role !== 'system');

  const contents = userMsgs.map((m, idx) => {
    const text = idx === 0 && systemMsg
      ? `${systemMsg.content}\n\n${m.content}`
      : m.content;
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }]
    };
  });

  const body = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: 2048
    }
  };

  logger.info('Chatbot LLM call', { model: CHATBOT_MODEL, messageCount: messages.length });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    let errDetail = errText;
    try { errDetail = JSON.parse(errText)?.error?.message || errText; } catch {}
    throw new Error(`Gemini API error (${response.status}): ${errDetail}`);
  }

  const data    = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!content) throw new Error('Empty response from Gemini');
  return content;
}

/**
 * @param {string} query  - User's message
 * @param {string} userId - The authenticated user's UUID
 */
async function handleLLMQuery(query, userId) {
  logger.info('LLMAgent processing', { userId: userId?.slice(0,8), queryLength: query.length });

  // 1. Gather deep financial persona for context
  let financialContext = '';
  try {
    const persona = await getFinancialPersona(userId);
    if (persona) {
      financialContext = `\n\n[USER DATA CONTEXT - 90 DAYS]:\n${JSON.stringify(persona, null, 2)}`;
    }
  } catch (err) {
    logger.warn('Failed to fetch persona for LLM', { error: err.message });
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user',   content: `${query}${financialContext}` }
  ];

  try {
    const response = await callChatbotLLM(messages, 0.4);
    return { text: response, source: 'gemini-chatbot' };
  } catch (err) {
    logger.error('LLMAgent call failed', { error: err.message });

    return {
      text: `⚠️ I'm having trouble connecting to my AI engine right now.\n\nFor the question: "_${query}_"\n\nPlease try again in a moment, or ask me a data-related question (like "what's my top spending category?") which I can answer instantly from your data!`,
      source: 'fallback'
    };
  }
}

module.exports = { handleLLMQuery };
