# Memorium — API Integration Guide

**Purpose**: Specific implementation details for Claude API question generation  
**Reference**: Use this when implementing Step 3 (Claude API Integration) in BUILD-PLAN.md

---

## Claude API Overview

### Endpoint
```
POST https://api.anthropic.com/v1/messages
```

### Authentication
```javascript
headers: {
  'Content-Type': 'application/json',
  'x-api-key': process.env.ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01'
}
```

### Model Choice
**Use**: `claude-sonnet-4-20250514`

**Why Sonnet (not Opus or Haiku)**:
- ✅ Fast enough (~5-10 seconds for 20 questions)
- ✅ High quality (better than Haiku, good enough vs Opus)
- ✅ Cost-effective (~$0.015 per document)

**Don't use Opus**: 3x cost, marginal quality improvement  
**Don't use Haiku**: Too fast, but question quality suffers

---

## Question Generation Prompt (v1)

### Full Prompt Template

```javascript
const QUESTION_GENERATION_PROMPT = `You are a learning assistant that creates high-quality study questions. Generate exactly 20 questions from the following content.

Create a balanced mix of three question types:
1. **Recall questions** (40%): Test memorization of key facts, concepts, definitions, or specific details. Ask "What", "Who", "When", "Where" questions.
2. **Application questions** (40%): Test ability to apply concepts to new scenarios or examples. Ask "How would you...", "What would happen if...", "Apply this to..."
3. **Connection questions** (20%): Test ability to relate ideas, compare/contrast concepts, or see broader patterns. Ask "How does X relate to Y?", "What's the connection between...", "Compare and contrast..."

For each question, provide:
- **question**: The question text (clear, specific, answerable from the content)
- **type**: One of: "recall", "application", "connection"
- **correctAnswer**: The complete correct answer (2-4 sentences)
- **explanation**: Why this answer is correct + additional context (2-3 sentences)
- **sourceReference**: Direct quote from the content that supports this answer (1-2 sentences max)

IMPORTANT RULES:
- Questions must be answerable from the provided content (no external knowledge required)
- Avoid yes/no questions (ask for explanations instead)
- Vary difficulty (mix easy, medium, hard)
- Don't repeat information across questions
- Keep questions focused (one concept per question)

Content to learn:
${content}

Respond ONLY with a JSON array in this exact format (no markdown, no backticks, no preamble):
[
  {
    "question": "Question text here?",
    "type": "recall",
    "correctAnswer": "The correct answer in 2-4 sentences.",
    "explanation": "Why this is correct and additional context.",
    "sourceReference": "Direct quote from the content."
  }
]

Generate exactly 20 questions now.`;
```

### Prompt Design Notes

**Why these percentages (40/40/20)**:
- Recall questions are essential for memory consolidation
- Application questions test deeper understanding
- Connection questions are hardest to generate well, so fewer
- This mix worked well in original build

**Why specific JSON format**:
- Predictable structure = easier to parse
- No markdown/backticks = no cleanup needed
- Explicit "respond ONLY with" = reduces preamble

**Why include source reference**:
- Grounds answers in the content (prevents hallucination)
- Useful for user to see where answer came from
- Forces Claude to find supporting evidence

---

## Implementation (`/lib/ai/generate-questions.js`)

### Complete Function

```javascript
/**
 * Generate 20 questions from document content using Claude API
 * @param {string} content - Document text (required)
 * @param {string} title - Document title (for context)
 * @param {string} themes - Comma-separated themes (for context)
 * @returns {Promise<Array>} Array of 20 question objects
 */
export async function generateQuestions(content, title = '', themes = '') {
  const MAX_RETRIES = 3;
  const INITIAL_DELAY_MS = 1000;
  
  // Validate input
  if (!content || content.trim().length < 100) {
    throw new Error('Content too short (minimum 100 characters)');
  }
  
  // Build prompt
  const prompt = `You are a learning assistant that creates high-quality study questions. Generate exactly 20 questions from the following content.

${title ? `Document title: ${title}\n` : ''}${themes ? `Themes: ${themes}\n` : ''}

Create a balanced mix of three question types:
1. **Recall questions** (40%): Test memorization of key facts, concepts, definitions, or specific details.
2. **Application questions** (40%): Test ability to apply concepts to new scenarios or examples.
3. **Connection questions** (20%): Test ability to relate ideas, compare/contrast concepts, or see broader patterns.

For each question, provide:
- **question**: The question text (clear, specific, answerable from the content)
- **type**: One of: "recall", "application", "connection"
- **correctAnswer**: The complete correct answer (2-4 sentences)
- **explanation**: Why this answer is correct + additional context (2-3 sentences)
- **sourceReference**: Direct quote from the content that supports this answer (1-2 sentences max)

IMPORTANT RULES:
- Questions must be answerable from the provided content
- Avoid yes/no questions
- Vary difficulty (mix easy, medium, hard)
- Don't repeat information across questions
- Keep questions focused (one concept per question)

Content to learn:
${content}

Respond ONLY with a JSON array (no markdown, no backticks, no preamble):
[
  {
    "question": "Question text?",
    "type": "recall",
    "correctAnswer": "Answer in 2-4 sentences.",
    "explanation": "Why this is correct and context.",
    "sourceReference": "Direct quote from content."
  }
]

Generate exactly 20 questions now.`;

  // Retry logic with exponential backoff
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Extract text from response
      const text = data.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
      
      // Clean response (remove markdown fences if present)
      const cleanText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      // Parse JSON
      let questions;
      try {
        questions = JSON.parse(cleanText);
      } catch (parseError) {
        throw new Error(`Failed to parse Claude response as JSON: ${parseError.message}`);
      }
      
      // Validate response structure
      if (!Array.isArray(questions)) {
        throw new Error('Claude response is not an array');
      }
      
      if (questions.length !== 20) {
        throw new Error(`Expected 20 questions, got ${questions.length}`);
      }
      
      // Validate each question has required fields
      const requiredFields = ['question', 'type', 'correctAnswer', 'explanation', 'sourceReference'];
      for (const [index, q] of questions.entries()) {
        for (const field of requiredFields) {
          if (!q[field] || typeof q[field] !== 'string') {
            throw new Error(`Question ${index + 1} missing or invalid field: ${field}`);
          }
        }
        
        // Validate type
        if (!['recall', 'application', 'connection'].includes(q.type)) {
          throw new Error(`Question ${index + 1} has invalid type: ${q.type}`);
        }
      }
      
      // Success!
      return questions;
      
    } catch (error) {
      console.error(`Attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);
      
      // If last attempt, throw error
      if (attempt === MAX_RETRIES) {
        throw new Error(`Failed to generate questions after ${MAX_RETRIES} attempts: ${error.message}`);
      }
      
      // Wait before retry (exponential backoff)
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

---

## Error Handling

### Common Errors & Solutions

#### 1. API Key Invalid
**Error**: `401 Unauthorized`  
**Cause**: API key missing, expired, or incorrect  
**Solution**: Verify `ANTHROPIC_API_KEY` in `.env.local`

#### 2. Rate Limit Hit
**Error**: `429 Too Many Requests`  
**Cause**: Too many requests in short time (unlikely for your usage)  
**Solution**: Retry with backoff (already implemented)

#### 3. Content Too Long
**Error**: `400 Bad Request - prompt too long`  
**Cause**: Document > ~100k characters  
**Solution**: Add validation to reject documents > 50k characters

#### 4. Invalid JSON Response
**Error**: `Failed to parse Claude response as JSON`  
**Cause**: Claude added markdown or preamble  
**Solution**: Retry (usually works on second attempt), already implemented

#### 5. Wrong Number of Questions
**Error**: `Expected 20 questions, got X`  
**Cause**: Claude didn't follow instructions  
**Solution**: Retry (already implemented)

---

## Cost Tracking (Optional for v1)

### Simple Logging

Add to `/lib/ai/generate-questions.js`:

```javascript
// After successful generation
console.log('[API] Question generation successful', {
  documentTitle: title,
  questionCount: questions.length,
  timestamp: new Date().toISOString(),
  // Rough cost estimate: $0.015 per doc
  estimatedCost: 0.015
});
```

### Monthly Cost Calculation

For 1 doc/week × 52 weeks:
- **Cost**: 52 × $0.015 = **~$0.78/year**
- **API calls**: 52 calls/year
- **Total questions generated**: 1,040 questions/year

Even if you 10x your usage: **~$7.80/year** (still negligible)

---

## Rate Limiting (Optional for v1)

### Current Risk: Very Low

Your usage pattern:
- 1 document/week = 52 API calls/year
- Anthropic's rate limits are generous (thousands/day)
- You'll never hit limits at this usage

### If You Want to Add Rate Limiting Anyway

Simple in-memory rate limiter:

```javascript
// /lib/api/rate-limiter.js
const calls = new Map(); // userId -> array of timestamps

export function checkRateLimit(userId, maxCallsPerHour = 10) {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  
  // Get user's recent calls
  const userCalls = calls.get(userId) || [];
  
  // Remove calls older than 1 hour
  const recentCalls = userCalls.filter(timestamp => timestamp > oneHourAgo);
  
  // Check limit
  if (recentCalls.length >= maxCallsPerHour) {
    throw new Error(`Rate limit exceeded: ${maxCallsPerHour} documents per hour`);
  }
  
  // Add current call
  recentCalls.push(now);
  calls.set(userId, recentCalls);
  
  return true;
}
```

Use in `/app/api/documents/create/route.js`:
```javascript
import { checkRateLimit } from '@/lib/api/rate-limiter';

export async function POST(request) {
  // Check rate limit (10 docs/hour)
  checkRateLimit('default-user', 10);
  
  // ... rest of handler
}
```

**Recommendation**: Skip this for v1. Add only if you find yourself accidentally uploading dozens of documents in testing.

---

## Prompt Tuning (Post-Launch)

### When to Tune the Prompt

**Don't tune** until you've generated 10+ documents and studied them. You need data to know what's wrong.

**Tune if**:
- Questions are consistently too easy/hard
- Too many yes/no questions
- Questions reference content not in the document
- Type distribution is off (e.g., 80% recall, 10% application, 10% connection)

### How to Tune

1. **Identify the problem** (be specific):
   - "Questions are too focused on trivial details"
   - "Not enough application questions"
   - "Explanations are too verbose"

2. **Modify one thing** in the prompt:
   - Add explicit instruction: "Avoid questions about trivial details"
   - Adjust percentages: "50% application, 30% recall, 20% connection"
   - Change answer length: "correctAnswer in 1-2 sentences (not 2-4)"

3. **Test with same document**:
   - Use a document you already generated questions for
   - Compare old vs new questions
   - Did the change improve quality?

4. **If improved**: Update prompt in `/lib/ai/generate-questions.js`, redeploy

### Example Tuning Scenarios

**Problem**: Questions too trivial  
**Solution**: Add to rules section:
```
- Focus on core concepts and key takeaways (not minor details)
- Prioritize information you'd need 3 months from now
```

**Problem**: Answers too long  
**Solution**: Change:
```
- **correctAnswer**: The complete correct answer (1-2 sentences, not 2-4)
```

**Problem**: Not enough application questions  
**Solution**: Change percentages:
```
1. **Recall questions** (30%): ...
2. **Application questions** (50%): ...
3. **Connection questions** (20%): ...
```

---

## Testing the Integration

### Test Script (`/scripts/test-question-generation.js`)

Create this for manual testing:

```javascript
import { generateQuestions } from '../lib/ai/generate-questions.js';

const testContent = `
Spaced repetition is a learning technique that involves reviewing information at increasing intervals over time. The spacing effect, discovered by Hermann Ebbinghaus in 1885, shows that we remember information better when study sessions are distributed over time rather than massed together.

The optimal spacing intervals follow a pattern: review after 1 day, then 3 days, then 7 days, then 14 days, and so on. Each successful recall strengthens the memory and extends the next review interval.

Research by Piotr Wozniak led to the SuperMemo algorithm, which dynamically adjusts intervals based on recall performance. If you struggle to recall information (grade it "hard" or "forgot"), the interval resets to keep that information fresh.

The key insight: memory consolidation happens during sleep and time between reviews. Cramming information in one session leads to rapid forgetting, while distributed practice builds long-term retention.
`;

async function test() {
  console.log('Testing question generation...\n');
  
  try {
    const questions = await generateQuestions(
      testContent,
      'Spaced Repetition Basics',
      'Learning, Memory, Study Techniques'
    );
    
    console.log(`✓ Generated ${questions.length} questions`);
    console.log('\nSample questions:\n');
    
    // Show first 3 questions
    for (const [index, q] of questions.slice(0, 3).entries()) {
      console.log(`${index + 1}. [${q.type.toUpperCase()}] ${q.question}`);
      console.log(`   Answer: ${q.correctAnswer.substring(0, 100)}...`);
      console.log('');
    }
    
    // Validate type distribution
    const typeCount = {
      recall: questions.filter(q => q.type === 'recall').length,
      application: questions.filter(q => q.type === 'application').length,
      connection: questions.filter(q => q.type === 'connection').length
    };
    console.log('Type distribution:', typeCount);
    console.log('\n✓ Test passed!');
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  }
}

test();
```

Run with: `node scripts/test-question-generation.js`

---

## Security Considerations

### API Key Protection

✅ **DO**:
- Store API key in `.env.local` (never commit)
- Only call Claude API from server-side code (API routes)
- Use environment variables in Vercel deployment

❌ **DON'T**:
- Expose API key in client-side JavaScript
- Commit `.env.local` to git
- Log API key in console or error messages

### Input Validation

Always validate user input before sending to Claude:

```javascript
// Reject empty or very short content
if (!content || content.length < 100) {
  throw new Error('Content too short');
}

// Reject excessively long content (>50k chars)
if (content.length > 50000) {
  throw new Error('Content too long (max 50,000 characters)');
}

// Strip potentially malicious input (XSS)
const sanitizedContent = content
  .replace(/<script>/gi, '')
  .replace(/<\/script>/gi, '');
```

---

## Monitoring (Post-Launch, Optional)

### Simple Usage Logging

Add to `/app/api/documents/create/route.js`:

```javascript
// After successful generation
console.log('[USAGE]', {
  timestamp: new Date().toISOString(),
  userId: 'default-user',
  action: 'generate_questions',
  documentTitle: title,
  contentLength: content.length,
  questionCount: questions.length,
  success: true
});
```

View logs in Vercel dashboard: Functions → Select function → Logs

### Cost Tracking Spreadsheet

If you want to track costs over time:
1. Create Google Sheet with columns: Date, Document Title, Cost ($0.015)
2. Manually log after each upload (takes 10 seconds)
3. Monthly sum to see actual spending

---

**Next**: See ENVIRONMENT-SETUP.md for initial project setup, then follow BUILD-PLAN.md sequentially.
