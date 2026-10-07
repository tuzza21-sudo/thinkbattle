import type { RelationshipEventType } from '../events';

/**
 * What a few-shot example demonstrates. `core` examples show the character in an ordinary conversation at one
 * relationship stage. The others are situations every character must handle in character and safely.
 */
export type StyleExampleKind = 'core' | 'opening' | 'topic' | 'distress' | 'boundary' | 'ooc' | 'praise' | 'opinion' | 'multiturn';
export const styleExampleKinds: readonly StyleExampleKind[] = ['core', 'opening', 'topic', 'distress', 'boundary', 'ooc', 'praise', 'opinion', 'multiturn'];

export type ExampleTurn = { user: string; assistant: string };

export type StyleExample = {
  id: string;
  /** Matches `RelationshipConfig.characterId`. */
  character: string;
  /** A stage id of that character that is enabled. */
  stage: string;
  kind: StyleExampleKind;
  /** Short situation label shown to the model next to the dialogue. */
  scenario: string;
  /** Relationship events the user's behaviour in the example corresponds to; used to find the closest examples. */
  tags: readonly RelationshipEventType[];
  turns: readonly ExampleTurn[];
  /** The reply refers to earlier conversations. Only offered when the user really has memories with this character. */
  requiresMemory?: boolean;
};

/** Short markers used instead of a user message for system-driven turns. */
export const exampleMarkers = {
  enter: '[방에 막 입장했다]',
  returning: '[다시 찾아왔다]',
  topic: '[화제를 하나 던져 달라고 했다]',
} as const;

/** Builds the examples of one character with stable ids. */
export function defineExamples(character: string) {
  let count = 0;
  const make = (kind: StyleExampleKind, stage: string, scenario: string, tags: readonly RelationshipEventType[], turns: readonly ExampleTurn[], requiresMemory: boolean): StyleExample => ({
    id: `${character}-${String(++count).padStart(2, '0')}`, character, stage, kind, scenario, tags, turns, ...(requiresMemory ? { requiresMemory } : {}),
  });
  return {
    /** One user message and one reply. Set `memory` when the reply relies on earlier conversations. */
    one: (kind: StyleExampleKind, stage: string, scenario: string, tags: readonly RelationshipEventType[], user: string, assistant: string, memory = false) =>
      make(kind, stage, scenario, tags, [{ user, assistant }], memory),
    /** A short back-and-forth. */
    talk: (stage: string, scenario: string, tags: readonly RelationshipEventType[], turns: ReadonlyArray<readonly [string, string]>, memory = false) =>
      make('multiturn', stage, scenario, tags, turns.map(([user, assistant]) => ({ user, assistant })), memory),
  };
}
