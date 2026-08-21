if (process.env.YARDMASTER_LIVE_STATE_GUARD !== '1') {
  throw new Error(
    'Yardmaster tests must run through the live-state guard. Use `npm test`.'
  );
}
