import type { PublicDebateTopic } from '../types';

const newsSearch = (query: string) =>
  `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB%3Aen`;

export const englishTopics: PublicDebateTopic[] = [
  {
    id: 'en-ai-schools',
    title: 'This House would allow students to use generative AI in school assignments.',
    description: 'Schools must decide whether generative AI is primarily a learning tool or a shortcut that weakens independent thinking. The debate should distinguish guided use, disclosure requirements and unrestricted use.',
    language: 'en',
    createdAt: '2026-01-01T00:00:00.000Z',
    config: { timeLimit: 600, debateLevel: 'beginner', debateFocus: 'policy' },
    briefing: {
      context: 'Schools must decide whether generative AI is primarily a learning tool or a shortcut that weakens independent thinking. The debate should distinguish guided use, disclosure requirements and unrestricted use.',
      recentCases: ['AI-assisted drafting can give immediate explanations and language support.', 'Teachers may struggle to identify which parts of an assignment reflect a student’s own understanding.', 'Clear citation and disclosure rules could allow limited use without treating every use as misconduct.'],
      newsLinks: [{ label: 'Generative AI in education', url: newsSearch('generative AI school education policy') }, { label: 'AI and academic integrity', url: newsSearch('AI academic integrity students') }],
      affirmative: { title: 'Government case', points: ['AI literacy is becoming a necessary academic and workplace skill.', 'Guided use can provide personalised explanations and reduce barriers to learning.', 'Transparent rules are more realistic and teachable than a complete ban.'] },
      negative: { title: 'Opposition case', points: ['Easy generation can replace the difficult thinking assignments are designed to develop.', 'Unequal access to better tools may widen existing educational gaps.', 'Reliable authorship and fair assessment become harder to maintain.'] },
      prepQuestions: ['Which uses of AI count as assistance, and which count as substitution?', 'How should students disclose AI use?', 'What abilities should an assignment actually measure?'],
      keywords: ['generative AI', 'education', 'academic integrity'],
    },
  },
  {
    id: 'en-social-media-age',
    title: 'This House would ban social media for children under the age of sixteen.',
    description: 'Governments are considering stronger age restrictions in response to concerns about mental health, privacy and harmful content. The debate must compare a legal ban with parental control, platform regulation and digital education.',
    language: 'en',
    createdAt: '2026-01-01T00:00:00.000Z',
    config: { timeLimit: 900, debateLevel: 'intermediate', debateFocus: 'policy' },
    briefing: {
      context: 'Governments are considering stronger age restrictions in response to concerns about mental health, privacy and harmful content. The debate must compare a legal ban with parental control, platform regulation and digital education.',
      recentCases: ['Age-verification systems may require users to provide additional identity information.', 'Social platforms can provide community and support for isolated young people.', 'Restrictions are difficult to enforce when users can change their stated age or use another person’s account.'],
      newsLinks: [{ label: 'Social media age restrictions', url: newsSearch('social media under 16 ban') }, { label: 'Children and online safety', url: newsSearch('children online safety social media') }],
      affirmative: { title: 'Government case', points: ['Children are especially vulnerable to addictive design and harmful recommendation systems.', 'A clear age rule shifts responsibility from families to powerful platforms.', 'Delayed access gives young people more time to develop offline relationships and judgement.'] },
      negative: { title: 'Opposition case', points: ['A broad ban removes useful communities and information from responsible young users.', 'Age verification may create privacy risks without preventing determined users.', 'Targeted platform duties and digital education address harms more proportionately.'] },
      prepQuestions: ['Who should carry the main responsibility: families, platforms or government?', 'Can the restriction be enforced without intrusive identification?', 'Which harms are caused by social media itself rather than patterns of use?'],
      keywords: ['social media', 'children', 'online safety'],
    },
  },
  {
    id: 'en-ubi',
    title: 'This House supports the introduction of a universal basic income.',
    description: 'A universal basic income would provide regular payments without employment or means-testing conditions. The central dispute concerns economic security, incentives to work, public cost and whether targeted welfare is more effective.',
    language: 'en',
    createdAt: '2026-01-01T00:00:00.000Z',
    config: { timeLimit: 900, debateLevel: 'intermediate', debateFocus: 'policy' },
    briefing: {
      context: 'A universal basic income would provide regular payments without employment or means-testing conditions. The central dispute concerns economic security, incentives to work, public cost and whether targeted welfare is more effective.',
      recentCases: ['Pilot programmes have examined changes in wellbeing, job search and financial stability.', 'Universal payments reduce administrative eligibility checks but also pay high-income citizens.', 'Automation has renewed debate about income security when employment becomes less predictable.'],
      newsLinks: [{ label: 'Universal basic income trials', url: newsSearch('universal basic income trial results') }, { label: 'Automation and income security', url: newsSearch('automation universal basic income') }],
      affirmative: { title: 'Government case', points: ['An unconditional floor protects people from sudden income loss and insecure work.', 'A simple universal system reduces stigma and gaps caused by complex eligibility rules.', 'Financial security can improve bargaining power, education and caregiving choices.'] },
      negative: { title: 'Opposition case', points: ['A meaningful universal payment requires substantial and potentially distortionary funding.', 'Scarce resources should be concentrated on people with greater needs.', 'Removing conditions may weaken the connection between welfare support and social participation.'] },
      prepQuestions: ['Which existing benefits would UBI replace, if any?', 'How large must the payment be to achieve its purpose?', 'What trade-offs would be acceptable to fund it?'],
      keywords: ['universal basic income', 'welfare', 'automation'],
    },
  },
  {
    id: 'en-nuclear-energy',
    title: 'This House would prioritise nuclear power in the transition to clean energy.',
    description: 'Nuclear power produces low-carbon electricity but raises questions about cost, construction time, waste and safety. The debate should compare nuclear investment with renewables, storage, grids and demand reduction.',
    language: 'en',
    createdAt: '2026-01-01T00:00:00.000Z',
    config: { timeLimit: 900, debateLevel: 'intermediate', debateFocus: 'policy' },
    briefing: {
      context: 'Nuclear power produces low-carbon electricity but raises questions about cost, construction time, waste and safety. The debate should compare nuclear investment with renewables, storage, grids and demand reduction.',
      recentCases: ['Nuclear plants can provide continuous low-carbon generation independent of weather.', 'Large projects may face delays and costs that arrive long after an investment decision.', 'Long-term radioactive waste management requires stable institutions across generations.'],
      newsLinks: [{ label: 'Nuclear energy transition', url: newsSearch('nuclear power clean energy transition') }, { label: 'Nuclear costs and construction', url: newsSearch('nuclear power construction cost delays') }],
      affirmative: { title: 'Government case', points: ['Reliable nuclear generation complements variable wind and solar power.', 'Deep decarbonisation is harder if an available low-carbon technology is excluded.', 'Energy security improves when electricity relies less on imported fossil fuels.'] },
      negative: { title: 'Opposition case', points: ['Long construction periods may deliver emissions reductions too late.', 'The same investment could deploy renewables, grids and storage more quickly.', 'Waste, accident risk and decommissioning costs remain with future generations.'] },
      prepQuestions: ['Does “prioritise” mean funding, planning reform or a target share?', 'Which energy alternatives provide the fairest comparison?', 'How should long-term risks be weighed against near-term climate risks?'],
      keywords: ['nuclear power', 'clean energy', 'energy security'],
    },
  },
];

