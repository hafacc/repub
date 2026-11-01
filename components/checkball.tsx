import Checkbox, { type CheckboxProps } from "@mui/material/Checkbox";
import { styled } from "@mui/material/styles";
import type { ReactElement } from "react";
import { CheckCircle, Circle } from "./icons";

type CheckballProps = Omit<CheckboxProps, "icon" | "checkedIcon">;

function MuiCheckball(props: CheckballProps): ReactElement {
  return (
    <Checkbox icon={<Circle />} checkedIcon={<CheckCircle />} {...props} />
  );
}

const Checkball = styled(MuiCheckball)<CheckballProps>(() => ({
  margin: 0,
}));

export default Checkball;
