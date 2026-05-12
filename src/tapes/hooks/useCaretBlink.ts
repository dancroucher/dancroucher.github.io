import { useState, useEffect } from 'react';

/**
 * Blinks the in-canvas block cursor while an in-canvas text field is focused
 * in the pending-mixtape or mixtape-inspect edit flow.
 */
export function useCaretBlink(
  focusedField: 'title' | 'author' | null,
  editing: boolean,
): boolean {
  const [on, setOn] = useState(true);

  useEffect(() => {
    if (!focusedField || !editing) {
      setOn(true);
      return;
    }
    setOn(true);
    const id = setInterval(() => setOn(v => !v), 500);
    return () => clearInterval(id);
  }, [focusedField, editing]);

  return on;
}
