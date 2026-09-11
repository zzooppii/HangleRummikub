import { CenturyMerchantSchema, CenturyPointSchema, type CenturyMerchant, type CenturyPoint } from '@hangul-rummikub/shared';
import { parse } from 'valibot';

// Numeric card facts, cross-checked sources: docs/CENTURY_GAME_RULES.md.
const MERCHANT_DATA = [
  {
    "kind": "PRODUCE",
    "gain": [
      2,
      0,
      0,
      0
    ]
  },
  {
    "kind": "UPGRADE",
    "steps": 2
  },
  {
    "kind": "TRADE",
    "cost": [
      3,
      0,
      0,
      0
    ],
    "gain": [
      0,
      0,
      0,
      1
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      1,
      0,
      0
    ],
    "gain": [
      3,
      0,
      0,
      0
    ]
  },
  {
    "kind": "PRODUCE",
    "gain": [
      1,
      1,
      0,
      0
    ]
  },
  {
    "kind": "PRODUCE",
    "gain": [
      0,
      0,
      1,
      0
    ]
  },
  {
    "kind": "PRODUCE",
    "gain": [
      3,
      0,
      0,
      0
    ]
  },
  {
    "kind": "UPGRADE",
    "steps": 3
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      2,
      0
    ],
    "gain": [
      2,
      3,
      0,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      2,
      0
    ],
    "gain": [
      2,
      1,
      0,
      1
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      0,
      1
    ],
    "gain": [
      3,
      0,
      1,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      2,
      0,
      0
    ],
    "gain": [
      3,
      0,
      1,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      3,
      0,
      0
    ],
    "gain": [
      2,
      0,
      2,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      0,
      1
    ],
    "gain": [
      2,
      2,
      0,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      4,
      0,
      0,
      0
    ],
    "gain": [
      0,
      0,
      2,
      0
    ]
  },
  {
    "kind": "PRODUCE",
    "gain": [
      2,
      1,
      0,
      0
    ]
  },
  {
    "kind": "PRODUCE",
    "gain": [
      4,
      0,
      0,
      0
    ]
  },
  {
    "kind": "PRODUCE",
    "gain": [
      0,
      0,
      0,
      1
    ]
  },
  {
    "kind": "PRODUCE",
    "gain": [
      0,
      2,
      0,
      0
    ]
  },
  {
    "kind": "PRODUCE",
    "gain": [
      1,
      0,
      1,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      2,
      0,
      0,
      0
    ],
    "gain": [
      0,
      0,
      1,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      1,
      1,
      0,
      0
    ],
    "gain": [
      0,
      0,
      0,
      1
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      1,
      0
    ],
    "gain": [
      0,
      2,
      0,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      2,
      0,
      0
    ],
    "gain": [
      2,
      0,
      0,
      1
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      3,
      0,
      0,
      0
    ],
    "gain": [
      0,
      1,
      1,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      2,
      0
    ],
    "gain": [
      0,
      2,
      0,
      1
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      3,
      0,
      0
    ],
    "gain": [
      1,
      0,
      1,
      1
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      0,
      1
    ],
    "gain": [
      0,
      3,
      0,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      3,
      0,
      0
    ],
    "gain": [
      0,
      0,
      0,
      2
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      0,
      1
    ],
    "gain": [
      1,
      1,
      1,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      1,
      0
    ],
    "gain": [
      1,
      2,
      0,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      1,
      0
    ],
    "gain": [
      4,
      1,
      0,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      5,
      0,
      0,
      0
    ],
    "gain": [
      0,
      0,
      0,
      2
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      4,
      0,
      0,
      0
    ],
    "gain": [
      0,
      0,
      1,
      1
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      0,
      2
    ],
    "gain": [
      0,
      3,
      2,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      0,
      2
    ],
    "gain": [
      1,
      1,
      3,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      5,
      0,
      0,
      0
    ],
    "gain": [
      0,
      0,
      3,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      2,
      0,
      1,
      0
    ],
    "gain": [
      0,
      0,
      0,
      2
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      3,
      0
    ],
    "gain": [
      0,
      0,
      0,
      3
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      3,
      0,
      0
    ],
    "gain": [
      0,
      0,
      3,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      3,
      0,
      0,
      0
    ],
    "gain": [
      0,
      3,
      0,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      2,
      0,
      0,
      0
    ],
    "gain": [
      0,
      2,
      0,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      2,
      0
    ],
    "gain": [
      0,
      0,
      0,
      2
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      2,
      0,
      0
    ],
    "gain": [
      0,
      0,
      2,
      0
    ]
  },
  {
    "kind": "TRADE",
    "cost": [
      0,
      0,
      0,
      1
    ],
    "gain": [
      0,
      0,
      2,
      0
    ]
  }
] as const;
const POINT_DATA = [
  {
    "cost": [
      2,
      2,
      0,
      0
    ],
    "points": 6
  },
  {
    "cost": [
      3,
      2,
      0,
      0
    ],
    "points": 7
  },
  {
    "cost": [
      0,
      4,
      0,
      0
    ],
    "points": 8
  },
  {
    "cost": [
      2,
      0,
      2,
      0
    ],
    "points": 8
  },
  {
    "cost": [
      2,
      3,
      0,
      0
    ],
    "points": 8
  },
  {
    "cost": [
      3,
      0,
      2,
      0
    ],
    "points": 9
  },
  {
    "cost": [
      0,
      2,
      2,
      0
    ],
    "points": 10
  },
  {
    "cost": [
      0,
      5,
      0,
      0
    ],
    "points": 10
  },
  {
    "cost": [
      2,
      0,
      0,
      2
    ],
    "points": 10
  },
  {
    "cost": [
      2,
      0,
      3,
      0
    ],
    "points": 11
  },
  {
    "cost": [
      3,
      0,
      0,
      2
    ],
    "points": 11
  },
  {
    "cost": [
      0,
      0,
      4,
      0
    ],
    "points": 12
  },
  {
    "cost": [
      0,
      2,
      0,
      2
    ],
    "points": 12
  },
  {
    "cost": [
      0,
      3,
      2,
      0
    ],
    "points": 12
  },
  {
    "cost": [
      0,
      2,
      3,
      0
    ],
    "points": 13
  },
  {
    "cost": [
      0,
      0,
      2,
      2
    ],
    "points": 14
  },
  {
    "cost": [
      0,
      3,
      0,
      2
    ],
    "points": 14
  },
  {
    "cost": [
      2,
      0,
      0,
      3
    ],
    "points": 14
  },
  {
    "cost": [
      0,
      0,
      5,
      0
    ],
    "points": 15
  },
  {
    "cost": [
      0,
      0,
      0,
      4
    ],
    "points": 16
  },
  {
    "cost": [
      0,
      2,
      0,
      3
    ],
    "points": 16
  },
  {
    "cost": [
      0,
      0,
      3,
      2
    ],
    "points": 17
  },
  {
    "cost": [
      0,
      0,
      2,
      3
    ],
    "points": 18
  },
  {
    "cost": [
      0,
      0,
      0,
      5
    ],
    "points": 20
  },
  {
    "cost": [
      2,
      1,
      0,
      1
    ],
    "points": 9
  },
  {
    "cost": [
      0,
      2,
      1,
      1
    ],
    "points": 12
  },
  {
    "cost": [
      1,
      0,
      2,
      1
    ],
    "points": 12
  },
  {
    "cost": [
      2,
      2,
      2,
      0
    ],
    "points": 13
  },
  {
    "cost": [
      2,
      2,
      0,
      2
    ],
    "points": 15
  },
  {
    "cost": [
      2,
      0,
      2,
      2
    ],
    "points": 17
  },
  {
    "cost": [
      0,
      2,
      2,
      2
    ],
    "points": 19
  },
  {
    "cost": [
      1,
      1,
      1,
      1
    ],
    "points": 12
  },
  {
    "cost": [
      3,
      1,
      1,
      1
    ],
    "points": 14
  },
  {
    "cost": [
      1,
      3,
      1,
      1
    ],
    "points": 16
  },
  {
    "cost": [
      1,
      1,
      3,
      1
    ],
    "points": 18
  },
  {
    "cost": [
      1,
      1,
      1,
      3
    ],
    "points": 20
  }
] as const;
export function makeCenturyCards(players: number, id: () => string): { merchants: CenturyMerchant[]; points: CenturyPoint[] } {
  return { merchants: [...Array.from({length: players}, () => MERCHANT_DATA.slice(0,2)).flat(), ...MERCHANT_DATA.slice(2)].map(c => parse(CenturyMerchantSchema, {...c,cardId:id()})), points: POINT_DATA.map(c => parse(CenturyPointSchema,{...c,cardId:id()})) };
}
export function centuryInventorySignature(card: CenturyMerchant | CenturyPoint): string {
  if ('points' in card) return JSON.stringify(['POINT',card.cost,card.points]);
  return card.kind === 'UPGRADE' ? JSON.stringify([card.kind,card.steps]) : JSON.stringify([card.kind,card.kind === 'TRADE' ? card.cost : null,card.gain]);
}
