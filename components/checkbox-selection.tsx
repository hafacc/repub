import type { ReactElement } from "react";
import Checkball from "./checkball";
import OptionRow from "./option-row";

export default function CheckboxSelection({
  value,
  onToggle,
  title,
  caption,
  disabled = false,
  collapsible,
}: {
  value: boolean | undefined;
  onToggle: () => void;
  title: string;
  caption: string;
  disabled?: boolean;
  collapsible?: boolean;
}): ReactElement {
  const checkbox = (
    <Checkball
      checked={!!value}
      disabled={disabled || value === undefined}
      onClick={onToggle}
    />
  );
  return (
    <OptionRow
      title={title}
      caption={caption}
      control={checkbox}
      collapsible={collapsible}
    />
  );
}
