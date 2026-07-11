/**
 * lib/litellm.js — Reusable LiteLLM Gateway HTTP client.
 *
 * Used by:
 *   - POST /api/alac/evaluate  (ALAC answer grading)
 *   - POST /api/generate        (Studio AI Generator — future)
 *
 * Supports:
 *   - Real mode: calls LiteLLM gateway when LLM_GATEWAY_URL is set
 *   - Mock mode: returns canned evaluations when gateway is unavailable
 *     (app works fully in demo/offline mode without API keys)
 *   - Multi-model fallback: tries primary model, falls back to secondary
 *   - Prompt injection defense: sanitizes user-provided text
 *   - JSON extraction: handles markdown-wrapped, preamble-prefixed responses
 *   - Retry: up to 2 retries on transient failures (5xx, timeout)
 */

const LLM_GATEWAY_URL = process.env.LLM_GATEWAY_URL || '';
const LLM_GATEWAY_KEY = process.env.LLM_GATEWAY_KEY || '';

const DEFAULTS = {
  model: process.env.LLM_MODEL || 'openrouter/anthropic/claude-sonnet-4',
  fallbackModel: process.env.LLM_FALLBACK_MODEL || 'openrouter/openai/gpt-4o-mini',
  temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
  maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '2000', 10),
  timeout: 30000,  // 30s
  retries: 2,
};

// =========================================================================
// Mock mode — returns a canned evaluation when no gateway is configured.
// This lets us build and test the full UI pipeline without API keys.
// =========================================================================
function generateMockEvaluation(factPattern, elements, confusion, answerData, mode) {
  let answer, law, application, conclusion;

  if (mode === 'freeform') {
    // In freeform mode, answerData is the full text — use heuristics to split
    const text = answerData || '';
    answer = text.length > 10 ? text.substring(0, Math.min(200, text.length)) : '';
    law = text.length > 20 ? text : '';
    application = text.length > 20 ? text : '';
    conclusion = text.length > 10 ? text.substring(Math.max(0, text.length - 200)) : '';
  } else {
    answer = answerData.answer || '';
    law = answerData.law || '';
    application = answerData.application || '';
    conclusion = answerData.conclusion || '';
  }
  const hasAnswer = answer && answer.length > 10;
  const hasLaw = law && law.length > 20;
  const hasSomeLaw = law && law.length >= 5;
  const hasApp = application && application.length > 20;
  const hasSomeApp = application && application.length >= 5;
  const hasConclusion = conclusion && conclusion.length > 10;

  const answerScore = hasAnswer ? 1 : 0;
  const lawScore = hasLaw ? (law.split(/\s+/).length >= 8 ? 3 : 2) : (hasSomeLaw ? 1 : 0);
  const appScore = hasApp ? (application.split(/\s+/).length >= 15 ? 4 : (application.split(/\s+/).length >= 8 ? 3 : 2)) : (hasSomeApp ? 1 : 0);
  const conclusionScore = hasConclusion ? 1 : 0;
  const clarityScore = (hasAnswer && hasLaw && hasApp) ? 1 : 0;
  const total = answerScore + lawScore + appScore + conclusionScore + clarityScore;

  const grade = total >= 8 ? 'PASS' : total >= 5 ? 'NEEDS WORK' : 'FAIL';

  const criticalErrors = [];
  if (!hasAnswer) criticalErrors.push('No direct answer provided. The Answer section must give a categorical yes/no response first.');
  if (!hasLaw) criticalErrors.push('No legal provision cited. The Law section must cite the specific Article and enumerate all elements.');
  if (!hasApp) criticalErrors.push('No application of law to facts. This is where most points are earned — map each element to specific facts.');
  if (hasAnswer && hasConclusion) {
    // Contradiction detection: check if answer is affirmative while conclusion is negative (or vice versa)
    // Use keyword matching with double-negative awareness
    const ansLower = answer.toLowerCase();
    const concLower = conclusion.toLowerCase();
    const yesWords = /\b(yes|liable|valid|granted|guilty|proper|allowed|constitutional)\b/;
    const noWords = /\b(no\b|not\s+liable|not\s+valid|invalid|denied|not\s+guilty|improper|not\s+allowed|unconstitutional)\b/;
    
    const ansIsYes = yesWords.test(ansLower) && !noWords.test(ansLower);
    const ansIsNo = noWords.test(ansLower);
    const concIsYes = yesWords.test(concLower) && !noWords.test(concLower);
    const concIsNo = noWords.test(concLower);
    
    if ((ansIsYes && concIsNo) || (ansIsNo && concIsYes)) {
      criticalErrors.push('Answer and Conclusion contradict each other. They must be consistent.');
    }
  }

  const triggeredConfusion = confusion && law && (() => {
    const confLower = confusion.toLowerCase();
    const lawLower = law.toLowerCase();
    
    // Strategy 1: Extract the FIRST article reference from confusion text
    // (convention: "wrong_provision vs correct_provision" → first is the trap)
    const firstArticleRef = confLower.match(/\bart\.?\s*\d+[a-z]?\b/i);
    if (firstArticleRef && lawLower.includes(firstArticleRef[0])) return true;
    
    // Strategy 2: Extract key phrase before "vs" or "::" separator
    const separatorMatch = confLower.match(/^(.+?)\s*(?:vs\.?|::|—|–|-)\s*/);
    if (separatorMatch) {
      const trapPhrase = separatorMatch[1].trim();
      if (trapPhrase.length > 5 && lawLower.includes(trapPhrase)) return true;
    }
    
    // Strategy 3: Check first 20 chars as fallback
    const shortPhrase = confLower.substring(0, 20).replace(/[^a-z0-9\s]/g, '').trim();
    if (shortPhrase.length > 5 && lawLower.includes(shortPhrase)) return true;
    
    return false;
  })();

  return {
    scores: {
      answer: answerScore,
      law: lawScore,
      application: appScore,
      conclusion: conclusionScore,
      clarity: clarityScore,
      total
    },
    feedback: {
      answer: hasAnswer
        ? 'You provided a direct answer — good. Philippine bar examiners expect a categorical yes/no response in the first sentence.'
        : 'No direct answer found. The Answer section must open with a categorical response (e.g., "Yes, the contract is void."). Never hedge or say "it depends."',
      law: hasLaw
        ? 'You cited a legal provision. Ensure ALL elements are enumerated completely — missing even one element means the answer is legally insufficient.'
        : 'No legal provision was cited. The Law section must state the exact Article/Section and enumerate every element. This is worth 3/10 points.',
      application: hasApp
        ? 'You attempted to apply the law to facts. For maximum points, apply EACH element systematically: state the element, cite the specific fact, then conclude whether the element is satisfied.'
        : 'No application of law to facts found. The Application section carries 4/10 points — map each element to the specific facts given. This is where examiners award the most points.',
      conclusion: hasConclusion
        ? 'Conclusion present. Ensure it restates your Answer and is consistent with your reasoning throughout.'
        : 'No conclusion provided. Restate your answer in one sentence with the legal basis.',
      overall: `Overall score: ${total}/10 (${grade}). ${criticalErrors.length > 0 ? 'Address the critical errors flagged below. ' : ''}Focus on improving the Application section — this is where Philippine bar examiners award 60-70% of points.`
    },
    critical_errors: criticalErrors,
    confusion_trap: {
      triggered: !!triggeredConfusion,
      explanation: triggeredConfusion
        ? `You may have fallen for the common confusion: "${confusion}". Review the distinction carefully.`
        : ''
    },
    model_answer: {
      answer: hasAnswer ? answer.substring(0, 200) : '[Model answer not available in mock mode]',
      law: `The correct provision is listed under the Answer Key below. Enumerate all ${elements.length} elements completely.`,
      application: `For each of the ${elements.length} elements, state: (1) what the element requires, (2) what the facts show, (3) whether the element is satisfied.`,
      conclusion: 'Therefore, [party] is [liable/not liable] under [Article] because [key reason].'
    },
    grade,
    meta: {
      model: 'mock',
      tokens_used: 0,
      latency_ms: 0,
      mock: true
    }
  };
}

// =========================================================================
// Real LLM call via LiteLLM gateway
// =========================================================================
async function callLiteLLM(systemPrompt, userPrompt, options = {}) {
  const model = options.model || DEFAULTS.model;
  const temperature = options.temperature ?? DEFAULTS.temperature;
  const maxTokens = options.maxTokens || DEFAULTS.maxTokens;
  const timeout = options.timeout || DEFAULTS.timeout;

  const url = `${LLM_GATEWAY_URL}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_GATEWAY_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: options.responseFormat !== undefined ? (options.responseFormat || undefined) : { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const err = new Error(`LiteLLM gateway returned ${response.status}: ${errorBody.substring(0, 200)}`);
      err.status = response.status;
      err.body = errorBody;
      throw err;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};
    const actualModel = data.model || model;

    return { content, usage, model: actualModel };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`LiteLLM call timed out after ${timeout / 1000}s`);
      timeoutErr.code = 'TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  }
}

// =========================================================================
// Prompt injection defense — strip common injection patterns from user text
// =========================================================================
function sanitizeUserInput(text) {
  if (!text) return '';
  return text
    // Strip "IGNORE PREVIOUS" / "SYSTEM:" / "OVERRIDE" injection attempts
    .replace(/\b(IGNORE|OVERRIDE|DISREGARD)\s+(PREVIOUS|ALL|ABOVE|PRIOR)\s+(INSTRUCTIONS?|RULES?|DIRECTIVES?|CONTEXT)\b/gi, '[INJECTION BLOCKED]')
    .replace(/\bSYSTEM:\s*/gi, 'User wrote: ')
    .replace(/\bASSISTANT:\s*/gi, 'User wrote: ')
    .replace(/\bHUMAN:\s*/gi, 'User wrote: ')
    // Strip markdown code fences that might contain injection
    .replace(/```[a-z]*\s*system\s*\n[\s\S]*?```/gi, '[CODE BLOCK REMOVED]')
    .replace(/```[a-z]*\s*assistant\s*\n[\s\S]*?```/gi, '[CODE BLOCK REMOVED]')
    // Truncate to reasonable length
    .substring(0, 5000);
}

// =========================================================================
// JSON extraction — handles LLM responses that aren't pure JSON
// =========================================================================
function extractJSON(rawContent) {
  // 1. Try direct parse
  try {
    return JSON.parse(rawContent);
  } catch (_) { /* continue */ }

  // 2. Try extracting from ```json ... ``` block
  const fenceMatch = rawContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) { /* continue */ }
  }

  // 3. Try finding first { ... } pair (greedy match from first { to last })
  const braceMatch = rawContent.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch (_) { /* continue */ }
  }

  // 4. Try finding balanced braces (non-greedy)
  let depth = 0;
  let start = -1;
  for (let i = 0; i < rawContent.length; i++) {
    if (rawContent[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (rawContent[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          return JSON.parse(rawContent.substring(start, i + 1));
        } catch (_) { /* continue */ }
        start = -1;
      }
    }
  }

  return null;
}

// =========================================================================
// Public API
// =========================================================================

/**
 * Call the LLM for ALAC evaluation.
 *
 * @param {string} systemPrompt - System prompt from prompts/alac-evaluation.txt
 * @param {object} userData - { factPattern, provision, elements, confusion,
 *                              answer, law, application, conclusion }
 * @param {object} options - Override defaults (model, temperature, etc.)
 * @returns {object} Evaluation result (scores, feedback, model_answer, etc.)
 */
async function evaluateALAC(systemPrompt, userData, options = {}) {
  // Build user prompt from structured data
  const userPrompt = buildUserPrompt(userData);

  // If gateway is not configured, use mock mode
  if (!LLM_GATEWAY_URL || !LLM_GATEWAY_KEY) {
    console.log('[litellm] Gateway not configured — using mock evaluation');
    const answerData = userData.mode === 'freeform'
      ? userData.freeform
      : { answer: userData.answer, law: userData.law, application: userData.application, conclusion: userData.conclusion };
    return generateMockEvaluation(
      userData.factPattern, userData.elements, userData.confusion,
      answerData, userData.mode || 'segmented'
    );
  }

  const startTime = Date.now();
  let lastError = null;

  // Try primary model, fall back to secondary on failure
  const models = [options.model || DEFAULTS.model];
  if (DEFAULTS.fallbackModel && DEFAULTS.fallbackModel !== models[0]) {
    models.push(DEFAULTS.fallbackModel);
  }

  for (let attempt = 0; attempt <= DEFAULTS.retries; attempt++) {
    const model = models[Math.min(attempt, models.length - 1)];

    try {
      console.log(`[litellm] Calling ${model} (attempt ${attempt + 1}/${DEFAULTS.retries + 1})`);
      const { content, usage, model: actualModel } = await callLiteLLM(systemPrompt, userPrompt, {
        ...options,
        model,
      });

      const parsed = extractJSON(content);
      if (!parsed) {
        throw new Error('LLM response was not valid JSON');
      }

      // Validate required structure
      validateEvaluationStructure(parsed);

      const latency = Date.now() - startTime;
      parsed.meta = {
        model: actualModel,
        tokens_used: usage.total_tokens || 0,
        latency_ms: latency,
        mock: false,
        attempt: attempt + 1,
      };

      return parsed;
    } catch (err) {
      lastError = err;
      console.warn(`[litellm] Attempt ${attempt + 1} failed (${model}): ${err.message}`);

      // Only retry on transient errors (5xx, timeout, network)
      if (err.status && err.status < 500 && err.status !== 429) {
        break; // Don't retry client errors (4xx except 429)
      }
      if (err.code === 'TIMEOUT' && attempt < DEFAULTS.retries) {
        continue; // Retry on timeout
      }
      if (attempt >= DEFAULTS.retries) {
        break;
      }
    }
  }

  // All attempts failed — fall back to mock mode with error note
  console.warn(`[litellm] All LLM attempts failed — falling back to mock evaluation. Last error: ${lastError?.message}`);
  const answerData = userData.mode === 'freeform'
    ? userData.freeform
    : { answer: userData.answer, law: userData.law, application: userData.application, conclusion: userData.conclusion };
  const mockResult = generateMockEvaluation(
    userData.factPattern, userData.elements, userData.confusion,
    answerData, userData.mode || 'segmented'
  );
  mockResult._fallback_reason = lastError?.message || 'All LLM attempts failed';
  return mockResult;
}

// =========================================================================
// Internal helpers
// =========================================================================

function buildUserPrompt(data) {
  const elementsText = (data.elements || [])
    .map((e, i) => `${i + 1}. ${e}`)
    .join('\n');

  if (data.mode === 'freeform') {
    return `Evaluate this student's ALAC answer against the model answer key.
The student wrote their answer in FREEFORM MODE — a single continuous text.
You must identify which parts of their answer correspond to each ALAC section
(Answer, Law, Application, Conclusion), then evaluate each section using the
standard rubric.

FACT_PATTERN:
${data.factPattern || '[No fact pattern provided]'}

MODEL_PROVISION:
${data.provision || '[No provision provided]'}

MODEL_ELEMENTS:
${elementsText || '[No elements provided]'}

MODEL_CONFUSION:
${data.confusion || 'None specified'}

STUDENT'S FREEFORM ANSWER:
${sanitizeUserInput(data.freeform) || '[No answer provided]'}

Return ONLY the JSON evaluation. No markdown, no explanation outside the JSON.`;
  }

  return `Evaluate this student's ALAC answer against the model answer key.

FACT_PATTERN:
${data.factPattern || '[No fact pattern provided]'}

MODEL_PROVISION:
${data.provision || '[No provision provided]'}

MODEL_ELEMENTS:
${elementsText || '[No elements provided]'}

MODEL_CONFUSION:
${data.confusion || 'None specified'}

STUDENT'S ANSWER (A):
${sanitizeUserInput(data.answer) || '[No answer provided]'}

STUDENT'S LAW (L):
${sanitizeUserInput(data.law) || '[No law cited]'}

STUDENT'S APPLICATION (App):
${sanitizeUserInput(data.application) || '[No application provided]'}

STUDENT'S CONCLUSION (C):
${sanitizeUserInput(data.conclusion) || '[No conclusion provided]'}

Return ONLY the JSON evaluation. No markdown, no explanation outside the JSON.`;
}

function validateEvaluationStructure(parsed) {
  const required = ['scores', 'feedback', 'critical_errors', 'model_answer', 'grade'];
  const missing = required.filter(k => !(k in parsed));
  if (missing.length > 0) {
    throw new Error(`Evaluation missing required fields: ${missing.join(', ')}`);
  }

  const scoreFields = ['answer', 'law', 'application', 'conclusion', 'clarity', 'total'];
  const missingScores = scoreFields.filter(k => !(k in (parsed.scores || {})));
  if (missingScores.length > 0) {
    throw new Error(`Evaluation.scores missing fields: ${missingScores.join(', ')}`);
  }

  const feedbackFields = ['answer', 'law', 'application', 'conclusion', 'overall'];
  const missingFeedback = feedbackFields.filter(k => !(k in (parsed.feedback || {})));
  if (missingFeedback.length > 0) {
    throw new Error(`Evaluation.feedback missing fields: ${missingFeedback.join(', ')}`);
  }

  if (!Array.isArray(parsed.critical_errors)) {
    throw new Error('Evaluation.critical_errors must be an array');
  }

  const modelAnswerFields = ['answer', 'law', 'application', 'conclusion'];
  const missingMA = modelAnswerFields.filter(k => !(k in (parsed.model_answer || {})));
  if (missingMA.length > 0) {
    throw new Error(`Evaluation.model_answer missing fields: ${missingMA.join(', ')}`);
  }
}

async function generateFlashcards(systemPrompt, prompt, groundingContext, options = {}) {
  const userPrompt = `USER REQUEST: ${prompt}\n\n${groundingContext}\n\nGenerate flashcards based on the instructions. Provide the output in markdown code blocks.`;

  if (!LLM_GATEWAY_URL || !LLM_GATEWAY_KEY) {
    // Mock generation when gateway is unavailable
    const mockCards = [];
    const paras = options.paragraphIds || [];
    const count = Math.max(1, paras.length);
    for (let i = 0; i < count; i++) {
      const pId = paras[i] || 'mock-source-p1';
      mockCards.push(`CARD gen-${i + 1}
FRONT (shape): Abstracted fact pattern related to prompt: "${prompt}" (Mock #${i + 1}).
FRONT (trigger words): trigger, keyphrase, signal
BACK (provision): Art. 1544 - Double Sale (Mock)
BACK (elements):
1. First buyer valid sale
2. Second buyer valid sale
BACK (common confusion): Art. 1458 - Sale :: Distinction is double sale requires two sales.
SOURCE: Civil Code Art. 1544
SOURCE_PARAGRAPH: ${pId}`);
    }
    return mockCards.join('\n\n');
  }

  try {
    const response = await callLiteLLM(systemPrompt, userPrompt, {
      model: options.model || process.env.LLM_MODEL || 'openrouter/anthropic/claude-sonnet-4',
      maxTokens: 4000,
      temperature: 0.2,
      responseFormat: null
    });
    return response.content;
  } catch (err) {
    throw new Error(`LLM generation failed: ${err.message}`);
  }
}

// =========================================================================
// Exports
// =========================================================================
module.exports = {
  evaluateALAC,
  extractJSON,
  sanitizeUserInput,
  validateEvaluationStructure,
  buildUserPrompt,
  generateFlashcards,
  // Re-export for testing
  _internal: {
    generateMockEvaluation,
    callLiteLLM,
    DEFAULTS,
  },
};
