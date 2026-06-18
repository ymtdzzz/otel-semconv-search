import { useState } from "preact/hooks";

/**
 * Placeholder island used to verify the Preact integration is wired up.
 * Replaced by the real search UI in a later slice.
 */
export default function Hello() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      clicked {count} times
    </button>
  );
}
