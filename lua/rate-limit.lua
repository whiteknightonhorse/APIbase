-- APIbase.pro — Token Bucket Rate Limiter (§12.152)
-- Atomic check + decrement. Lazy initialization.
--
-- KEYS[1] = bucket key (e.g. ratelimit:{agent_id}:{tool_id}:bucket)
-- ARGV[1] = max_tokens (burst size)
-- ARGV[2] = refill_rate (tokens per second)
-- ARGV[3] = now (current unix timestamp with fractional seconds)
--
-- Returns: {allowed(0/1), remaining_tokens, max_tokens}

local key = KEYS[1]
local max_tokens = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(data[1]) or max_tokens
local last_refill = tonumber(data[2]) or now

-- Refill tokens based on elapsed time
local elapsed = now - last_refill
local new_tokens = math.min(max_tokens, tokens + elapsed * refill_rate)

if new_tokens >= 1 then
  -- Allow request: decrement token
  redis.call('HMSET', key, 'tokens', new_tokens - 1, 'last_refill', now)
  redis.call('EXPIRE', key, 60)
  return {1, math.floor(new_tokens - 1), max_tokens}
else
  -- Deny request: no tokens available
  redis.call('HMSET', key, 'tokens', new_tokens, 'last_refill', now)
  redis.call('EXPIRE', key, 60)
  return {0, 0, max_tokens}
end
