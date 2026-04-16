import { useEffect, useState } from "react";
import { api } from "../api.js";

export function SizeSelector(props: {
  pair: string;
  fromChain: number;
  toChain: number;
  current: number;
  onChange: (size: number) => void;
}) {
  const [sizes, setSizes] = useState<number[]>([props.current]);

  useEffect(() => {
    api.routes().then(d => {
      const matched = d.routes
        .filter(r =>
          r.pair_name === props.pair &&
          r.from_chain === props.fromChain &&
          r.to_chain === props.toChain
        )
        .map(r => r.from_amount_hr);
      const unique = [...new Set(matched)].sort((a, b) => a - b);
      if (unique.length > 0) setSizes(unique);
    });
  }, [props.pair, props.fromChain, props.toChain]);

  return (
    <label className="flex items-center gap-2 text-xs text-[--color-muted-foreground]">
      <span className="uppercase tracking-wider font-medium">Size</span>
      <select
        value={props.current}
        onChange={e => props.onChange(Number(e.target.value))}
        className="bg-[--color-muted] border border-[--color-border] rounded px-2 py-1 font-mono text-xs text-[--color-foreground] focus:outline-none focus:ring-1 focus:ring-[--color-accent]"
      >
        {sizes.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </label>
  );
}
