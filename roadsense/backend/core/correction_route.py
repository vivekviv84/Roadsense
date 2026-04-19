"""
Safe correction sequence when wrong-way is detected.

Avoids immediate sharp merges; prefers forward distance then legal U-turn (India context).
"""

from __future__ import annotations

from typing import Any, Optional


def suggest_correction_plan(
  *,
  continue_forward_m: float = 50.0,
  rejoin_eta_sec: Optional[float] = None,
) -> dict[str, Any]:
  steps = [
    {
      'id': 1,
      'instruction': f'Continue forward ~{int(continue_forward_m)} m; stay predictable for surrounding traffic.',
      'distance_m': continue_forward_m,
      'icon': 'arrow-up',
    },
    {
      'id': 2,
      'instruction': 'At the next safe junction, take a U-turn (prefer signalized / police-controlled).',
      'distance_m': None,
      'icon': 'u-turn',
    },
    {
      'id': 3,
      'instruction': 'Rejoin the original route in the correct carriageway; yield to crossing traffic.',
      'distance_m': None,
      'icon': 'merge',
    },
  ]
  return {
    'steps': steps,
    'rejoin_eta_sec': rejoin_eta_sec,
    'severity': 'high',
    'notes': 'Avoid abrupt lane cuts; use hazard lights if stationary.',
  }
