"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch, Radio } from "@/components/ui/switch";
import { Orb } from "@/components/ui/orb";

export function TasarimInteractive() {
  const [seg, setSeg] = useState<"a" | "b">("a");
  const [on, setOn] = useState(true);
  const [radio, setRadio] = useState(true);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <Orb state="idle" size={88} />
      <Orb state="listening" size={88} />
      <Orb state="speaking" size={88} level={0.6} />
      <SegmentedControl
        ariaLabel="Örnek segment"
        value={seg}
        onChange={setSeg}
        options={[
          { value: "a", label: "Bir" },
          { value: "b", label: "İki" },
        ]}
      />
      <Switch aria-label="Örnek anahtar" checked={on} onCheckedChange={setOn} />
      <Radio aria-label="Örnek radyo" checked={radio} onChange={() => setRadio(true)} />
    </div>
  );
}
