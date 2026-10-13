import Box from "@mui/material/Box";
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
    // the row stretches whatever control it's given, which a round checkbox
    // can't be, so the box beside it takes the width instead
    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
      <Checkball
        checked={!!value}
        disabled={disabled || value === undefined}
        onClick={onToggle}
      />
    </Box>
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
