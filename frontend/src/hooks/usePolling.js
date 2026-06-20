import { useState, useEffect, useRef } from 'react';

export function usePolling(fetcher, intervalMs = 5000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const savedFetcher = useRef(fetcher);

  useEffect(() => {
    savedFetcher.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const result = await savedFetcher.current();
        if (active) { setData(result); setError(null); }
      } catch (err) {
        if (active) setError(err.message);
      }
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => { active = false; clearInterval(id); };
  }, [intervalMs]);

  return { data, error };
}
