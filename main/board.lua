-- Jewel Grove: pure match-3 board logic (no Defold API).
-- Swap two adjacent tiles to make a row/column of 3+ identical gems.
-- Matched gems pop, gems above fall, new gems drop in, cascades chain.
-- 4-in-a-row creates a line-clearer, 5-in-a-row creates a bomb.
-- Golden star tiles (type STAR) cannot match: they fall with gravity and
-- are collected when they reach the bottom row (drop missions).
local M = {}

M.COLS = 8
M.ROWS = 8
M.SPACING = 62
M.TILE = 56
M.W, M.H = 1136, 640
M.STAR = 7
M.NGEM = 6

-- Board centre (380, 330): the right-hand side holds the mission panel.
function M.cell_pos(b, row, col)
  local x = b.x0 + (col - 1) * M.SPACING
  local y = b.y_top - (row - 1) * M.SPACING
  return x, y
end

function M.get(b, row, col)
  if row < 1 or row > b.rows or col < 1 or col > b.cols then return nil end
  return b.grid[row][col]
end

function M.count(b)
  local n = 0
  for r = 1, b.rows do
    for c = 1, b.cols do
      if b.grid[r][c] then n = n + 1 end
    end
  end
  return n
end

function M.count_type(b, t)
  local n = 0
  for r = 1, b.rows do
    for c = 1, b.cols do
      if b.grid[r][c] == t then n = n + 1 end
    end
  end
  return n
end

function M.count_stars(b)
  return M.count_type(b, M.STAR)
end

local function is_gem(t)
  return t ~= nil and t >= 1 and t <= M.NGEM
end

-- Runs of 3+ identical gems. Returns runs = list of
-- { dir = "h"|"v", cells = { {r,c}, ... } } and a set table keyed "r,c".
function M.find_matches(b)
  local runs = {}
  local set = {}
  for r = 1, b.rows do
    local c = 1
    while c <= b.cols do
      local t = M.get(b, r, c)
      if is_gem(t) then
        local c2 = c
        while c2 + 1 <= b.cols and M.get(b, r, c2 + 1) == t do c2 = c2 + 1 end
        if c2 - c + 1 >= 3 then
          local run = { dir = "h", cells = {} }
          for cc = c, c2 do
            run.cells[#run.cells + 1] = { r, cc }
            set[r .. "," .. cc] = true
          end
          runs[#runs + 1] = run
        end
        c = c2 + 1
      else
        c = c + 1
      end
    end
  end
  for c = 1, b.cols do
    local r = 1
    while r <= b.rows do
      local t = M.get(b, r, c)
      if is_gem(t) then
        local r2 = r
        while r2 + 1 <= b.rows and M.get(b, r2 + 1, c) == t do r2 = r2 + 1 end
        if r2 - r + 1 >= 3 then
          local run = { dir = "v", cells = {} }
          for rr = r, r2 do
            run.cells[#run.cells + 1] = { rr, c }
            set[rr .. "," .. c] = true
          end
          runs[#runs + 1] = run
        end
        r = r2 + 1
      else
        r = r + 1
      end
    end
  end
  return runs, set
end

function M.has_match(b)
  local _, set = M.find_matches(b)
  return next(set) ~= nil
end

-- First legal swap (row-major: right neighbour, then down neighbour) that
-- creates a match. Returns r1,c1,r2,c2 or nil.
function M.find_swap(b)
  for r = 1, b.rows do
    for c = 1, b.cols do
      local t = M.get(b, r, c)
      if is_gem(t) then
        for _, d in ipairs({ { 0, 1 }, { 1, 0 } }) do
          local r2, c2 = r + d[1], c + d[2]
          local t2 = M.get(b, r2, c2)
          if is_gem(t2) and t2 ~= t then
            b.grid[r][c], b.grid[r2][c2] = t2, t
            local hit = M.has_match(b)
            b.grid[r][c], b.grid[r2][c2] = t, t2
            if hit then return r, c, r2, c2 end
          end
        end
      end
    end
  end
  return nil
end

-- Special cells: b.special["r,c"] = "lineH" | "lineV" | "bomb".
local function special_at(b, r, c)
  return b.special and b.special[r .. "," .. c] or nil
end

-- Cells cleared when a special at (r,c) triggers.
local function special_cells(b, kind, r, c)
  local out = {}
  if kind == "lineH" then
    for cc = 1, b.cols do out[#out + 1] = { r, cc } end
  elseif kind == "lineV" then
    for rr = 1, b.rows do out[#out + 1] = { rr, c } end
  elseif kind == "bomb" then
    for rr = r - 1, r + 1 do
      for cc = c - 1, c + 1 do
        if rr >= 1 and rr <= b.rows and cc >= 1 and cc <= b.cols then
          out[#out + 1] = { rr, cc }
        end
      end
    end
  end
  return out
end

-- Clear a set of cells, chaining any specials on cleared cells.
-- `keep` is a set of "r,c" keys that must survive (special-creation cell).
-- Returns cleared list { {r,c,kind} } and a list of triggered specials.
function M.clear_cells(b, seed_cells, keep)
  keep = keep or {}
  local cleared = {}
  local cleared_set = {}
  local triggered = {}
  local queue = {}
  for _, cell in ipairs(seed_cells) do
    queue[#queue + 1] = { cell[1], cell[2], "match" }
  end
  local head = 1
  while head <= #queue do
    local r, c, kind = queue[head][1], queue[head][2], queue[head][3]
    head = head + 1
    local key = r .. "," .. c
    if not cleared_set[key] and not keep[key] and M.get(b, r, c) then
      cleared_set[key] = true
      local sp = special_at(b, r, c)
      cleared[#cleared + 1] = { r, c, sp and sp or kind }
      if b.special then b.special[key] = nil end
      b.grid[r][c] = nil
      if sp then
        triggered[#triggered + 1] = sp
        for _, cell in ipairs(special_cells(b, sp, r, c)) do
          queue[#queue + 1] = { cell[1], cell[2], sp }
        end
      end
    end
  end
  return cleared, triggered
end

-- Pick the special-creation cell for a run: the swapped cell if it is in
-- the run, else the middle cell. Returns r, c, kind ("lineH"/"lineV"/"bomb")
-- or nil when the run is too short.
local function special_for_run(run, sr, sc)
  local len = #run.cells
  if len < 4 then return nil end
  local kind = "bomb"
  if len == 4 then kind = run.dir == "h" and "lineH" or "lineV" end
  if sr then
    for _, cell in ipairs(run.cells) do
      if cell[1] == sr and cell[2] == sc then
        return cell[1], cell[2], kind
      end
    end
  end
  local mid = run.cells[math.floor(len / 2) + 1]
  return mid[1], mid[2], kind
end

-- Resolve the current matches on the board (one cascade step).
-- sr,sc is the swapped cell (may be nil for cascade steps).
-- Returns cleared list, triggered specials, created special {r,c,kind} or
-- nil, and the number of matched cells.
function M.resolve_matches(b, sr, sc)
  local runs, set = M.find_matches(b)
  if #runs == 0 then return {}, {}, nil, 0 end
  -- Decide special creation: longest run wins; prefer the swapped cell.
  local best_r, best_c, best_kind = nil, nil, nil
  local best_len = 0
  for _, run in ipairs(runs) do
    if #run.cells > best_len then
      local r, c, kind = special_for_run(run, sr, sc)
      if kind then
        best_r, best_c, best_kind = r, c, kind
        best_len = #run.cells
      end
    end
  end
  local keep = {}
  if best_r then keep[best_r .. "," .. best_c] = true end
  local seed = {}
  for key in pairs(set) do
    local r, c = key:match("^(%d+),(%d+)$")
    seed[#seed + 1] = { tonumber(r), tonumber(c) }
  end
  local cleared, triggered = M.clear_cells(b, seed, keep)
  local created = nil
  if best_r then
    b.special = b.special or {}
    b.special[best_r .. "," .. best_c] = best_kind
    created = { r = best_r, c = best_c, kind = best_kind }
  end
  return cleared, triggered, created, #seed
end

-- Gravity: compact each column downward, refill the top with new gems.
-- Stars fall too; gems never spawn as stars.
function M.apply_gravity(b)
  for c = 1, b.cols do
    local vals = {}
    local specs = {}
    for r = b.rows, 1, -1 do
      local t = b.grid[r][c]
      if t then
        vals[#vals + 1] = t
        specs[#specs + 1] = b.special and b.special[r .. "," .. c] or nil
      end
    end
    local r = b.rows
    for i = 1, #vals do
      b.grid[r][c] = vals[i]
      if b.special then
        b.special[r .. "," .. c] = specs[i]
      end
      r = r - 1
    end
    while r >= 1 do
      b.grid[r][c] = math.random(b.ntypes)
      if b.special then b.special[r .. "," .. c] = nil end
      r = r - 1
    end
  end
end

-- Collect stars sitting on the bottom row. Returns how many collected.
function M.collect_bottom_stars(b)
  local n = 0
  for c = 1, b.cols do
    if b.grid[b.rows][c] == M.STAR then
      b.grid[b.rows][c] = nil
      if b.special then b.special[b.rows .. "," .. c] = nil end
      n = n + 1
    end
  end
  if n > 0 then M.apply_gravity(b) end
  return n
end

-- Validate + perform a player swap. Returns a result table or nil when
-- the swap is illegal (not adjacent / no match / nothing happens).
-- Result kinds: "match" (a match was made, caller resolves),
-- "star" (a star was swapped, no match), "special" (a special was
-- triggered at r,c with kind).
function M.try_swap(b, r1, c1, r2, c2)
  if math.abs(r1 - r2) + math.abs(c1 - c2) ~= 1 then return nil end
  local t1, t2 = M.get(b, r1, c1), M.get(b, r2, c2)
  if not t1 or not t2 then return nil end
  -- Swapping a special with any neighbour triggers it (no tile moves).
  local sp1 = special_at(b, r1, c1)
  local sp2 = special_at(b, r2, c2)
  if sp1 or sp2 then
    local r, c, kind = r1, c1, sp1
    if sp2 then r, c, kind = r2, c2, sp2 end
    return { kind = "special", r = r, c = c, special = kind }
  end
  -- Stars swap freely with any neighbour (they never match).
  if t1 == M.STAR or t2 == M.STAR then
    b.grid[r1][c1], b.grid[r2][c2] = t2, t1
    return { kind = "star", r1 = r1, c1 = c1, r2 = r2, c2 = c2 }
  end
  if t1 == t2 then return nil end
  b.grid[r1][c1], b.grid[r2][c2] = t2, t1
  if M.has_match(b) then
    return { kind = "match", r1 = r1, c1 = c1, r2 = r2, c2 = c2 }
  end
  b.grid[r1][c1], b.grid[r2][c2] = t1, t2
  return nil
end

-- New board: no pre-existing matches, stars on the top rows, and at
-- least one legal swap. Retries with fresh layouts until it holds.
function M.new(cols, rows, ntypes, nstars, seed)
  math.randomseed(seed)
  local b = { cols = cols, rows = rows, ntypes = ntypes, grid = {},
              special = {} }
  b.x0 = 380 - ((cols - 1) * M.SPACING) / 2
  b.y_top = 330 + ((rows - 1) * M.SPACING) / 2
  for r = 1, rows do b.grid[r] = {} end
  for _try = 1, 500 do
    for r = 1, rows do
      for c = 1, cols do
        local t
        repeat
          t = math.random(ntypes)
        until not ((c >= 3 and b.grid[r][c - 1] == t and b.grid[r][c - 2] == t)
          or (r >= 3 and b.grid[r - 1][c] == t and b.grid[r - 2][c] == t))
        b.grid[r][c] = t
      end
    end
    b.special = {}
    -- Stars: top two rows, distinct columns.
    local placed = 0
    local star_cols = {}
    while placed < nstars do
      local c = math.random(cols)
      local r = math.random(2)
      if not star_cols[c] and b.grid[r][c] then
        star_cols[c] = true
        b.grid[r][c] = M.STAR
        placed = placed + 1
      end
    end
    if M.find_swap(b) or nstars > 0 then return b end
  end
  return b
end

-- Reshuffle the non-star gems until no immediate matches exist and a
-- legal swap exists (or stars give the player a move). Stars stay put.
function M.shuffle_tiles(b)
  local vals = {}
  for r = 1, b.rows do
    for c = 1, b.cols do
      local t = b.grid[r][c]
      if t and t ~= M.STAR then vals[#vals + 1] = t end
    end
  end
  for _try = 1, 200 do
    for i = #vals, 2, -1 do
      local j = math.random(i)
      vals[i], vals[j] = vals[j], vals[i]
    end
    local k = 1
    b.special = {}
    for r = 1, b.rows do
      for c = 1, b.cols do
        if b.grid[r][c] and b.grid[r][c] ~= M.STAR then
          b.grid[r][c] = vals[k]
          k = k + 1
        end
      end
    end
    if not M.has_match(b) and (M.find_swap(b) or M.count_stars(b) > 0) then
      return true
    end
  end
  return false
end

-- A first non-matching adjacent pair (two different gem types whose swap
-- makes no match). Returns r1,c1,r2,c2 or nil.
function M.find_nomatch(b)
  for r = 1, b.rows do
    for c = 1, b.cols do
      local t = M.get(b, r, c)
      if is_gem(t) then
        for _, d in ipairs({ { 0, 1 }, { 1, 0 } }) do
          local r2, c2 = r + d[1], c + d[2]
          local t2 = M.get(b, r2, c2)
          if is_gem(t2) and t2 ~= t then
            b.grid[r][c], b.grid[r2][c2] = t2, t
            local hit = M.has_match(b)
            b.grid[r][c], b.grid[r2][c2] = t, t2
            if not hit then return r, c, r2, c2 end
          end
        end
      end
    end
  end
  return nil
end

return M
