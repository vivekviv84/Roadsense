"""
Historical traffic direction per road segment and time bucket.

Uses SQLite for zero-ops deployment. `road_id` can be an OSM way id or a synthetic grid id.
"""

from __future__ import annotations

import os
import sqlite3
import time
from dataclasses import dataclass
from typing import Any, Optional

_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'road_usage.db')


def _ensure_dir(path: str) -> None:
  os.makedirs(os.path.dirname(path), exist_ok=True)


def _connect() -> sqlite3.Connection:
  _ensure_dir(_DB_PATH)
  conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
  conn.row_factory = sqlite3.Row
  return conn


def init_db() -> None:
  conn = _connect()
  try:
    conn.execute(
      """
      CREATE TABLE IF NOT EXISTS road_usage_stats (
        road_id TEXT NOT NULL,
        time_slot INTEGER NOT NULL,
        direction TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0,
        updated_at REAL NOT NULL,
        PRIMARY KEY (road_id, time_slot, direction)
      )
      """
    )
    conn.commit()
  finally:
    conn.close()


def time_slot_now(ts: Optional[float] = None) -> int:
  """4-hour buckets: 0=0-3h, 1=4-7, ..."""
  t = time.localtime(ts or time.time())
  return int(t.tm_hour // 4)


def record_passage(road_id: str, direction: str, weight: float = 1.0) -> None:
  init_db()
  slot = time_slot_now()
  now = time.time()
  conn = _connect()
  try:
    row = conn.execute(
      'SELECT count, confidence FROM road_usage_stats WHERE road_id=? AND time_slot=? AND direction=?',
      (road_id, slot, direction),
    ).fetchone()
    if row is None:
      new_count = int(max(1, round(weight)))
      new_conf = min(1.0, 0.12 * min(1.0, weight))
      conn.execute(
        """
        INSERT INTO road_usage_stats(road_id, time_slot, direction, count, confidence, updated_at)
        VALUES(?,?,?,?,?,?)
        """,
        (road_id, slot, direction, new_count, new_conf, now),
      )
    else:
      prev_c = int(row['count'])
      new_count = prev_c + int(max(1, round(weight)))
      old_conf = float(row['confidence'])
      share_boost = min(1.0, weight / max(new_count, 1))
      new_conf = min(1.0, old_conf * 0.94 + 0.06 * share_boost)
      conn.execute(
        """
        UPDATE road_usage_stats
        SET count=?, confidence=?, updated_at=?
        WHERE road_id=? AND time_slot=? AND direction=?
        """,
        (new_count, new_conf, now, road_id, slot, direction),
      )
    conn.commit()
  finally:
    conn.close()


@dataclass
class RoadIntel:
  road_id: str
  dominant_direction: Optional[str]
  confidence: float
  total_samples: int
  by_direction: dict[str, int]

  def to_dict(self) -> dict[str, Any]:
    return {
      'road_id': self.road_id,
      'dominant_direction': self.dominant_direction,
      'confidence': round(self.confidence * 100.0, 1),
      'total_samples': self.total_samples,
      'by_direction': self.by_direction,
    }


def get_road_intelligence(road_id: str, slot: Optional[int] = None) -> RoadIntel:
  init_db()
  slot = slot if slot is not None else time_slot_now()
  conn = _connect()
  try:
    rows = conn.execute(
      'SELECT direction, count, confidence FROM road_usage_stats WHERE road_id=? AND time_slot=?',
      (road_id, slot),
    ).fetchall()
  finally:
    conn.close()

  by_dir: dict[str, int] = {}
  total = 0
  best: Optional[tuple[str, int, float]] = None
  for r in rows:
    c = int(r['count'])
    by_dir[r['direction']] = c
    total += c
    if best is None or c > best[1]:
      best = (r['direction'], c, float(r['confidence']))

  if not best or total == 0:
    return RoadIntel(road_id, None, 0.0, 0, {})

  dom, _count, conf = best
  share = _count / total
  merged_conf = min(1.0, 0.5 * share + 0.5 * conf)
  return RoadIntel(road_id, dom, merged_conf, total, by_dir)


def warn_if_opposes_flow(user_direction: str, intel: RoadIntel) -> tuple[bool, str]:
  if not intel.dominant_direction or intel.confidence < 0.55:
    return False, 'insufficient_history'
  if user_direction != intel.dominant_direction and intel.confidence >= 0.65:
    return True, 'opposes_high_confidence_flow'
  return False, 'ok'
