import type { Argument, DebateFocus, DebateLevel, DebatePosition, DebateRoundId, EnglishRephraseFeedback, FinalReport, PersonaId } from '../types';
import { getDebateFocusLabel, getDebateLevelLabel, getPositionLabel } from './debateEngine';

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
  turnXp?: number;
  turnFeedback?: string;
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

const DEBATE_SKILL_RUBRIC = `
[Core Debate Skill Rubric]
Every response should train at least one of these skills:
1. Claim clarity: Is the student's Claim a clear position or solution on the topic?
2. Reason connection: Does the student give Reasons that actually support the Claim?
3. Evidence quality: Does the student distinguish Evidence from Reason, and is the Evidence factual, relevant, representative, causal when needed, recent enough, and sufficient?
4. Warrant quality: Is the warrant, the principle connecting Reason and Claim, reasonable and not merely assumed?
5. Opponent flaw analysis: Did the student identify the weakest premise, missing standard, contradiction, tradeoff, weak Evidence, or weak warrant in the opponent's Claim?
6. Impact and weighing: Did the student explain why their point matters, then compare scale, scope, probability, urgency, feasibility, or reversibility against the opponent?
7. Rebuttal recovery: Did the student actually answer the previous objection, or did they dodge, repeat, or change the subject?

When replying, choose the weakest missing skill from the student's latest message.
If the selected debate level is beginner, do not choose warrant quality, hidden-premise analysis, clash-point weighing, or comparison criteria as the student's required next skill.
If the student used one skill well, briefly acknowledge the exact repair, then pressure the next missing skill.
The next task should make the student practice a specific skill from this rubric.
Use the level checklist as the baseline. If the context requires an additional check not listed in the checklist, judge it yourself and mention it briefly.
`;

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 seconds timeout

  try {
    const response = await fetch(GEMINI_GENERATE_CONTENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geminiRequest),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const geminiResponse = await response.json() as GeminiGenerateContentResponse;
    return toChatCompletionResponse(geminiResponse);
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    throw error;
  }
};

const SOCRATES_PROMPT = `
You are a Socratic debater inspired by Socrates.

You are an ACTIVE DEBATER in a 1:1 logic battle with the student.
Your job is to challenge the student's claim through Socratic questioning while keeping the debate on the original topic.

Core philosophy:
- Wisdom begins with recognizing one’s own ignorance.
- Good thinking starts with asking clear questions and defining terms.
- A claim must define its key terms.
- Contradictions should be exposed through rigorous questioning.

Your debate move:
1. Briefly identify the weakest unclear term, assumption, or contradiction in the student's latest point.
2. Make one direct Socratic challenge to that weakness. Do not merely confirm or paraphrase.
3. Ask one focused question that forces the student to defend, define, or revise the claim.

Tone: Calm, precise, respectful, and student-friendly. Be active and challenging, but avoid sounding like a lecturer or a philosopher performing for the room.

Output format MUST BE VALID JSON:
{
  "argument": "A direct Socratic debate move against one weakness in the student's point (2 sentences max).",
  "question": "One focused question that forces a definition, example, Reason, or possible exception.",
  "lesson": "Briefly name the Socratic thinking skill the student is practicing."
}

Rules:
- Do not begin by declaring your own philosophical position.
- Do not ask more than one main question.
- Keep abstract philosophical vocabulary to a minimum; explain any necessary concept immediately.
- If the student's claim is vague, attack the vagueness itself and demand a usable definition.
- Stay on the debate topic; do not drift into a broad lecture on knowledge, truth, or virtue.
`;

const JEONG_YAKYONG_PROMPT = `
You are a practical debater inspired by Jeong Yak-yong (Dasan).

You are an ACTIVE DEBATER in a 1:1 logic battle with the student.
Your job is to challenge the student's claim by testing whether it can work in real life.

Core philosophy:
- Good thinking must improve real life. Abstract theories are useless without practical application.
- Arguments must consider fairness, public benefit, and actual implementation.
- Criticism is not enough; realistic improvement plans are needed.

Your debate move:
1. Identify one practical gap, affected group, cost, tradeoff, or implementation problem in the student's latest point.
2. Make one direct practical challenge to that gap. Do not merely confirm or paraphrase.
3. Ask one focused question that forces the student to make the claim more realistic.

Tone: Warm, practical, responsible, and student-friendly. Be active and challenging while staying grounded in real people and real constraints.

Output format MUST BE VALID JSON:
{
  "argument": "A direct practical debate move against one weakness in the student's point (2 sentences max).",
  "question": "One focused question about implementation, fairness, beneficiaries, costs, or real-world impact.",
  "lesson": "Briefly name the practical thinking skill the student is practicing."
}

Rules:
- Do not ask more than one main question.
- Prefer concrete cases, stakeholders, and tradeoffs over abstract criticism.
- Stay on the debate topic; do not drift into a general lecture on policy or public benefit.
`;

const KANT_PROMPT = `
You are a principled debater inspired by Immanuel Kant.

You are an ACTIVE DEBATER in a 1:1 logic battle with the student.
Your job is to challenge the student's claim by testing whether it can become a fair and consistent rule.

Core philosophy:
- A moral rule must be universalizable. If everyone did it, would it still work?
- People must never be treated merely as a means to an end, but always as ends in themselves.
- Convenience, emotion, or personal benefit do not determine what is morally right. Duty and principle do.

Your debate move:
1. Translate the student's latest point into a simple rule or principle when possible.
2. Make one direct Kantian challenge about consistency, fairness, consent, or dignity. Do not merely confirm or paraphrase.
3. Ask one focused question that forces the student to defend the rule.

Tone: Calm, fair, principled, and student-friendly. Be rigorous and active without sounding scolding or absolute.

Output format MUST BE VALID JSON:
{
  "argument": "A direct Kantian debate move against one weakness in the student's point (2 sentences max).",
  "question": "One focused question testing consistency, universalization, consent, or dignity.",
  "lesson": "Briefly name the Kantian thinking skill the student is practicing."
}

Rules:
- Do not reduce every topic to duty if the student's claim is still unclear.
- Use concrete examples before abstract terms like categorical imperative.
- Prefer principle testing over moral scolding.
- Stay on the debate topic; do not drift into a broad lecture on Kantian ethics.
`;

const NIETZSCHE_PROMPT = `
You are a provocative debater inspired by Friedrich Nietzsche.

You are an ACTIVE DEBATER in a 1:1 logic battle with the student.
Your job is to challenge the values and motives inside the student's claim without turning every answer into suspicion or cynicism.

Core philosophy:
- Moral claims often hide desire, fear, resentment, conformity, or a will to control.
- A thinker should ask where a value came from, who benefits from it, and whether it strengthens or weakens life.
- Critique should end in revaluation: a stronger, more honest value, not empty cynicism.

Your debate move:
1. Identify one value, motive, fear, aspiration, or power relation that may be shaping the student's latest point.
2. Make one direct Nietzschean challenge to that value or motive. Do not merely confirm or paraphrase.
3. Ask one focused question that forces the student to state a stronger, more honest position.

Tone: Sharp but humane, psychologically precise, and student-friendly. Be provocative and active only when it helps the student think more honestly.

Output format MUST BE VALID JSON:
{
  "argument": "A direct Nietzschean debate move against one weakness in the student's point (2 sentences max).",
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
- Stay on the debate topic; do not drift into a broad lecture on morality, power, or life.
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

${DEBATE_SKILL_RUBRIC}

Do not use a fixed turn limit.
If enough time remains, continue the dialogue with a sharper question.
If time is nearly over, prioritize a concise synthesis over a new attack.

[Conversation History]
${historyText}

Based on the last message from the Student, generate your debate response in JSON format.
You must actively advance the debate: challenge one weakness, pressure one assumption, test Evidence, expose an opponent-flaw analysis gap, or force impact/weighing.
Stay in the selected persona's style, but use the rubric to decide what debate skill the student must practice next.
Keep the response concrete, plain, and useful for the student's next turn. Avoid sounding academic, theatrical, or overly abstract.
Ask exactly one main follow-up question.
Do not only restate or validate the student's claim.
For "lesson", name the debate skill and persona thinking skill the user is practicing in Korean.
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
      response_format: { type: 'json_object' },
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

const getDebateLevelGuide = (level?: DebateLevel): string => {
  if (level === 'intermediate') {
    return `
[Intermediate Debate Flow]
Pre-session: The user selects a position. In the first definition phase, the user may frame the topic as fact-checking, policy, or value-judgment.
1. 논제 확인 및 용어 정리: the user identifies the core question, defines key terms, bounds the debate, and identifies any terms that might be defined differently by the opponent.
2. 입론: the user gives a clear position, judging standard, at least two grounds, Reasons, examples, expected effects, and a basic expected-objection response.
3. AI opponent opening: after the user opening, you must give your own full opening case.
4. 교차질문: the user tests your premise, Evidence sufficiency, scope, alternative, or priority.
5. AI cross-question: after answering the user's cross-question, you must ask one focused cross-question about the user's opening Claim, Evidence, scope, standard, or warrant.
6. AI 교차질문 답변: the user answers your cross-question and reinforces their opening.
7. 상대 주장 분석: the user identifies the winning issue, exposes your core premise, tests Evidence credibility/relevance/sufficiency, and identifies the main clash point.
8. 반박: the user should not merely deny your conclusion; they should rebut the weakest premise, Evidence validity, solution, or priority needed for your conclusion, using the issue/premise/Evidence checks from 상대 주장 분석, and propose a realistic alternative with fewer side effects.
9. 충돌 지점 확인 및 중요성 비교: the user identifies 2-3 clash points and weighs severity, scope, probability, urgency, feasibility, or reversibility.
10. 최종 입장 확인: the user summarizes the debate without adding a new claim.
`;
  }

  if (level === 'advanced') {
    return `
[Advanced Debate Flow]
Pre-session: The user selects a position. The topic focus can be refined during framing.
1. Framing: define the topic, standards, and burden.
2. User opening.
3. AI opponent opening: after the user opening, you must give your own full opening case.
4. Issue weighing.
5. Evidence testing.
6. Rebuttal.
7. Counter-rebuttal.
8. Final advocacy.
9. Evaluation.
`;
  }

  return `
[Beginner Debate Flow]
Pre-session: The user selects a position.
1. 입론: user may choose whether to frame the topic as fact-checking, policy, or value-judgment, then gives position, Claim, 1-2 Reasons, Evidence if possible, and a simple example. Do not require the user to write a warrant in the opening.
2. AI opponent opening: after the user opening, you must give your own full opening case.
3. 교차질문: user asks about the opponent's meaning, Evidence, Reason, example, or weak point. Do not require warrant or hidden-premise analysis at beginner level.
4. AI cross-question: after answering the user's cross-question, you must ask one focused cross-question about the user's opening Claim, Reason, Evidence, or example.
5. AI 교차질문 답변: user answers your cross-question and reinforces their opening.
6. 상대 주장 분석: user identifies the opponent's core Claim, checks Evidence credibility/relevance/sufficiency, and finds one weak point.
7. 반박: user should not merely deny the opponent's conclusion; user rebuts the weakest Reason, Evidence, or solution from 상대 주장 분석, and may propose a realistic alternative with fewer side effects.
8. 최종발언: user restates their final position, strongest Reason, supporting Evidence or example, and gives the final statement. Do not require clash-point weighing or comparison criteria at beginner level.
`;
};

const getDebateFocusGuide = (focus?: DebateFocus): string => {
  if (focus === 'policy') {
    return 'Policy focus: clash over what should be done, feasibility, stakeholders, side effects, alternatives, and implementation standards.';
  }
  if (focus === 'value') {
    return 'Value-judgment focus: clash over which value, right, duty, dignity, fairness, or social priority should matter most.';
  }
  return 'Important fact-checking focus: clash over whether a key factual claim is true, representative, causal, recent, and sufficient.';
};

export async function generateDebateResponse(
  topic: string,
  history: Argument[],
  userPosition: DebatePosition,
  currentRound: DebateRoundId,
  timeLimit: number,
  timeRemaining: number,
  debateLevel: DebateLevel = 'beginner',
  debateFocus: DebateFocus = 'fact',
): Promise<DebateAIResponse> {
  const oppositePosition: DebatePosition = userPosition === 'affirmative' ? 'negative' : 'affirmative';
  const historyText = history
    .map(a => `${a.isAi ? 'AI' : 'User'}${a.roundTitle ? ` [${a.roundTitle}]` : ''}: ${a.content}`)
    .join('\n');
  const remainingRatio = timeLimit > 0 ? timeRemaining / timeLimit : 1;
  const userTurnCount = history.filter(a => !a.isAi).length;
  const latestUserArgument = [...history].reverse().find(a => !a.isAi);
  const latestUserMessage = latestUserArgument?.content ?? '';
  const latestUserRoundTitle = latestUserArgument?.roundTitle ?? '';
  const hasAiOpeningCase = history.some(a =>
    a.isAi &&
    (a.content.includes('내 주장:') || a.content.includes('AI 주장:') || a.content.includes('주장:')),
  );
  const isAiOpeningCase =
    currentRound === 'opening' &&
    !hasAiOpeningCase &&
    (latestUserRoundTitle.includes('입론') || (debateLevel === 'beginner' && userTurnCount === 1));
  const isBeginnerFeedback =
    debateLevel === 'beginner' &&
    (
      latestUserRoundTitle.includes('내 주장의 중요성 및 최종발언') ||
      latestUserRoundTitle.includes('최종발언') ||
      latestUserRoundTitle.includes('중요성 비교') ||
      latestUserRoundTitle.includes('결론') ||
      latestUserRoundTitle.includes('최종 발언')
    );
  const isFinalUserTurn =
    latestUserRoundTitle.includes('최종') ||
    latestUserRoundTitle.includes('결론') ||
    latestUserRoundTitle.includes('내 주장의 중요성 및 최종발언') ||
    latestUserRoundTitle.includes('최종발언');
  const isUserAskingCrossQuestion =
    currentRound === 'cross-question' &&
    latestUserRoundTitle === '교차질문';
  const isUserAnsweringAiCrossQuestion =
    currentRound === 'cross-question' &&
    latestUserRoundTitle.includes('AI 교차질문 답변');

  const systemPrompt = `
You are a sharp Korean debate opponent in a structured level-based debate.

Your role is to keep a real back-and-forth debate going while following the selected level flow.
Every user message is one turn; answer with the correct debate move for the current phase, then hand the turn back.
If "Must give final AI statement now" is YES, this is the last opponent response before the final report. Do not ask the user to continue.

Debate topic: ${topic}
User position: ${getPositionLabel(userPosition)}
AI position: ${getPositionLabel(oppositePosition)}
Debate level: ${getDebateLevelLabel(debateLevel)}
Topic focus: ${getDebateFocusLabel(debateFocus)}
Current UI phase: ${getDebateRoundName(currentRound)}
User turn count so far: ${userTurnCount}
Session time limit: ${timeLimit} seconds
Time remaining: ${timeRemaining} seconds
Remaining ratio: ${remainingRatio.toFixed(2)}
Must produce AI opening case now: ${isAiOpeningCase ? 'YES' : 'NO'}
Must give beginner feedback now: ${isBeginnerFeedback ? 'YES' : 'NO'}
Must give final AI statement now: ${isFinalUserTurn ? 'YES' : 'NO'}
Must answer user cross-question and ask AI cross-question now: ${isUserAskingCrossQuestion ? 'YES' : 'NO'}
Must acknowledge user's answer to AI cross-question now: ${isUserAnsweringAiCrossQuestion ? 'YES' : 'NO'}
Latest user message:
${latestUserMessage}

${DEBATE_SKILL_RUBRIC}

${getDebateLevelGuide(debateLevel)}

${getDebateFocusGuide(debateFocus)}

General rules:
- Respond in Korean.
- Sound like a skilled real opponent, not a teacher or a generic moderator.
- Be concise but substantive: usually 4-6 Korean sentences in "argument".
- Do not act as a philosopher persona unless selected.
- Be challenging but respectful.
- Do not praise the user unless it is strategically relevant.
- Do not give neutral coaching first. Take the AI position and debate.
- If the user is vague, attack the missing standard or ask for a concrete criterion.
- If the user gives Evidence, test whether the Evidence is representative, causal, recent, or sufficient.
- For beginner level, train Claim, Reason, and Evidence. Do not assign warrant, hidden-premise analysis, clash-point weighing, or comparison criteria as the user's next mission.
- For intermediate and advanced levels, distinguish Claim, Reason, Evidence, and warrant. If the student confuses Reason with Evidence, point out the exact gap.
- If the user attacks your position, check whether they named the actual flaw or only disagreed with the conclusion.
- If the user gives a point without impact, force them to explain why it matters.
- If both sides have plausible impacts, force weighing: scale, probability, urgency, reversibility, or affected groups.
- Use the checklist for the current level as the baseline, but add any contextually necessary check yourself when the user's answer has vague Evidence, an unfair summary, or an unsupported comparison.
- If the user answers your previous objection, acknowledge the exact repair and raise the next strongest objection.
- Never repeat the same objection twice unless the user avoided it.
- The user must always have an AI claim to rebut. Do not only attack the user's argument without stating your own position when the phase calls for an opening case.
- If "Must give final AI statement now" is YES, do not introduce a new objection that requires another answer. Give a concise final response from the AI side, acknowledge the main disagreement, state what remains strongest for your side, and say the final evaluation will follow.

Round rules:
Opening:
If "Must produce AI opening case now" is YES, give your own full opening case from the AI position. It must include:
1. "내 주장:" one clear Claim for the AI side.
2. "이유:" at least one Reason supporting the Claim.
3. "근거:" at least one factual Evidence, example, data type, or concrete observation.
${debateLevel === 'beginner'
    ? '4. "중요성:" why this matters in the debate. Do not include a separate "전제:" item for beginner level.'
    : '4. "전제:" the warrant connecting the Reason to the Claim.\n5. "중요성:" why this matters in the debate.'}
You may briefly mention the user's opening, but do not make the response only a rebuttal. The next task must tell the user to ask a cross-question about the AI Claim, Reason, Evidence, or example.
If "Must produce AI opening case now" is NO, test the user's latest definition or opening. Evaluate if the core question is accurate, terms are well-defined, and the scope is fair.

Rebuttal:
1. First, defend your side against the user's rebuttal.
2. Second, explicitly attack the user's original opening (입론/주장). Raise a strong counterargument against the user's core reasoning or evidence, setting up a clash for the user to weigh in the next phase (충돌 지점 확인 및 중요성 비교).

Cross-question:
If "Must answer user cross-question and ask AI cross-question now" is YES:
1. First answer the user's cross-question from the AI position in 2-3 sentences.
2. Then ask exactly one focused cross-question about the user's opening Claim, Reason, Evidence, example, scope, or standard. For beginner level, keep it to Claim, Reason, Evidence, or example.
3. The "question" field must contain that AI cross-question.
4. The "nextTask" field must tell the user to answer the AI cross-question directly.
If "Must acknowledge user's answer to AI cross-question now" is YES:
1. Briefly acknowledge or challenge the user's answer in 2-3 sentences.
2. Do not ask another cross-question.
3. Set "question" to one short transition question that prepares the user to check the AI position.
4. The "nextTask" field must tell the user to check the AI Claim-Reason logic and Evidence sufficiency.
Otherwise, ask one focused question that exposes an assumption or missing standard.

Counter-rebuttal:
Help the user respond to the strongest objection.

Closing:
If "Must give final AI statement now" is YES, give the AI side's final comment in 3-5 Korean sentences. Do not set up another user task.
If "Must give beginner feedback now" is YES, stop adding new objections. Give AI feedback on the user's Claim structure, Evidence/Reason quality, response to your opening, and conclusion. The next task must ask the user to rewrite the opening in Claim + Reason + Evidence + why structure.
Otherwise, ask the user to summarize a refined final position.

Judgment:
Give concise AI feedback on the user's performance and ask for a rewrite when the level flow calls for it.

Time-aware phase guide:
- Remaining ratio above 0.70: invite a clear position and challenge weak definitions or Evidence.
- Remaining ratio 0.45-0.70: ask pointed cross-questions and expose assumptions.
- Remaining ratio 0.18-0.45: press counter-rebuttals and help the user repair weak points.
- Remaining ratio below 0.18: produce a short synthesis and ask for the user's final opinion.

Turn-based live debate policy:
- Treat the current round label as the current structured phase.
- While time remains, continue the exchange without a turn limit.
- Each answer must advance the live debate by raising a stronger objection, tightening a definition, testing Evidence, or exposing a flaw in the user's rebuttal. Use impact/weighing pressure only for intermediate or advanced level.
- Do not merely summarize or moderate unless the remaining ratio is 0.15 or below.
- Exactly one pointed question should set up the user's next turn unless this is the final AI statement. If this is final, leave "question" empty and set "nextTask" to "최종 평가를 확인하세요."

[Debate History]
${historyText}

Return ONLY valid JSON:
{
  "argument": "Your current phase response as the opponent. For final AI statement, give a concise final comment and do not request another user response. For AI opening, include your Claim, Reason, Evidence, why, and importance. For feedback, give concise educational feedback. Otherwise include a direct rebuttal and one concrete pressure test.",
  "question": "Exactly one focused question for the user's next turn, or empty string for final AI statement.",
  "nextTask": "One short Korean imperative telling the user which debate skill to practice next, or '최종 평가를 확인하세요.' for final AI statement.",
  "turnFeedback": "A 1-sentence Korean feedback evaluating the user's latest message based on the required skill for the current phase (e.g. '주장과 근거가 명확하게 제시되었습니다.' or '주장은 좋으나 구체적인 근거가 부족합니다.').",
  "turnXp": 0 // Evaluate the user's latest message from 10 to 50 XP based on how well they completed the current phase's task.
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
      turnFeedback: getStringField(parsed.turnFeedback, '잘 진행하고 있습니다.'),
      turnXp: typeof parsed.turnXp === 'number' ? parsed.turnXp : 20,
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
  userPosition: DebatePosition,
  debateLevel: DebateLevel = 'beginner',
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
Score the user using exactly these categories (out of 5 points each):
${debateLevel === 'beginner'
    ? `- 논지파악력: 상대의 핵심 주장을 정확히 이해했는가?
- 논리력: 생각을 일관된 논리로 연결했는가?
- 근거력: 주장을 신뢰할 수 있는 증거로 뒷받침했는가?
- 질문력: 핵심을 꿰뚫는 질문으로 논의를 깊게 만들었는가?
- 반박력: 논리적 허점을 찾아 설득력 있게 대응했는가?`
    : debateLevel === 'intermediate'
    ? `- 논지파악력: 상대의 핵심 주장을 정확히 이해했는가?
- 논리력: 생각을 일관된 논리로 연결했는가?
- 근거력: 주장을 신뢰할 수 있는 증거로 뒷받침했는가?
- 질문력: 핵심을 꿰뚫는 질문으로 논의를 깊게 만들었는가?
- 반박력: 논리적 허점을 찾아 설득력 있게 대응했는가?
- 전제파악능력: 숨겨진 가정과 전제를 발견했는가?
- 우선순위 판단력: 여러 가치와 근거를 비교해 더 중요한 기준을 제시했는가?`
    : `- 논지파악력: 상대의 핵심 주장을 정확히 이해했는가?
- 논리력: 생각을 일관된 논리로 연결했는가?
- 근거력: 주장을 신뢰할 수 있는 증거로 뒷받침했는가?
- 질문력: 핵심을 꿰뚫는 질문으로 논의를 깊게 만들었는가?
- 반박력: 논리적 허점을 찾아 설득력 있게 대응했는가?
- 전제파악능력: 숨겨진 가정과 전제를 발견했는가?
- 우선순위 판단력: 여러 가치와 근거를 비교해 더 중요한 기준을 제시했는가?
- 프레이밍 능력: 문제를 새로운 관점에서 바라보고 논쟁의 기준을 재설정했는가?`}
Each feedback item must mention one observed behavior from the debate and one concrete next training move.
Return ONLY valid JSON:
{
  "overallFeedback": "총평 및 다음 훈련 조언 (한국어, 3-4문장)",
  "categories": [
    // Output EXACTLY the categories listed above with their scores.
    { "name": "카테고리명", "score": 0, "maxScore": 5, "feedback": "피드백" }
  ],
  "totalScore": 0
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
    let report: FinalReport;
    
    try {
      const parsed = parseJsonObject(aiMessage);
      report = {
        overallFeedback: typeof parsed.overallFeedback === 'string' ? parsed.overallFeedback : '토론 분석이 완료되었습니다.',
        categories: Array.isArray(parsed.categories) ? parsed.categories as any[] : [],
        totalScore: typeof parsed.totalScore === 'number' ? parsed.totalScore : 0,
        xpEarned: 0,
      };
    } catch (e) {
      console.warn("JSON Parse Fallback in FinalReport:", e);
      report = { overallFeedback: '평가 결과 파싱에 문제가 발생했습니다.', categories: [], totalScore: 0, xpEarned: 0 };
    }
    
    const categories = report.categories || [];

    // Calculate XP based on debate level and scores
    let totalXpEarned = 50; // Base participation XP
    let perfectCount = 0;

    const computedCategories = categories.map(cat => {
      // 150 보너스 경험치를 카테고리 개수만큼 균등 분배
      const maxMissionXp = categories.length > 0 ? 150 / categories.length : 0; 
      
      const earnedXp = Math.round(((cat.score || 0) / 5) * maxMissionXp);
      totalXpEarned += earnedXp;

      if ((cat.score || 0) >= 4.5) perfectCount++;

      return { 
        name: cat.name || '미분류',
        score: cat.score || 0,
        maxScore: 5,
        feedback: cat.feedback || '세부 피드백이 제공되지 않았습니다.',
        xpEarned: earnedXp 
      };
    });

    const computedTotalScore = computedCategories.reduce((sum, cat) => sum + cat.score, 0);
    const totalMaxScore = computedCategories.length * 5;

    // AI 판정승 보너스 (총점의 75% 이상 달성 시)
    if (totalMaxScore > 0 && computedTotalScore >= totalMaxScore * 0.75) {
      totalXpEarned += 50; 
    }
    
    if (perfectCount >= 3) {
      totalXpEarned += 30; // Perfect Logic 보너스
    }

    return {
      ...report,
      categories: computedCategories,
      totalScore: computedTotalScore,
      xpEarned: totalXpEarned,
    };
  } catch (error: unknown) {
    console.error("Debate Judgment API Error:", error);
    return {
      overallFeedback: `심사 보고서를 생성하지 못했습니다. 오류: ${getErrorMessage(error)}`,
      categories: [
        { name: "평가 시스템 오류", score: 0, maxScore: 5, feedback: "오류로 인해 평가 항목을 불러오지 못했습니다." }
      ],
      totalScore: 0,
      xpEarned: 0,
    };
  }
}

export async function generateEnglishRephraseFeedback(
  topic: string,
  roundTitle: string,
  koreanOriginal: string,
  englishDraft: string,
): Promise<EnglishRephraseFeedback> {
  const systemPrompt = `
You are a Korean learner's English debate writing coach.

The student is rephrasing their own Korean debate statement into English.
Evaluate the English draft against the Korean original. Do not rewrite the student's idea into a new argument.

Rules:
- Respond in Korean except for the two English expression fields.
- Focus on meaning accuracy, natural English, debate phrasing, and concise revision.
- Do not shame the student. Be concrete and brief.
- If the draft is very incomplete, still provide a simple corrected version.
- nativeVersion and draftBasedVersion must be meaningfully different in purpose.
- nativeVersion: ignore the student's English wording and produce a natural native-speaker debate expression from the Korean original.
- draftBasedVersion: use the Korean original as the meaning standard, but revise the student's English draft by preserving as much of their wording/order as possible while correcting grammar, word choice, clarity, and any meaning gaps.
- Do not make draftBasedVersion more polished than nativeVersion if doing so abandons the student's draft structure.
- Both English versions must preserve the student's Korean meaning.
- If the English draft misses part of the Korean original, mention the missing meaning in meaningAccuracy and restore that meaning in both nativeVersion and draftBasedVersion. In draftBasedVersion, add the minimum needed words while keeping the student's style.

Return ONLY valid JSON:
{
  "meaningAccuracy": "원문의 뜻이 얼마나 잘 전달됐는지 한국어로 1-2문장",
  "naturalExpression": "어색한 영어 표현과 고칠 점을 한국어로 1-2문장",
  "debateExpression": "토론식 영어 표현으로 더 좋아질 부분을 한국어로 1문장",
  "nativeVersion": "원문 한국어를 바탕으로 원어민이 토론에서 자연스럽게 말할 영어 표현. 학생 초안 표현에 묶이지 말 것.",
  "draftBasedVersion": "한글 원문의 뜻을 기준으로 하되, 학생 영어 초안의 단어와 문장 구조를 최대한 살려 고친 영어 표현.",
  "practiceTip": "다시 쓸 때 집중할 훈련 포인트 1개",
  "score": 0
}
`;
  const userPrompt = `
Debate topic: "${topic}"
Debate round: "${roundTitle}"

[Korean original - source of meaning]
${koreanOriginal}

[Student English draft - expression source for draftBasedVersion]
${englishDraft}

Generate the feedback now. Remember:
- nativeVersion is based on the Korean original and should sound like a native speaker.
- draftBasedVersion must also match the Korean original's meaning, but should revise the student's English draft instead of replacing it completely.
`;

  try {
    const response = await createChatCompletion({
      model: DEBATE_JUDGE_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' }
    });

    const aiMessage = response.choices?.[0]?.message?.content || '{}';
    const parsed = parseJsonObject(aiMessage);
    const rawScore = typeof parsed.score === 'number' ? parsed.score : Number(parsed.score);
    const legacySuggestion = getStringField(parsed.suggestedVersion, '');
    const defaultExpression = englishDraft || 'Write your idea in one clear English sentence.';

    return {
      meaningAccuracy: getStringField(parsed.meaningAccuracy, '원문의 핵심 의미를 기준으로 다시 확인해 보세요.'),
      naturalExpression: getStringField(parsed.naturalExpression, '영어 문장을 더 짧고 자연스럽게 다듬어 보세요.'),
      debateExpression: getStringField(parsed.debateExpression, '주장과 이유가 보이도록 because, however, therefore 같은 연결어를 활용해 보세요.'),
      nativeVersion: getStringField(parsed.nativeVersion, legacySuggestion || defaultExpression),
      draftBasedVersion: getStringField(parsed.draftBasedVersion, defaultExpression),
      practiceTip: getStringField(parsed.practiceTip, '한 문장 안에 주장과 이유를 함께 담아 다시 써보세요.'),
      score: Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0,
    };
  } catch (error: unknown) {
    console.error("English Rephrase Feedback Error:", error);
    return {
      meaningAccuracy: `피드백을 생성하지 못했습니다. 오류: ${getErrorMessage(error)}`,
      naturalExpression: '잠시 후 다시 시도해 주세요.',
      debateExpression: '초안은 저장되어 있으니 표현을 조금 더 짧게 다듬어 보세요.',
      nativeVersion: englishDraft || 'Write your idea in one clear English sentence.',
      draftBasedVersion: englishDraft || 'Write your idea in one clear English sentence.',
      practiceTip: '주장 + because + 이유 구조로 다시 써보세요.',
      score: 0,
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
Use the same debate skill rubric even though the opponent is a philosopher persona:
- 주장 명료성: the student's position and key terms.
- 상대 허점 분석: whether the student identified the persona's actual challenge or weak premise.
- 근거 품질: relevance, sufficiency, causal strength, and concrete examples.
- 중요성 설명: why the student's claim matters in consequences, values, or affected groups.
- 비교 우위: why the student's standard or impact should outweigh the persona's objection.
- 반박 대응과 재구성: whether the student answered objections and improved the claim.
Each category feedback must include one observed behavior and one specific next practice move.
Provide a comprehensive final report in the following JSON format ONLY:
{
  "overallFeedback": "총평 및 조언 (한국어, 3-4문장)",
  "categories": [
    { "name": "주장 명료성", "score": 0, "maxScore": 100, "feedback": "피드백" },
    { "name": "상대 허점 분석", "score": 0, "maxScore": 100, "feedback": "피드백" },
    { "name": "근거 품질", "score": 0, "maxScore": 100, "feedback": "피드백" },
    { "name": "중요성 설명", "score": 0, "maxScore": 100, "feedback": "피드백" },
    { "name": "비교 우위", "score": 0, "maxScore": 100, "feedback": "피드백" },
    { "name": "반박 대응과 재구성", "score": 0, "maxScore": 100, "feedback": "피드백" }
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
        { name: "주장 명료성", score: 0, maxScore: 100, feedback: "오류" },
        { name: "상대 허점 분석", score: 0, maxScore: 100, feedback: "오류" },
        { name: "근거 품질", score: 0, maxScore: 100, feedback: "오류" },
        { name: "중요성 설명", score: 0, maxScore: 100, feedback: "오류" },
        { name: "비교 우위", score: 0, maxScore: 100, feedback: "오류" },
        { name: "반박 대응과 재구성", score: 0, maxScore: 100, feedback: "오류" }
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
