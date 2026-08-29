/* Air Hockey World Cup — teams.js
 *
 * 16 nations for the World Cup bracket. Each has a flag emoji, two colours
 * (primary mallet + accent), and an AI skill rating 0..1 that scales the
 * opponent's reaction speed and aim in ai.js.
 *
 * Skill is only used when the CPU controls the team. The player's chosen
 * team's skill is ignored (you are the skill).
 */

export const TEAMS = [
  { id: 'bra', name: 'Brazil',      flag: '🇧🇷', c1: '#ffd32a', c2: '#0a8f3c', skill: 0.92 },
  { id: 'fra', name: 'France',      flag: '🇫🇷', c1: '#3b6cff', c2: '#ffffff', skill: 0.90 },
  { id: 'arg', name: 'Argentina',   flag: '🇦🇷', c1: '#75aadb', c2: '#ffffff', skill: 0.90 },
  { id: 'ger', name: 'Germany',     flag: '🇩🇪', c1: '#111111', c2: '#ffce00', skill: 0.88 },
  { id: 'esp', name: 'Spain',       flag: '🇪🇸', c1: '#c60b1e', c2: '#ffc400', skill: 0.87 },
  { id: 'eng', name: 'England',     flag: '🏴',   c1: '#ffffff', c2: '#cf142b', skill: 0.85 },
  { id: 'por', name: 'Portugal',    flag: '🇵🇹', c1: '#046a38', c2: '#da291c', skill: 0.84 },
  { id: 'ned', name: 'Netherlands', flag: '🇳🇱', c1: '#ff6a13', c2: '#21468b', skill: 0.83 },
  { id: 'ita', name: 'Italy',       flag: '🇮🇹', c1: '#0066a1', c2: '#ffffff', skill: 0.82 },
  { id: 'bel', name: 'Belgium',     flag: '🇧🇪', c1: '#e30613', c2: '#ffd32a', skill: 0.80 },
  { id: 'uru', name: 'Uruguay',     flag: '🇺🇾', c1: '#5ca4dd', c2: '#ffffff', skill: 0.78 },
  { id: 'cro', name: 'Croatia',     flag: '🇭🇷', c1: '#ff2b2b', c2: '#ffffff', skill: 0.77 },
  { id: 'mex', name: 'Mexico',      flag: '🇲🇽', c1: '#006341', c2: '#ce1126', skill: 0.74 },
  { id: 'usa', name: 'USA',         flag: '🇺🇸', c1: '#3c3b6e', c2: '#b22234', skill: 0.72 },
  { id: 'jpn', name: 'Japan',       flag: '🇯🇵', c1: '#bc002d', c2: '#ffffff', skill: 0.71 },
  { id: 'kor', name: 'South Korea', flag: '🇰🇷', c1: '#c60c30', c2: '#003478', skill: 0.70 },
];

export function teamById(id) {
  return TEAMS.find(t => t.id === id) || TEAMS[0];
}

/* Build a 16-slot single-elimination bracket seeded so the player's team sits
 * in slot 0 and the rest are shuffled by descending skill into standard seed
 * positions (so tougher teams tend to meet later). Deterministic-ish but with
 * a light shuffle for variety. */
export function buildBracket(playerId) {
  const player = teamById(playerId);
  const others = TEAMS.filter(t => t.id !== playerId).slice();
  // sort by skill desc, then light shuffle within to vary the path
  others.sort((a, b) => b.skill - a.skill);
  for (let i = others.length - 1; i > 0; i--) {
    if (Math.random() < 0.5) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
  }
  // 16 competitors: player + 15 others
  const field = [player, ...others].slice(0, 16);
  return field;
}
