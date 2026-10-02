import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import { type ReactElement, useCallback } from "react";
import OptionRow from "./option-row";

export default function ButtonSelection<T extends string>({
  value,
  onChange,
  selections,
  title,
  caption,
  disabled = false,
  collapsible,
}: {
  value: T | undefined;
  onChange: (val: T) => void;
  selections: { val: T; icon: ReactElement; label?: string }[];
  title: string;
  caption: string;
  disabled?: boolean;
  collapsible?: boolean;
}): ReactElement {
  const change = useCallback(
    (_: unknown, newVal: string | null) => {
      if (newVal !== null) {
        onChange(newVal as T);
      }
    },
    [onChange],
  );

  const groupDisabled = disabled || value === undefined;
  const buttons = selections.map(({ val, icon, label }) => {
    const button = (
      <ToggleButton key={val} value={val} aria-label={label ?? val}>
        {icon}
      </ToggleButton>
    );
    // a disabled button doesn't fire the events Tooltip needs to listen for
    return groupDisabled ? (
      button
    ) : (
      <Tooltip key={val} title={label ?? val}>
        {button}
      </Tooltip>
    );
  });

  const control = (
    <ToggleButtonGroup
      orientation="horizontal"
      size="small"
      value={value ?? null}
      disabled={groupDisabled}
      exclusive
      onChange={change}
    >
      {buttons}
    </ToggleButtonGroup>
  );

  return (
    <OptionRow
      title={title}
      caption={caption}
      control={control}
      collapsible={collapsible}
    />
  );
}
