import type { Argument, DebatePosition, DebateRoundId, FinalReport, PersonaId } from '../types';
import { getPositionLabel } from './debateEngine';

const GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
const GEMINI_GENERATE_CONTENT_URL = `/api/gemini/v1beta/models/${GEMINI_FLASH_MODEL}:generateContent`;
const PERSONA_MODEL = GEMINI_FLASH_MODEL;
const DEBATE_OPPONENT_MODEL = GEMINI_FLASH_MODEL;
const DEBATE_JUDGE_MODEL = GEMINI_FLASH_MODEL;

export interface AIResponse {
  argument: string;
  question: string;
  lesson: string;
  turns?: RoundtableTurn[];
}

export interface DebateAIResponse {
  argument: string;
  question?: string;
  nextTask: string;
}

export interface RoundtableTurn {
  speaker: 'socrates' | 'kant' | 'nietzsche';
  content: string;
  target?: string;
}

type PersonaPhase =
  | 'explore'
  | 'challenge'
  | 'reconstruct'
  | 'summarize';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  response_format?: { type: 'json_object' };
  reasoning_effort?: 'high' | 'max';
  thinking?: { type: 'enabled' | 'disabled' };
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type GeminiPart = {
  text: string;
};

type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

type GeminiGenerateContentRequest = {
  systemInstruction?: {
    parts: GeminiPart[];
  };
  contents: GeminiContent[];
  generationConfig?: {
    responseMimeType?: 'application/json';
  };
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';

const parseJsonObject = (raw: string): Record<string, unknown> => {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonString = jsonMatch ? jsonMatch[0] : '{}';
  return JSON.parse(jsonString) as Record<string, unknown>;
};

const getStringField = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value : fallback;

const getPersonaPhase = (timeLimit: number, timeRemaining: number): PersonaPhase => {
  if (timeLimit <= 0) return 'explore';

  const remainingRatio = timeRemaining / timeLimit;

  if (remainingRatio <= 0.15) return 'summarize';
  if (remainingRatio <= 0.4) return 'reconstruct';
  if (remainingRatio <= 0.7) return 'challenge';
  return 'explore';
};

const getPersonaPhaseGuide = (phase: PersonaPhase): string => {
  switch (phase) {
    case 'explore':
      return 'The session is early. Do not summarize yet. Pull out definitions, assumptions, examples, and the user’s intuitive position.';
    case 'challenge':
      return 'The session is in the middle. Focus on the weakest assumption, contradiction, missing standard, or practical blind spot.';
    case 'reconstruct':
      return 'The session is moving toward refinement. Help the user rebuild a stronger version of their claim after the challenge.';
    case 'summarize':
      return 'The session is almost over. Do not introduce a new major issue. Summarize the original claim, key philosophical challenge, improved claim, and learned concept.';
    default:
      return 'Continue the philosophical dialogue.';
  }
};

const toGeminiGenerateContentRequest = (request: ChatCompletionRequest): GeminiGenerateContentRequest => {
  const systemText = request.messages
    .filter(message => message.role === 'system')
    .map(message => message.content)
    .join('\n\n')
    .trim();
  const contents = request.messages
    .filter(message => message.role !== 'system')
    .map<GeminiContent>(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));

  return {
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    contents: contents.length
      ? contents
      : [{ role: 'user', parts: [{ text: 'Generate the requested response now.' }] }],
    ...(request.response_format?.type === 'json_object'
      ? { generationConfig: { responseMimeType: 'application/json' } }
      : {}),
  };
};

const toChatCompletionResponse = (response: GeminiGenerateContentResponse): ChatCompletionResponse => {
  const content = response.candidates?.[0]?.content?.parts
    ?.map(part => part.text)
    .filter(Boolean)
    .join('\n') ?? '{}';

  return {
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  };
};

const createChatCompletion = async (request: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
  const { thinking: _thinking, reasoning_effort: _reasoningEffort, model: _model } = request;
  void _thinking;
  void _reasoningEffort;
  void _model;
  const geminiRequest = toGeminiGenerateContentRequest(request);

  const response = await fetch(GEMINI_GENERATE_CONTENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(geminiRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const geminiResponse = await response.json() as GeminiGenerateContentResponse;
  return toChatCompletionResponse(geminiResponse);
};

const SOCRATES_PROMPT = `
You are a Socratic debater inspired by Socrates.

You are a thinking partner in a 1:1 student debate.
Your job is to help the student make their own claim clearer before you challenge it.

Core philosophy:
- Wisdom begins with recognizing one’s own ignorance.
- Good thinking starts with asking clear questions and defining terms.
- A claim must define its key terms.
- Contradictions should be exposed through rigorous questioning.

Your role:
1. First, restate the student's latest point in plain Korean and identify one unclear term, assumption, or missing example.
2. Ask one focused Socratic question that helps the student clarify their own view.
3. Challenge the claim only after the student has given enough definition or reasoning to examine.

Tone: Calm, precise, respectful, and student-friendly. Avoid sounding like a lecturer or a philosopher performing for the room.

Output format MUST BE VALID JSON:
{
  "argument": "A plain-language Socratic response to the student's point (1-2 sentences).",
  "question": "One focused question that asks for a definition, example, reason, or possible exception.",
  "lesson": "Briefly name the Socratic thinking skill the student is practicing."
}

Rules:
- Do not begin by declaring your own philosophical position.
- Do not ask more than one main question.
- Keep abstract philosophical vocabulary to a minimum; explain any necessary concept immediately.
- Prefer clarification before attack, especially early in the session.
`;

const JEONG_YAKYONG_PROMPT = `
You are a practical debater inspired by Jeong Yak-yong (Dasan).

You are a thinking partner in a 1:1 student debate.
Your job is to help the student connect their claim to practical reality, not to overwhelm them with a full doctrine.

Core philosophy:
- Good thinking must improve real life. Abstract theories are useless without practical application.
- Arguments must consider fairness, public benefit, and actual implementation.
- Criticism is not enough; realistic improvement plans are needed.

Your role:
1. First, identify one practical condition, affected group, or implementation issue in the student's point.
2. Ask one concrete question that helps the student make the claim more realistic and fair.
3. Challenge the claim only when the practical gap is clear.

Tone: Warm, practical, responsible, and student-friendly. Stay grounded in real people and real constraints.

Output format MUST BE VALID JSON:
{
  "argument": "A plain-language practical response to the student's point (1-2 sentences).",
  "question": "One focused question about implementation, fairness, beneficiaries, costs, or real-world impact.",
  "lesson": "Briefly name the practical thinking skill the student is practicing."
}

Rules:
- Do not begin with a broad counter-argument.
- Do not ask more than one main question.
- Prefer concrete cases, stakeholders, and tradeoffs over abstract criticism.
`;

const KANT_PROMPT = `
You are a principled debater inspired by Immanuel Kant.

You are a thinking partner in a 1:1 student debate.
Your job is to help the student test whether their claim can become a fair rule, not to force the debate into Kantian doctrine.

Core philosophy:
- A moral rule must be universalizable. If everyone did it, would it still work?
- People must never be treated merely as a means to an end, but always as ends in themselves.
- Convenience, emotion, or personal benefit do not determine what is morally right. Duty and principle do.

Your role:
1. First, translate the student's point into a simple rule or principle when possible.
2. Test that rule with one concrete fairness, consistency, or dignity concern.
3. Give a direct objection only when the student's rule is clear enough to evaluate.

Tone: Calm, fair, principled, and student-friendly. Be rigorous without sounding scolding or absolute.

Output format MUST BE VALID JSON:
{
  "argument": "A plain-language Kantian response that identifies the rule or fairness issue (1-2 sentences).",
  "question": "One focused question testing consistency, universalization, consent, or dignity.",
  "lesson": "Briefly name the Kantian thinking skill the student is practicing."
}

Rules:
- Do not begin by announcing a rigid moral verdict.
- Do not reduce every topic to duty if the student's claim is still unclear.
- Use concrete examples before abstract terms like categorical imperative.
- Prefer principle testing over moral scolding.
`;

const NIETZSCHE_PROMPT = `
You are a provocative debater inspired by Friedrich Nietzsche.

You are a thinking partner in a 1:1 student debate.
Your job is to help the student notice the values and motives inside their claim without turning every answer into suspicion or cynicism.

Core philosophy:
- Moral claims often hide desire, fear, resentment, conformity, or a will to control.
- A thinker should ask where a value came from, who benefits from it, and whether it strengthens or weakens life.
- Critique should end in revaluation: a stronger, more honest value, not empty cynicism.

Your role:
1. First, identify one value, motive, fear, or aspiration that may be shaping the student's point.
2. Ask one concrete question that helps the student own, revise, or strengthen that value.
3. Challenge hidden motives carefully; frame them as possibilities to test, not accusations.

Tone: Sharp but humane, psychologically precise, and student-friendly. Be provocative only when it helps the student think more honestly.

Output format MUST BE VALID JSON:
{
  "argument": "A plain-language Nietzschean response that names one possible value or motive (1-2 sentences).",
  "question": "One focused question about the value, motive, fear, power relation, or stronger affirmation.",
  "lesson": "Briefly name the Nietzschean thinking skill the student is practicing."
}

Rules:
- Do not say morality is simply fake.
- Do not glorify cruelty or domination.
- Do not leave the student in cynicism; push toward a stronger revaluation.
- Do not accuse the student personally; test a possible motive or value.
- Do not overuse Nietzschean jargon such as herd morality, ressentiment, or will to power.
- Prefer concrete psychological insight over theatrical provocation.
`;

const getPersonaPrompt = (personaId: PersonaId) => {
  switch (personaId) {
    case 'socrates': return SOCRATES_PROMPT;
    case 'jeong_yakyong': return JEONG_YAKYONG_PROMPT;
    case 'kant': return KANT_PROMPT;
    case 'nietzsche': return NIETZSCHE_PROMPT;
    default: return SOCRATES_PROMPT;
  }
};

export async function generatePersonaResponse(
  topic: string,
  history: Argument[],
  personaId: PersonaId,
  timeLimit: number,
  timeRemaining: number
): Promise<AIResponse> {
  const historyText = history.map(a => `${a.isAi ? 'AI' : 'Student'}: ${a.content}`).join('\n');
  const phase = getPersonaPhase(timeLimit, timeRemaining);

  const systemPrompt = `
${getPersonaPrompt(personaId)}

Current Debate Topic: "${topic}"
Session time limit: ${timeLimit} seconds
Time remaining: ${timeRemaining} seconds
Conversation phase: ${phase}

[Time-Aware Dialogue Policy]
${getPersonaPhaseGuide(phase)}

Do not use a fixed turn limit.
If enough time remains, continue the dialogue with a sharper question.
If time is nearly over, prioritize a concise synthesis over a new attack.

[Conversation History]
${historyText}

Based on the last message from the Student, generate your debate response in JSON format.
Keep the response concrete, plain, and useful for the student's next turn. Avoid sounding academic, theatrical, or overly abstract.
Ask exactly one main follow-up question.
For "lesson", name the philosophical thinking skill the user just practiced in Korean.
Return ONLY valid JSON without any markdown wrapping.
`;

  try {
    const response = await createChatCompletion({
      model: PERSONA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt }
      ],
      reasoning_effort: 'high',
      thinking: { type: 'enabled' },
    });

    const aiMessage = response.choices?.[0]?.message?.content || '{}';
    const parsed = parseJsonObject(aiMessage);
    
    return {
      argument: getStringField(parsed.argument, "오류가 발생했습니다."),
      question: getStringField(parsed.question, "말씀을 이해하지 못했습니다. 다시 설명해주시겠습니까?"),
      lesson: getStringField(parsed.lesson, "")
    };
    
  } catch (error: unknown) {
    console.error("AI API Error:", error);
    return {
      argument: "시스템 오류로 답변을 생성할 수 없습니다.",
      question: `[AI 연결 오류] ${getErrorMessage(error)}`,
      lesson: "잠시 후 다시 시도해주세요."
    };
  }
}

const isRoundtableTurn = (value: unknown): value is RoundtableTurn => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RoundtableTurn>;
  return (
    (candidate.speaker === 'socrates' || candidate.speaker === 'kant' || candidate.speaker === 'nietzsche') &&
    typeof candidate.content === 'string' &&
    candidate.content.trim().length > 0
  );
};

const getRoundtableTurns = (value: unknown): RoundtableTurn[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRoundtableTurn);
};

const getRoundtablePhaseGuide = (userTurnCount: number, timeLimit: number, timeRemaining: number) => {
  const remainingRatio = timeLimit > 0 ? timeRemaining / timeLimit : 1;

  if (remainingRatio <= 0.15) {
    return 'Final synthesis phase. Summarize the original claim, the improved claim, remaining weaknesses, and one next thinking task. Do not introduce a major new challenge.';
  }

  if (userTurnCount === 0) {
    return 'Opening statements. Each philosopher must give an independent first view on the topic before any user reply. Socrates frames the core concept, Kant frames the implied principle, and Nietzsche frames the hidden value or motive. End by asking the user which opening pressure they want to answer first.';
  }

  if (userTurnCount === 1) {
    return 'Rebuttal round. Each philosopher should respond to the student AND explicitly push back against one other philosopher where their framework conflicts. Socrates may challenge Kant or Nietzsche if their critique uses unclear terms. Kant may challenge Nietzsche if suspicion cannot become a usable principle. Nietzsche may challenge Socrates or Kant if their clarity or duty hides inherited morality.';
  }

  if (userTurnCount === 2) {
    return 'Refinement round. Each philosopher should identify what improved in the student answer, what remains unstable, and what condition must be added to the claim.';
  }

  if (userTurnCount === 3) {
    return 'Strongest objection round. Each philosopher gives their strongest remaining objection, aimed at helping the student rebuild a stronger claim.';
  }

  return 'Reconstruction and synthesis phase. The philosophers should stop adding endless new attacks. Help the student produce a final revised position and name the remaining disagreement.';
};

export async function generateRoundtableResponse(
  topic: string,
  history: Argument[],
  timeLimit: number,
  timeRemaining: number
): Promise<AIResponse> {
  const speakerNameById: Record<string, string> = {
    p1: 'Student',
    socrates: 'Socrates',
    kant: 'Kant',
    nietzsche: 'Nietzsche',
    p2: 'Roundtable',
  };
  const historyText = history
    .map(a => `${speakerNameById[a.playerId] ?? (a.isAi ? 'Roundtable' : 'Student')}: ${a.content}`)
    .join('\n');
  const userTurnCount = history.filter(a => !a.isAi).length;

  const systemPrompt = `
You are the moderator of an interactive philosophical roundtable for critical thinking training.

Participants:
1. Socrates: clarify concepts, expose assumptions, test contradictions.
2. Kant: extract maxims, test universalizability, protect human dignity.
3. Nietzsche: unmask hidden motives, trace values, challenge inherited morality without nihilism.

Debate topic: "${topic}"
Session time limit: ${timeLimit} seconds
Time remaining: ${timeRemaining} seconds
Student turns so far: ${userTurnCount}

[Current Round Policy]
${getRoundtablePhaseGuide(userTurnCount, timeLimit, timeRemaining)}

[Conversation History]
${historyText}

Rules:
- Respond in Korean.
- Return three separate philosopher turns, one for Socrates, one for Kant, and one for Nietzsche.
- In the opening round, each philosopher gives their own first thought before responding to anyone else.
- After the opening round, each philosopher should respond to the student and may rebut another philosopher's view.
- Keep the student inside the debate. End with one clear next action in "question".
- Do not let the personas monologue. Each persona turn should be 2-4 Korean sentences.
- Preserve persona separation:
  - Socrates asks about definitions, assumptions, and contradictions.
  - Kant asks about maxims, universal law, duty, and dignity.
  - Nietzsche asks about hidden values, motives, power, resentment, and stronger affirmation.
- The goal is not a final answer. The goal is a clearer, stronger, more self-aware student claim.
- If the student has not given a clear claim yet, ask them to write one sentence before deep critique.
- If enough dialogue has happened, move toward synthesis instead of adding endless new attacks.

Return ONLY valid JSON:
{
  "argument": "A concise moderator summary of the round, not the full participant speeches.",
  "turns": [
    { "speaker": "socrates", "content": "Socrates' separate contribution.", "target": "optional: user, kant, nietzsche, or topic" },
    { "speaker": "kant", "content": "Kant's separate contribution.", "target": "optional: user, socrates, nietzsche, or topic" },
    { "speaker": "nietzsche", "content": "Nietzsche's separate contribution.", "target": "optional: user, socrates, kant, or topic" }
  ],
  "question": "One clear question or task for the student's next turn.",
  "lesson": "Name the thinking move practiced in this round, in Korean."
}
`;

  try {
    const response = await createChatCompletion({
      model: PERSONA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt }
      ],
      reasoning_effort: 'high',
      thinking: { type: 'enabled' },
      response_format: { type: 'json_object' },
    });

    const aiMessage = response.choices?.[0]?.message?.content || '{}';
    const parsed = parseJsonObject(aiMessage);
    const turns = getRoundtableTurns(parsed.turns);

    return {
      argument: getStringField(parsed.argument, '라운드테이블 응답을 생성하지 못했습니다. 방금 주장을 한 문장으로 다시 적어주세요.'),
      question: getStringField(parsed.question, '지금 입장을 한 문장으로 다시 써보세요.'),
      lesson: getStringField(parsed.lesson, '라운드테이블 사고 훈련'),
      turns,
    };
  } catch (error: unknown) {
    console.error("Roundtable AI API Error:", error);
    return {
      argument: '라운드테이블 응답을 생성하는 중 오류가 발생했습니다.',
      question: `[AI 연결 오류] ${getErrorMessage(error)}`,
      lesson: '잠시 후 다시 시도해주세요.',
      turns: [],
    };
  }
}

const getDebateRoundName = (roundId: DebateRoundId): string => {
  switch (roundId) {
    case 'opening':
      return 'Opening';
    case 'rebuttal':
      return 'Rebuttal';
    case 'cross-question':
      return 'Cross-question';
    case 'counter-rebuttal':
      return 'Counter-rebuttal';
    case 'closing':
      return 'Closing';
    case 'judgment':
      return 'Judgment';
    default:
      return 'Opening';
  }
};

export async function generateDebateResponse(
  topic: string,
  history: Argument[],
  userPosition: DebatePosition,
  currentRound: DebateRoundId,
  timeLimit: number,
  timeRemaining: number
): Promise<DebateAIResponse> {
  const oppositePosition: DebatePosition = userPosition === 'affirmative' ? 'negative' : 'affirmative';
  const historyText = history
    .map(a => `${a.isAi ? 'AI' : 'User'}${a.roundTitle ? ` [${a.roundTitle}]` : ''}: ${a.content}`)
    .join('\n');
  const remainingRatio = timeLimit > 0 ? timeRemaining / timeLimit : 1;
  const userTurnCount = history.filter(a => !a.isAi).length;
  const latestUserMessage = [...history].reverse().find(a => !a.isAi)?.content ?? '';

  const systemPrompt = `
You are a sharp Korean debate opponent in a timed turn-based debate.

Your role is to keep a real back-and-forth debate going until time runs out.
Do not run a fixed round script. Do not end the debate because a phase is complete.
Every user message is one turn; answer with one strong debate move, then hand the turn back.

Debate topic: ${topic}
User position: ${getPositionLabel(userPosition)}
AI position: ${getPositionLabel(oppositePosition)}
Current UI phase: ${getDebateRoundName(currentRound)}
User turn count so far: ${userTurnCount}
Session time limit: ${timeLimit} seconds
Time remaining: ${timeRemaining} seconds
Remaining ratio: ${remainingRatio.toFixed(2)}
Latest user message:
${latestUserMessage}

General rules:
- Respond in Korean.
- Sound like a skilled real opponent, not a teacher or a generic moderator.
- Be concise but substantive: usually 4-6 Korean sentences in "argument".
- Do not act as a philosopher persona unless selected.
- Be challenging but respectful.
- Do not praise the user unless it is strategically relevant.
- Do not give neutral coaching first. Take the AI position and debate.
- If the user is vague, attack the missing standard or ask for a concrete criterion.
- If the user gives evidence, test whether the evidence is representative, causal, recent, or sufficient.
- If the user answers your previous objection, acknowledge the exact repair and raise the next strongest objection.
- Never repeat the same objection twice unless the user avoided it.

Round rules:
Opening:
Test the user's first claim, reason, evidence, and conclusion.

Rebuttal:
Challenge the user’s argument with the strongest relevant counterargument.

Cross-question:
Ask one focused question that exposes an assumption or missing standard.

Counter-rebuttal:
Help the user respond to the strongest objection.

Closing:
Ask the user to summarize a refined final position.

Judgment:
Score the user based on clarity, evidence, rebuttal, structure, and final summary.

Time-aware phase guide:
- Remaining ratio above 0.70: invite a clear position and challenge weak definitions or evidence.
- Remaining ratio 0.45-0.70: ask pointed cross-questions and expose assumptions.
- Remaining ratio 0.18-0.45: press counter-rebuttals and help the user repair weak points.
- Remaining ratio below 0.18: produce a short synthesis and ask for the user's final opinion.

Turn-based live debate policy:
- Treat the current round label as a UI hint, not a fixed sequence.
- While time remains, continue the exchange without a turn limit.
- Each answer must advance the live debate by raising a stronger objection, tightening a definition, testing evidence, or forcing a tradeoff.
- Do not merely summarize or moderate unless the remaining ratio is 0.15 or below.
- Exactly one pointed question should set up the user's next turn.

[Debate History]
${historyText}

Return ONLY valid JSON:
{
  "argument": "Your active debate move as the opponent. Include a direct rebuttal and one concrete pressure test.",
  "question": "Exactly one focused question for the user's next turn.",
  "nextTask": "One short imperative sentence telling the user what to do next."
}
`;

  try {
    const response = await createChatCompletion({
      model: DEBATE_OPPONENT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt }
      ],
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' }
    });

    const aiMessage = response.choices?.[0]?.message?.content || '{}';
    const parsed = parseJsonObject(aiMessage);

    return {
      argument: getStringField(parsed.argument, '다음 라운드로 넘어가기 전에 핵심 주장을 더 명확히 정리해야 합니다.'),
      question: getStringField(parsed.question, ''),
      nextTask: getStringField(parsed.nextTask, '다음 발언을 구조화해서 작성하세요.'),
    };
  } catch (error: unknown) {
    console.error("Debate AI API Error:", error);
    return {
      argument: "AI 응답을 생성하지 못했습니다. 지금까지의 발언을 기준으로 다음 단계로 진행해 주세요.",
      question: `[AI 연결 오류] ${getErrorMessage(error)}`,
      nextTask: "상대 반론을 한 문장으로 요약한 뒤, 그 약점을 반박하세요.",
    };
  }
}

export async function generateDebateJudgment(
  topic: string,
  history: Argument[],
  userPosition: DebatePosition
): Promise<FinalReport> {
  const historyText = history
    .map(a => `${a.isAi ? 'AI' : 'User'}${a.roundTitle ? ` [${a.roundTitle}]` : ''}: ${a.content}`)
    .join('\n');

  const systemPrompt = `
You are a strict but educational Korean debate judge.

Debate topic: "${topic}"
User position: "${getPositionLabel(userPosition)}"

[Debate History]
${historyText}

Judge only the user's debate performance.
Score the user using exactly these five categories:
- Claim 명확성: 주장이 너무 추상적인가?
- Reason 연결성: 이유가 주장과 논리적으로 이어지는가?
- Evidence 적합성: 근거가 충분한가?
- Impact: 왜 중요한지 설명했는가?
- Weighing: 상대 주장보다 왜 중요한가?
Return ONLY valid JSON:
{
  "overallFeedback": "총평 및 다음 훈련 조언 (한국어, 3-4문장)",
  "categories": [
    { "name": "Claim 명확성", "score": 0, "maxScore": 100, "feedback": "피드백" },
    { "name": "Reason 연결성", "score": 0, "maxScore": 100, "feedback": "피드백" },
    { "name": "Evidence 적합성", "score": 0, "maxScore": 100, "feedback": "피드백" },
    { "name": "Impact", "score": 0, "maxScore": 100, "feedback": "피드백" },
    { "name": "Weighing", "score": 0, "maxScore": 100, "feedback": "피드백" }
  ],
  "totalScore": 0,
  "xpEarned": 0
}
`;

  try {
    const response = await createChatCompletion({
      model: DEBATE_JUDGE_MODEL,
      messages: [
        { role: 'system', content: systemPrompt }
      ],
      reasoning_effort: 'high',
      thinking: { type: 'enabled' },
      response_format: { type: 'json_object' }
    });

    const aiMessage = response.choices?.[0]?.message?.content || '{}';
    return JSON.parse(aiMessage) as FinalReport;
  } catch (error: unknown) {
    console.error("Debate Judgment API Error:", error);
    return {
      overallFeedback: `심사 보고서를 생성하지 못했습니다. 오류: ${getErrorMessage(error)}`,
      categories: [
        { name: "Claim 명확성", score: 0, maxScore: 100, feedback: "오류" },
        { name: "Reason 연결성", score: 0, maxScore: 100, feedback: "오류" },
        { name: "Evidence 적합성", score: 0, maxScore: 100, feedback: "오류" },
        { name: "Impact", score: 0, maxScore: 100, feedback: "오류" },
        { name: "Weighing", score: 0, maxScore: 100, feedback: "오류" },
      ],
      totalScore: 0,
      xpEarned: 0,
    };
  }
}

export async function generateFinalReport(
  topic: string,
  history: Argument[],
  personaId: PersonaId
): Promise<FinalReport> {
  const historyText = history.map(a => `${a.isAi ? 'AI' : 'Student'}: ${a.content}`).join('\n');

  const systemPrompt = `
You are an expert debate adjudicator evaluating a student's performance in a dialogue with a philosopher persona (${personaId}).
Debate Topic: "${topic}"

[Conversation History]
${historyText}

Please evaluate the Student's performance based on the entire conversation.
Provide a comprehensive final report in the following JSON format ONLY:
{
  "overallFeedback": "총평 및 조언 (한국어, 3-4문장)",
  "categories": [
    {
      "name": "논리력",
      "score": 85,
      "maxScore": 100,
      "feedback": "논리 전개에 대한 피드백"
    },
    {
      "name": "근거력",
      "score": 75,
      "maxScore": 100,
      "feedback": "근거 제시에 대한 피드백"
    },
    {
      "name": "반박력",
      "score": 80,
      "maxScore": 100,
      "feedback": "상대 질문/반박 대처에 대한 피드백"
    }
  ],
  "totalScore": 80,
  "xpEarned": 120
}
`;

  try {
    const response = await createChatCompletion({
      model: DEBATE_JUDGE_MODEL,
      messages: [
        { role: 'system', content: systemPrompt }
      ],
      reasoning_effort: 'high',
      thinking: { type: 'enabled' },
      response_format: { type: 'json_object' }
    });

    const aiMessage = response.choices?.[0]?.message?.content || '{}';
    return JSON.parse(aiMessage) as FinalReport;
    
  } catch (error: unknown) {
    console.error("Final Report API Error:", error);
    return {
      overallFeedback: "보고서 생성 중 오류가 발생했습니다.",
      categories: [
        { name: "논리력", score: 0, maxScore: 100, feedback: "오류" },
        { name: "근거력", score: 0, maxScore: 100, feedback: "오류" },
        { name: "반박력", score: 0, maxScore: 100, feedback: "오류" }
      ],
      totalScore: 0,
      xpEarned: 0
    };
  }
}

export async function generateRoundtableFinalReport(
  topic: string,
  history: Argument[]
): Promise<FinalReport> {
  const historyText = history.map(a => `${a.isAi ? 'Roundtable' : 'Student'}: ${a.content}`).join('\n');

  const systemPrompt = `
You are an educational judge evaluating a student's critical thinking performance in a Socrates-Kant-Nietzsche roundtable session.

Debate Topic: "${topic}"

[Conversation History]
${historyText}

Evaluate only the student's thinking performance:
- concept clarity,
- principle consistency,
- response to hidden-value critique,
- ability to revise the claim,
- quality of final position.

Return ONLY valid JSON:
{
  "overallFeedback": "A concise Korean overall assessment in 3-4 sentences.",
  "categories": [
    { "name": "개념 명료성", "score": 0, "maxScore": 100, "feedback": "Korean feedback" },
    { "name": "원칙 검증", "score": 0, "maxScore": 100, "feedback": "Korean feedback" },
    { "name": "가치 성찰", "score": 0, "maxScore": 100, "feedback": "Korean feedback" },
    { "name": "주장 재구성", "score": 0, "maxScore": 100, "feedback": "Korean feedback" }
  ],
  "totalScore": 0,
  "xpEarned": 0
}
`;

  try {
    const response = await createChatCompletion({
      model: DEBATE_JUDGE_MODEL,
      messages: [
        { role: 'system', content: systemPrompt }
      ],
      reasoning_effort: 'high',
      thinking: { type: 'enabled' },
      response_format: { type: 'json_object' }
    });

    const aiMessage = response.choices?.[0]?.message?.content || '{}';
    return JSON.parse(aiMessage) as FinalReport;
  } catch (error: unknown) {
    console.error("Roundtable Final Report API Error:", error);
    return {
      overallFeedback: `라운드테이블 보고서를 생성하지 못했습니다. 오류: ${getErrorMessage(error)}`,
      categories: [
        { name: "개념 명료성", score: 0, maxScore: 100, feedback: "오류" },
        { name: "원칙 검증", score: 0, maxScore: 100, feedback: "오류" },
        { name: "가치 성찰", score: 0, maxScore: 100, feedback: "오류" },
        { name: "주장 재구성", score: 0, maxScore: 100, feedback: "오류" },
      ],
      totalScore: 0,
      xpEarned: 0,
    };
  }
}
