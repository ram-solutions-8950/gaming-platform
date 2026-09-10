import type { RuleSection, RulePayout } from './GameRulesModal';

export const LUDO_RULES_DATA: {
  title: string;
  subtitle: string;
  sections: RuleSection[];
  tips: string[];
} = {
  title: '🎲 Ludo Rules & How to Play',
  subtitle: 'Classic 2-4 Player Board Game',
  sections: [
    {
      title: 'Objective',
      icon: '🎯',
      body: 'Race all 4 of your tokens around the board from your colored Yard to the central Home triangle before any opponent does.',
    },
    {
      title: 'Rolling the Dice',
      icon: '🎲',
      body: [
        'Players take turns rolling the 6-sided dice in clockwise order.',
        'You have 10 seconds to roll and choose a move on your turn.',
        'Missing 3 turns consecutively results in an automatic match forfeit.',
      ],
    },
    {
      title: 'Starting a Token (Roll a 6)',
      icon: '🚪',
      body: 'To release a token from your yard onto your colored starting square, you MUST roll a 6. Any other roll cannot move tokens resting in the yard.',
      example: 'Rolled 6 → Tap yard token to move it to your starting track cell.',
      isPositive: true,
    },
    {
      title: 'Bonus Rolls & Consecutive Sixes',
      icon: '⚡',
      body: [
        'Rolling a 6 awards an immediate bonus roll!',
        'Capturing an opponent token also awards a bonus roll.',
        'CAUTION: Rolling 3 consecutive sixes in a row forfeits your turn immediately with no moves.',
      ],
      example: '6 + 6 + 6 → Turn cancelled! Play passes to next player.',
      isPositive: false,
    },
    {
      title: 'Capturing Opponents',
      icon: '⚔️',
      body: 'Landing on a cell occupied by an opponent’s token captures it, sending it back to their starting yard. You are awarded a free bonus roll!',
    },
    {
      title: 'Safe Squares (★ Stars & Starts)',
      icon: '⭐',
      body: 'Squares marked with a star (★) and each player’s starting square are SAFE. Tokens on these cells cannot be captured or eliminated by opponents.',
    },
    {
      title: 'Home Stretch & Winning',
      icon: '👑',
      body: 'Once a token circles the full board, it enters its private colored Home corridor. An exact roll is required to reach the center Home. First player to get all 4 tokens Home wins the prize pool!',
    },
  ],
  tips: [
    'Unlock multiple tokens with 6s early to give yourself flexible options on every roll.',
    'Station tokens on star squares to safely stalk opponents ahead of you.',
    'Always move vulnerable tokens that risk being captured on the opponent’s next turn.',
  ],
};

export const AVIATOR_RULES_DATA: {
  title: string;
  subtitle: string;
  sections: RuleSection[];
  payouts: RulePayout[];
  tips: string[];
} = {
  title: '✈️ Aviator Rules & Guide',
  subtitle: 'Next-Gen Crash Multiplier Game',
  sections: [
    {
      title: 'Objective',
      icon: '🎯',
      body: 'Cash out your bet before the lucky red aircraft accelerates and flies away into the sky!',
    },
    {
      title: 'Betting Phase (10s Countdown)',
      icon: '⏱️',
      body: [
        'Place your bet(s) during the 10-second countdown before takeoff.',
        'You can place 1 or 2 bets simultaneously with independent cashout points.',
        'Minimum bet is ₹10 (1000 paise); maximum bet is ₹10,000.',
      ],
    },
    {
      title: 'Flight & Exponential Growth',
      icon: '📈',
      body: 'Once airborne, the multiplier starts at 1.00x and climbs rapidly in real time according to the flight curve. The higher the plane flies, the bigger your payout multiplier.',
    },
    {
      title: 'Cash Out & Winnings',
      icon: '💰',
      body: 'Tap the Cash Out button at any time during flight to claim your winnings: Win Amount = Bet × Current Multiplier.',
      example: 'Bet ₹100 • Cash out at 3.50x → Win ₹350.00!',
      isPositive: true,
    },
    {
      title: 'The Crash (Fly Away)',
      icon: '💥',
      body: 'The plane can crash or fly away at any unpredictable instant based on cryptographic provably-fair RNG. If the plane crashes before you cash out, your bet is lost.',
      isPositive: false,
    },
    {
      title: 'Auto Cash Out Feature',
      icon: '⚙️',
      body: 'Toggle Auto Cash Out on either bet slot to automatically secure profits whenever the multiplier reaches your chosen target (e.g. 1.50x or 2.00x).',
    },
  ],
  payouts: [
    { name: '1.10x – 1.50x', payout: '10% – 50% Profit', desc: 'High frequency, low volatility cashouts' },
    { name: '2.00x – 5.00x', payout: '2x – 5x Returns', desc: 'Balanced risk-reward target' },
    { name: '10.00x – 100.00x+', payout: 'Mega Jackpot', desc: 'Rare high-altitude sky rockets' },
  ],
  tips: [
    'Use Slot 1 for conservative auto-cashout (e.g. 1.5x) and Slot 2 to hunt for 5x+ moonshots.',
    'Check recent crash pills at the top to observe recent multiplier patterns.',
    'Never chase losses with high multipliers; stick to a consistent exit strategy.',
  ],
};

export const TEEN_PATTI_RULES_DATA: {
  title: string;
  subtitle: string;
  sections: RuleSection[];
  payouts: RulePayout[];
  tips: string[];
} = {
  title: '🂠 Teen Patti Rules & Hand Hierarchy',
  subtitle: 'Indian 3-Card Poker',
  sections: [
    {
      title: 'Game Objective',
      icon: '🎯',
      body: 'Hold the highest-ranking 3-card hand according to standard Teen Patti hierarchy, or bet aggressively to force all opponents to fold.',
    },
    {
      title: 'Blind vs Seen Players',
      icon: '👁️',
      body: [
        'Blind: You play without looking at your cards. Blind bets cost 1x the current table boot.',
        'Seen: You have viewed your cards. Seen bets cost 2x the blind bet amount.',
        'A player can switch from Blind to Seen at any turn by tapping "See Cards".',
      ],
    },
    {
      title: 'Sideshow (Comparison)',
      icon: '🔄',
      body: 'A Seen player can request a Sideshow with the previous Seen player. If accepted, the player with the lower hand must fold immediately.',
    },
    {
      title: 'Show (Showdown)',
      icon: '🏆',
      body: 'When only 2 players remain at the table, either player can pay for a "Show". Both reveal cards; higher ranking hand wins the entire pot!',
    },
  ],
  payouts: [
    { name: '1. Trail / Trio / Set', payout: 'Rank 1 (Highest)', desc: 'Three cards of same rank (AAA is king)' },
    { name: '2. Pure Sequence', payout: 'Rank 2', desc: 'Straight Flush in same suit (A-2-3 highest, 4-3-2 lowest)' },
    { name: '3. Sequence (Run)', payout: 'Rank 3', desc: 'Three consecutive cards of mixed suits (A-2-3 highest)' },
    { name: '4. Color (Flush)', payout: 'Rank 4', desc: 'Any three cards of the same suit' },
    { name: '5. Pair (Double)', payout: 'Rank 5', desc: 'Two cards of the same rank (A-A-K highest)' },
    { name: '6. High Card', payout: 'Rank 6', desc: 'Highest single card decides (A-K-J highest)' },
  ],
  tips: [
    'Playing blind in early rounds keeps your betting costs low while opponents pay double.',
    'Pure sequences and Trails are rare — raise strongly when you hold one!',
    'Use Sideshow when you have a decent hand like a high pair or color to eliminate an opponent cheaply.',
  ],
};

export const DRAGON_TIGER_RULES_DATA: {
  title: string;
  subtitle: string;
  sections: RuleSection[];
  payouts: RulePayout[];
  tips: string[];
} = {
  title: '🐉 Dragon Tiger Rules & Guide',
  subtitle: 'Live 2-Card Casino Duel',
  sections: [
    {
      title: 'Objective',
      icon: '🎯',
      body: 'Predict which side — Dragon or Tiger — will receive the higher value card, or if both cards will Tie in rank.',
    },
    {
      title: 'Card Ranks',
      icon: '🃏',
      body: 'King is highest (13), Queen is 12, Jack is 11, numbers 10 down to 2, and Ace is lowest (1). Suits have no ranking effect.',
      example: 'Dragon: K♠ vs Tiger: Q♦ → Dragon Wins!',
      isPositive: true,
    },
    {
      title: 'Tie Rules',
      icon: '🤝',
      body: 'If Dragon and Tiger cards have identical rank (e.g. 8♥ and 8♠), the Tie bet wins at 8:1! In case of a Tie, 50% of main bets on Dragon and Tiger are refunded.',
    },
  ],
  payouts: [
    { name: 'Dragon', payout: '1 : 1', desc: 'Wins if Dragon card is higher' },
    { name: 'Tiger', payout: '1 : 1', desc: 'Wins if Tiger card is higher' },
    { name: 'Tie', payout: '8 : 1', desc: 'Equal rank cards (50% refund on Dragon/Tiger)' },
  ],
  tips: [
    'Dragon and Tiger offer the lowest house edge with 1:1 even-money payouts.',
    'Observe the bead plate / road history to identify winning streaks.',
  ],
};

export const ROULETTE_RULES_DATA: {
  title: string;
  subtitle: string;
  sections: RuleSection[];
  payouts: RulePayout[];
  tips: string[];
} = {
  title: '🎡 European Roulette Rules',
  subtitle: 'Single-Zero 37-Pocket Wheel',
  sections: [
    {
      title: 'Objective',
      icon: '🎯',
      body: 'Place chips on numbers or combinations where you predict the roulette ball will land after the wheel spin.',
    },
    {
      title: 'The Green Zero (0)',
      icon: '🟢',
      body: 'European Roulette features 37 pockets: numbers 1 through 36 and a single green Zero (0). If the ball lands on 0, all outside bets lose unless specifically bet on 0.',
    },
    {
      title: 'Inside vs Outside Bets',
      icon: '🎯',
      body: 'Inside bets target specific numbers with high payouts (up to 35:1). Outside bets cover larger categories (Red/Black, Even/Odd, Dozens) with higher winning probabilities.',
    },
  ],
  payouts: [
    { name: 'Straight Up (Single #)', payout: '35 : 1', desc: 'Bet on any individual number' },
    { name: 'Split (2 numbers)', payout: '17 : 1', desc: 'Bet on line between 2 adjacent numbers' },
    { name: 'Street (3 numbers)', payout: '11 : 1', desc: 'Bet on row of 3 numbers' },
    { name: 'Corner / Square', payout: '8 : 1', desc: 'Bet on 4 intersecting numbers' },
    { name: 'Six Line (Double Street)', payout: '5 : 1', desc: 'Bet on 6 numbers across 2 rows' },
    { name: 'Dozen / Column (12 #)', payout: '2 : 1', desc: '1st 12, 2nd 12, 3rd 12, or column' },
    { name: 'Red / Black, Even / Odd, 1-18 / 19-36', payout: '1 : 1', desc: 'Even-money outside bets' },
  ],
  tips: [
    'Outside bets like Red/Black and Even/Odd offer nearly 50% chance of winning.',
    'Spread split or corner bets to cover multiple numbers simultaneously.',
  ],
};

export const CHICKEN_ROAD_RULES_DATA: {
  title: string;
  subtitle: string;
  sections: RuleSection[];
  payouts: RulePayout[];
  tips: string[];
} = {
  title: '🐔 Chicken Road Rules & Guide',
  subtitle: 'High-Stakes Highway Crosser',
  sections: [
    {
      title: 'Objective',
      icon: '🎯',
      body: 'Guide your brave chicken across traffic lanes one step at a time, accumulating multiplier payouts with every lane successfully crossed!',
    },
    {
      title: 'Crossing Lanes',
      icon: '🛣️',
      body: 'Each forward hop into the next lane increases your win multiplier. You can Cash Out at any time to collect your winnings.',
    },
    {
      title: 'The Crash (Squash)',
      icon: '🚗',
      body: 'If a vehicle hits the chicken before you cash out, the round is lost! Take the money and run before you get squashed.',
      isPositive: false,
    },
    {
      title: 'Difficulty Modes',
      icon: '⚡',
      body: [
        'Easy: Slower cars, safe crossings, moderate multipliers.',
        'Medium: Balanced traffic and attractive multiplier jumps.',
        'Hard: Fast lanes, significant risk, rapid multiplier growth.',
        'Daredevil: Extreme highway speed with monumental jackpot multipliers!',
      ],
    },
  ],
  payouts: [
    { name: 'Lane 1 – 3', payout: '1.2x – 2.0x', desc: 'Safe early crossing zone' },
    { name: 'Lane 4 – 8', payout: '2.5x – 10.0x', desc: 'High profit danger zone' },
    { name: 'Lane 9+', payout: '15x – 100x+', desc: 'Legendary jackpot territory' },
  ],
  tips: [
    'Lock in profits by cashing out around 2.0x – 3.0x on higher difficulties.',
    'Minimum bet is ₹10.',
  ],
};

export const TRIPLE_777_RULES_DATA: {
  title: string;
  subtitle: string;
  sections: RuleSection[];
  payouts: RulePayout[];
  tips: string[];
} = {
  title: '🎰 Triple 777 Slots Guide',
  subtitle: 'Classic 3-Reel Vegas Slot',
  sections: [
    {
      title: 'Objective',
      icon: '🎯',
      body: 'Spin the three reels to line up 3 matching symbols on the central payline.',
    },
    {
      title: 'How to Play',
      icon: '🕹️',
      body: 'Select your spin stake (minimum ₹10) and press SPIN. If all 3 reels align matching symbols, your payout is automatically credited to your wallet.',
    },
    {
      title: '⚡ Turbo Mode',
      icon: '⚡',
      body: 'Toggle TURBO on for ultra-fast 0.4-second spins! Turbo mode accelerates the reels and bypasses routine modal popups so you can enjoy instant, continuous action. Major jackpot and big win celebrations still display fully.',
    },
    {
      title: '🔁 Auto Spin',
      icon: '🔁',
      body: 'Tap AUTO to queue 10 automated consecutive spins at your current stake. You can stop Auto spin anytime by tapping STOP, and it automatically pauses on massive wins or if wallet balance runs low.',
    },
  ],
  payouts: [
    { name: '7 7 7 (Triple Sevens)', payout: '100x Stake', desc: 'Grand Vegas Jackpot' },
    { name: '💎 💎 💎 (Diamonds)', payout: '50x Stake', desc: 'Diamond Royale' },
    { name: 'BAR BAR BAR (Bars)', payout: '25x Stake', desc: 'Triple Bar Gold' },
    { name: '🔔 🔔 🔔 (Bells)', payout: '10x Stake', desc: 'Liberty Bell' },
    { name: '🍒 🍒 🍒 (Cherries)', payout: '5x Stake', desc: 'Classic Cherry' },
  ],
  tips: [
    'Use Turbo mode when you want high-speed spins without popup interruptions.',
    'Combine Auto + Turbo for rapid-fire automated rounds.',
    'Manage your bankroll by setting steady spin sizes.',
    'Jackpot RTP is certified provably fair.',
  ],
};

export const ANDAR_BAHAR_RULES_DATA: {
  title: string;
  subtitle: string;
  sections: RuleSection[];
  payouts: RulePayout[];
  tips: string[];
} = {
  title: '🃏 Andar Bahar Rules & Guide',
  subtitle: 'Traditional Indian Card Game',
  sections: [
    {
      title: 'Game Objective',
      icon: '🎯',
      body: 'The dealer deals a center "Joker" card, then alternately deals cards to Andar (Inside) and Bahar (Outside). Bet on which side will match the rank of the Joker card first!',
    },
    {
      title: 'Dealing Order',
      icon: '🎴',
      body: 'If the Joker card is Black (♠/♣), the first card goes to Andar. If the Joker card is Red (♥/♦), the first card goes to Bahar. Dealing alternates until a matching rank appears.',
    },
  ],
  payouts: [
    { name: 'Andar (First dealt)', payout: '0.9 : 1 (or 1:1)', desc: 'Wins when matching card lands on Andar' },
    { name: 'Bahar', payout: '1 : 1', desc: 'Wins when matching card lands on Bahar' },
  ],
  tips: [
    'Whichever side receives the very first card has a statistically higher chance (~51.5%) of winning!',
  ],
};
