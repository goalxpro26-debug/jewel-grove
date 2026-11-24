-- Jewel Grove: level definitions + mission text.
-- Mission types:
--   "score"      reach a score target before the moves run out
--   "clear_type" clear N gems of one type before the moves run out
--   "drop"       drop N golden stars to the bottom row before the moves run out
-- All levels are move-limited (no timer in level play); endless is timed.
local M = {}

M.TILE_NAMES = { "ruby", "sapphire", "emerald", "topaz", "amethyst", "pearl" }
M.GEM_DISPLAY = { "Ruby", "Sapphire", "Emerald", "Topaz", "Amethyst", "Pearl" }

M.LEVELS = {
  { types = 4, moves = 25, stars = 0,
    mission = { type = "score", target = 3000,
                text = "Score 3,000 points" } },
  { types = 4, moves = 30, stars = 0,
    mission = { type = "clear_type", gem = 1, target = 15,
                text = "Clear 15 Ruby gems" } },
  { types = 5, moves = 28, stars = 2,
    mission = { type = "drop", target = 2,
                text = "Drop 2 golden stars to the bottom!" } },
  { types = 5, moves = 28, stars = 0,
    mission = { type = "score", target = 5000,
                text = "Score 5,000 points" } },
  { types = 5, moves = 30, stars = 0,
    mission = { type = "clear_type", gem = 3, target = 20,
                text = "Clear 20 Emerald gems" } },
  { types = 6, moves = 30, stars = 3,
    mission = { type = "drop", target = 3,
                text = "Drop 3 golden stars to the bottom!" } },
  { types = 6, moves = 30, stars = 0,
    mission = { type = "score", target = 8000,
                text = "Score 8,000 points" } },
  { types = 6, moves = 32, stars = 0,
    mission = { type = "clear_type", gem = 2, target = 25,
                text = "Clear 25 Sapphire gems" } },
  { types = 6, moves = 32, stars = 4,
    mission = { type = "drop", target = 4,
                text = "Drop 4 golden stars to the bottom!" } },
  { types = 6, moves = 35, stars = 0,
    mission = { type = "score", target = 12000,
                text = "Score 12,000 points" } },
  { types = 6, moves = 35, stars = 0,
    mission = { type = "clear_type", gem = 4, target = 30,
                text = "Clear 30 Topaz gems" } },
  { types = 6, moves = 35, stars = 5,
    mission = { type = "drop", target = 5,
                text = "Drop 5 golden stars to the bottom!" } },
}

M.ENDLESS = { types = 6, moves = 0, stars = 0, time = 120,
  mission = { type = "endless", text = "Score as much as you can in 2 minutes!" } }

function M.get(n)
  return M.LEVELS[math.max(1, math.min(#M.LEVELS, n))]
end

return M
