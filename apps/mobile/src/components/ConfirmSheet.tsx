import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useState } from "react"
import { StyleSheet, View } from "react-native"
import { useConfirmStore, type ConfirmRequest } from "../lib/confirm"
import { haptics } from "../lib/haptics"
import { useTheme } from "../theme/useTheme"
import { radius, space } from "../theme/tokens"
import { Button } from "./Button"
import { Sheet } from "./Sheet"
import { Text } from "./Text"

// Themed confirmation dialog behind lib/confirm.ts's confirm(). Mounted once
// inside the root BottomSheetModalProvider, so it stacks ("push") above any
// sheet that is already open (e.g. confirming "Remove pack size" from inside
// the pack-size sheet). Cancel is the default, left-hand action; a
// destructive confirm is red and fires a warning haptic when the dialog opens.
export function ConfirmHost() {
  const theme = useTheme()
  const request = useConfirmStore((s) => s.request)
  const answer = useConfirmStore((s) => s.answer)
  // Keep showing the last request while the sheet animates closed.
  const [shown, setShown] = useState<ConfirmRequest | null>(request)
  if (request && request !== shown) setShown(request)

  const destructiveId = request?.destructive ? request.id : null
  useEffect(() => {
    if (destructiveId !== null) haptics.warning()
  }, [destructiveId])

  const close = () => {
    if (request) answer(request.id, false)
  }

  return (
    <Sheet open={!!request} onClose={close} accessibilityLabel={shown?.title}>
      {shown ? (
        <View style={styles.body}>
          <View style={styles.head}>
            {shown.destructive ? (
              <View style={[styles.icon, { backgroundColor: theme.red50 }]}>
                <Ionicons name="alert-circle-outline" size={26} color={theme.red} />
              </View>
            ) : null}
            <Text variant="title" accessibilityRole="header" style={styles.title}>
              {shown.title}
            </Text>
          </View>
          {shown.message ? <Text tone="secondary">{shown.message}</Text> : null}
          <View style={styles.actions}>
            <Button
              title={shown.cancelLabel ?? "Cancel"}
              variant="secondary"
              onPress={() => answer(shown.id, false)}
              style={styles.flex}
            />
            <Button
              title={shown.confirmLabel}
              variant={shown.destructive ? "danger" : "primary"}
              onPress={() => answer(shown.id, true)}
              style={styles.flex}
            />
          </View>
        </View>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingTop: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  title: { flex: 1 },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  flex: { flex: 1 },
})
