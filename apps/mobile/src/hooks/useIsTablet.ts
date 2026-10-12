import { useWindowDimensions } from "react-native"
import { TABLET_MIN_WIDTH } from "../theme/tokens"

/** True at tablet widths — screens switch to master–detail layouts. */
export function useIsTablet(): boolean {
  return useWindowDimensions().width >= TABLET_MIN_WIDTH
}
